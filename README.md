# Gym Lens

Private, browser-based exercise tracking and voice coaching, rebuilt from `gym-lens-plan.md`.

The application lives in **`frontend/` and `backend/`**. Root npm commands run these projects. Frontend configuration belongs in `frontend/.env`; API configuration and provider secrets belong in `backend/.env`.

## Run locally

Requires Node.js 22.12+ (tested with Node 24), Python 3.12+ (tested with 3.14), and [uv](https://docs.astral.sh/uv/).

```powershell
# First-time setup from the repository root:
npm run setup

# Start the frontend:
npm run dev
```

Open **http://127.0.0.1:5173**. Choose **Try the demo**, then **Start landmark demo**. A complete local session works without an API, accounts, or provider keys. Enable the camera to use MediaPipe; turn on voice to use your browser's installed speech engine.

`npm run setup` installs locked frontend dependencies, downloads the official Pose Landmarker Full model, and copies matching WASM files into `frontend/public/`. Subsequent camera sessions load these assets from the app's own origin. Internet is needed for setup, not for local inference. If installing directly inside `frontend`, also run `npm run assets`.

For the API, in another terminal:

```powershell
uv sync --directory backend --locked
Copy-Item backend/.env.example backend/.env
npm run api
```

API health: http://127.0.0.1:8000/health. Interactive contracts: http://127.0.0.1:8000/docs.

SQLite is an optional local API database and initializes automatically on startup. **All `/api` endpoints still require valid Auth0 tokens**; there is no guest authentication bypass. Guest sessions stay in browser storage. Do not replace an existing `.env` when repeating setup.

## Connect cloud services

For complete login, signup, password reset, and deployment configuration, follow the [Auth0 setup guide](docs/auth0-setup.md).

Copy `frontend/.env.example` to `frontend/.env` and fill in your own account configuration. Restart the relevant server after environment changes.

1. **Auth0:** create a Single Page Application and an API with RS256 tokens. Set allowed callback URLs, logout URLs, and web origins to `http://127.0.0.1:5173` (also add `http://localhost:5173` if used). Fill `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, and `VITE_AUTH0_AUDIENCE`. Set matching backend `AUTH0_DOMAIN` and `AUTH0_AUDIENCE`. Use the bare domain without `https://`. Use your deployed HTTPS origin in production.
2. **Tiger Data:** follow the [Tiger Data setup guide](docs/tiger-data-setup.md). Set backend `DATABASE_URL` to `postgresql+psycopg://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require`. URL-encode special characters in credentials. On a fresh managed database, run:

   ```powershell
   uv run --directory backend alembic upgrade head
   ```

   The migrations create the relational schema, convert metrics to a hypertable, add a real-time one-minute continuous aggregate, and move raw chunks older than seven days to columnstore. On ordinary PostgreSQL, metrics remain a regular table. The database user needs permission to create the extension. Local SQLite auto-initialization is a separate convenience path; do not run initial migrations over already auto-created tables.
3. **ElevenLabs:** set backend `ELEVENLABS_API_KEY`. The example configuration selects the premade **Rachel** voice (`21m00Tcm4TlvDq8ikWAM`) for a warm, clear coaching tone; replace `ELEVENLABS_VOICE_ID` with another library voice if preferred. Only bounded coaching phrases and measured summaries are sent. Audio is cached and browser speech is the fallback. Voice starts disabled until the athlete enables it with one tap on the setup screen.
4. **Gemini:** set backend `GEMINI_API_KEY` and optionally `GEMINI_MODEL` (default `gemini-3.8-flash`). Completed cloud reports request structured insights once and offer a retry on failure. Deterministic statistics remain available.
5. Set `VITE_API_BASE_URL` to your API origin and backend `CORS_ORIGINS` to a JSON array of allowed frontend origins.

Provider keys belong only in `backend/.env`. Never use a `VITE_` prefix for provider or database secrets. Auth0's SPA client ID and API audience are public configuration.

## Features

- Overview with exercise selection and totals computed from saved camera workouts.
- Squat, curl, and push-up analyzers with side-view calibration, visibility gates, smoothing, hysteresis, minimum duration, and complete-cycle counting.
- Local camera model, canvas skeleton, distinct camera error states, pause/resume recalibration, timer, optional spoken coaching, and replay fallback.
- Squat depth/torso cues, curl range/upper-arm cues, and push-up range/hip cues. No side-view knee-valgus claim.
- Independent left/right curl tracking with per-arm counts and a comfortable return threshold, plus an angle-driven muscle heatmap. Color represents joint bend, not measured muscle activation.
- Real-time voice coaching with prioritized, non-overlapping speech: early rep counts and milestones, persistent form corrections, set summaries, rest countdowns, and a measured session recap. Selected phrases warm in the background for account users; browser speech keeps the complete flow available without provider credentials. Manual set boundaries remain browser-local metadata while measured reps and metrics use the existing session API.
- Local reports and 50 recent browser sessions, separated by guest/account identity. Demo sessions are labeled and excluded from totals. JSON export is available.
- Protected FastAPI persistence, retry-safe uploads, account history, angle charts, and validated Gemini insights.
- Local backup before cloud upload, visible pending-save status, and retry. Navigating away from an active studio finishes it locally; explicitly ending a session also attempts cloud saving.

## Verification

```powershell
npm test
npm run lint
npm run build
npm run test:api
uv run --directory backend ruff check app tests alembic
npm --prefix frontend exec -- playwright install chromium
npm run test:e2e
```

Unit tests cover geometry, full/shallow cycles, calibration, tracking loss, minimum duration, and cooldowns. API tests cover JWT verification, ownership, idempotency, bounded payloads, voice caching/fallback, rate limiting, and structured insight validation. Provider responses are mocked, with no paid calls. Browser tests exercise replay to persisted report/history, pause/resume, camera-denial fallback, mobile layout, and initialization of the actual MediaPipe model using Chromium's test camera.

**Validation limits:** fixtures are synthetic stored landmark sequences, not recordings of real athletes. Live accuracy depends on lighting, clothing, framing, body proportions, and camera angle. The analyzers are not clinically or biomechanically validated. Real Auth0 login, Tiger Data connectivity, ElevenLabs playback, and Gemini generation must be verified using your configured accounts; credentials are not included.

## Deployment

For the configured Vercel frontend and Render API workflow, follow the [production deployment guide](docs/deployment.md).

Run `npm run setup` then `npm run build`; host `frontend/dist` on HTTPS with app routes falling back to `index.html`. Preserve `/wasm/` and `/models/` assets. Deploy the Python API separately, install with `uv sync --locked --no-dev`, migrate Tiger Data, and run `uv run uvicorn app.main:app --host 0.0.0.0 --port 8000` from `backend/`.

The API bounds bodies/batches and includes process-local rate limits for costly endpoints. For multiple workers/instances, enforce shared limits at the gateway. Configure exact HTTPS CORS origins and keep tokens and raw video out of logs.

See [architecture](docs/architecture.md), [demo walkthrough](docs/demo-script.md), and [verification notes](docs/verification.md).
