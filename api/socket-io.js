import http from "node:http";
import { Server } from "socket.io";
import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";

const server = http.createServer();
const io = new Server(server, {
  path: "/api/socket-io/socket.io",
  transports: ["websocket"],
  cors: { origin: true, methods: ["GET", "POST"] },
  pingInterval: 20000,
  pingTimeout: 25000,
  maxHttpBufferSize: 16000
});

const redisUrl = process.env.REDIS_URL;
let redis;
let localWaiting = new Map();

if (redisUrl) {
  redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
  const publisher = redis.duplicate();
  const subscriber = redis.duplicate();
  await Promise.all([redis.connect(), publisher.connect(), subscriber.connect()]);
  io.adapter(createAdapter(publisher, subscriber));
}

const prefix = "weilchat:v1:";
const userKey = (id) => prefix + "user:" + id;
const queueKey = (gender, preference) => prefix + "queue:" + gender + ":" + preference;

const matchScript = `
local candidate = redis.call("LPOP", KEYS[1])
while candidate do
  local status = redis.call("HGET", ARGV[1] .. candidate, "status")
  if status == "waiting" then
    redis.call("HSET", ARGV[1] .. candidate, "status", "matched", "peer", ARGV[2], "room", ARGV[3])
    redis.call("HSET", ARGV[1] .. ARGV[2], "status", "matched", "peer", candidate, "room", ARGV[3])
    redis.call("EXPIRE", ARGV[1] .. candidate, 900)
    redis.call("EXPIRE", ARGV[1] .. ARGV[2], 900)
    return candidate
  end
  candidate = redis.call("LPOP", KEYS[1])
end
redis.call("RPUSH", KEYS[2], ARGV[2])
redis.call("HSET", ARGV[1] .. ARGV[2], "gender", ARGV[4], "preference", ARGV[5], "status", "waiting", "peer", "", "room", "")
redis.call("EXPIRE", ARGV[1] .. ARGV[2], 900)
return ""
`;

async function removeFromQueue(id, gender, preference) {
  if (redis) {
    await redis.lrem(queueKey(gender, preference), 0, id);
    await redis.del(userKey(id));
  } else localWaiting.delete(id);
}

async function findMatch(socket, gender, preference) {
  if (redis) {
    const room = "chat:" + crypto.randomUUID();
    const candidate = await redis.eval(
      matchScript, 2,
      queueKey(preference, gender),
      queueKey(gender, preference),
      prefix + "user:", socket.id, room, gender, preference
    );
    if (candidate) {
      socket.emit("matched", { partner: "Stranger" });
      io.to(candidate).emit("matched", { partner: "Stranger" });
      return;
    }
  } else {
    const reciprocal = [...localWaiting.entries()].find(([, item]) => item.gender === preference && item.preference === gender);
    if (reciprocal) {
      const [peerId] = reciprocal;
      localWaiting.delete(peerId);
      socket.data.peer = peerId;
      const peer = io.sockets.sockets.get(peerId);
      if (peer) {
        peer.data.peer = socket.id;
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
  const peerId = redis ? await redis.hget(userKey(socket.id), "peer") : socket.data.peer;
  if (redis) {
    const status = await redis.hget(userKey(socket.id), "status");
    if (status === "waiting" && socket.data.gender && socket.data.preference) {
      await redis.lrem(queueKey(socket.data.gender, socket.data.preference), 0, socket.id);
      await redis.del(userKey(socket.id));
    }
  } else if (socket.data.waiting && socket.data.gender) {
    await removeFromQueue(socket.id, socket.data.gender, socket.data.preference);
  }
  if (peerId) {
    if (redis) {
      await redis.hset(userKey(peerId), "status", "idle", "peer", "", "room", "");
      await redis.expire(userKey(peerId), 900);
      await redis.hset(userKey(socket.id), "status", "idle", "peer", "", "room", "");
    } else {
      const peer = io.sockets.sockets.get(peerId);
      if (peer) peer.data.peer = null;
    }
    if (notifyPeer) io.to(peerId).emit("partner-left");
  }
  socket.data.waiting = false;
  socket.data.peer = null;
}

io.on("connection", (socket) => {
  socket.data.lastMessageAt = 0;

  socket.on("find-match", async (payload = {}) => {
    try {
      const gender = payload.gender;
      const preference = payload.preference;
      if (payload.adult !== true) {
        socket.emit("chat-error", "You must confirm that you are 18 or older.");
        return;
      }
      if (process.env.VERCEL && !redis) {
        socket.emit("chat-error", "Chat is not configured yet. Please try again later.");
        return;
      }
      if (!["man", "woman"].includes(gender) || !["man", "woman"].includes(preference) || gender === preference) {
        socket.emit("chat-error", "Choose a gender and its opposite to continue.");
        return;
      }
      await leaveChat(socket, true);
      socket.data.gender = gender;
      socket.data.preference = preference;
      await findMatch(socket, gender, preference);
    } catch (error) {
      console.error("matchmaking error", error);
      socket.emit("chat-error", "Matchmaking is temporarily unavailable. Please try again.");
    }
  });

  socket.on("chat-message", async (payload = {}) => {
    const now = Date.now();
    const message = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!message || message.length > 1000) return;
    if (now - socket.data.lastMessageAt < 650) {
      socket.emit("chat-error", "Slow down a little.");
      return;
    }
    socket.data.lastMessageAt = now;
    try {
      const peerId = redis ? await redis.hget(userKey(socket.id), "peer") : socket.data.peer;
      const status = redis ? await redis.hget(userKey(socket.id), "status") : (peerId ? "matched" : "idle");
      if (status === "matched" && peerId) {
        io.to(peerId).emit("chat-message", { from: "Stranger", text: message, timestamp: Date.now() });
      }
    } catch (error) {
      console.error("message relay error", error);
    }
  });

  socket.on("next", async () => {
    try {
      await leaveChat(socket, true);
      socket.emit("chat-reset");
    } catch {
      socket.emit("chat-error", "Couldn't leave this chat. Please reconnect.");
    }
  });

  socket.on("report", async (payload = {}) => {
    const reason = typeof payload.reason === "string" ? payload.reason.slice(0, 120) : "Other";
    try {
      if (redis) {
        const reported = await redis.hget(userKey(socket.id), "peer");
        await redis.lpush(prefix + "reports", JSON.stringify({ reporter: socket.id, reported, reason, at: Date.now() }));
        await redis.ltrim(prefix + "reports", 0, 499);
        await redis.expire(prefix + "reports", 2592000);
      }
      socket.emit("report-received");
    } catch {
      socket.emit("chat-error", "Report could not be submitted right now.");
    }
  });

  socket.on("disconnect", async () => {
    try {
      await leaveChat(socket, true);
      if (redis) await redis.del(userKey(socket.id));
    } catch (error) {
      console.error("disconnect cleanup error", error);
    }
  });
});

export default server;

