import express from "express";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import handler from "../api/socket-io.js";

const app = express();
const here = fileURLToPath(new URL("../public/", import.meta.url));
app.use(express.static(resolve(here)));
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "weilchat", redis: Boolean(process.env.REDIS_URL) }));
handler.on("request", app);
const port = Number(process.env.PORT || 3000);
handler.listen(port, () => console.log("Weilchat listening at http://localhost:" + port));

