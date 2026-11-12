import { io } from "socket.io-client";
import { SOCKET_PATH } from "../public/socket-config.js";

const baseUrl = process.env.WEILCHAT_PRODUCTION_URL;
const moderationToken = process.env.WEILCHAT_MODERATION_TOKEN;

if (!baseUrl || !moderationToken) {
  console.error("Set WEILCHAT_PRODUCTION_URL and WEILCHAT_MODERATION_TOKEN before running the production smoke test.");
  process.exit(1);
}

const timeout = (promise, label, ms = 15000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out: " + label)), ms))
]);

const waitForEvent = (socket, name, ms = 15000) => timeout(new Promise((resolve) => {
  socket.once(name, resolve);
}), name, ms);

const once = (socket, name, ms = 15000) => timeout(new Promise((resolve, reject) => {
  const onEvent = (value) => {
    cleanup();
    resolve(value);
  };
  const onError = (error) => {
    cleanup();
    reject(error);
  };
  const cleanup = () => {
    clearTimeout(timer);
    socket.off(name, onEvent);
    socket.off("connect_error", onError);
  };
  const timer = setTimeout(() => {
    cleanup();
    reject(new Error("Timed out: " + name));
  }, ms);
  socket.once(name, onEvent);
  socket.once("connect_error", onError);
}), name, ms + 500);

const connect = () => io(baseUrl, {
  path: SOCKET_PATH,
  addTrailingSlash: false,
  transports: ["websocket"],
  forceNew: true,
  reconnection: true,
  reconnectionAttempts: 8,
  reconnectionDelay: 500,
  reconnectionDelayMax: 1500,
  timeout: 12000
});

const waitForMatch = async (a, b) => {
  const matchedA = once(a, "matched");
  const matchedB = once(b, "matched");
  a.emit("find-match", { gender: "man", preference: "woman", adult: true });
  b.emit("find-match", { gender: "woman", preference: "man", adult: true });
  await Promise.all([matchedA, matchedB]);
};

const a = connect();
const b = connect();
let reportId;

try {
  const [connectedA, connectedB] = await Promise.all([once(a, "connect"), once(b, "connect")]);
  console.log("WebSocket handshake passed", { a: connectedA, b: connectedB });

  await waitForMatch(a, b);
  const firstMessage = once(b, "chat-message");
  a.emit("chat-message", { text: "Weilchat production smoke test" });
  if ((await firstMessage).text !== "Weilchat production smoke test") throw new Error("Message relay failed");
  console.log("Two independent users matched and exchanged a message");

  const report = once(a, "report-received");
  a.emit("report", { reason: "other" });
  reportId = (await report).reportId;
  const auth = { Authorization: "Bearer " + moderationToken };
  const listResponse = await fetch(new URL("/api/moderation?status=open&limit=50", baseUrl), { headers: auth });
  const list = await listResponse.json();
  if (!listResponse.ok || !list.reports?.some((item) => item.id === reportId)) {
    throw new Error("Report was not visible in moderation queue");
  }
  const resolveResponse = await fetch(new URL("/api/moderation", baseUrl), {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ reportId, status: "dismissed" })
  });
  if (!resolveResponse.ok) throw new Error("Could not dismiss smoke-test report");
  console.log("Reporting and moderation queue passed; smoke-test report dismissed");

  const partnerLeft = once(b, "partner-left");
  const reconnected = waitForEvent(a, "connect", 25000);
  a.io.engine.close();
  await partnerLeft;
  await reconnected;
  console.log("Transport reconnect passed");

  await waitForMatch(a, b);
  const secondMessage = once(b, "chat-message");
  a.emit("chat-message", { text: "Reconnect recovery passed" });
  if ((await secondMessage).text !== "Reconnect recovery passed") throw new Error("Post-reconnect relay failed");
  console.log("Users rematched and exchanged a message after reconnect");

  const left = once(b, "partner-left");
  const reset = once(a, "chat-reset");
  a.emit("next");
  await Promise.all([left, reset]);
  console.log("Leave and partner notification passed");
} catch (error) {
  console.error("Production smoke test failed:", error);
  process.exitCode = 1;
} finally {
  if (reportId) {
    try {
      await fetch(new URL("/api/moderation", baseUrl), {
        method: "PATCH",
        headers: { Authorization: "Bearer " + moderationToken, "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, status: "dismissed" })
      });
    } catch (error) {
      console.error("Could not clean up the smoke-test report:", error.message);
    }
  }
  a.close();
  b.close();
}
