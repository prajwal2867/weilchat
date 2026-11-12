import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { preferenceForGender, isValidMatchSelection } from "../public/matchmaking.js";
import { SOCKET_PATH, SOCKET_SERVER_PATH } from "../public/socket-config.js";

test("the public gender choices use the backend's canonical values", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /name="gender" value="man"/);
  assert.match(html, /name="gender" value="woman"/);
  assert.doesNotMatch(html, /name="gender" value="Male"|name="gender" value="Female"/);
});

test("gender selection derives exactly the opposite preference", () => {
  assert.equal(preferenceForGender("man"), "woman");
  assert.equal(preferenceForGender("woman"), "man");
  assert.equal(preferenceForGender("other"), null);
  assert.equal(isValidMatchSelection({ gender: "man", preference: "woman" }), true);
  assert.equal(isValidMatchSelection({ gender: "woman", preference: "man" }), true);
  assert.equal(isValidMatchSelection({ gender: "man", preference: "man" }), false);
  assert.equal(isValidMatchSelection({ gender: "Male", preference: "Female" }), false);
  assert.equal(isValidMatchSelection({ gender: "woman", preference: "woman" }), false);
});

test("the Socket.IO path maps to an exact Vercel function route", async () => {
  const [api, app, integration, localServer, vercelText] = await Promise.all([
    readFile(new URL("../server/socket-server.js", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("./socket-flow.test.js", import.meta.url), "utf8"),
    readFile(new URL("../server/local.js", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8")
  ]);
  const vercelConfig = JSON.parse(vercelText);
  assert.equal(SOCKET_PATH, "/api/socket-io/socket.io");
  assert.equal(SOCKET_SERVER_PATH, SOCKET_PATH);
  assert.ok(api.includes("path: SOCKET_SERVER_PATH"));
  assert.ok(app.includes("path: SOCKET_PATH"));
  assert.ok(integration.includes("path: SOCKET_PATH"));
  assert.ok(localServer.includes("socket-server.js"));
  assert.doesNotMatch(localServer, /rewriteSocketPath/);
  assert.ok(vercelConfig.functions["api/socket-io/socket.io.js"]);
});
