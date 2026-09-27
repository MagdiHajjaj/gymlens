import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 18987;

function spawnServer(env = {}) {
  const child = spawn('node', ['--import', './test/setup-mock.mjs', 'server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(PORT), PRESAGE_API_KEY: 'test-key', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}

function waitForOutput(child, needle, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${needle}; got: ${out}`)), timeoutMs);
    const onData = (d) => {
      out += d.toString();
      if (out.includes(needle)) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        child.stderr.off('data', onData);
        resolve(out);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function nextMessage(ws, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for message')), timeoutMs);
    ws.once('message', (data, isBinary) => {
      clearTimeout(timer);
      resolve(isBinary ? data : JSON.parse(data.toString()));
    });
  });
}

test('server exits without PRESAGE_API_KEY', async () => {
  const child = spawn('node', ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(PORT + 1) },
    stdio: 'ignore',
  });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(code, 1);
});

test('start -> ready; second client -> busy; stop -> bye; session released', async () => {
  const child = spawnServer();
  await waitForOutput(child, `listening on :${PORT}`);
  try {
    const a = await connect();
    const b = await connect();

    a.send(JSON.stringify({ type: 'start' }));
    assert.deepEqual(await nextMessage(a), { type: 'ready' });

    b.send(JSON.stringify({ type: 'start' }));
    assert.deepEqual(await nextMessage(b), { type: 'busy' });

    a.send(JSON.stringify({ type: 'stop' }));
    assert.deepEqual(await nextMessage(a), { type: 'bye' });

    // session released: b can now claim it
    b.send(JSON.stringify({ type: 'start' }));
    assert.deepEqual(await nextMessage(b), { type: 'ready' });
    b.send(JSON.stringify({ type: 'stop' }));
    assert.deepEqual(await nextMessage(b), { type: 'bye' });

    a.close();
    b.close();
  } finally {
    child.kill();
  }
});

test('invalid JSON and pre-start binary frames are ignored', async () => {
  const child = spawnServer();
  await waitForOutput(child, `listening on :${PORT}`);
  try {
    const ws = await connect();
    ws.send('this is not json{{{');
    ws.send(Buffer.from([0xff, 0xd8, 0xff, 0x00])); // binary before start
    // no crash: server still answers start
    ws.send(JSON.stringify({ type: 'start' }));
    assert.deepEqual(await nextMessage(ws), { type: 'ready' });
    ws.close();
  } finally {
    child.kill();
  }
});

test('holder disconnect releases the session', async () => {
  const child = spawnServer();
  await waitForOutput(child, `listening on :${PORT}`);
  try {
    const a = await connect();
    a.send(JSON.stringify({ type: 'start' }));
    assert.deepEqual(await nextMessage(a), { type: 'ready' });
    a.terminate(); // abrupt disconnect without stop
    await sleep(500);
    const b = await connect();
    b.send(JSON.stringify({ type: 'start' }));
    assert.deepEqual(await nextMessage(b), { type: 'ready' });
    b.close();
  } finally {
    child.kill();
  }
});
