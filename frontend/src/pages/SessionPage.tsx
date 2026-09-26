import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  Download,
  Sparkles,
  Check,
  CloudUpload,
  Info,
  Activity,
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { Button } from '../components/ui/button';
import { useIdentity } from '../features/auth/AuthProvider';
import { exercises } from '../features/exercises/ExerciseRegistry';
import { api } from '../lib/api';
import { duration, exportSession, localSessions, saveLocal, timeLabel } from '../lib/sessionBuffer';
import type { WorkoutSession } from '../types/workout';
export function SessionPage() {
  const { id } = useParams();
  const { authenticated, owner } = useIdentity();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attemptedInsight = useRef('');
  useEffect(() => {
    let cancelled = false;
    const local = localSessions(owner).find((s) => s.id === id);
    setSession(local || null);
    setError('');
    if (!authenticated || local?.local) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void api
      .detail(id!)
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, authenticated, owner]);
  async function sync() {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const saved = { ...(await api.save(session)), local: false };
      setSession(saved);
      saveLocal(saved, owner);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this session.');
    } finally {
      setBusy(false);
    }
  }
  async function insights() {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const insight = await api.insights(session.id);
      const updated = { ...session, insight };
      setSession(updated);
      saveLocal(updated, owner);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Insights unavailable.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      loading ||
      !authenticated ||
      !session ||
      session.local ||
      session.insight ||
      session.status !== 'completed' ||
      attemptedInsight.current === session.id
    )
      return;
    attemptedInsight.current = session.id;
    void insights();
  }, [loading, authenticated, session?.id, session?.local, session?.insight, session?.status]);
  if (loading && !session)
    return (
      <div className="page">
        <p className="loading-text">Loading your session…</p>
      </div>
    );
  if (!session)
    return (
      <div className="page empty-state">
        <h1>Session not found.</h1>
        <p>{error || 'This report may belong to another browser or account.'}</p>
        <Button asChild>
          <Link to="/history">Back to history</Link>
        </Button>
      </div>
    );
  const faulty = session.reps.filter((r) => r.faults_json.length > 0).length;
  const faultCounts = new Map<string, { message: string; count: number }>();
  for (const rep of session.reps)
    for (const f of rep.faults_json) {
      const existing = faultCounts.get(f.code);
      faultCounts.set(f.code, { message: f.message, count: (existing?.count || 0) + 1 });
    }
  const primary = session.exercise === 'squat' ? 'knee_angle' : 'elbow_angle';
  const chart = session.metrics
    .filter((m) => m.metric_name === primary)
    .map((m) => ({
      seconds: Math.max(0, Math.round((Date.parse(m.recorded_at) - Date.parse(session.started_at)) / 1000)),
      angle: m.metric_value,
    }));
  return (
    <div className="page">
      <Link className="back-link" to="/history">
        <ArrowLeft size={16} /> All sessions
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {session.source === 'demo' ? 'DEMO SESSION REPORT' : 'YOUR SESSION REPORT'}
          </span>
          <h1>{session.total_reps ? 'You showed up. That counts.' : 'A fresh start is still a start.'}</h1>
          <p>
            {exercises[session.exercise].name} <span className="selection-separator">·</span>{' '}
            {new Date(session.started_at).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })}
          </p>
        </div>
        <Button variant="secondary" onClick={() => exportSession(session)}>
          <Download size={16} /> Export report
        </Button>
      </div>
      {session.source === 'demo' && (
        <div className="notice">
          <Info size={17} />
          <span>
            This report uses synthetic landmark data to demonstrate the app. It is not a measured workout.
          </span>
        </div>
      )}
      {session.local && (
        <div className="notice">
          <Check size={17} />
          <span>
            Saved in this browser.
            {authenticated
              ? ' Your cloud upload is pending. Retry to save it to your account.'
              : ' Sign in for cloud history and AI insights.'}
          </span>
          {authenticated && (
            <Button size="small" variant="secondary" onClick={() => void sync()} disabled={busy}>
              <CloudUpload size={15} />
              {busy ? 'Saving…' : 'Save to account'}
            </Button>
          )}
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error} Your measured statistics remain available.
        </div>
      )}
      <div className="report-stats">
        <div className="panel">
          <span className="eyebrow">COMPLETED REPS</span>
          <strong>
            {session.total_reps}
            <small> reps</small>
          </strong>
        </div>
        <div className="panel">
          <span className="eyebrow">SESSION DURATION</span>
          <strong>{timeLabel(duration(session))}</strong>
        </div>
        <div className="panel">
          <span className="eyebrow">REPS WITH TECHNIQUE CUES</span>
          <strong>
            {faulty}
            <small> of {session.total_reps}</small>
          </strong>
        </div>
      </div>
      <div className="report-grid">
        <section className="panel chart-panel">
          <div className="section-heading">
            <div>
              <h2>Your movement, mapped</h2>
              <p>{primary.replace('_', ' ')} · sampled once per second</p>
            </div>
            <Activity size={20} />
          </div>
          {chart.length ? (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 15, right: 20, bottom: 15, left: -15 }}>
                  <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e7ebe4" />
                  <XAxis
                    dataKey="seconds"
                    tickFormatter={(v) => `${v}s`}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={35}
                  />
                  <YAxis domain={[0, 180]} tickFormatter={(v) => `${v}°`} tickLine={false} axisLine={false} />
                  <Tooltip
                    labelFormatter={(v) => `${v} seconds`}
                    formatter={(v) => [`${v}°`, 'Joint angle']}
                  />
                  <Line
                    type="monotone"
                    dataKey="angle"
                    stroke="#427756"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-inline">
              <p>
                No angle samples were recorded. Calibrate your position before moving in your next session.
              </p>
            </div>
          )}
        </section>
        <section className="report-coach">
          <span className="eyebrow">
            <Sparkles size={15} />
            {session.insight ? 'GEMINI SESSION INSIGHTS' : 'OBSERVED SESSION SUMMARY'}
          </span>
          <h2>A moment to reflect.</h2>
          <p>
            {session.insight?.recap ||
              (session.total_reps
                ? `${session.total_reps} full movement cycles recorded. ${faulty} ${faulty === 1 ? 'rep included' : 'reps included'} a supported technique cue.`
                : 'No full movement cycles were recorded in this session.')}
          </p>
          {session.insight ? (
            <>
              <h3>What went well</h3>
              <ul>
                {session.insight.strengths.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
              <h3>Room to grow</h3>
              <ul>
                {session.insight.improvements.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="small-muted">
              No detected cues does not guarantee correct form. These measurements depend on a clear side
              view.
            </p>
          )}
          <div className="next-focus">
            <span className="eyebrow">NEXT SESSION’S FOCUS</span>
            <p>
              {session.insight?.next_focus ||
                [...faultCounts.values()].sort((a, b) => b.count - a.count)[0]?.message ||
                'Set up a clear side view, then move at a steady, comfortable pace.'}
            </p>
          </div>
          {authenticated && !session.local && !session.insight && (
            <Button
              variant="secondary"
              onClick={() => void insights()}
              disabled={busy || session.status !== 'completed'}
            >
              <Sparkles size={15} />
              {busy ? 'Creating insights…' : 'Generate AI insights'}
            </Button>
          )}
        </section>
      </div>
      <section className="panel reps-table">
        <div className="section-heading">
          <div>
            <h2>One rep at a time</h2>
            <p>The details behind your session.</p>
          </div>
          <span className="tag">{session.reps.length} recorded</span>
        </div>
        {session.reps.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rep</th>
                  <th>Minimum joint angle</th>
                  <th>Movement time</th>
                  <th>Observed cues</th>
                </tr>
              </thead>
              <tbody>
                {session.reps.map((r) => (
                  <tr key={r.rep_number}>
                    <td>
                      <strong>{String(r.rep_number).padStart(2, '0')}</strong>
                    </td>
                    <td>
                      {r.metrics_json.min_angle === undefined
                        ? 'Unavailable'
                        : `${r.metrics_json.min_angle}°`}
                    </td>
                    <td>
                      {r.metrics_json.duration_ms === undefined
                        ? 'Unavailable'
                        : `${(r.metrics_json.duration_ms / 1000).toFixed(1)}s`}
                    </td>
                    <td>
                      {r.faults_json.length ? (
                        r.faults_json.map((f) => (
                          <span className="fault-tag" key={f.code}>
                            {f.code.replaceAll('_', ' ')}
                          </span>
                        ))
                      ) : (
                        <span className="tag green">No supported cues detected</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small-muted">No reps recorded. Try a full descent and return after calibration.</p>
        )}
      </section>
      <div className="report-bottom">
        <p className="disclaimer">
          <Info size={15} /> Approximate movement cues, not a medical assessment.
        </p>
        <Button asChild>
          <Link to="/workout">
            Back to movement <ArrowUpRight size={16} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
