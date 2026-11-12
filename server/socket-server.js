import http from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "socket.io";
import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import { isValidMatchSelection } from "../public/matchmaking.js";
import { SOCKET_SERVER_PATH } from "../public/socket-config.js";
import {
  clientAddress,
  createRateLimiter,
  hashClientAddress,
  validateMatchPayload,
  validateMessagePayload,
  validateReportPayload
} from "./security.js";

export { SOCKET_SERVER_PATH };

const server = http.createServer();
const io = new Server(server, {
  path: SOCKET_SERVER_PATH,
  addTrailingSlash: false,
  transports: ["websocket"],
  cors: { origin: true, methods: ["GET", "POST"] },
  pingInterval: 20000,
  pingTimeout: 25000,
  maxHttpBufferSize: 16000
});

const redisUrl = process.env.REDIS_URL;
let redis;
const localWaiting = new Map();

if (redisUrl) {
  redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
  const publisher = redis.duplicate();
  const subscriber = redis.duplicate();
  await Promise.all([redis.connect(), publisher.connect(), subscriber.connect()]);
  io.adapter(createAdapter(publisher, subscriber));
}

const prefix = process.env.WEILCHAT_REDIS_PREFIX || "weilchat:v1:";
const rateLimit = createRateLimiter({ redis, prefix, secret: redisUrl || "weilchat-local" });
const localReports = [];
const userKey = (id) => prefix + "user:" + id;
const queueKey = (gender, preference) => prefix + "queue:" + gender + ":" + preference;

// Matching and queue insertion happen in one Redis transaction. Stale queue
// entries are discarded, and only a genuinely reciprocal selection can match.
const matchScript = `
local candidate = redis.call("LPOP", KEYS[1])
while candidate do
  local candidateKey = ARGV[1] .. candidate
  local status = redis.call("HGET", candidateKey, "status")
  local candidateGender = redis.call("HGET", candidateKey, "gender")
  local candidatePreference = redis.call("HGET", candidateKey, "preference")
  if status == "waiting" and candidateGender == ARGV[4] and candidatePreference == ARGV[5] then
    redis.call("HSET", candidateKey, "status", "matched", "peer", ARGV[2], "room", ARGV[3])
    redis.call("HSET", ARGV[1] .. ARGV[2], "gender", ARGV[6], "preference", ARGV[7], "status", "matched", "peer", candidate, "room", ARGV[3])
    redis.call("EXPIRE", candidateKey, 900)
    redis.call("EXPIRE", ARGV[1] .. ARGV[2], 900)
    return candidate
  end
  candidate = redis.call("LPOP", KEYS[1])
end
redis.call("LREM", KEYS[2], 0, ARGV[2])
redis.call("RPUSH", KEYS[2], ARGV[2])
redis.call("HSET", ARGV[1] .. ARGV[2], "gender", ARGV[6], "preference", ARGV[7], "status", "waiting", "peer", "", "room", "")
redis.call("EXPIRE", ARGV[1] .. ARGV[2], 900)
redis.call("EXPIRE", KEYS[2], 900)
return ""
`;

// Leaving is atomic: remove a waiting user from their queue, clear the peer
// only if the peer still points back to this socket, then delete this user.
const leaveScript = `
local userKey = KEYS[1]
local status = redis.call("HGET", userKey, "status")
local peer = redis.call("HGET", userKey, "peer")
redis.call("LREM", KEYS[2], 0, ARGV[2])
redis.call("LREM", KEYS[3], 0, ARGV[2])
if peer and peer ~= "" then
  local peerKey = ARGV[1] .. "user:" .. peer
  if redis.call("HGET", peerKey, "peer") == ARGV[2] then
    redis.call("HSET", peerKey, "status", "idle", "peer", "", "room", "")
    redis.call("EXPIRE", peerKey, 900)
  else
    peer = ""
  end
end
redis.call("DEL", userKey)
return {peer or "", status or "idle"}
`;

async function findMatch(socket, gender, preference) {
  if (redis) {
    const room = "chat:" + randomUUID();
    const candidate = await redis.eval(
      matchScript,
      2,
      queueKey(preference, gender),
      queueKey(gender, preference),
      prefix + "user:",
      socket.id,
      room,
      preference,
      gender,
      gender,
      preference
    );
    if (candidate) {
      socket.data.waiting = false;
      socket.emit("matched", { partner: "Stranger" });
      io.to(candidate).emit("matched", { partner: "Stranger" });
      return;
    }
  } else {
    const reciprocal = [...localWaiting.entries()].find(([, item]) =>
      item.gender === preference && item.preference === gender
    );
    if (reciprocal) {
      const [peerId] = reciprocal;
      localWaiting.delete(peerId);
      const peer = io.sockets.sockets.get(peerId);
      if (peer) {
        socket.data.peer = peerId;
        socket.data.waiting = false;
        peer.data.peer = socket.id;
        peer.data.waiting = false;
        socket.emit("matched", { partner: "Stranger" });
        peer.emit("matched", { partner: "Stranger" });
        return;
      }
    }
    localWaiting.set(socket.id, { gender, preference });
  }

  socket.data.gender = gender;
  socket.data.preference = preference;
  socket.data.waiting = true;
  socket.emit("waiting");
}

async function leaveChat(socket, notifyPeer = true) {
  let peerId = null;
  if (redis) {
    const result = await redis.eval(
      leaveScript,
      3,
      userKey(socket.id),
      queueKey("man", "woman"),
      queueKey("woman", "man"),
      prefix,
      socket.id
    );
    peerId = result?.[0] || null;
  } else {
    if (socket.data.waiting) localWaiting.delete(socket.id);
    peerId = socket.data.peer || null;
    if (peerId) {
      const peer = io.sockets.sockets.get(peerId);
      if (peer && peer.data.peer === socket.id) {
        peer.data.peer = null;
        peer.data.waiting = false;
      } else {
        peerId = null;
      }
    }
  }

  if (peerId && notifyPeer) io.to(peerId).emit("partner-left");
  socket.data.waiting = false;
  socket.data.peer = null;
}

io.use(async (socket, next) => {
  const identity = hashClientAddress(clientAddress(socket), redisUrl || "weilchat-local");
  socket.data.rateLimitIdentity = identity;
  try {
    if (!(await rateLimit("connection", identity, 40, 60))) {
      return next(new Error("Too many connections. Please wait a minute and try again."));
    }
    next();
  } catch (error) {
    console.error("connection rate limit failed", error);
    next(new Error("Connection is temporarily unavailable. Please try again."));
  }
});

async function consumeEventLimit(socket, scope, max, windowSeconds) {
  const identity = socket.data.rateLimitIdentity ||
    hashClientAddress(clientAddress(socket), redisUrl || "weilchat-local");
  try {
    const allowed = await rateLimit(scope, identity, max, windowSeconds);
    if (!allowed) socket.emit("chat-error", "You're doing that too quickly. Please wait and try again.");
    return allowed;
  } catch (error) {
    console.error("event rate limit failed", error);
    socket.emit("chat-error", "This action is temporarily unavailable. Please try again.");
    return false;
  }
}

io.on("connection", (socket) => {
  socket.data.lastMessageAt = 0;

  socket.on("find-match", async (payload) => {
    try {
      if (!validateMatchPayload(payload)) {
        socket.emit("chat-error", "Invalid matchmaking request.");
        return;
      }
      if (!(await consumeEventLimit(socket, "search", 20, 60))) return;
      if (payload.adult !== true) {
        socket.emit("chat-error", "You must confirm that you are 18 or older.");
        return;
      }
      if (process.env.VERCEL && !redis) {
        socket.emit("chat-error", "Chat is not configured yet. Please try again later.");
        return;
      }
      if (!isValidMatchSelection(payload)) {
        socket.emit("chat-error", "Choose a gender and its opposite to continue.");
        return;
      }
      await leaveChat(socket, true);
      socket.data.gender = payload.gender;
      socket.data.preference = payload.preference;
      await findMatch(socket, payload.gender, payload.preference);
    } catch (error) {
      console.error("matchmaking error", error);
      socket.emit("chat-error", "Matchmaking is temporarily unavailable. Please try again.");
    }
  });

  socket.on("chat-message", async (payload) => {
    const now = Date.now();
    if (!validateMessagePayload(payload)) {
      socket.emit("chat-error", "Messages must contain between 1 and 1000 characters.");
      return;
    }
    const message = payload.text.trim();
    if (!(await consumeEventLimit(socket, "message", 45, 60))) return;
    if (now - socket.data.lastMessageAt < 650) {
      socket.emit("chat-error", "Slow down a little.");
      return;
    }
    socket.data.lastMessageAt = now;
    try {
      const peerId = redis ? await redis.hget(userKey(socket.id), "peer") : socket.data.peer;
      const status = redis ? await redis.hget(userKey(socket.id), "status") : (peerId ? "matched" : "idle");
      if (status !== "matched" || !peerId) {
        socket.emit("chat-error", "You are not in an active chat.");
        return;
      }
      io.to(peerId).emit("chat-message", { from: "Stranger", text: message, timestamp: Date.now() });
    } catch (error) {
      console.error("message relay error", error);
    }
  });

  socket.on("next", async (payload) => {
    if (payload !== undefined) {
      socket.emit("chat-error", "Invalid request.");
      return;
    }
    if (!(await consumeEventLimit(socket, "next", 30, 60))) return;
    try {
      await leaveChat(socket, true);
      socket.emit("chat-reset");
    } catch {
      socket.emit("chat-error", "Couldn't leave this chat. Please reconnect.");
    }
  });

  socket.on("report", async (payload) => {
    if (!validateReportPayload(payload)) {
      socket.emit("chat-error", "Choose a valid report reason.");
      return;
    }
    if (!(await consumeEventLimit(socket, "report", 3, 600))) return;

    try {
      const reported = redis
        ? await redis.hget(userKey(socket.id), "peer")
        : socket.data.peer;
      const activeStatus = redis
        ? await redis.hget(userKey(socket.id), "status")
        : (reported ? "matched" : "idle");
      if (activeStatus !== "matched" || !reported) {
        socket.emit("chat-error", "You can report only an active conversation.");
        return;
      }

      const reportId = randomUUID();
      const createdAt = Date.now();
      if (redis) {
        const reportKey = prefix + "report:" + reportId;
        const reportIndex = prefix + "reports:index";
        await redis.multi()
          .zadd(reportIndex, String(createdAt), reportId)
          .hset(reportKey, "reporter", socket.id, "reported", reported, "reason", payload.reason, "createdAt", String(createdAt), "status", "open")
          .expire(reportKey, 2592000)
          .expire(reportIndex, 2592000)
          .exec();
      } else {
        localReports.unshift({
          id: reportId,
          reporter: socket.id,
          reported,
          reason: payload.reason,
          createdAt,
          status: "open"
        });
        if (localReports.length > 500) localReports.length = 500;
      }
      socket.emit("report-received", { reportId });
    } catch (error) {
      console.error("report submission failed", error);
      socket.emit("chat-error", "Report could not be submitted right now.");
    }
  });

  socket.on("disconnect", async () => {
    try {
      await leaveChat(socket, true);
    } catch (error) {
      console.error("disconnect cleanup error", error);
    }
  });
});

export default server;
