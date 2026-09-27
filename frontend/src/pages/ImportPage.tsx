import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, TriangleAlert, Upload } from 'lucide-react';
import { exercises } from '../features/exercises/ExerciseRegistry';
import { useIdentity } from '../features/auth/AuthProvider';
import { api } from '../lib/api';
import type { ExerciseId, RepEvent, WorkoutSession } from '../types/workout';
import { Button } from '../components/ui/button';

const EXERCISE_IDS = Object.keys(exercises) as ExerciseId[];

const SAMPLE_CSV = `date, exercise, sets, reps, minutes, name
2026-09-20, squat, 4, 10, 30, Leg day
2026-09-20, lunge, 3, 12, 20, Leg day
2026-09-22, pushup, 3, 15, 15, Push day
2026-09-24, deadlift, 5, 8, 35, Pull day`;

interface ImportRow {
  line: number;
  date: string;
  exercise: ExerciseId;
  sets: number;
  reps: number;
  minutes: number;
  name: string;
}

interface RowError {
  line: number;
  message: string;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/;

export function parseCsv(text: string): { rows: ImportRow[]; errors: RowError[] } {
  const rows: ImportRow[] = [];
  const errors: RowError[] = [];
  const lines = text.split('\n');
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  lines.forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const cells = trimmed.split(',').map((c) => c.trim());
    // Skip a header row.
    if (index === 0 && !DATE_RE.test(cells[0] ?? '')) return;
    const fail = (message: string) => errors.push({ line, message });
    const [dateStr = '', exerciseStr = '', setsStr = '', repsStr = '', minutesStr = '', name = ''] =
      cells;
    const dateMatch = DATE_RE.exec(dateStr);
    if (!dateMatch) return fail(`Date must look like YYYY-MM-DD (got "${dateStr}")`);
    const [, y, mo, d, hh = '09', mm = '00'] = dateMatch;
    const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm));
    if (Number.isNaN(date.getTime()) || date.getDate() !== Number(d))
      return fail(`"${dateStr}" is not a real date`);
    if (date > today) return fail(`"${dateStr}" is in the future`);
    const exercise = exerciseStr.toLowerCase().replace(/[\s-]+/g, '_') as ExerciseId;
    if (!EXERCISE_IDS.includes(exercise))
      return fail(
        `"${exerciseStr}" is not a GymLens exercise (one of: ${EXERCISE_IDS.join(', ')})`,
      );
    const sets = Number(setsStr);
    const reps = Number(repsStr);
    if (!Number.isInteger(sets) || sets < 1 || sets > 50)
      return fail(`Sets must be a whole number from 1 to 50 (got "${setsStr}")`);
    if (!Number.isInteger(reps) || reps < 1 || reps > 500)
      return fail(`Reps must be a whole number from 1 to 500 (got "${repsStr}")`);
    const minutes = minutesStr === '' ? 20 : Number(minutesStr);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 600)
      return fail(`Minutes must be between 1 and 600 (got "${minutesStr}")`);
    rows.push({ line, date: dateStr.slice(0, 10), exercise, sets, reps, minutes, name });
  });
  return { rows, errors };
}

export function buildSession(row: ImportRow, workoutId: string, start: Date): WorkoutSession {
  const total = row.sets * row.reps;
  const end = new Date(start.getTime() + row.minutes * 60_000);
  const reps: RepEvent[] = Array.from({ length: total }, (_, i) => ({
    rep_number: i + 1,
    completed_at: new Date(start.getTime() + ((i + 1) / total) * row.minutes * 60_000).toISOString(),
    metrics_json: {},
    faults_json: [],
  }));
  return {
    id: crypto.randomUUID(),
    workout_id: workoutId,
    workout_name: row.name || null,
    exercise: row.exercise,
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    total_reps: total,
    status: 'active',
    source: 'import',
    reps,
    metrics: [],
  };
}

export function ImportPage() {
  const { authenticated, login } = useIdentity();
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [previewed, setPreviewed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<RowError[]>([]);
  const [finished, setFinished] = useState(false);

  const { rows, errors } = useMemo(() => parseCsv(csv), [csv]);
  const total = rows.length;

  const startImport = async () => {
    if (importing || errors.length > 0 || total === 0) return;
    setImporting(true);
    setDone(0);
    setFailed([]);
    setFinished(false);
    // Rows on the same date share a workout so they group into one calendar entry.
    const workoutIds = new Map<string, string>();
    const dayCursor = new Map<string, number>();
    const failures: RowError[] = [];
    let completed = 0;
    for (const row of rows) {
      try {
        let workoutId = workoutIds.get(row.date);
        if (!workoutId) {
          workoutId = crypto.randomUUID();
          workoutIds.set(row.date, workoutId);
        }
        const [y, mo, d] = row.date.split('-').map(Number);
        const offsetMin = dayCursor.get(row.date) ?? 0;
        const start = new Date(y, mo - 1, d, 9, 0 + offsetMin);
        dayCursor.set(row.date, offsetMin + row.minutes + 5);
        await api.save(buildSession(row, workoutId, start));
      } catch (error) {
        failures.push({
          line: row.line,
          message: error instanceof Error ? error.message : 'Import failed',
        });
      }
      completed += 1;
      setDone(completed);
    }
    setFailed(failures);
    setFinished(true);
    setImporting(false);
  };

  if (!authenticated) {
    return (
      <div className="page empty-state">
        <span className="eyebrow">TRAINING DATA</span>
        <h1>Import workout history</h1>
        <p>Sign in so the imported sessions land on your account.</p>
        <Button onClick={login}>Sign in to continue</Button>
      </div>
    );
  }

  return (
    <div className="page import-page">
      <Link className="back-link" to="/profile">
        <ArrowLeft size={15} /> Profile
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TRAINING DATA</span>
          <h1>Import workout history</h1>
          <p>
            Paste past workouts as CSV. Each row becomes a finished session on your account —
            nothing is imported until you press the button.
          </p>
        </div>
      </div>

      <div className="panel import-format">
        <h2>Format</h2>
        <code>date, exercise, sets, reps, minutes, name</code>
        <ul>
          <li>
            <strong>date</strong> — <code>YYYY-MM-DD</code>, not in the future
          </li>
          <li>
            <strong>exercise</strong> — one of <code>{EXERCISE_IDS.join(', ')}</code>
          </li>
          <li>
            <strong>sets / reps</strong> — whole numbers (reps are per set)
          </li>
          <li>
            <strong>minutes</strong> — optional, defaults to 20
          </li>
          <li>
            <strong>name</strong> — optional workout name; rows on the same date group together
          </li>
        </ul>
      </div>

      <label className="import-field">
        <span>Your CSV</span>
        <textarea
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setPreviewed(false);
            setFinished(false);
          }}
          rows={8}
          spellCheck={false}
          aria-label="Workout history CSV"
        />
      </label>

      <div className="import-actions">
        <Button
          variant="secondary"
          onClick={() => setPreviewed(true)}
          disabled={importing}
        >
          Preview
        </Button>
        <Button onClick={startImport} disabled={!previewed || importing || errors.length > 0 || total === 0}>
          <Upload size={16} /> {importing ? `Importing ${done}/${total}…` : `Import ${total} session${total === 1 ? '' : 's'}`}
        </Button>
      </div>

      {importing && (
        <div className="import-progress" role="status" aria-live="polite">
          <div className="import-progress-bar">
            <div style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
          </div>
          <p className="small-muted">
            Imported {done} of {total}…
          </p>
        </div>
      )}

      {previewed && errors.length > 0 && (
        <div className="notice error" role="alert">
          <p>
            <TriangleAlert size={15} /> Fix {errors.length} row{errors.length === 1 ? '' : 's'} before
            importing:
          </p>
          <ul>
            {errors.map((e) => (
              <li key={e.line}>
                Line {e.line}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {previewed && rows.length > 0 && (
        <div className="panel import-preview">
          <h2>Preview</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Exercise</th>
                <th scope="col">Sets × reps</th>
                <th scope="col">Minutes</th>
                <th scope="col">Name</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.line}>
                  <td>{row.date}</td>
                  <td>{exercises[row.exercise].name}</td>
                  <td>
                    {row.sets} × {row.reps}
                  </td>
                  <td>{row.minutes}</td>
                  <td>{row.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {finished && (
        <div className="notice success" role="status">
          <p>
            <Check size={16} /> Imported {total - failed.length} of {total} sessions.
          </p>
          {failed.length > 0 && (
            <ul>
              {failed.map((e) => (
                <li key={e.line}>
                  Line {e.line}: {e.message}
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link to="/history">View your history</Link>
          </p>
        </div>
      )}
    </div>
  );
}
