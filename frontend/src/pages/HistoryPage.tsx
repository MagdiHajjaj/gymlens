import { MovementChips } from '../components/MovementChips';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, History, Repeat2 } from 'lucide-react';
import { useSessions } from '../lib/useSessions';
import { useIdentity } from '../features/auth/AuthProvider';
import { exercises, type ExerciseMovement } from '../features/exercises/ExerciseRegistry';
import { useWorkout } from '../features/workout/workoutStore';
import { timeLabel } from '../lib/sessionBuffer';
import { Button } from '../components/ui/button';
import { groupWorkouts } from '../lib/workoutGroups';

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
  const workouts = groupWorkouts(filtered);

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
            : `${workouts.length} ${workouts.length === 1 ? 'workout' : 'workouts'}`}
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
        {workouts.map((workout) => {
          const details = workout.sessions.reduce((sum, session) => sum + (session.reps?.length ?? 0), 0);
          const cued = workout.sessions.reduce(
            (sum, session) => sum + (session.reps?.filter((rep) => rep.faults_json.length > 0).length ?? 0),
            0,
          );
          const local = workout.sessions.some((session) => session.local !== false);
          const session = workout.sessions[0];
          const exerciseNames = workout.sessions.map((row) => exercises[row.exercise].name);
          return (
            <article
              className="panel history-session-card"
              key={workout.id}
              aria-label={`${exerciseNames.join(', ')} workout`}
            >
              <div className="history-session-heading">
                <div>
                  <h2>{exerciseNames.join(' · ')}</h2>
                  <p>
                    {new Date(workout.startedAt).toLocaleString([], {
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
                  <dt>Total reps</dt>
                  <dd>{workout.totalReps}</dd>
                </div>
                <div>
                  <dt>{session.source === 'upload' ? 'Analysis time' : 'Session time'}</dt>
                  <dd>{workout.endedAt ? timeLabel(workout.durationSeconds) : 'Incomplete'}</dd>
                </div>
                <div>
                  <dt>Recorded cues</dt>
                  <dd>
                    {details
                      ? `${cued} / ${details} detailed reps`
                      : session.reps
                        ? 'No rep details'
                        : 'Open report'}
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
                  {workout.sessions.some((row) => row.status !== 'completed') ? ' · Incomplete workout' : ''}
                </span>
                <div>
                  <Button size="small" variant="ghost" onClick={() => {
                    select(session.exercise);
                    navigate('/workout');
                  }} aria-label={`Repeat ${exercises[session.exercise].name}`}>
                    <Repeat2 size={16} /> Repeat
                  </Button>
                  {workout.sessions.map((row) => (
                    <Button asChild size="small" variant="secondary" key={row.id}>
                      <Link to={`/session/${row.id}`} aria-label={`View ${exercises[row.exercise].name} report`}>
                        {workout.sessions.length > 1 ? exercises[row.exercise].name : 'View report'} <ArrowRight size={16} />
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
        {!loading && !workouts.length && (
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
