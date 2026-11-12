import { timingSafeEqual } from "node:crypto";
import { clientAddress, hashClientAddress, createRateLimiter } from "./security.js";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

function matchesToken(received, expected) {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createModerationHandler({ getRedis, token, prefix = "weilchat:v1:", now = Date.now }) {
  let limiter;

  return async function moderationHandler(req, res) {
    if (!token) return send(res, 503, { error: "Moderation is not configured." });

    let redis;
    try {
      redis = await getRedis();
      if (!limiter) limiter = createRateLimiter({ redis, prefix, secret: token, now });
      const ip = clientAddress({ handshake: { headers: req.headers, address: req.socket && req.socket.remoteAddress } });
      const ipHash = hashClientAddress(ip, token);
      if (!(await limiter("admin", ipHash, 20, 60))) {
        return send(res, 429, { error: "Too many moderation requests. Try again shortly." });
      }
    } catch {
      return send(res, 503, { error: "Moderation is temporarily unavailable." });
    }

    const authorization = req.headers && req.headers.authorization || "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!matchesToken(supplied, token)) return send(res, 401, { error: "Unauthorized." });

    try {
      if (req.method === "GET") {
        const url = new URL(req.url || "/api/moderation", "http://localhost");
        const status = url.searchParams.get("status") || "open";
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
        if (!["open", "resolved", "dismissed", "all"].includes(status)) {
          return send(res, 400, { error: "Invalid status filter." });
        }

        const ids = await redis.zrevrange(prefix + "reports:index", 0, 499);
        const records = await Promise.all(ids.map(async (id) => {
          const data = await redis.hgetall(prefix + "report:" + id);
          return data && Object.keys(data).length ? { id, ...data } : null;
        }));
        const reports = records
          .filter(Boolean)
          .filter((report) => status === "all" || report.status === status)
          .slice(0, limit);
        return send(res, 200, { reports });
      }

      if (req.method === "PATCH") {
        const body = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return send(res, 400, { error: "A JSON object is required." });
        }
        const reportId = body.reportId;
        const status = body.status;
        if (typeof reportId !== "string" || !/^[0-9a-f-]{36}$/i.test(reportId) ||
            !["resolved", "dismissed"].includes(status)) {
          return send(res, 400, { error: "Invalid report update." });
        }
        const key = prefix + "report:" + reportId;
        if (!(await redis.exists(key))) return send(res, 404, { error: "Report not found." });
        await redis.hset(key, "status", status, "updatedAt", String(now()));
        return send(res, 200, { ok: true, reportId, status });
      }

      res.setHeader("Allow", "GET, PATCH");
      return send(res, 405, { error: "Method not allowed." });
    } catch (error) {
      console.error("moderation request failed", error);
      return send(res, 503, { error: "Moderation is temporarily unavailable." });
    }
  };
}
