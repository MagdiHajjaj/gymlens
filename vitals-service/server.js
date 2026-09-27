/**
 * GymLens vitals sidecar.
 *
 * WebSocket server that accepts JPEG camera frames from the GymLens frontend,
 * runs them through the Presage SmartSpectra SDK, and streams back vitals.
 *
 * The native SDK keeps process-global state: exactly ONE measurement session
 * may be active per process. The first client to send {"type":"start"} claims
 * the session; further clients are told the service is busy until it ends.
 *
 * Wire protocol (client -> server):
 *   {"type":"start"}          claim the session and begin measuring
 *   {"type":"stop"}            end the session, release the service
 *   <binary JPEG frame>       one camera frame (any size; ~320px wide @ ~10fps recommended)
 *
 * Wire protocol (server -> client), all JSON:
 *   {"type":"ready"}                                        session claimed, measuring
 *   {"type":"busy"}                                         another client is measuring
 *   {"type":"vitals", pulse_bpm, pulse_confidence,
 *                     breathing_bpm, breathing_confidence, ts}
 *   {"type":"validation", code, hint}                       e.g. face not visible, too dark
 *   {"type":"error", message, retryable?}
 *   {"type":"bye"}                                          session ended
 *
 * Env:
 *   PRESAGE_API_KEY   required. Never commit it; set it in the deploy dashboard.
 *   PORT              default 8787
 *
 * Vitals are wellness/informational only, not medical data.
 */
import { WebSocketServer } from 'ws';
import { VitalsEngine } from './vitals-engine.js';

const PORT = Number(process.env.PORT ?? 8787);
const apiKey = process.env.PRESAGE_API_KEY;

if (!apiKey) {
  console.error('FATAL: PRESAGE_API_KEY is not set');
  process.exit(1);
}

const wss = new WebSocketServer({ port: PORT });

// Single-flight session: the SDK allows one active session per process.
let holder = null; // WebSocket currently measuring
let engine = null;

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

async function release() {
  if (engine) {
    const stats = engine.stats();
    console.log('session ended', stats);
    try {
      await engine.stop();
    } catch (err) {
      console.error('engine stop failed:', err.message);
    }
    engine = null;
  }
  if (holder) {
    send(holder, { type: 'bye' });
    holder = null;
  }
}

wss.on('connection', (ws) => {
  console.log('client connected');
  let isHolder = false;

  ws.on('message', async (data, isBinary) => {
    if (isBinary) {
      if (isHolder && engine) {
        const tsUs = Math.floor(performance.now() * 1000);
        engine.pushJpeg(Buffer.from(data), tsUs);
      }
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type === 'start') {
      if (holder) {
        send(ws, { type: 'busy' });
        return;
      }
      try {
        engine = new VitalsEngine({
          apiKey,
          onVitals: (v) => send(ws, v),
          onValidation: (v) => send(ws, v),
          onError: (v) => send(ws, v),
        });
        engine.start();
        holder = ws;
        isHolder = true;
        send(ws, { type: 'ready' });
        console.log('session started');
      } catch (err) {
        engine = null;
        send(ws, { type: 'error', message: `failed to start: ${err.message}` });
      }
    } else if (msg.type === 'stop') {
      if (isHolder) await release();
    }
  });

  ws.on('close', async () => {
    console.log('client disconnected');
    if (isHolder) await release();
  });
  ws.on('error', () => {});
});

console.log(`vitals-service listening on :${PORT}`);
