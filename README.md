<div align="center">
  <img src="frontend/public/favicon.svg" alt="GymLens logo" width="96" height="96" />

  # GymLens

  **Your camera-powered AI workout coach.**

  Plan a workout, count reps, receive live voice cues, track contactless vitals, and understand your progress—all from a browser.

  [![Live App](https://img.shields.io/badge/Live_App-gymlens.fit-285b3f?style=for-the-badge&logo=vercel&logoColor=white)](https://www.gymlens.fit/)
  [![Devpost](https://img.shields.io/badge/Devpost-Project-003E54?style=for-the-badge&logo=devpost&logoColor=white)](https://devpost.com/software/gymlens-rplve4)
  [![Winner](https://img.shields.io/badge/Winner-General_Challenge_--_Second_Place-d4a72c?style=for-the-badge)](https://devpost.com/software/gymlens-rplve4)

  ![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
  ![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi&logoColor=white)
  ![Tiger Data](https://img.shields.io/badge/Tiger_Data-PostgreSQL-336791?logo=postgresql&logoColor=white)
  ![MediaPipe](https://img.shields.io/badge/MediaPipe-On_Device-4285F4?logo=google&logoColor=white)
</div>

> [!IMPORTANT]
> 🏆 **GymLens won Second Place in the General Challenge main track.** Read the story, stack, and judging submission on [Devpost](https://devpost.com/software/gymlens-rplve4).

## ✨ What is GymLens?

GymLens turns a phone or laptop camera into an interactive workout companion. Athletes choose exercises, set their target weight, sets, reps, and rest time, then follow a guided camera setup. Once the required joints are visible and the starting position is calibrated, GymLens begins tracking automatically.

During a workout, GymLens combines local pose estimation with exercise-specific movement analyzers to count completed reps and deliver supported technique cues. Afterward, it creates a structured report and uses saved history to show progress over time.

### What it can do

- 📷 **Live movement tracking** with 33 MediaPipe body landmarks and a responsive skeleton overlay
- 🔢 **Automatic rep and set counting** using smoothed angles, calibration, movement phases, timing gates, and full-cycle validation
- 🗣️ **ElevenLabs voice coaching** with prioritized cues, audio caching, and browser-speech fallback
- 🏋️ **Multi-exercise planning** with workout names, weights, target sets, target reps, and rest timers
- 💪 **10 supported exercises:** squat, bicep curl, push-up, Romanian deadlift, lunge, overhead press, glute bridge, bent-over row, tricep dips, and pull-up
- 🎥 **Local video analysis** using the same pose and rep-detection pipeline as the live camera
- 📊 **Session reports and history** with reps, sets, timing, joint measurements, cues, load, and weight-progress charts
- ✨ **Gemini commentary** grounded in the recorded session and recent same-exercise history
- ❤️ **Presage contactless vitals** for pulse and breathing during live-camera workouts
- 🔐 **Auth0 accounts** with athlete-owned profiles, schedules, workout history, and reports
- 🐯 **Tiger Data analytics** for relational workout data and time-series measurements in one PostgreSQL system
- 📱 **Mobile-first camera flow** that keeps framing, countdown, reps, and controls visible while the phone is on a stand

## 🧠 How rep detection works

MediaPipe supplies body landmarks frame by frame. GymLens turns that noisy stream into reliable workout events:

1. Required joints must be visible.
2. Landmark and angle measurements are smoothed over time.
3. The athlete holds a known starting position to calibrate.
4. An exercise-specific state machine follows phases such as **ready → eccentric → concentric → ready**.
5. Minimum range, duration, stable-frame, and return thresholds reject jitter and partial movements.
6. Tracking loss resets an incomplete cycle instead of joining unrelated movement.
7. Measurements and supported cues are attached to the completed rep.

The pose model estimates where joints are; GymLens decides whether their movement represents a complete rep.

## 🏗️ Architecture

```mermaid
flowchart LR
  Camera[📷 Camera or video] --> Pose[MediaPipe Pose Landmarker]
  Pose --> Analysis[Visibility + smoothing + joint angles]
  Analysis --> Reps[Exercise state machines]
  Reps --> UI[Rep count + skeleton + cues]
  Reps --> Local[Browser backup]

  UI --> Voice[ElevenLabs / browser voice]
  Camera -. downscaled frames for optional vitals .-> Presage[Presage sidecar]
  Presage --> Vitals[Pulse + breathing confidence]

  Local --> API[Auth0-protected FastAPI]
  API --> Tiger[(Tiger Data PostgreSQL)]
  Tiger --> Gemini[Gemini session commentary]
  Gemini --> Reports[Reports + history + progress]
```

The rep-analysis loop does not wait for cloud APIs or audio playback. MediaPipe pose inference, skeleton rendering, and exercise analysis run in the browser. Raw workout video is not uploaded to the GymLens API. When Presage vitals are active, the browser sends downscaled camera frames to the separately deployed vitals service for contactless measurement.

## 🧰 Tech stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 19, TypeScript, Vite | Responsive workout, history, and report experience |
| Computer vision | MediaPipe Pose Landmarker | On-device body landmarks and world landmarks |
| Visualization | Canvas, Recharts | Skeleton overlay, measurements, and progress charts |
| State | Zustand | Workout, plan, set, rep, rest, and session state |
| API | FastAPI, Pydantic, SQLAlchemy | Authenticated persistence and provider integrations |
| Database | Tiger Data, PostgreSQL, TimescaleDB | Profiles, workouts, time-series metrics, aggregates, and columnstore |
| Authentication | Auth0 | SPA login and RS256-protected API access |
| Voice | ElevenLabs | Consistent spoken rep counts and coaching cues |
| AI | Google Gemini | Structured, evidence-grounded post-workout commentary |
| Vitals | Presage SmartSpectra | Camera-based pulse and breathing estimates |
| Deployment | Vercel, Render | Frontend, API, and vitals WebSocket sidecar |

## 🐯 Why Tiger Data?

GymLens produces both relational data and measurements that change over time. A workout connects an athlete, exercises, sets, reps, weights, cues, joint measurements, and optional vitals. Tiger Data lets us keep those relationships in PostgreSQL while adding time-series capabilities:

- A hypertable for high-frequency movement metrics
- A real-time one-minute continuous aggregate for fast summaries
- Average, minimum, maximum, and sample counts by session and metric
- Hypercore columnstore for older raw chunks
- Standard SQL, joins, SQLAlchemy, and Alembic migrations
- Structured history that Gemini can use without receiving raw video

Tiger Data gives GymLens a long-term memory: MediaPipe understands the current movement, while Tiger Data helps us understand progress across workouts.

## 🚀 Run locally

### Prerequisites

- [Node.js](https://nodejs.org/) **22.12+**
- [Python](https://www.python.org/) **3.12+**
- [uv](https://docs.astral.sh/uv/)
- A modern Chromium-based browser

### 1. Clone and install

```bash
git clone https://github.com/MagdiHajjaj/gymlens.git
cd gymlens
npm run setup
```

`npm run setup` installs the locked frontend dependencies, downloads the official Pose Landmarker Full model, and copies the matching MediaPipe WASM files into `frontend/public/`.

### 2. Start the frontend

```bash
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Guest/demo mode works without Auth0, the API, or provider keys. Camera access requires `localhost`, `127.0.0.1`, or HTTPS.

### 3. Start the API

In a second terminal:

```bash
uv sync --directory backend --locked
```

Create `backend/.env` from `backend/.env.example`:

```bash
# macOS / Linux
cp backend/.env.example backend/.env

# PowerShell
Copy-Item backend/.env.example backend/.env
```

Then run:

```bash
npm run api
```

- API health: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
- OpenAPI docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

SQLite initializes automatically for local development. Protected `/api` routes still require a valid Auth0 token; guest workout sessions remain in browser storage.

### 4. Configure the frontend

Copy `frontend/.env.example` to `frontend/.env` and fill in the public SPA configuration:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your_spa_client_id
VITE_AUTH0_AUDIENCE=https://your-api-identifier
VITE_VITALS_WS_URL=ws://localhost:8787
```

### 5. Configure cloud integrations

Set these in `backend/.env` when you want the complete cloud experience:

```dotenv
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://your-api-identifier
ELEVENLABS_API_KEY=your_key
ELEVENLABS_VOICE_ID=your_voice_id
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-3.8-flash
CORS_ORIGINS=["http://127.0.0.1:5173","http://localhost:5173"]
```

On a new Tiger Data database, apply the schema:

```bash
uv run --directory backend alembic upgrade head
```

Provider keys and database credentials belong only in server-side environment files or deployment dashboards. Never give secrets a `VITE_` prefix.

### 6. Start the optional Presage vitals service

The Presage sidecar requires a Presage API key:

```bash
cd vitals-service
npm ci
```

```bash
# macOS / Linux
PRESAGE_API_KEY=your_key npm start

# PowerShell
$env:PRESAGE_API_KEY="your_key"
npm start
```

The service listens on `ws://localhost:8787`. Vitals are wellness estimates, not medical measurements. Only one measurement session can use a sidecar process at a time.

## 🧪 Verify the project

From the repository root:

```bash
npm test
npm run lint
npm run build
npm run test:api
uv run --directory backend ruff check app tests alembic
```

For browser tests:

```bash
npm --prefix frontend exec -- playwright install chromium
npm run test:e2e
```

Provider calls are mocked in automated tests, so validation does not consume paid API credits.

## 🌐 Deployment

| Service | Platform | Configuration |
|---|---|---|
| React frontend | Vercel | Root `frontend`; set the `VITE_*` variables |
| FastAPI API | Render | Root `backend`; run Alembic, then Uvicorn |
| Presage sidecar | Render | Root `vitals-service`; `npm ci`, then `npm start` |
| PostgreSQL/TimescaleDB | Tiger Data | Set the server-side `DATABASE_URL` |

For detailed production configuration, read:

- [Deployment guide](docs/deployment.md)
- [Auth0 setup](docs/auth0-setup.md)
- [Tiger Data setup](docs/tiger-data-setup.md)
- [Presage sidecar setup](vitals-service/README.md)
- [Architecture notes](docs/architecture.md)

## 🔒 Privacy and limits

- Pose inference and exercise analysis run locally in the browser.
- Raw workout video is not stored by the GymLens API.
- Presage vitals require sending downscaled live frames to the dedicated vitals service.
- Only rep events, measurements, workout metadata, and generated summaries are persisted.
- Technique cues are camera estimates, not medical assessments or a universal form score.
- Pulse and breathing values are wellness information, not medical data.
- Accuracy depends on lighting, clothing, framing, camera placement, and body visibility.

## 🗺️ What is next?

Our next major step is bringing GymLens to **iOS and Android** as a native, more user-friendly mobile experience. Native apps will improve camera positioning, permission handling, voice playback, offline workouts, reminders, and performance for a phone placed several feet away during training.

We also want to add:

- More exercises and camera positions
- Deeper personalization from long-term workout history
- Earlier detection of shrinking range, slowing speed, and loss of control
- Physiotherapy workflows with clinician-defined comfortable ranges
- Seated, adaptive, and accessibility-focused workouts
- Better offline support and synchronization

## 🏆 Try GymLens

🌐 **Live:** [https://www.gymlens.fit/](https://www.gymlens.fit/)

🚀 **Devpost:** [https://devpost.com/software/gymlens-rplve4](https://devpost.com/software/gymlens-rplve4)

⭐ If GymLens helps or inspires you, consider starring the repository.
