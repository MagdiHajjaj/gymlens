# Deploy Gym Lens with Vercel and Render

The production layout is:

```text
Browser → Vercel (React/Vite)
            ↓ Auth0 access token
          Render (FastAPI)
            ↓ TLS PostgreSQL
          Tiger Cloud
```

Video and pose inference remain in the browser. Vercel serves static assets, Render handles authenticated API calls and provider secrets, and Tiger stores workout data and time-series metrics.

## Before deploying

Push the repository to GitHub, GitLab, or Bitbucket. Create the Tiger service first and follow [Tiger Data setup](tiger-data-setup.md) to obtain its PostgreSQL connection URL.

Do not commit either `.env` file. Production variables are entered in the Vercel and Render dashboards.

## 1. Deploy the API on Render

1. In Render, choose **New → Blueprint** and connect this repository.
2. Render detects `render.yaml` and proposes a `gymlens-api` web service.
3. Enter every environment variable marked as requiring a value.

Use these values:

| Render variable       | Production value                                                     |
| --------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`        | Tiger URL rewritten as `postgresql+psycopg://...?...sslmode=require` |
| `AUTH0_DOMAIN`        | `gymlens.ca.auth0.com`                                               |
| `AUTH0_AUDIENCE`      | `https://gymlens-api`                                                |
| `CORS_ORIGINS`        | Initially `[]`; replace it with the exact Vercel origin after step 2 |
| `ELEVENLABS_API_KEY`  | Your restricted server-side key                                      |
| `ELEVENLABS_VOICE_ID` | Your selected voice ID                                               |
| `GEMINI_API_KEY`      | Your server-side Gemini key                                          |

`GEMINI_MODEL` and `PYTHON_VERSION` are already declared in the Blueprint. Secrets should remain hidden in Render and must not be exposed to Vercel.

Render runs these lifecycle stages from `backend/`:

```text
Build:  pip install uv && uv sync --locked --no-dev
Start:  uv run alembic upgrade head && exec uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health: GET /health/ready
```

Render's free web services do not support a separate pre-deploy command, so the free Blueprint applies idempotent Alembic migrations immediately before starting Uvicorn. If you move to a paid instance, set `preDeployCommand` to `uv run alembic upgrade head` and simplify the start command to only the Uvicorn portion.

Copy the resulting API URL, for example:

```text
https://gymlens-api.onrender.com
```

Check `https://YOUR-RENDER-DOMAIN/health`. The readiness endpoint also tests the database and is used by Render automatically.

## 2. Deploy the frontend on Vercel

1. In Vercel, choose **Add New → Project** and import the same repository.
2. Leave the repository root as the project root. The checked-in `vercel.json` supplies the monorepo build and output paths.
3. Add the production environment variables below.

| Vercel variable        | Production value                              |
| ---------------------- | --------------------------------------------- |
| `VITE_API_BASE_URL`    | Exact Render origin, without a trailing slash |
| `VITE_AUTH0_DOMAIN`    | `gymlens.ca.auth0.com`                        |
| `VITE_AUTH0_CLIENT_ID` | `jf9ZIy5RfbTYzMYP2A5LYEDoraSh1NED`            |
| `VITE_AUTH0_AUDIENCE`  | `https://gymlens-api`                         |

Apply these to **Production**. Apply them to Preview only if you also register and permit the specific preview origin. Vite embeds these values during the build, so changing one requires a redeploy.

Deploy and copy the assigned origin, for example:

```text
https://gymlens.vercel.app
```

The Vercel rewrite sends application routes to `index.html`, so direct visits to `/history`, `/workout`, and `/session/{id}` work.

## 3. Connect both origins

Return to Render and update:

```dotenv
CORS_ORIGINS=["https://gymlens.vercel.app"]
```

Use the exact Vercel origin: HTTPS, hostname, and no trailing slash. If you add a custom frontend domain, include it as another JSON array entry and redeploy Render.

In the Auth0 application settings, add the exact Vercel origin to all three fields:

- **Allowed Callback URLs**
- **Allowed Logout URLs**
- **Allowed Web Origins**

Keep the local origins already registered. A typical combined value is:

```text
http://127.0.0.1:5173,http://localhost:5173,https://gymlens.vercel.app
```

No Render URL belongs in these three Auth0 fields because the browser callback returns to the frontend.

## 4. Production verification

1. Open the Vercel site in a private browser window.
2. Create an account or sign in through Auth0 and confirm it returns to the same Vercel route.
3. Open **Settings & connections** and confirm Tiger says **Connected · time-series ready**.
4. Start a camera workout, enable voice, complete reps, and end the session.
5. Confirm the session appears in History after a hard refresh.
6. Open its report and confirm its angle chart and Gemini insight appear.
7. Sign out and confirm account history is no longer displayed.

Also verify these URLs directly:

```text
https://YOUR-RENDER-DOMAIN/health
https://YOUR-VERCEL-DOMAIN/history
```

The first should return HTTP 200. The second should load the SPA instead of a Vercel 404.

## Preview deployments

Vercel preview domains change per deployment. Auth0 callback allowlists and the API CORS allowlist are intentionally exact. For a stable hackathon demo, use the production Vercel domain. If a preview needs cloud login, register that specific preview origin in Auth0 and add it to Render's `CORS_ORIGINS`, then remove it afterward.

## Common failures

| Symptom                                 | Fix                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Vercel build cannot find the pose model | Confirm `vercel.json` runs `npm --prefix frontend run assets` before the build.                              |
| Refreshing `/history` gives 404         | Confirm the SPA rewrite remains in `vercel.json`.                                                            |
| Browser shows a CORS error              | Add the exact Vercel origin to Render `CORS_ORIGINS` and redeploy.                                           |
| Auth0 says callback mismatch            | Add the exact Vercel origin to Auth0 Allowed Callback URLs.                                                  |
| API deploy fails before start           | Inspect Render's pre-deploy logs; Tiger credentials or migration permissions are usually the cause.          |
| Render readiness fails                  | Open Render logs and test the Tiger URL; `/health/ready` requires a working database connection.             |
| First API request is slow               | Render free services can spin down after inactivity; use a paid instance for a consistently responsive demo. |
| Environment change has no effect        | Redeploy the affected service. Vercel variables are build-time values.                                       |

References: [Vercel Vite deployment](https://vercel.com/docs/frameworks/frontend/vite), [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json), [Render Blueprint specification](https://render.com/docs/blueprint-spec), and [Render FastAPI deployment](https://render.com/docs/deploy-fastapi).
