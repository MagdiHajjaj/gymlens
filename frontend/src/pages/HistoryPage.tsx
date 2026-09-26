import { MovementChips } from '../components/MovementChips';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, History, Repeat2 } from 'lucide-react';
import { useSessions } from '../lib/useSessions';
import { useIdentity } from '../features/auth/AuthProvider';
import { exercises, type ExerciseMovement } from '../features/exercises/ExerciseRegistry';
import { useWorkout } from '../features/workout/workoutStore';
import { duration, timeLabel } from '../lib/sessionBuffer';
import { Button } from '../components/ui/button';

export function HistoryPage() {
  const { sessions, loading, error, retry } = useSessions();
  const { authenticated } = useIdentity();
  const select = useWorkout((state) => state.select);
  const navigate = useNavigate();
  const [movementFilter, setMovementFilter] = useState<ExerciseMovement | null>(null);
  const filtered = sessions
    .filter(
      (session) =>
        movementFilter === null || exercises[session.exercise].movement === movementFilter,
    )
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));

  return (
    <div className="page workout-history-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR TRAINING RECORD</span>
          <h1>Workout history</h1>
          <p>
            {authenticated
              ? 'Review saved sessions, find a pattern, or repeat an exercise.'
              : 'Sessions saved in this browser. Open a report to see what was recorded.'}
          </p>
        </div>
        <Button asChild>
          <Link to="/workout">
            New workout <ArrowRight size={17} />
          </Link>
        </Button>
      </div>
      <div className="history-filters">
        <p role="status">
          {loading
            ? 'Updating history…'
            : `${filtered.length} ${filtered.length === 1 ? 'session' : 'sessions'}`}
        </p>
        {movementFilter !== null && (
          <Button size="small" variant="ghost" onClick={() => setMovementFilter(null)}>
            Clear filters
          </Button>
        )}
      </div>
      <MovementChips value={movementFilter} onChange={setMovementFilter} showCounts={false} />
      {error && (
        <div className="notice error" role="alert">
          <span>Account history couldn’t load. Showing any sessions saved in this browser.</span>
          <Button size="small" variant="secondary" onClick={retry}>
            Retry account history
          </Button>
        </div>
      )}
      <div className="history-session-list" aria-busy={loading}>
        {filtered.map((session) => {
          const details = session.reps?.length ?? 0;
          const cued = session.reps?.filter((rep) => rep.faults_json.length > 0).length ?? 0;
          const local = session.local !== false;
          return (
            <article
              className="panel history-session-card"
              key={session.id}
              aria-label={`${exercises[session.exercise].name} session`}
            >
              <div className="history-session-heading">
                <div>
                  <h2>{exercises[session.exercise].name}</h2>
                  <p>
                    {new Date(session.started_at).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                <span className={`tag ${session.source === 'demo' ? 'demo-tag' : ''}`}>
                  {session.source === 'demo'
                    ? 'Demo · sample data'
                    : session.source === 'upload'
                      ? 'Video analysis'
                      : 'Camera workout'}
                </span>
              </div>
              <dl className="history-session-metrics">
                <div>
                  <dt>{session.exercise === 'curl' ? 'Arm reps' : 'Reps'}</dt>
                  <dd>{session.total_reps}</dd>
                </div>
                <div>
                  <dt>{session.source === 'upload' ? 'Analysis time' : 'Session time'}</dt>
                  <dd>{session.ended_at ? timeLabel(duration(session)) : 'Incomplete'}</dd>
                </div>
                <div>
                  <dt>Recorded cues</dt>
                  <dd>
                    {details ? `${cued} / ${details} reps` : session.reps ? 'No rep details' : 'Open report'}
                  </dd>
                </div>
              </dl>
              <div className="history-session-bottom">
                <span>
                  {local
                    ? authenticated
                      ? 'Saved in this browser · account save pending'
                      : 'Saved in this browser'
                    : 'Saved to account'}
                  {session.status !== 'completed' ? ' · Incomplete session' : ''}
                </span>
                <div>
                  <Button
                    size="small"
                    variant="ghost"
                    onClick={() => {
                      select(session.exercise);
                      navigate('/workout');
                    }}
                    aria-label={`Repeat ${exercises[session.exercise].name}`}
                  >
                    <Repeat2 size={16} /> Repeat
                  </Button>
                  <Button asChild size="small" variant="secondary">
                    <Link
                      to={`/session/${session.id}`}
                      aria-label={`View ${exercises[session.exercise].name} session`}
                    >
                      View report <ArrowRight size={16} />
                    </Link>
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
        {!loading && !filtered.length && (
          <section className="panel history-empty">
            <History size={30} />
            <h2>
              {movementFilter !== null
                ? 'No sessions match these filters.'
                : error
                  ? 'No browser sessions available.'
                  : 'Your first session belongs here.'}
            </h2>
            <p>
              {movementFilter !== null
                ? 'Try another movement, or clear the filter.'
                : error
                  ? 'Retry account history to check your saved workouts.'
                  : 'Complete a workout to see your report here.'}
            </p>
            {movementFilter !== null ? (
              <Button variant="secondary" onClick={() => setMovementFilter(null)}>
                Show all sessions
              </Button>
            ) : (
              <Button asChild>
                <Link to="/workout">
                  Start a workout <ArrowRight size={16} />
                </Link>
              </Button>
            )}
          </section>
        )}
      </div>
      <p className="report-note">
        Cue counts reflect recorded checks, not a form score. This browser keeps up to 50 recent workouts.
      </p>
    </div>
  );
}
