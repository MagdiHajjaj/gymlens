import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, History, Repeat2, Search } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSessions } from '../lib/useSessions';
import { useIdentity } from '../features/auth/AuthProvider';
import { exercises } from '../features/exercises/ExerciseRegistry';
import type { ExerciseId } from '../types/workout';
import { useWorkout } from '../features/workout/workoutStore';
import { timeLabel } from '../lib/sessionBuffer';
import { Button } from '../components/ui/button';
import { groupWorkouts } from '../lib/workoutGroups';
import { filterWorkouts } from '../lib/filterWorkouts';
import { weightProgress } from '../lib/weightProgress';

export function HistoryPage() {
  const { sessions, loading, error, retry } = useSessions();
  const { authenticated } = useIdentity();
  const select = useWorkout((state) => state.select);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [exerciseFilter, setExerciseFilter] = useState<ExerciseId | null>(null);
  const [progressExercise, setProgressExercise] = useState<ExerciseId | null>(null);
  const workouts = groupWorkouts(
    [...sessions].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)),
  );
  // Only offer exercises the user has actually done, in registry order.
  const historyExercises = (Object.keys(exercises) as ExerciseId[]).filter((id) =>
    sessions.some((session) => session.exercise === id),
  );
  const weightedExercises = (Object.keys(exercises) as ExerciseId[]).filter((id) =>
    sessions.some(
      (session) =>
        session.exercise === id &&
        session.status === 'completed' &&
        typeof session.weight_kg === 'number' &&
        session.weight_kg > 0,
    ),
  );
  const selectedProgressExercise =
    progressExercise && weightedExercises.includes(progressExercise)
      ? progressExercise
      : (weightedExercises[0] ?? null);
  const progress = selectedProgressExercise
    ? weightProgress(sessions, selectedProgressExercise)
    : [];
  const progressChange =
    progress.length > 1 ? progress[progress.length - 1].weightKg - progress[0].weightKg : null;
  const hasFilter = query.trim() !== '' || exerciseFilter !== null;
  const filtered = filterWorkouts(workouts, { query, exercise: exerciseFilter });
  const clearFilters = () => {
    setQuery('');
    setExerciseFilter(null);
  };

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
      <section className="history-filter-panel" aria-label="Filter workout history">
        <div className="history-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            placeholder="Search by workout or exercise…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search workouts by name or exercise"
          />
        </div>
        <label>
          <span>Exercise</span>
          <select
            value={exerciseFilter ?? ''}
            onChange={(event) =>
              setExerciseFilter((event.target.value || null) as ExerciseId | null)
            }
            aria-label="Filter workout history by exercise"
          >
            <option value="">All exercises</option>
            {historyExercises.map((id) => (
              <option key={id} value={id}>
                {exercises[id].name}
              </option>
            ))}
          </select>
        </label>
        <div className="history-filter-status">
          <p role="status">
            {loading
              ? 'Updating history…'
              : `${filtered.length} ${filtered.length === 1 ? 'workout' : 'workouts'}`}
          </p>
          {hasFilter && (
            <Button size="small" variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </section>
      {selectedProgressExercise && (
        <section className="panel history-progress" aria-labelledby="weight-progress-title">
          <div className="history-progress-heading">
            <div>
              <span className="eyebrow">LOAD PROGRESS</span>
              <h2 id="weight-progress-title">Weight over time</h2>
              <p>Recorded workout load for completed sessions.</p>
            </div>
            <label>
              <span>Exercise</span>
              <select
                value={selectedProgressExercise}
                onChange={(event) => setProgressExercise(event.target.value as ExerciseId)}
                aria-label="Choose exercise for weight progress"
              >
                {weightedExercises.map((id) => (
                  <option key={id} value={id}>
                    {exercises[id].name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="history-progress-summary">
            <strong>{progress[progress.length - 1]?.weightKg} kg latest</strong>
            <span>
              {progressChange === null
                ? 'Add another weighted session to see your change.'
                : `${progressChange >= 0 ? '+' : ''}${progressChange.toFixed(1)} kg from first recorded session`}
            </span>
          </div>
          <div className="history-progress-chart" role="img" aria-label={`${exercises[selectedProgressExercise].name} recorded weight over time`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progress} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis domain={['dataMin - 5', 'dataMax + 5']} tickFormatter={(value) => `${value} kg`} />
                <Tooltip formatter={(value) => [`${value} kg`, 'Weight']} />
                <Line dataKey="weightKg" name="Weight" stroke="#285b3f" strokeWidth={3} dot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="report-note">Bodyweight sessions and workouts without a recorded load are excluded.</p>
        </section>
      )}
      {error && (
        <div className="notice error" role="alert">
          <span>Account history couldn’t load. Showing any sessions saved in this browser.</span>
          <Button size="small" variant="secondary" onClick={retry}>
            Retry account history
          </Button>
        </div>
      )}
      <div className="history-session-list" aria-busy={loading}>
        {filtered.map((workout) => {
          const local = workout.sessions.some((session) => session.local !== false);
          const session = workout.sessions[0];
          const exerciseNames = workout.sessions.map((row) => exercises[row.exercise].name);
          const workoutName = workout.name || exerciseNames.join(' · ');
          const workoutAria = /workout$/i.test(workoutName) ? workoutName : `${workoutName} workout`;
          const incomplete = workout.sessions.some((row) => row.status !== 'completed');
          return (
            <article
              className="panel history-session-card"
              key={workout.id}
              aria-label={workoutAria}
            >
              <div className="history-session-heading">
                <div>
                  <h2>{workoutName}</h2>
                  <p>
                    {new Date(workout.startedAt).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                  <p className="small-muted">{exerciseNames.join(' · ')}</p>
                </div>
                <span className={`tag ${session.source === 'demo' ? 'demo-tag' : ''}`}>
                  {session.source === 'demo'
                    ? 'Demo · sample data'
                    : session.source === 'upload'
                      ? 'Video analysis'
                      : 'Camera workout'}
                </span>
              </div>
              {workout.sessions.length > 1 ? (
                <>
                  <p className="history-workout-meta">
                    {workout.endedAt ? timeLabel(workout.durationSeconds) : 'Incomplete'} ·{' '}
                    {workout.totalReps} reps across {workout.sessions.length} exercises
                  </p>
                  <ul className="history-exercise-list">
                    {workout.sessions.map((row) => {
                      const detailCount = row.reps?.length ?? 0;
                      const cuedCount =
                        row.reps?.filter((rep) => rep.faults_json.length > 0).length ?? 0;
                      return (
                        <li key={row.id}>
                          <div>
                            <strong>{exercises[row.exercise].name}</strong>
                            <span>
                              {row.total_reps} {row.total_reps === 1 ? 'rep' : 'reps'}
                              {detailCount
                                ? ` · ${cuedCount} / ${detailCount} detailed reps with cues`
                                : row.reps
                                  ? ' · no rep details'
                                  : ''}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="history-workout-actions">
                    <Button asChild size="small" variant="secondary">
                      <Link
                        to={`/report/${workout.id}`}
                        aria-label={`View ${workoutName} combined report`}
                      >
                        View report <ArrowRight size={16} />
                      </Link>
                    </Button>
                  </div>
                </>
              ) : (
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
                      {(() => {
                        const details = session.reps?.length ?? 0;
                        const cued =
                          session.reps?.filter((rep) => rep.faults_json.length > 0).length ?? 0;
                        return details
                          ? `${cued} / ${details} detailed reps`
                          : session.reps
                            ? 'No rep details'
                            : 'Open report';
                      })()}
                    </dd>
                  </div>
                </dl>
              )}
              <div className="history-session-bottom">
                <span>
                  {local
                    ? authenticated
                      ? 'Saved in this browser · account save pending'
                      : 'Saved in this browser'
                    : 'Saved to account'}
                  {incomplete ? ' · Incomplete workout' : ''}
                </span>
                <div>
                  <Button size="small" variant="ghost" onClick={() => {
                    select(session.exercise);
                    navigate('/workout');
                  }} aria-label={`Repeat ${exercises[session.exercise].name}`}>
                    <Repeat2 size={16} /> Repeat
                  </Button>
                  {workout.sessions.length === 1 && (
                    <Button asChild size="small" variant="secondary">
                      <Link to={`/session/${session.id}`} aria-label={`View ${exercises[session.exercise].name} report`}>
                        View report <ArrowRight size={16} />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!loading && !filtered.length && (
          <section className="panel history-empty">
            <History size={30} />
            <h2>
              {hasFilter
                ? 'No workouts match these filters.'
                : error
                  ? 'No browser sessions available.'
                  : 'Your first session belongs here.'}
            </h2>
            <p>
              {hasFilter
                ? 'Try a different search, or clear the filter.'
                : error
                  ? 'Retry account history to check your saved workouts.'
                  : 'Complete a workout to see your report here.'}
            </p>
            {hasFilter ? (
              <Button variant="secondary" onClick={clearFilters}>
                Show all workouts
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
