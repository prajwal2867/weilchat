import { createHmac } from "node:crypto";

export const REPORT_REASONS = Object.freeze([
  "harassment",
  "inappropriate",
  "spam",
  "underage",
  "other"
]);

const RATE_LIMIT_SCRIPT = [
  'local count = redis.call("INCR", KEYS[1])',
  'if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end',
  'return count'
].join("\n");

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateMatchPayload(payload) {
  if (!isPlainObject(payload)) return false;
  if (Object.keys(payload).some((key) => !["gender", "preference", "adult"].includes(key))) return false;
  return typeof payload.adult === "boolean";
}

export function validateMessagePayload(payload) {
  if (!isPlainObject(payload)) return false;
  if (Object.keys(payload).some((key) => key !== "text")) return false;
  return typeof payload.text === "string" && payload.text.trim().length > 0 && payload.text.trim().length <= 1000;
}

export function validateReportPayload(payload) {
  if (!isPlainObject(payload)) return false;
  if (Object.keys(payload).some((key) => key !== "reason")) return false;
  return REPORT_REASONS.includes(payload.reason);
}

export function clientAddress(socket) {
  const headers = socket && socket.handshake ? socket.handshake.headers || {} : {};
  const forwarded = headers["x-vercel-forwarded-for"] || headers["x-real-ip"] || headers["x-forwarded-for"];
  const address = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (typeof address === "string" ? address.split(",")[0].trim() : "") ||
    (socket && socket.handshake && socket.handshake.address) ||
    "unknown";
}

export function hashClientAddress(address, secret = "") {
  return createHmac("sha256", secret || "weilchat-local-rate-limit").update(String(address)).digest("hex");
}

export function createRateLimiter({ redis, prefix, secret = "", now = Date.now } = {}) {
  const local = new Map();

  return async function consumeRateLimit(scope, identity, max, windowSeconds) {
    const windowMs = windowSeconds * 1000;
    const bucket = Math.floor(now() / windowMs);
    const key = prefix + "rate:" + scope + ":" + identity + ":" + bucket;

    if (redis) {
      const count = Number(await redis.eval(RATE_LIMIT_SCRIPT, 1, key, String(windowSeconds + 2)));
      return count <= max;
    }

    const expiresAt = (bucket + 1) * windowMs;
    let entry = local.get(key);
    if (!entry || now() >= entry.expiresAt) {
      entry = { count: 0, expiresAt };
      local.set(key, entry);
    }
    entry.count += 1;

    if (local.size > 5000) {
      for (const [storedKey, stored] of local) {
        if (now() >= stored.expiresAt) local.delete(storedKey);
      }
    }

    return entry.count <= max;
  };
}
