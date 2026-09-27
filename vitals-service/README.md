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

> The SDK pins its TLS certificates, so the smoke test needs direct
> internet access — it fails behind TLS-intercepting proxies (e.g. dev
> sandboxes). On headless Linux it also needs a D-Bus user session for
> device-key provisioning, or the no-emd SDK variant. Render/your laptop
> are fine; sandboxed CI is not.

## Deploy (Render)

The frontend needs this service reachable at a public WebSocket URL.
Whoever owns the Render account (the main API already lives there):

1. Render dashboard → **New +** → **Web Service** → connect the
   `MagdiHajjaj/gymlens` repo.
2. Settings:
   - **Branch**: `main` (merge the vitals stack first)
   - **Root Directory**: `vitals-service`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - Instance: Free is fine for testing.
3. **Environment** → add variable:
   - `PRESAGE_API_KEY` = the key from the Presage dashboard
     (https://presagetech.com → sign in → Dashboard → API keys).
     Render supplies `PORT` automatically; the service reads it.
     Never commit the key — it stays in Render's env only.
4. Deploy, then copy the service URL, e.g.
   `https://gymlens-vitals.onrender.com`.
5. In the frontend host (Vercel), set:
   - `VITE_VITALS_WS_URL` = `wss://gymlens-vitals.onrender.com`
     (note `wss`, not `https`). Redeploy the frontend.

**Verify**: open the site, start a workout, begin a rest — the Vitals
panel should go from "Connecting…" to "Measuring…" and then show a
pulse number. On mobile, tap "Check vitals" during rest.

Notes:

- Free-tier Render sleeps when idle: the first measurement after a
  while can take ~30s while the service wakes. The panel shows
  "Connecting…" meanwhile and the workout is unaffected.
- The SDK pins its TLS certificates, so the service needs direct
  internet (fine on Render).
- If the service is down or busy, the frontend treats vitals as
  optional: the panel shows "service unavailable" and everything
  else keeps working.
