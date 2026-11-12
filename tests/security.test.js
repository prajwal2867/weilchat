import test from "node:test";
import assert from "node:assert/strict";
import {
  REPORT_REASONS,
  clientAddress,
  createRateLimiter,
  hashClientAddress,
  validateMatchPayload,
  validateMessagePayload,
  validateReportPayload
} from "../server/security.js";
import { createModerationHandler } from "../server/moderation.js";

test("matchmaking payload validation rejects malformed and extra fields", () => {
  assert.equal(validateMatchPayload({ gender: "man", preference: "woman", adult: true }), true);
  assert.equal(validateMatchPayload({ gender: "man", preference: "woman", adult: "true" }), false);
  assert.equal(validateMatchPayload({ gender: "man", preference: "woman", adult: true, admin: true }), false);
  assert.equal(validateMatchPayload(null), false);
  assert.equal(validateMatchPayload([]), false);
});

test("message validation enforces a string and the 1000-character limit", () => {
  assert.equal(validateMessagePayload({ text: "hello" }), true);
  assert.equal(validateMessagePayload({ text: "  hello  " }), true);
  assert.equal(validateMessagePayload({ text: " " }), false);
  assert.equal(validateMessagePayload({ text: "x".repeat(1001) }), false);
  assert.equal(validateMessagePayload({ text: 12 }), false);
  assert.equal(validateMessagePayload({ text: "hello", peer: "other" }), false);
});

test("report reasons are an explicit allow-list", () => {
  assert.deepEqual(REPORT_REASONS, ["harassment", "inappropriate", "spam", "underage", "other"]);
  assert.equal(validateReportPayload({ reason: "harassment" }), true);
  assert.equal(validateReportPayload({ reason: "Other" }), false);
  assert.equal(validateReportPayload({ reason: "harassment", notes: "extra" }), false);
  assert.equal(validateReportPayload(null), false);
});

test("client address uses Vercel's trusted client IP header and hashes it", () => {
  const socket = { handshake: { headers: { "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" }, address: "127.0.0.1" } };
  assert.equal(clientAddress(socket), "203.0.113.7");
  assert.equal(hashClientAddress("203.0.113.7", "secret"), hashClientAddress("203.0.113.7", "secret"));
  assert.notEqual(hashClientAddress("203.0.113.7", "secret"), hashClientAddress("203.0.113.7", "other"));
});

test("local rate limiter enforces a fixed window and resets after expiry", async () => {
  let now = 1000;
  const limit = createRateLimiter({ prefix: "test:", now: () => now });
  assert.equal(await limit("message", "ip-a", 2, 10), true);
  assert.equal(await limit("message", "ip-a", 2, 10), true);
  assert.equal(await limit("message", "ip-a", 2, 10), false);
  now = 11000;
  assert.equal(await limit("message", "ip-a", 2, 10), true);
});

function response() {
  return {
    headers: {},
    statusCode: 0,
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); }
  };
}

function fakeRedis() {
  const records = new Map([
    ["r-open", { reason: "harassment", status: "open", createdAt: "1000", reported: "socket-b" }],
    ["r-done", { reason: "spam", status: "resolved", createdAt: "900", reported: "socket-c" }]
  ]);
  const rateCounts = new Map();
  return {
    async eval(_script, _keyCount, key) {
      const count = (rateCounts.get(key) || 0) + 1;
      rateCounts.set(key, count);
      return count;
    },
    async zrevrange() { return ["r-open", "r-done"]; },
    async hgetall(key) { return records.get(key.split(":").at(-1)) || {}; },
    async exists(key) { return records.has(key.split(":").at(-1)) ? 1 : 0; },
    async hset(key, ...args) {
      const id = key.split(":").at(-1);
      const current = records.get(id);
      for (let i = 0; i < args.length; i += 2) current[args[i]] = args[i + 1];
      return 1;
    },
    records
  };
}

async function call(handler, request) {
  const res = response();
  await handler({ headers: {}, socket: {}, ...request }, res);
  return res;
}

test("moderation API refuses to run without a configured token", async () => {
  const handler = createModerationHandler({ getRedis: async () => fakeRedis(), token: "" });
  const res = await call(handler, { method: "GET", url: "/api/moderation" });
  assert.equal(res.statusCode, 503);
});

test("moderation API requires a bearer token and returns open reports", async () => {
  const redis = fakeRedis();
  const handler = createModerationHandler({ getRedis: async () => redis, token: "test-admin-token" });
  const denied = await call(handler, { method: "GET", url: "/api/moderation" });
  assert.equal(denied.statusCode, 401);

  const allowed = await call(handler, {
    method: "GET",
    url: "/api/moderation?status=open&limit=20",
    headers: { authorization: "Bearer test-admin-token" }
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.body.reports.length, 1);
  assert.equal(allowed.body.reports[0].id, "r-open");
});

test("moderation API validates and updates report status", async () => {
  const redis = fakeRedis();
  const handler = createModerationHandler({ getRedis: async () => redis, token: "test-admin-token", now: () => 1234 });
  const updated = await call(handler, {
    method: "PATCH",
    url: "/api/moderation",
    headers: { authorization: "Bearer test-admin-token" },
    body: { reportId: "r-open", status: "resolved" }
  });
  assert.equal(updated.statusCode, 400);

  const reportId = "d9428888-122b-4b2c-a7e8-0c3f8b4b9f31";
  redis.records.set(reportId, { reason: "spam", status: "open" });
  const result = await call(handler, {
    method: "PATCH",
    url: "/api/moderation",
    headers: { authorization: "Bearer test-admin-token" },
    body: { reportId, status: "dismissed" }
  });
  assert.equal(result.statusCode, 200);
  assert.equal(redis.records.get(reportId).status, "dismissed");
  assert.equal(redis.records.get(reportId).updatedAt, "1234");
});
