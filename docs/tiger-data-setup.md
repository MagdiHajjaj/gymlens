# Tiger Data setup

Gym Lens uses Tiger Cloud as its production PostgreSQL database and time-series analytics engine. Relational users, workouts, reps, and AI insights live beside high-frequency movement samples. TimescaleDB turns `movement_metrics` into a hypertable, maintains a real-time one-minute continuous aggregate, and moves raw chunks older than seven days into Hypercore's columnstore.

## 1. Create the service

1. Create a Tiger Cloud service at [console.cloud.timescale.com](https://console.cloud.timescale.com/).
2. Choose a region near the API deployment.
3. Open **Connect**, select the PostgreSQL connection string, and copy it. Treat the password as a secret.
4. Keep the service running while applying migrations.

Tiger may show a URL beginning with `postgres://` or `postgresql://`. SQLAlchemy needs the Psycopg driver marker:

```dotenv
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

URL-encode special characters in the username or password. For example, `@` becomes `%40` and `#` becomes `%23`. Store this only in `backend/.env`; never put it in a `VITE_` variable or commit it.

## 2. Apply the database migrations

From the repository root:

```powershell
uv sync --directory backend --locked
uv run --directory backend alembic upgrade head
```

The migrations create:

| Object | Purpose |
| --- | --- |
| `users`, `workout_sessions`, `rep_events`, `session_insights` | Relational account and report data |
| `movement_metrics` | Time-series hypertable keyed by timestamp, workout, and metric |
| `movement_metrics_1m` | Real-time continuous aggregate with average, minimum, maximum, and sample count |
| Refresh policy | Incrementally refreshes the previous 30 days every five minutes |
| Columnstore policy | Converts raw metric chunks older than seven days for lower storage use |

The third migration prefers Tiger's current Hypercore columnstore API and falls back to the older Timescale compression API when needed. SQLite skips all Tiger-specific operations and remains available for local offline development.

## 3. Verify the connection

Start the API and sign in to Gym Lens:

```powershell
npm run api
```

The Settings panel reports the protected platform status. You can also call `GET /api/platform/tiger` with a valid Auth0 access token. A complete Tiger response is:

```json
{
  "connected": true,
  "database": "postgresql",
  "timescale": true,
  "continuous_aggregate": true
}
```

In Tiger's SQL editor, verify the objects and background jobs:

```sql
SELECT hypertable_name
FROM timescaledb_information.hypertables
WHERE hypertable_name = 'movement_metrics';

SELECT view_name, materialized_only
FROM timescaledb_information.continuous_aggregates
WHERE view_name = 'movement_metrics_1m';

SELECT job_id, proc_name, schedule_interval
FROM timescaledb_information.jobs
WHERE hypertable_name IN ('movement_metrics', 'movement_metrics_1m');
```

Complete a signed-in workout, then verify ingestion:

```sql
SELECT metric_name, count(*) AS samples, min(recorded_at), max(recorded_at)
FROM movement_metrics
GROUP BY metric_name
ORDER BY samples DESC;

SELECT bucket, session_id, metric_name, average, minimum, maximum, samples
FROM movement_metrics_1m
ORDER BY bucket DESC
LIMIT 25;
```

The protected endpoint `GET /api/workouts/{session_id}/metrics/summary` reads the continuous aggregate on Tiger. On SQLite it computes the same response in application code so local behavior remains testable.

## 4. Demo story

During a workout, MediaPipe analyzes video locally and the browser records only joint measurements and rep events. The API sends bounded, retry-safe batches to Tiger. Tiger stores account relationships and raw time-series samples in one SQL system. The continuous aggregate incrementally precomputes chart-ready minute buckets, while Hypercore moves older raw samples into columnar storage. The application can therefore keep detailed history without sending video or repeatedly scanning every raw sample.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Connection refused or timeout | Tiger service is running, host/port are correct, and outbound network access is allowed. |
| Password authentication failed | Copy the connection string again and URL-encode special characters. |
| SSL error | Keep `sslmode=require` in `DATABASE_URL`. |
| Timescale is false | Run all migrations using the Tiger database URL and confirm the service supports TimescaleDB. |
| Continuous aggregate is false | Run `alembic current`, then `alembic upgrade head`; revision `0003` creates it. |
| Local data disappeared after switching | SQLite and Tiger are separate databases. Existing browser backups can be reopened and saved while signed in. |

References: [Tiger continuous aggregates](https://docs.timescale.com/use-timescale/latest/continuous-aggregates/about-continuous-aggregates/), [real-time aggregates](https://docs.timescale.com/use-timescale/latest/continuous-aggregates/real-time-aggregates/), and [Hypercore columnstore policies](https://docs.timescale.com/api/latest/hypercore/add_columnstore_policy/).
