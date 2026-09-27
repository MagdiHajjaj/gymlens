import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Repeat2, Sparkles } from 'lucide-react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { Button } from './ui/button';
import { useIdentity } from '../features/auth/AuthProvider';
import { exercises } from '../features/exercises/ExerciseRegistry';
import {
  buildSessionReport,
  cueLabel,
  measuredAngle,
  measuredTime,
  primaryJoint,
} from '../features/insights/sessionReport';
import { formatRepList } from '../features/insights/repList';
import { generateStatisticsInsight } from '../features/insights/insightEngine';
import { rangeGuidance } from '../features/insights/rangeGuidance';
import { useWorkout } from '../features/workout/workoutStore';
import { useFitnessGoal } from '../features/goals/goals';
import { api } from '../lib/api';
import { duration, exportSession, timeLabel } from '../lib/sessionBuffer';
import type { Insight, WorkoutSession } from '../types/workout';

interface ExerciseReportProps {
  session: WorkoutSession;
  /** Show an exercise heading above the analysis (for combined workout reports). */
  showHeading?: boolean;
  /** Automatically request Gemini commentary on mount when eligible. */
  autoFetchInsight?: boolean;
  /** Notified when an insight is fetched so the parent can persist it. */
  onInsight?: (sessionId: string, insight: Insight) => void;
}

/**
 * The full per-exercise analysis: key stats, coach feedback, recorded cues,
 * sets, measurement charts, and the individual rep table. Used by the single
 * session page and, once per exercise, by the combined workout report.
 */
export function ExerciseReport({
  session,
  showHeading = false,
  autoFetchInsight = false,
  onInsight,
}: ExerciseReportProps) {
  const { authenticated } = useIdentity();
  const navigate = useNavigate();
  const select = useWorkout((state) => state.select);
  const { goal } = useFitnessGoal();
  const [insight, setInsight] = useState<Insight | null>(session.insight ?? null);
  const [insightBusy, setInsightBusy] = useState(false);
  const [insightError, setInsightError] = useState('');
  const attemptedInsight = useRef(false);
  const onInsightRef = useRef(onInsight);
  onInsightRef.current = onInsight;

  // Keep local insight in sync if the parent session object changes.
  useEffect(() => {
    setInsight(session.insight ?? null);
  }, [session.insight]);

  async function fetchInsight() {
    if (insightBusy) return;
    setInsightBusy(true);
    setInsightError('');
    try {
      const fresh = await api.insights(session.id);
      setInsight(fresh);
      onInsightRef.current?.(session.id, fresh);
    } catch {
      setInsightError(
        'Additional commentary is unavailable. The recorded findings above remain available.',
      );
    } finally {
      setInsightBusy(false);
    }
  }

  // Restores the pre-grounded-report behavior: eligible reports fetch the Gemini
  // insight on load instead of waiting for a manual request. Guarded to run
  // once per session so it never spams the rate-limited endpoint.
  useEffect(() => {
    if (
      !autoFetchInsight ||
      !authenticated ||
      session.local !== false ||
      insight ||
      session.status !== 'completed' ||
      attemptedInsight.current
    )
      return;
    attemptedInsight.current = true;
    void fetchInsight();
  }, [autoFetchInsight, authenticated, session.id, session.local, session.status]);

  const report = buildSessionReport(session);
  const angleGuide = rangeGuidance(session.exercise);
  const knownArmReps = report.arms
    ? report.arms.left + report.arms.right + report.arms.both
    : 0;
  const showArmBreakdown = Boolean(report.arms && knownArmReps > 0);
  const observedInsight = generateStatisticsInsight(session, goal?.id);
  // "What went well" only renders when there is something genuinely positive
  // to say — a zero-clean session reports that fact in the recap instead.
  const strengths = insight?.strengths || observedInsight.strengths;
  const improvements = insight?.improvements || observedInsight.improvements;
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
  const canRequestInsight =
    authenticated && !local && report.measured > 0 && session.status === 'completed';
  const insightUnavailableReason = !authenticated
    ? 'Sign in and save this session to your account to request AI commentary.'
    : local
      ? 'Save this session to your account to request AI commentary.'
      : session.status !== 'completed'
        ? 'Finish the session before requesting AI commentary.'
        : report.measured === 0
          ? 'AI commentary needs recorded rep measurements.'
          : '';

  return (
    <section className="exercise-report" aria-label={`${exercises[session.exercise].name} analysis`}>
      {showHeading && (
        <div className="exercise-report-heading">
          <div>
            <span className="eyebrow">{exercises[session.exercise].name}</span>
            <h2>{exercises[session.exercise].name} analysis</h2>
            <p>
              {report.total} {report.total === 1 ? 'rep' : 'reps'}
              {session.ended_at ? ` · ${timeLabel(duration(session))}` : ' · Incomplete'}
            </p>
          </div>
          <Button size="small" variant="secondary" onClick={() => exportSession(session)}>
            <Download size={15} /> Session data
          </Button>
        </div>
      )}

      <dl className="session-key-stats">
        <div>
          <dt>Completed reps</dt>
          <dd>{report.total}</dd>
          <p>
            {report.arms
              ? showArmBreakdown
                ? 'One rep is a completed cycle from both arms, whether you curl together or alternate.'
                : 'Arm-by-arm detail was not recorded for this session.'
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
        {report.reps.length} rep details · {report.measured} valid angle measurements · {report.timed}{' '}
        rep timings
        {!report.completeDetails && (
          <strong>
            {' '}
            · Individual details do not match the session total; findings cover only the available reps.
          </strong>
        )}
      </p>

      {angleGuide && (
        <p className="report-note report-range-guide">
          <strong>{angleGuide.label}:</strong> aim for about {angleGuide.target} within your comfortable
          range. {angleGuide.explanation}
        </p>
      )}

      {report.arms && showArmBreakdown && (
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
            These are recorded counts, not a measure of strength or muscle imbalance. A difference can
            also reflect visibility or alternating reps.
          </p>
        </section>
      )}

      <div className="report-findings-grid">
        <section className="report-coach" aria-labelledby={`report-coach-title-${session.id}`}>
          <span className="eyebrow">
            <Sparkles size={15} />
            {insight ? 'GEMINI FEEDBACK' : isDemo ? 'SAMPLE FEEDBACK' : 'SESSION FEEDBACK'}
          </span>
          {goal && <span className="tag green">Training for: {goal.name}</span>}
          <h2 id={`report-coach-title-${session.id}`}>A moment to reflect.</h2>
          <p>{insight?.recap || observedInsight.recap}</p>
          {strengths.length > 0 && (
            <>
              <h3 className="reflect-pos">What went well</h3>
              <ul>
                {strengths.map((text, i) => (
                  <li key={i}>
                    {text}
                    {!insight && observedInsight.evidence.strengths[i]?.why && (
                      <span className="coach-why">
                        {' '}
                        Why: {observedInsight.evidence.strengths[i]?.why}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {improvements.length > 0 && (
            <>
              <h3 className="reflect-neg">Try next</h3>
              <ul>
                {improvements.map((text, i) => (
                  <li key={i}>
                    {text}
                    {!insight && observedInsight.evidence.improvements[i]?.why && (
                      <span className="coach-why">
                        {' '}
                        Why: {observedInsight.evidence.improvements[i]?.why}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="next-focus">
            <span className="eyebrow">NEXT SESSION&rsquo;S FOCUS</span>
            <p>{insight?.next_focus || observedInsight.next_focus}</p>
            {!insight && observedInsight.evidence.next_focus.why && (
              <p className="coach-why">Why: {observedInsight.evidence.next_focus.why}</p>
            )}
          </div>
          {insight ? (
            <p className="coach-source-note">
              Generated by Gemini from your recorded measurements. Check it against the recorded cues
              and measurements above; it does not add new observations.
            </p>
          ) : (
            <>
              <p className="coach-source-note">
                Based only on this session&rsquo;s recorded measurements. This is not a form score or a
                medical assessment.
              </p>
              {!isDemo && canRequestInsight && (
                <Button variant="secondary" disabled={insightBusy} onClick={() => void fetchInsight()}>
                  <Sparkles size={15} />
                  {insightBusy
                    ? 'Preparing commentary…'
                    : insightError
                      ? 'Retry AI commentary'
                      : 'Request AI commentary'}
                </Button>
              )}
              {!isDemo && !canRequestInsight && insightUnavailableReason && (
                <p className="coach-why">{insightUnavailableReason}</p>
              )}
            </>
          )}
          {insightError && !insight && (
            <p className="notice error" role="alert">
              {insightError}
            </p>
          )}
        </section>
        <section className="panel report-cues" aria-labelledby={`report-cues-title-${session.id}`}>
          <h2 id={`report-cues-title-${session.id}`}>What the tracker observed</h2>
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
                  <p>
                    Rep{cue.reps.length === 1 ? '' : 's'} {formatRepList(cue.reps)}
                  </p>
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
            Cues are camera estimates for the checks this exercise supports. They do not measure every
            aspect of technique.
          </p>
        </section>
      </div>

      <section className="panel report-sets" aria-labelledby={`report-sets-title-${session.id}`}>
        <h2 id={`report-sets-title-${session.id}`}>Your recorded sets</h2>
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
                Only some reps have reliable set boundaries. Ungrouped reps are included in the session
                total.
              </p>
            )}
          </>
        ) : (
          <p>
            Set boundaries are unavailable for this workout. During a workout, tap &ldquo;Finish set ·
            rest&rdquo; between sets and the report will split your reps into sets here.
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
                  {showArmBreakdown ? (
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
                      {(report.arms?.both ?? 0) > 0 && (
                        <Line
                          dataKey="both"
                          name="Both arms (average)"
                          stroke="#b77935"
                          connectNulls={false}
                          dot
                          isAnimationActive={false}
                        />
                      )}
                      {(report.arms?.unknown ?? 0) > 0 && (
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
                      {group.change.lastReps.join(', ')}): <strong>{group.change.last}°</strong>.
                      Change:{' '}
                      <strong>
                        {group.change.delta > 0 ? '+' : ''}
                        {group.change.delta}°
                      </strong>
                      .
                    </p>
                  ) : (
                    <p>
                      Need at least six reps with valid angles in this group to compare the first three
                      with the last three.
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
                    {showArmBreakdown && <th>Arm</th>}
                    <th>Lowest {joint} angle</th>
                    <th>Tracked time</th>
                    <th>Recorded cues</th>
                  </tr>
                </thead>
                <tbody>
                  {report.reps.map((rep) => (
                    <tr key={rep.rep_number}>
                      <td>{rep.rep_number}</td>
                      {showArmBreakdown && (
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
                      <td>
                        {measuredAngle(rep) === undefined ? 'Unavailable' : `${measuredAngle(rep)}°`}
                      </td>
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

      <div className="report-next-actions">
        <Button onClick={repeat}>
          <Repeat2 size={18} /> Repeat this exercise
        </Button>
      </div>
      <p className="report-note">
        {isDemo ? 'Sample data only.' : 'Camera-based estimates, not a medical assessment.'} The report
        cannot infer calories, strength gains, or injury risk from these measurements.
      </p>
    </section>
  );
}
