import express from "express";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import handler from "../api/socket-io.js";
import { SOCKET_PATH, SOCKET_SERVER_PATH } from "../public/socket-config.js";

const app = express();
const here = fileURLToPath(new URL("../public/", import.meta.url));
app.use(express.static(resolve(here)));
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "weilchat", redis: Boolean(process.env.REDIS_URL) }));
// Vercel strips the /api/socket-io function prefix before the Socket.IO
// handler sees the request. Mirror that routing locally for integration tests.
const socketFunctionPrefix = SOCKET_PATH.slice(0, -SOCKET_SERVER_PATH.length);
const rewriteSocketPath = (req) => {
  if (req.url?.startsWith(SOCKET_PATH)) {
    req.url = req.url.slice(socketFunctionPrefix.length);
  }
};
handler.prependListener("request", rewriteSocketPath);
handler.prependListener("upgrade", rewriteSocketPath);
handler.on("request", app);
const port = Number(process.env.PORT || 3000);
handler.listen(port, () => console.log("Weilchat listening at http://localhost:" + port));

