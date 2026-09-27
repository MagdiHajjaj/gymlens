import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { Button } from '../components/ui/button';
import { ExerciseReport } from '../components/ExerciseReport';
import { useIdentity } from '../features/auth/AuthProvider';
import { exercises } from '../features/exercises/ExerciseRegistry';
import { useSessions } from '../lib/useSessions';
import { groupWorkouts } from '../lib/workoutGroups';
import { api } from '../lib/api';
import { duration, localSessions, timeLabel } from '../lib/sessionBuffer';
import type { Insight, WorkoutSession } from '../types/workout';

/**
 * One combined report for every exercise in a workout. The page shows
 * workout-level totals once, then one full per-exercise analysis section
 * inside it. AI commentary is manual per exercise so a combined report
 * never spams the rate-limited insights endpoint on load.
 */
export function WorkoutReportPage() {
  const { workoutId } = useParams();
  const { authenticated, owner } = useIdentity();
  const { sessions, loading: sessionsLoading, error: sessionsError, retry } = useSessions();
  const [fullSessions, setFullSessions] = useState<WorkoutSession[] | null>(null);
  const [detailError, setDetailError] = useState('');

  const group = useMemo(
    () => groupWorkouts(sessions).find((g) => g.id === workoutId),
    [sessions, workoutId],
  );

  useEffect(() => {
    let cancelled = false;
    setDetailError('');
    if (sessionsLoading || !group) {
      setFullSessions(null);
      return;
    }
    const locals = new Map(localSessions(owner).map((s) => [s.id, s]));
    void (async () => {
      const resolved = await Promise.all(
        group.sessions.map(async (entry): Promise<WorkoutSession> => {
          const localFull = locals.get(entry.id);
          if (localFull) return localFull;
          if (entry.reps && entry.metrics) return entry as WorkoutSession;
          if (authenticated && entry.local === false) {
            const remote = await api.detail(entry.id);
            return {
              ...remote,
              set_ranges: entry.set_ranges ?? remote.set_ranges,
              local: false,
            };
          }
          return entry as WorkoutSession;
        }),
      );
      if (!cancelled) setFullSessions(resolved);
    })().catch(() => {
      if (!cancelled) {
        setDetailError(
          'Some exercise details could not be loaded. The sections below show what is available.',
        );
        setFullSessions(
          group.sessions.map((entry) => entry as WorkoutSession),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionsLoading, group, authenticated, owner]);

  function handleInsight(sessionId: string, insight: Insight) {
    setFullSessions((prev) =>
      prev ? prev.map((row) => (row.id === sessionId ? { ...row, insight } : row)) : prev,
    );
  }

  if (sessionsLoading || (group && !fullSessions && !detailError))
    return (
      <div className="page">
        <p role="status">Loading your workout report…</p>
      </div>
    );

  if (!group)
    return (
      <div className="page empty-state">
        <h1>Workout not found.</h1>
        <p>{sessionsError || 'This report may belong to another browser or account.'}</p>
        {sessionsError && <Button onClick={retry}>Retry</Button>}
        <Button asChild variant="secondary">
          <Link to="/history">Back to history</Link>
        </Button>
      </div>
    );

  const exerciseNames = group.sessions.map((row) => exercises[row.exercise].name);
  const workoutName = group.name || exerciseNames.join(' · ');
  const workoutAria = /workout$/i.test(workoutName) ? workoutName : `${workoutName} workout`;
  const rows = fullSessions ?? group.sessions.map((entry) => entry as WorkoutSession);
  const isDemo = rows.some((row) => row.source === 'demo');
  const incomplete = rows.some((row) => row.status !== 'completed');
  const totalReps = rows.reduce((sum, row) => sum + row.total_reps, 0);
  const totalSeconds = rows.reduce((sum, row) => sum + duration(row), 0);

  return (
    <div className="page session-report-page" aria-label={workoutAria}>
      <Link className="back-link" to="/history">
        <ArrowLeft size={16} /> All sessions
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKOUT REPORT</span>
          <h1>{workoutName}</h1>
          <p>
            {new Date(group.startedAt).toLocaleString([], {
              dateStyle: 'long',
              timeStyle: 'short',
            })}
          </p>
        </div>
      </div>
      {isDemo && (
        <div className="notice">
          <Info size={18} />
          <span>
            This report was made from sample footage to demonstrate the app. It is not your workout and
            is excluded from training totals.
          </span>
        </div>
      )}
      {incomplete && (
        <div className="notice">This workout was not completed. These are the details saved so far.</div>
      )}
      {sessionsError && (
        <div className="notice error" role="alert">
          <span>Account history couldn&rsquo;t load. Showing sessions saved in this browser.</span>
          <Button size="small" variant="secondary" onClick={retry}>
            Retry account history
          </Button>
        </div>
      )}
      {detailError && (
        <div className="notice error" role="alert">
          {detailError}
        </div>
      )}

      <dl className="session-key-stats">
        <div>
          <dt>Exercises</dt>
          <dd>{rows.length}</dd>
          <p>{exerciseNames.join(' · ')}</p>
        </div>
        <div>
          <dt>Total reps</dt>
          <dd>{totalReps}</dd>
          <p>Completed movements counted by the tracker, across all exercises.</p>
        </div>
        <div>
          <dt>Total time</dt>
          <dd>{group.endedAt ? timeLabel(totalSeconds) : 'Incomplete'}</dd>
          <p>Sum of exercise times. Includes calibration, pauses, and rest.</p>
        </div>
      </dl>

      {rows.map((row) => (
        <ExerciseReport key={row.id} session={row} showHeading onInsight={handleInsight} />
      ))}

      <div className="report-next-actions">
        <Button asChild variant="secondary">
          <Link to="/history">
            View history <ArrowRight size={17} />
          </Link>
        </Button>
      </div>
      <p className="report-note">
        {isDemo ? 'Sample data only.' : 'Camera-based estimates, not a medical assessment.'} The report
        cannot infer calories, strength gains, or injury risk from these measurements.
      </p>
    </div>
  );
}
