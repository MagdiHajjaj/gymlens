import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Download, Check, CloudUpload, Info, Repeat2 } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Button } from '../components/ui/button';
import { useIdentity } from '../features/auth/AuthProvider';
import { exercises } from '../features/exercises/ExerciseRegistry';
import {
  buildSessionReport,
  cueLabel,
  measuredAngle,
  measuredTime,
  primaryJoint,
} from '../features/insights/sessionReport';
import { useWorkout } from '../features/workout/workoutStore';
import { useFitnessGoal } from '../features/goals/goals';
import { api } from '../lib/api';
import { duration, exportSession, localSessions, saveLocal, timeLabel } from '../lib/sessionBuffer';
import type { WorkoutSession } from '../types/workout';

export function SessionPage() {
  const { id } = useParams();
  const { authenticated, owner } = useIdentity();
  const navigate = useNavigate();
  const select = useWorkout((state) => state.select);
  const { goal } = useFitnessGoal();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'insights' | null>(null);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [insightError, setInsightError] = useState('');
  const [backupWarning, setBackupWarning] = useState('');
  const [version, setVersion] = useState(0);
  const currentRequest = useRef('');

  useEffect(() => {
    let cancelled = false;
    currentRequest.current = `${owner}:${id}`;
    const local = localSessions(owner).find((s) => s.id === id);
    setSession(local || null);
    setError('');
    setSaveError('');
    setInsightError('');
    setBackupWarning('');
    setBusy(null);
    if (!authenticated || local?.local) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void api
      .detail(id!)
      .then((remote) => {
        if (!cancelled)
          setSession({ ...remote, set_ranges: local?.set_ranges ?? remote.set_ranges, local: false });
      })
      .catch(() => {
        if (!cancelled)
          setError('Could not load the account report. Any available browser copy is shown below.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      currentRequest.current = '';
    };
  }, [id, owner, authenticated, version]);

  async function sync() {
    if (!session || busy) return;
    const requestKey = currentRequest.current;
    setBusy('save');
    setSaveError('');
    setBackupWarning('');
    try {
      const saved = { ...(await api.save(session)), set_ranges: session.set_ranges, local: false };
      if (currentRequest.current !== requestKey) return;
      setSession(saved);
      try {
        saveLocal(saved, owner);
      } catch {
        setBackupWarning('Saved to your account, but the browser backup could not be updated.');
      }
    } catch {
      if (currentRequest.current === requestKey)
        setSaveError(
          'Account save failed. Your browser copy is still available. Retry or download a backup.',
        );
    } finally {
      if (currentRequest.current === requestKey) setBusy(null);
    }
  }

  async function insights() {
    if (!session || busy) return;
    const requestKey = currentRequest.current;
    setBusy('insights');
    setInsightError('');
    try {
      const insight = await api.insights(session.id);
      if (currentRequest.current !== requestKey) return;
      const updated = { ...session, insight };
      setSession(updated);
      try {
        saveLocal(updated, owner);
      } catch {
        setBackupWarning(
          'The account report is available, but this browser could not store the updated copy.',
        );
      }
    } catch {
      if (currentRequest.current === requestKey)
        setInsightError(
          'Additional commentary is unavailable. The recorded findings above remain available.',
        );
    } finally {
      if (currentRequest.current === requestKey) setBusy(null);
    }
  }

  if (loading && !session)
    return (
      <div className="page">
        <p role="status">Loading your session…</p>
      </div>
    );
  if (!session)
    return (
      <div className="page empty-state">
        <h1>Session not found.</h1>
        <p>{error || 'This report may belong to another browser or account.'}</p>
        {error && <Button onClick={() => setVersion((v) => v + 1)}>Retry report</Button>}
        <Button asChild variant="secondary">
          <Link to="/history">Back to history</Link>
        </Button>
      </div>
    );

  const report = buildSessionReport(session);
  const joint = primaryJoint(session.exercise);
  const chart = report.reps.map((rep) => ({
    rep: rep.rep_number,
    angle: measuredAngle(rep) ?? null,
    left: rep.metrics_json.arm_side === 0 ? (measuredAngle(rep) ?? null) : null,
    right: rep.metrics_json.arm_side === 1 ? (measuredAngle(rep) ?? null) : null,
    both: rep.metrics_json.arm_side === 2 ? (measuredAngle(rep) ?? null) : null,
    unknown: ![0, 1, 2].includes(rep.metrics_json.arm_side) ? (measuredAngle(rep) ?? null) : null,
  }));
  const repeat = () => {
    select(session.exercise);
    navigate('/workout');
  };
  const isDemo = session.source === 'demo';
  const local = session.local !== false;
  const sourceLabel = isDemo
    ? 'Demo · sample movement'
    : session.source === 'upload'
      ? 'Video analysis'
      : 'Camera workout';

  return (
    <div className="page session-report-page">
      <Link className="back-link" to="/history">
        <ArrowLeft size={16} /> All sessions
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{sourceLabel}</span>
          <h1>{exercises[session.exercise].name} session report</h1>
          <p>{new Date(session.started_at).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })}</p>
        </div>
        <Button variant="secondary" onClick={() => exportSession(session)}>
          <Download size={16} /> Download session data
        </Button>
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
      {session.status !== 'completed' && (
        <div className="notice">This session was not completed. These are the details saved so far.</div>
      )}
      <div className={`report-save-state ${saveError ? 'has-error' : ''}`} role="status">
        <Check size={18} />
        <div>
          <strong>
            {busy === 'save'
              ? 'Saving to your account…'
              : local
                ? 'Saved in this browser'
                : 'Saved to your account'}
          </strong>
          <p>
            {local
              ? authenticated
                ? 'An account copy is not confirmed yet. Keep this browser copy until saving succeeds.'
                : 'Available in this browser. Download the session data to keep a separate copy.'
              : 'Available when you sign in to this account.'}
          </p>
        </div>
        {local && authenticated && session.status === 'completed' && (
          <Button size="small" variant="secondary" disabled={Boolean(busy)} onClick={() => void sync()}>
            <CloudUpload size={16} />
            {saveError ? 'Retry account save' : 'Save to account'}
          </Button>
        )}
      </div>
      {saveError && (
        <p className="notice error" role="alert">
          {saveError}
        </p>
      )}
      {backupWarning && (
        <p className="notice" role="status">
          {backupWarning}
        </p>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
          <Button size="small" variant="secondary" onClick={() => setVersion((v) => v + 1)}>
            Retry report
          </Button>
        </div>
      )}

      <dl className="session-key-stats">
        <div>
          <dt>Completed reps</dt>
          <dd>{report.total}</dd>
          <p>
            {report.arms
              ? 'Simultaneous curls count as one rep; single-arm curls count individually.'
              : 'Completed movements counted by the tracker.'}
          </p>
        </div>
        <div>
          <dt>{session.source === 'upload' ? 'Analysis time' : 'Session time'}</dt>
          <dd>{session.ended_at ? timeLabel(duration(session)) : 'Incomplete'}</dd>
          <p>
            {session.source === 'upload'
              ? 'Elapsed analysis time, not the video length.'
              : 'Includes calibration, pauses, and rest.'}
          </p>
        </div>
        <div>
          <dt>Reps with recorded cues</dt>
          <dd>
            {report.reps.length ? (
              <>
                {report.cuedReps}
                <small> / {report.reps.length}</small>
              </>
            ) : (
              '—'
            )}
          </dd>
          <p>Based on available rep details. This is not a form score.</p>
        </div>
      </dl>
      <p className="report-coverage">
        {report.reps.length} rep details · {report.measured} valid angle measurements · {report.timed} rep
        timings
        {!report.completeDetails && (
          <strong>
            {' '}
            · Individual details do not match the session total; findings cover only the available reps.
          </strong>
        )}
      </p>

      {report.arms && (
        <section className="panel report-arm-counts" aria-label="Recorded reps by arm">
          <div>
            <span>Left arm</span>
            <strong>{report.arms.left} reps</strong>
          </div>
          <div>
            <span>Right arm</span>
            <strong>{report.arms.right} reps</strong>
          </div>
          {report.arms.both > 0 && (
            <div>
              <span>Both arms together</span>
              <strong>{report.arms.both} reps</strong>
            </div>
          )}
          {report.arms.unknown > 0 && (
            <div>
              <span>Arm not recorded</span>
              <strong>{report.arms.unknown} reps</strong>
            </div>
          )}
          <p>
            These are recorded counts, not a measure of strength or muscle imbalance. A difference can also
            reflect visibility or alternating reps.
          </p>
        </section>
      )}

      <div className="report-findings-grid">
        <section className="report-focus" aria-labelledby="report-focus-title">
          <span className="eyebrow">
            {isDemo ? 'EXAMPLE FOCUS FROM SAMPLE DATA' : 'ONE FOCUS FOR NEXT TIME'}
          </span>
          <h2 id="report-focus-title">{report.focus.title}</h2>
          {goal && (
            <p className="report-goal-context">
              Current training goal: {goal.name}. This focus is based on recorded session data, not a
              measurement of progress toward that goal.
            </p>
          )}
          <p>{report.focus.action}</p>
          <div>
            <strong>Why this focus?</strong>
            <p>{report.focus.evidence}</p>
          </div>
        </section>
        <section className="panel report-cues" aria-labelledby="report-cues-title">
          <h2 id="report-cues-title">What the tracker observed</h2>
          {report.cues.length ? (
            <ul>
              {report.cues.map((cue) => (
                <li key={cue.code}>
                  <div>
                    <strong>{cue.label}</strong>
                    <span>
                      {cue.count} / {report.reps.length} detailed reps
                    </span>
                  </div>
                  <p>Rep {cue.reps.join(', ')}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="report-no-cues">
              <h3>{report.reps.length ? 'No supported cues recorded' : 'No rep-level findings yet'}</h3>
              <p>
                {report.reps.length
                  ? `The tracker recorded no supported technique cues on ${report.reps.length} reps. This does not mean every aspect of your form was assessed.`
                  : 'Without completed rep details, the report cannot assess your movement.'}
              </p>
            </div>
          )}
          <p className="report-note">
            Cues are camera estimates for the checks this exercise supports. They do not measure every aspect
            of technique.
          </p>
        </section>
      </div>

      <section className="panel report-sets" aria-labelledby="report-sets-title">
        <h2 id="report-sets-title">Your recorded sets</h2>
        {report.sets.length ? (
          <>
            <div className="recorded-set-list">
              {report.sets.map((set) => (
                <div key={set.label}>
                  <strong>{set.label}</strong>
                  <span>{set.reps.length} reps</span>
                  <small>
                    Reps {set.reps[0].rep_number}–{set.reps[set.reps.length - 1].rep_number}
                  </small>
                  {set.restSeconds !== undefined && <small>{set.restSeconds}s rest planned</small>}
                </div>
              ))}
            </div>
            {!report.hasCompleteSets && (
              <p className="report-note">
                Only some reps have reliable set boundaries. Ungrouped reps are included in the session total.
              </p>
            )}
          </>
        ) : (
          <p>
            Set boundaries are unavailable in this copy of the report. Set details currently stay in the
            browser that recorded the workout. Use Finish set to mark sets during your next workout.
          </p>
        )}
      </section>

      <details className="panel report-details">
        <summary>
          <strong>Explore measurements and individual reps</strong>
          <span>Joint angles, timing, and the evidence behind each cue</span>
        </summary>
        <section className="report-measurements">
          <h2>Recorded {joint} angles</h2>
          <p>
            Lowest captured joint angle per completed rep. This is not total range of motion, and a lower
            number is not automatically better.
          </p>
          {report.measured ? (
            <div className="report-angle-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <CartesianGrid strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="rep" tickFormatter={(value) => `Rep ${value}`} />
                  <YAxis domain={[0, 180]} tickFormatter={(value) => `${value}°`} />
                  <Tooltip
                    labelFormatter={(value) => `Rep ${value}`}
                    formatter={(value) => [`${value}°`, joint]}
                  />
                  {report.arms ? (
                    <>
                      <Legend />
                      <Line
                        dataKey="left"
                        name="Left arm"
                        stroke="#427756"
                        connectNulls={false}
                        dot
                        isAnimationActive={false}
                      />
                      <Line
                        dataKey="right"
                        name="Right arm"
                        stroke="#7461a8"
                        connectNulls={false}
                        dot
                        isAnimationActive={false}
                      />
                      {report.arms.both > 0 && (
                        <Line
                          dataKey="both"
                          name="Both arms (average)"
                          stroke="#b77935"
                          connectNulls={false}
                          dot
                          isAnimationActive={false}
                        />
                      )}
                      {report.arms.unknown > 0 && (
                        <Line
                          dataKey="unknown"
                          name="Arm not recorded"
                          stroke="#7b7468"
                          connectNulls={false}
                          dot
                          isAnimationActive={false}
                        />
                      )}
                    </>
                  ) : (
                    <Line
                      dataKey="angle"
                      name={`${joint} angle`}
                      stroke="#427756"
                      dot
                      isAnimationActive={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="report-note">No valid rep-level angles were recorded.</p>
          )}
          {report.groups.length > 0 && (
            <div className="report-measurement-groups">
              {report.groups.map((group) => (
                <article key={group.label}>
                  <h3>{group.label}</h3>
                  <p>
                    {group.angles.length} / {group.reps.length} reps include angles.
                    {group.medianSeconds !== undefined &&
                      ` Typical tracked rep time: ${group.medianSeconds}s (median of available timings).`}
                  </p>
                  {group.change ? (
                    <p>
                      First three reps ({group.change.firstReps.join(', ')}):{' '}
                      <strong>{group.change.first}°</strong> average minimum angle. Last three (
                      {group.change.lastReps.join(', ')}): <strong>{group.change.last}°</strong>. Change:{' '}
                      <strong>
                        {group.change.delta > 0 ? '+' : ''}
                        {group.change.delta}°
                      </strong>
                      .
                    </p>
                  ) : (
                    <p>
                      Need at least six reps with valid angles in this group to compare the first three with
                      the last three.
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
          <p className="report-note">
            Angle comparisons stay within recorded sets and, for curls, within the same arm or bilateral
            group. Changes can reflect movement or camera position; they do not establish fatigue or
            improvement. Rep timing covers the tracked movement cycle, not time under load.
          </p>
        </section>
        <section className="report-rep-section">
          <h2>Individual reps</h2>
          {report.reps.length ? (
            <div className="table-scroll">
              <table>
                <caption className="sr-only">Recorded measurements and cues for each rep</caption>
                <thead>
                  <tr>
                    <th>Rep</th>
                    {report.arms && <th>Arm</th>}
                    <th>Lowest {joint} angle</th>
                    <th>Tracked time</th>
                    <th>Recorded cues</th>
                  </tr>
                </thead>
                <tbody>
                  {report.reps.map((rep) => (
                    <tr key={rep.rep_number}>
                      <td>{rep.rep_number}</td>
                      {report.arms && (
                        <td>
                          {rep.metrics_json.arm_side === 0
                            ? 'Left'
                            : rep.metrics_json.arm_side === 1
                              ? 'Right'
                              : rep.metrics_json.arm_side === 2
                                ? 'Both (average)'
                                : 'Unknown'}
                        </td>
                      )}
                      <td>{measuredAngle(rep) === undefined ? 'Unavailable' : `${measuredAngle(rep)}°`}</td>
                      <td>
                        {measuredTime(rep) === undefined
                          ? 'Unavailable'
                          : `${(measuredTime(rep)! / 1000).toFixed(1)}s`}
                      </td>
                      <td>
                        {rep.faults_json.length
                          ? [...new Set(rep.faults_json.map((fault) => fault.code))].map((code) => (
                              <span className="fault-tag" key={code}>
                                {cueLabel(code)}
                              </span>
                            ))
                          : 'None recorded'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No individual rep details are available.</p>
          )}
        </section>
      </details>

      {!isDemo &&
        (session.insight ||
          (authenticated && !local && report.measured > 0 && session.status === 'completed')) && (
          <details className="panel report-details report-extra">
            <summary>
              <strong>Additional AI commentary</strong>
              <span>Generated interpretation, separate from the recorded findings above</span>
            </summary>
            <p>
              This commentary may suggest interpretations. Check it against the recorded cues and
              measurements; it does not add new observations.
            </p>
            {session.insight ? (
              <>
                <p>{session.insight.recap}</p>
                <ul>
                  {[...session.insight.strengths, ...session.insight.improvements].map((text, index) => (
                    <li key={index}>{text}</li>
                  ))}
                </ul>
                <p>{session.insight.next_focus}</p>
              </>
            ) : (
              <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void insights()}>
                {busy === 'insights'
                  ? 'Preparing commentary…'
                  : insightError
                    ? 'Retry commentary'
                    : 'Request commentary'}
              </Button>
            )}
            {insightError && <p role="alert">{insightError}</p>}
          </details>
        )}
      <div className="report-next-actions">
        <Button onClick={repeat}>
          <Repeat2 size={18} /> Repeat this exercise
        </Button>
        <Button asChild variant="secondary">
          <Link to="/history">
            View history <ArrowRight size={17} />
          </Link>
        </Button>
      </div>
      <p className="report-note">
        {isDemo ? 'Sample data only.' : 'Camera-based estimates, not a medical assessment.'} The report cannot
        infer calories, strength gains, or injury risk from these measurements.
      </p>
    </div>
  );
}
