import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowRight, History, Search } from 'lucide-react';
import { useSessions } from '../lib/useSessions';
import { useIdentity } from '../features/auth/AuthProvider';
import { exercises } from '../features/exercises/ExerciseRegistry';
import { duration, timeLabel } from '../lib/sessionBuffer';
import { Button } from '../components/ui/button';
export function HistoryPage() {
  const { sessions, loading, error, retry } = useSessions();
  const { authenticated } = useIdentity();
  const [filter, setFilter] = useState('all');
  const filtered = sessions.filter((s) => filter === 'all' || s.exercise === filter);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE BIGGER PICTURE</span>
          <h1>Every session is a step forward.</h1>
          <p>
            {authenticated
              ? 'Your saved workouts, all in one place.'
              : 'Your recent sessions, saved in this browser. Sign in to build a history across devices.'}
          </p>
        </div>
        <Button asChild>
          <Link to="/workout">
            New workout <ArrowUpRight size={17} />
          </Link>
        </Button>
      </div>
      <section className="panel history-panel">
        <div className="history-toolbar">
          <div>
            <History size={19} />
            <h2>Workout history</h2>
            <span className="count-chip">{sessions.length}</span>
          </div>
          <label className="filter">
            <Search size={16} />
            <select aria-label="Filter exercise" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All exercises</option>
              {Object.entries(exercises).map(([id, e]) => (
                <option key={id} value={id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && (
          <div className="notice error" role="alert">
            {error}
            <Button size="small" variant="secondary" onClick={retry}>
              Retry cloud history
            </Button>
          </div>
        )}
        {loading && <p className="loading-text">Loading your sessions…</p>}
        {filtered.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Movement</th>
                  <th>Date</th>
                  <th>Reps</th>
                  <th>Duration</th>
                  <th>Saved to</th>
                  <th>
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{exercises[s.exercise].name}</strong>
                      {s.source === 'demo' && <span className="tag demo-tag">Demo</span>}
                      {s.source === 'upload' && <span className="tag">Video</span>}
                      {s.status === 'active' && <span className="tag demo-tag">Incomplete</span>}
                    </td>
                    <td>
                      {new Date(s.started_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td>{s.total_reps}</td>
                    <td>{timeLabel(duration(s))}</td>
                    <td>
                      <span className={`tag ${s.local ? '' : 'green'}`}>
                        {s.local ? 'This browser' : 'Account'}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="table-link"
                        to={`/session/${s.id}`}
                        aria-label={`View ${exercises[s.exercise].name} session`}
                      >
                        View <ArrowUpRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && (
            <div className="empty-state">
              <span className="empty-icon">
                <History size={30} />
              </span>
              <h2>
                {filter === 'all' ? 'Your next chapter starts here.' : 'No sessions for this movement yet.'}
              </h2>
              <p>
                Complete a camera workout or try the landmark demo.
                <br />
                Your session report will be waiting here.
              </p>
              <Button asChild>
                <Link to="/workout">
                  Start a session <ArrowRight size={17} />
                </Link>
              </Button>
            </div>
          )
        )}
      </section>
      <p className="small-muted">
        Demo sessions are labeled and excluded from your training totals. Local history retains your 50 most recent sessions.
      </p>
    </div>
  );
}
