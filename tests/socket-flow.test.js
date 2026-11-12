import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { io as connect } from "socket.io-client";
import { SOCKET_PATH } from "../public/socket-config.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const event = (socket, name, timeout = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), timeout);
  socket.once(name, (value) => { clearTimeout(timer); resolve(value); });
});

async function startLocalServer(t) {
  const port = 3107;
  const server = spawn(process.execPath, ["server/local.js"], {
    stdio: "ignore",
    env: { ...process.env, PORT: String(port), REDIS_URL: "" }
  });
  t.after(() => server.kill("SIGTERM"));
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/api/health`)).ok) { ready = true; break; }
    } catch {}
    await sleep(100);
  }
  assert.equal(ready, true, "local server should start");
  return `http://localhost:${port}`;
}

function client(url) {
  return connect(url, { path: SOCKET_PATH, transports: ["websocket"], forceNew: true, reconnection: false, timeout: 3000 });
}

test("reciprocal users match and exchange messages over the configured Socket.IO path", async (t) => {
  const url = await startLocalServer(t);
  const a = client(url);
  const b = client(url);
  t.after(() => { a.close(); b.close(); });
  await Promise.all([event(a, "connect"), event(b, "connect")]);

  const waitingA = event(a, "waiting");
  const matchedA = event(a, "matched");
  const matchedB = event(b, "matched");
  a.emit("find-match", { gender: "man", preference: "woman", adult: true });
  await waitingA;
  b.emit("find-match", { gender: "woman", preference: "man", adult: true });
  await Promise.all([matchedA, matchedB]);

  const received = event(b, "chat-message");
  a.emit("chat-message", { text: "hello from A" });
  const message = await received;
  assert.equal(message.text, "hello from A");
  assert.equal(message.from, "Stranger");
});

test("invalid legacy gender values are rejected without entering the queue", async (t) => {
  const url = await startLocalServer(t);
  const a = client(url);
  t.after(() => a.close());
  await event(a, "connect");
  const error = event(a, "chat-error");
  a.emit("find-match", { gender: "Male", preference: "Female", adult: true });
  assert.match(await error, /Choose a gender/);
});

test("next removes a matched user and notifies the remaining peer", async (t) => {
  const url = await startLocalServer(t);
  const a = client(url);
  const b = client(url);
  t.after(() => { a.close(); b.close(); });
  await Promise.all([event(a, "connect"), event(b, "connect")]);
  const waiting = event(a, "waiting");
  const matchedA = event(a, "matched");
  const matchedB = event(b, "matched");
  a.emit("find-match", { gender: "man", preference: "woman", adult: true });
  await waiting;
  b.emit("find-match", { gender: "woman", preference: "man", adult: true });
  await Promise.all([matchedA, matchedB]);

  const partnerLeft = event(b, "partner-left");
  const reset = event(a, "chat-reset");
  a.emit("next");
  await Promise.all([partnerLeft, reset]);

  const waitingAgain = event(a, "waiting");
  a.emit("find-match", { gender: "man", preference: "woman", adult: true });
  await waitingAgain;
});

test("a disconnected waiter cannot be matched from a stale local queue entry", async (t) => {
  const url = await startLocalServer(t);
  const disconnected = client(url);
  await event(disconnected, "connect");
  const waiting = event(disconnected, "waiting");
  disconnected.emit("find-match", { gender: "man", preference: "woman", adult: true });
  await waiting;
  disconnected.close();

  const nextUser = client(url);
  t.after(() => nextUser.close());
  await event(nextUser, "connect");
  const nextWaiting = event(nextUser, "waiting");
  const unexpectedMatch = event(nextUser, "matched", 700).then(() => true, () => false);
  nextUser.emit("find-match", { gender: "woman", preference: "man", adult: true });
  await nextWaiting;
  assert.equal(await unexpectedMatch, false, "a disconnected socket must not be matched");
});

test("simultaneous reciprocal searches produce one shared match", async (t) => {
  const url = await startLocalServer(t);
  const a = client(url);
  const b = client(url);
  t.after(() => { a.close(); b.close(); });
  await Promise.all([event(a, "connect"), event(b, "connect")]);
  const matchedA = event(a, "matched");
  const matchedB = event(b, "matched");
  a.emit("find-match", { gender: "man", preference: "woman", adult: true });
  b.emit("find-match", { gender: "woman", preference: "man", adult: true });
  await Promise.all([matchedA, matchedB]);
  assert.equal(a.connected, true);
  assert.equal(b.connected, true);
});
