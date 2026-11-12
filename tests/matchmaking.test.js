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

test("the Socket.IO path is shared and uses the Vercel function endpoint", async () => {
  const [api, app, integration] = await Promise.all([
    readFile(new URL("../api/socket-io.js", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("./socket-flow.test.js", import.meta.url), "utf8")
  ]);
  assert.equal(SOCKET_PATH, "/api/socket-io/socket.io");
  assert.equal(SOCKET_SERVER_PATH, "/socket.io");
  assert.match(api, /path:\s*SOCKET_SERVER_PATH/);
  assert.match(app, /path:\s*SOCKET_PATH/);
  assert.match(integration, /path:\s*SOCKET_PATH/);
  const localServer = await readFile(new URL("../server/local.js", import.meta.url), "utf8");
  assert.match(localServer, /prependListener\("request", rewriteSocketPath\)/);
});
