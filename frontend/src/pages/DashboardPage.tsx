import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowRight,
  Play,
  MoveUpRight,
  Timer,
  Target,
  Activity,
  Check,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { ExerciseArt } from '../components/ExerciseArt';
import { exercises } from '../features/exercises/ExerciseRegistry';
import { useWorkout } from '../features/workout/workoutStore';
import { useSessions } from '../lib/useSessions';
import { duration } from '../lib/sessionBuffer';
import type { ExerciseId } from '../types/workout';

export function badgeNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Keep the deterministic e2e demo flag when entering demo mode from here.
  const synthetic = searchParams.get('synthetic') === '1' ? '&synthetic=1' : '';
  const selected = useWorkout((s) => s.selected);
  const select = useWorkout((s) => s.select);
  const { sessions, error } = useSessions();
  const completed = sessions.filter((s) => s.status === 'completed' && s.source !== 'demo');
  const total = completed.reduce((sum, s) => sum + s.total_reps, 0);
  return (
    <div className="page dashboard-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LITTLE BETTER, EVERY SESSION</span>
          <h1>
            Good form. Great progress<span className="green-text">.</span>
          </h1>
          <p>Your personal training space. Let’s make every movement count.</p>
        </div>
        <div className="date-chip">
          {new Date().toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-tag">
            <span /> YOUR AI TRAINING PARTNER
          </div>
          <h2>
            Move with
            <br />
            <em>intention.</em>
          </h2>
          <p>
            Point your camera at your workout — we count every rep and coach your form in real time.
            <br />A stronger connection to the way you move.
          </p>
          <div className="button-row">
            <Button className="button-lime" onClick={() => navigate('/workout')}>
              Start a workout <ArrowUpRight size={18} />
            </Button>
            <button className="hero-demo" onClick={() => navigate(`/workout?mode=demo${synthetic}`)}>
              <span>
                <Play size={12} fill="currentColor" />
              </span>
              Try the demo
            </button>
          </div>
          <div className="hero-footnote">
            <ShieldCheck size={14} /> Your camera. Your device. Always private.
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <ExerciseArt exercise="squat" large />
          <div className="floating-label tracking-label">
            <span className="live-dot" />
            MOVEMENT, IN FOCUS
          </div>
          <div className="floating-label feedback-label">
            <span className="check-circle">
              <Check size={16} />
            </span>
            <div>
              <strong>
                A little guidance.
                <br />A lot of possibility.
              </strong>
              <small>COACHING THAT MOVES WITH YOU</small>
            </div>
          </div>
          <div className="hero-coordinate">
            33 LANDMARKS <span>·</span> ONE YOU
          </div>
        </div>
      </section>
      <section className="stat-grid" aria-label="Your workout statistics">
        <Link className="stat-card" to="/history" aria-label="Completed workouts. View history.">
          <span className="stat-icon">
            <Activity size={20} />
          </span>
          <div>
            <span>Completed workouts</span>
            <strong>
              {completed.length}
              <small> sessions</small>
            </strong>
          </div>
          <MoveUpRight size={15} aria-hidden />
        </Link>
        <Link className="stat-card" to="/history" aria-label="Reps that count. View history.">
          <span className="stat-icon">
            <Target size={20} />
          </span>
          <div>
            <span>Reps that count</span>
            <strong>
              {total}
              <small> reps</small>
            </strong>
          </div>
          <MoveUpRight size={15} aria-hidden />
        </Link>
        <Link className="stat-card" to="/history" aria-label="Time for yourself. View history.">
          <span className="stat-icon">
            <Timer size={20} />
          </span>
          <div>
            <span>Time for yourself</span>
            <strong>
              {Math.floor(completed.reduce((sum, s) => sum + duration(s), 0) / 60)}
              <small> minutes</small>
            </strong>
          </div>
          <MoveUpRight size={15} aria-hidden />
        </Link>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <h2>Find your movement</h2>
            <p>
              {Object.keys(exercises).length} movements. Thoughtful feedback for each.
            </p>
          </div>
          <span className="tag outlined">SIDE-VIEW TRAINING</span>
        </div>
        <div className="exercise-grid">
          {(Object.keys(exercises) as ExerciseId[]).map((id) => {
            const exercise = exercises[id];
            return (
              <button
                key={id}
                className={`exercise-card ${selected === id ? 'selected' : ''}`}
                onClick={() => select(id)}
                aria-pressed={selected === id}
              >
                <div className={`exercise-image ${exercise.color}`}>
                  <span className="exercise-category">{exercise.category}</span>
                  <span className={`selection-dot ${selected === id ? 'checked' : ''}`}>
                    {selected === id && <Check size={12} />}
                  </span>
                  <ExerciseArt exercise={id} />
                  <span className="exercise-number">{badgeNumber(Object.keys(exercises).indexOf(id))}</span>
                </div>
                <div className="exercise-info">
                  <div>
                    <h3>{exercise.name}</h3>
                    <p>{exercise.muscles}</p>
                  </div>
                </div>
                <div className="exercise-checks">
                  <span /> {exercise.checks}
                </div>
              </button>
            );
          })}
        </div>
        <div className="selection-bar">
          <span>
            <strong>{exercises[selected].name}</strong> selected{' '}
            <span className="selection-separator">·</span> Find your space. We’ll handle the counting.
          </span>
          <Button size="small" onClick={() => navigate('/workout')}>
            Let’s go <ArrowRight size={15} />
          </Button>
        </div>
      </section>
      <div className="dashboard-bottom">
        <section className="recent-section">
          <div className="section-heading">
            <h2>Your recent sessions</h2>
            <Link className="text-link" to="/history">
              View history <ArrowRight size={15} />
            </Link>
          </div>
          {error && (
            <p className="small-muted" role="alert">
              Cloud history unavailable. Showing this browser’s sessions.
            </p>
          )}
          {sessions.length ? (
            <div className="recent-list">
              {sessions.slice(0, 3).map((s) => (
                <Link to={`/session/${s.id}`} key={s.id} className="recent-row">
                  <div className={`mini-exercise ${exercises[s.exercise].color}`}>
                    <Activity size={20} />
                  </div>
                  <div>
                    <strong>{exercises[s.exercise].name}</strong>
                    <small>
                      {new Date(s.started_at).toLocaleDateString()} {s.source === 'demo' ? '· Demo' : ''}
                    </small>
                  </div>
                  <span>{s.total_reps} reps</span>
                  <ArrowUpRight size={17} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-inline">
              <span className="empty-icon">
                <HistoryIcon />
              </span>
              <div>
                <h3>Your story starts with one session.</h3>
                <p>Finish a workout and you’ll find it right here.</p>
              </div>
            </div>
          )}
        </section>
        <aside className="tip-card">
          <span className="eyebrow">
            <Sparkles size={14} /> A SMALL REMINDER
          </span>
          <h3>
            Progress isn’t always
            <br />a heavier weight.
          </h3>
          <p>Sometimes it’s a slower rep, a deeper breath, or simply showing up.</p>
          <span className="tip-line" />
        </aside>
      </div>
    </div>
  );
}
function HistoryIcon() {
  return <Activity size={23} />;
}
