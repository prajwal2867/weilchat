import Redis from "ioredis";
import { createModerationHandler } from "../server/moderation.js";

const prefix = process.env.WEILCHAT_REDIS_PREFIX || "weilchat:v1:";
let redis;

async function getRedis() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is not configured");
  if (!redis) redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
  if (redis.status === "wait") await redis.connect();
  return redis;
}

const handler = createModerationHandler({
  getRedis,
  token: process.env.MODERATION_TOKEN,
  prefix
});

export default handler;
