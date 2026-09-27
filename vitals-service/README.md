# vitals-service

WebSocket sidecar that streams camera frames to the **Presage SmartSpectra**
SDK and returns contactless vitals (pulse, breathing) with confidence.

The browser can't reach the native SDK directly, so the frontend captures
JPEG frames from its existing camera stream and pushes them here over a
WebSocket. This service decodes frames to RGB, runs the SDK, and streams
back JSON vitals. The Presage API key lives **only** here (server-side env).

> Wellness/informational use only. Not medical data. Never show a number
> while confidence is 0 — the frontend renders "Measuring..." instead.

## Setup

```bash
cd vitals-service
npm install
PRESAGE_API_KEY=your_key_here npm start   # listens on :8787
```

`PORT` overrides the listen port. The frontend's dev proxy forwards
`/vitals-ws` to this service (see root `package.json` / vite config in PR2).

## Wire protocol

Client → server: `{"type":"start"}`, `{"type":"stop"}`, binary JPEG frames.
Server → client: `{"type":"ready"|"busy"|"vitals"|"validation"|"error"|"bye"}`.
See `server.js` for the full schema.

One measurement session per process (the native SDK is process-global):
the first client to send `start` claims it; others get `busy`.

## Smoke test (no camera needed)

Feed a pre-recorded clip through the SDK and watch validation + vitals:

```bash
PRESAGE_API_KEY=your_key_here node smoke.js path/to/face-clip.mp4
```

A 30–60s, well-lit, mostly-still face clip gives real pulse (~12s window)
and breathing (~30s window) numbers. Without a visible face you still get
`validation` events proving the pipeline runs.

## Deploy (Render)

New **Web Service**: Node, build `npm install`, start `npm start`,
working directory `vitals-service/`, env `PRESAGE_API_KEY` set in the
Render dashboard (never committed). Health: the WS port itself; the
frontend treats vitals as optional and works fine when the service is
down or busy.
