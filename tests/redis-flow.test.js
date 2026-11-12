import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { io as connect } from "socket.io-client";
import { SOCKET_PATH } from "../public/socket-config.js";

const redisUrl = process.env.REDIS_TEST_URL;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const event = (socket, name, timeout = 8000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Timed out waiting for " + name)), timeout);
  socket.once(name, (value) => { clearTimeout(timer); resolve(value); });
  socket.once("connect_error", (error) => { clearTimeout(timer); reject(error); });
});

async function startServer(t, port, prefix) {
  const child = spawn(process.execPath, ["server/local.js"], {
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: String(port),
      REDIS_URL: redisUrl,
      WEILCHAT_REDIS_PREFIX: prefix,
      VERCEL: ""
    }
  });
  t.after(() => child.kill("SIGTERM"));
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch("http://127.0.0.1:" + port + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await sleep(150);
  }
  assert.equal(ready, true, "Redis-backed server should start on port " + port);
  return "http://127.0.0.1:" + port;
}

test("two server instances match and relay messages through Redis", { skip: !redisUrl }, async (t) => {
  const prefix = "weilchat:test:" + randomUUID() + ":";
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
  t.after(() => redis.quit());

  const [urlA, urlB] = await Promise.all([
    startServer(t, 3111, prefix),
    startServer(t, 3112, prefix)
  ]);
  const a = connect(urlA, { path: SOCKET_PATH, transports: ["websocket"], forceNew: true, reconnection: false });
  const b = connect(urlB, { path: SOCKET_PATH, transports: ["websocket"], forceNew: true, reconnection: false });
  t.after(() => { a.close(); b.close(); });

  await Promise.all([event(a, "connect"), event(b, "connect")]);
  const waiting = event(a, "waiting");
  const matchedA = event(a, "matched");
  const matchedB = event(b, "matched");
  a.emit("find-match", { gender: "man", preference: "woman", adult: true });
  await waiting;
  b.emit("find-match", { gender: "woman", preference: "man", adult: true });
  await Promise.all([matchedA, matchedB]);

  assert.equal(await redis.hget(prefix + "user:" + a.id, "status"), "matched");
  assert.equal(await redis.hget(prefix + "user:" + b.id, "status"), "matched");

  const received = event(b, "chat-message");
  a.emit("chat-message", { text: "redis cross-instance message" });
  assert.equal((await received).text, "redis cross-instance message");

  const partnerLeft = event(b, "partner-left");
  const reset = event(a, "chat-reset");
  a.emit("next");
  await Promise.all([partnerLeft, reset]);

  assert.equal(await redis.exists(prefix + "user:" + a.id), 0);
  assert.equal(await redis.hget(prefix + "user:" + b.id, "status"), "idle");

  await redis.del(prefix + "user:" + b.id, prefix + "queue:man:woman", prefix + "queue:woman:man");
});
