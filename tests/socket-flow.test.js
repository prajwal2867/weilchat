import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io as connect } from 'socket.io-client';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

 test('two strangers with reciprocal gender choices can match and exchange text', async (t) => {
  const server = spawn(process.execPath, ['server/local.js'], { stdio: 'ignore', env: { ...process.env, PORT: '3107' } });
  t.after(() => server.kill('SIGTERM'));
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch('http://localhost:3107/api/health')).ok) { ready = true; break; } } catch {}
    await sleep(100);
  }
  assert.equal(ready, true, 'local server should start');

  const a = connect('http://localhost:3107', { path: '/api/socket-io/socket.io', transports: ['websocket'], forceNew: true });
  const b = connect('http://localhost:3107', { path: '/api/socket-io/socket.io', transports: ['websocket'], forceNew: true });
  t.after(() => { a.close(); b.close(); });
  await Promise.all([new Promise((r, j) => a.once('connect', r).once('connect_error', j)), new Promise((r, j) => b.once('connect', r).once('connect_error', j))]);

  const matchedA = new Promise((resolve) => a.once('matched', resolve));
  const matchedB = new Promise((resolve) => b.once('matched', resolve));
  a.emit('find-match', { gender: 'man', preference: 'woman', adult: true });
  await new Promise((resolve) => a.once('waiting', resolve));
  b.emit('find-match', { gender: 'woman', preference: 'man', adult: true });
  await Promise.all([matchedA, matchedB]);

  const received = new Promise((resolve) => b.once('chat-message', resolve));
  a.emit('chat-message', { text: 'hello from A' });
  const message = await received;
  assert.equal(message.text, 'hello from A');
  assert.equal(message.from, 'Stranger');
 });
