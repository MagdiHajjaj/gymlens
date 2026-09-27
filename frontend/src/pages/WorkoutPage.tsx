import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check,
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  ScanLine,
  Info,
  Download,
  SkipForward,
  Timer,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { WorkoutSetup } from '../features/workout/WorkoutSetup';
import { CameraView } from '../features/camera/CameraView';
import { VoiceCoach } from '../features/coaching/VoiceCoach';
import { PRIORITY, selectedExerciseWarmPhrases } from '../features/coaching/Phrasebook';
import { summarizeSession, summarizeSet } from '../features/coaching/sessionSummary';
import { MuscleDiagram } from '../components/MuscleDiagram';
import { useWorkout } from '../features/workout/workoutStore';
import { usePlan } from '../features/workout/planStore';
import { exercises } from '../features/exercises/ExerciseRegistry';
import { useIdentity } from '../features/auth/AuthProvider';
import { exportSession, saveLocal, timeLabel } from '../lib/sessionBuffer';
import {
  formatMetricName,
  formatMetricValue,
  trackingStatusText,
} from '../features/camera/measurementDisplay';
import { api } from '../lib/api';
import type { WorkoutSession } from '../types/workout';

const COUNTDOWN_CALLOUTS = new Set([10, 5, 4, 3, 2, 1]);

export function WorkoutPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const identity = useIdentity();
  const {
    selected,
    session,
    begin,
    result,
    paused,
    pause,
    voice,
    toggleVoice,
    restPreset,
    targetReps,
    rest,
    currentSetStartRep,
    startRest,
    completeRest,
    finish,
  } = useWorkout();
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (active) window.scrollTo(0, 0);
  }, [active]);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [unsaved, setUnsaved] = useState<WorkoutSession | null>(null);
  const [cue, setCue] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [voiceStatus, setVoiceStatus] = useState('Tap Voice on to hear coaching.');
  const [restRemaining, setRestRemaining] = useState(0);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const [leaveError, setLeaveError] = useState('');
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active &&
      session?.source !== 'demo' &&
      (session?.status === 'active' || Boolean(error && unsaved)) &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state === 'blocked') leaveDialog.current?.showModal();
    else leaveDialog.current?.close();
  }, [blocker.state]);
  const announcedCountdown = useRef(new Set<number>());
  const [voiceCoach] = useState(() => new VoiceCoach(setVoiceStatus));
  const currentSetReps = Math.max(0, (session?.total_reps ?? 0) - currentSetStartRep + 1);
  const trackedReps = session?.total_reps ?? 0;
  const trackingState = rest
    ? 'rest'
    : paused
      ? 'paused'
      : !result?.trackingValid
        ? 'searching'
        : !result.calibrated
          ? 'calibrating'
          : 'ready';
  const trackingLabel = {
    rest: 'Resting',
    paused: 'Paused',
    searching: 'Move into frame',
    calibrating: 'Hold your starting position',
    ready: 'Tracking your movement',
  }[trackingState];

  function saveAndLeave() {
    if (blocker.state !== 'blocked') return;
    const completed = session?.status === 'active' ? finish() : unsaved;
    if (completed) {
      try {
        saveLocal(completed, identity.owner);
      } catch {
        setUnsaved(completed);
        setError('Your session could not be saved in this browser.');
        setLeaveError('Browser storage is unavailable. Stay here and download your session before leaving.');
        return;
      }
    }
    voiceCoach.stop();
    blocker.proceed();
  }

  function enableVoice() {
    voiceCoach.stop();
    voiceCoach.unlock();
    toggleVoice();
    if (!voice) {
      void voiceCoach.speak("Voice coach is ready. Let's get moving.", identity.authenticated, {
        priority: PRIORITY.transition,
      });
      void voiceCoach.warmPhrases(selectedExerciseWarmPhrases(selected), identity.authenticated);
    } else setVoiceStatus('Voice is off.');
  }

  function finishSet() {
    voiceCoach.stop();
    const range = startRest(Date.now());
    const current = useWorkout.getState().session;
    if (!range || !current) return;
    // Closing the final planned set ends the exercise: bank the session and
    // advance to the plan review instead of starting another rest.
    const planItem = usePlan.getState().plan.find((item) => item.exerciseId === current.exercise);
    const finalPlannedSet =
      planItem !== undefined && range.set_number >= planItem.sets && current.source !== 'demo';
    if (finalPlannedSet) {
      if (voice) {
        void voiceCoach.speak('Exercise complete. Nice work.', identity.authenticated, {
          priority: PRIORITY.summary,
        });
      }
      void end();
      return;
    }
    setRestRemaining(restPreset);
    if (voice) {
      void voiceCoach.speak(summarizeSet(current, range), identity.authenticated, {
        priority: PRIORITY.summary,
      });
      void voiceCoach.speak(`Rest ${restPreset} seconds.`, identity.authenticated, {
        priority: PRIORITY.transition,
      });
    }
  }
      // Auto-finish the set once the chosen rep target is reached, which starts the rest timer.
    // Uploaded videos keep playing, so they are analyzed as one continuous set instead.
  const autoSets = targetReps > 0 && session?.source !== 'upload';
  useEffect(() => {
    if (!active || !autoSets || rest || paused || session?.status !== 'active') return;
    if (currentSetReps >= targetReps) finishSet();
      // finishSet reads the latest store state itself; re-run only when the rep count or set state changes.
  }, [active, autoSets, currentSetReps, targetReps, rest, paused, session?.status]);
  
  function skipRest() {
    if (!rest) return;
    const nextSet = rest.completed_set + 1;
    voiceCoach.stop();
    completeRest();
    if (voice)
      void voiceCoach.speak(`Set ${nextSet}, go.`, identity.authenticated, {
        priority: PRIORITY.transition,
      });
  }
  useEffect(() => {
    if (!active) return;
    const checkpoint = setInterval(() => {
      const snapshot = useWorkout.getState().session;
      if (snapshot?.status !== 'active') return;
      try {
        saveLocal({ ...snapshot, status: 'completed', ended_at: new Date().toISOString() }, identity.owner);
      } catch {
        setError('Browser storage is unavailable. End the session to export a backup.');
      }
    }, 5000);
    return () => {
      clearInterval(checkpoint);
      const state = useWorkout.getState();
      if (state.session?.status === 'active') {
        const completed = state.finish();
        try {
          saveLocal(completed, identity.owner);
        } catch {
          /* Explicit end/export handles unavailable storage. */
        }
      }
    };
  }, [active, identity.owner]);
  useEffect(() => {
    if (!active || paused) return;
    const timer = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [active, paused]);
  useEffect(() => {
    announcedCountdown.current.clear();
  }, [rest?.ends_at_ms]);
  useEffect(() => {
    if (!rest) {
      setRestRemaining(0);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((rest.ends_at_ms - Date.now()) / 1000));
      setRestRemaining(remaining);
      if (remaining === 0) {
        if (announcedCountdown.current.has(0)) return;
        announcedCountdown.current.add(0);
        const nextSet = rest.completed_set + 1;
        completeRest();
        if (voice)
          void voiceCoach.speak(`Set ${nextSet}, go.`, identity.authenticated, {
            priority: PRIORITY.transition,
          });
        return;
      }
      if (voice && COUNTDOWN_CALLOUTS.has(remaining) && !announcedCountdown.current.has(remaining)) {
        announcedCountdown.current.add(remaining);
        void voiceCoach.speak(`${remaining}.`, identity.authenticated, {
          priority: PRIORITY.transition,
        });
      }
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [completeRest, identity.authenticated, rest, voice, voiceCoach]);
  useEffect(() => {
    if (!active || session?.source === 'demo' || (session?.status !== 'active' && !(error && unsaved))) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active, session?.source, session?.status, error, unsaved]);
  useEffect(() => {
    if (!result?.faults.length) return;
    setCue(result.faults[0].message);
    const timer = setTimeout(() => setCue(''), 4000);
    return () => clearTimeout(timer);
  }, [result?.faults[0]?.code]);
  function start(source: 'camera' | 'demo' | 'upload', file?: File) {
    setVideoFile(file ?? null);
    setError('');
    setElapsed(0);
    setCue('');
    // Camera sessions always launch from the setup preview, whose Start button and
    // auto-start only fire once the position is calibrated — so the session can
    // skip the hold-still calibration and start tracking immediately.
    begin(source, { preCalibrated: source === 'camera' });
    setActive(true);
  }
  async function end() {
    if (saving) return;
    setSaving(true);
    setError('');
    voiceCoach.stop();
    const completed = finish();
    if (completed.source === 'demo') {
      setUnsaved(null);
      setActive(false);
      setSaving(false);
      navigate('/workout');
      return;
    }
    setUnsaved(completed);
    const spokenSummary = voice
      ? voiceCoach.speak(summarizeSession(completed), identity.authenticated, {
          priority: PRIORITY.summary,
        })
      : Promise.resolve();
    try {
      saveLocal(completed, identity.owner);
    } catch {
      setError('Browser storage is full or unavailable. Download this session before leaving.');
      await spokenSummary;
      setSaving(false);
      return;
    }
    if (identity.authenticated) {
      try {
        const remote = await api.save(completed);
        saveLocal({ ...remote, set_ranges: completed.set_ranges, local: false }, identity.owner);
      } catch {
        /* The report exposes the local backup and a retry action. */
      }
    }
    await spokenSummary;
    setActive(false);
    setSaving(false);
    // With a session plan, land on the plan review (checkmarks + next exercise)
    // instead of the session report; it also covers the fully-complete state.
    const hasPlan = usePlan.getState().plan.length > 0;
    navigate(hasPlan ? '/workout?plan=review' : `/session/${completed.id}`);
  }
  const exercise = exercises[selected];
  if (saving)
    return (
      <div className="page workout-page">
        <section className="panel workout-finishing" role="status" aria-live="polite">
          <span className="eyebrow">WORKOUT COMPLETE</span>
          <h1>Saving your workout…</h1>
          <p>Keeping your exercises together in one workout history entry.</p>
        </section>
      </div>
    );
  if (!active)
    return (
      <WorkoutSetup
        demo={search.get('mode') === 'demo'}
        voiceCoach={voiceCoach}
        onVoice={enableVoice}
        onStart={start}
      />
    );
  return (
    <div className="page workout-page">
      <dialog
        ref={leaveDialog}
        className="workout-leave-dialog"
        aria-labelledby="leave-workout-title"
        onCancel={(event) => {
          event.preventDefault();
          if (blocker.state === 'blocked') blocker.reset();
        }}
      >
        <h2 id="leave-workout-title">End this workout and leave?</h2>
        <p>Your session will finish and be saved in this browser. Stay here to keep training.</p>
        {leaveError && <p role="alert">{leaveError}</p>}
        <div className="button-row">
          <Button
            autoFocus
            variant="secondary"
            onClick={() => {
              setLeaveError('');
              if (blocker.state === 'blocked') blocker.reset();
            }}
          >
            Stay in workout
          </Button>
          <Button onClick={saveAndLeave}>Save and leave</Button>
        </div>
      </dialog>
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">
            {session?.source === 'demo'
              ? 'VIDEO DEMO'
              : session?.source === 'upload'
                ? 'VIDEO ANALYSIS'
                : 'WORKOUT IN PROGRESS'}
          </span>
          <h1>{exercise.name}</h1>
        </div>
        <div className="session-clock">
          <span className={paused ? '' : 'live-dot'} />
          {timeLabel(elapsed)}
        </div>
      </div>
      <div className={`workout-status workout-status-${trackingState}`} role="status">
        {trackingState === 'ready' ? (
          <Check size={18} />
        ) : trackingState === 'paused' ? (
          <Pause size={18} />
        ) : trackingState === 'rest' ? (
          <Timer size={18} />
        ) : (
          <ScanLine size={18} />
        )}
        <strong>{trackingLabel}</strong>
        <span>
          {rest
            ? `Next set in ${restRemaining}s`
            : paused
              ? 'Resume when you’re ready.'
              : result?.trackingValid && result.calibrated
                ? cue || 'Complete the movement and return to your starting position.'
                : result?.guidance || exercise.calibrate}
        </span>
      </div>
      <div className="workout-grid">
        <div>
          <div className="camera-shell">
            <CameraView
              onDemo={() => start('demo')}
              voiceCoach={voiceCoach}
              videoFile={session?.source === 'upload' ? videoFile : null}
              onFinish={() => void end()}
            />
            <div className="mobile-rep-overlay" aria-hidden="true">
              <strong>{currentSetReps}</strong>
              <span>set reps</span>
            </div>
            {rest && (
              <div
                className="camera-message rest-overlay"
                role="dialog"
                aria-modal="false"
                aria-labelledby="rest-title"
              >
                <Timer size={30} />
                <span className="eyebrow">SET {rest.completed_set} COMPLETE</span>
                <h3 id="rest-title">Rest, then go again.</h3>
                <strong className="rest-countdown" role="timer" aria-label={`${restRemaining} seconds left`}>
                  {restRemaining}
                </strong>
                <span className="sr-only" aria-live="polite">
                  {COUNTDOWN_CALLOUTS.has(restRemaining) ? `${restRemaining} seconds remaining` : ''}
                </span>
                <p>Set {rest.completed_set + 1} is next. Breathe and reset your position.</p>
                <div className="button-row">
                  <Button onClick={skipRest}>
                    <SkipForward size={16} /> Skip rest
                  </Button>
                  <Button variant="secondary" onClick={() => void end()} disabled={saving}>
                    <Square size={13} fill="currentColor" />{' '}
                    {session?.source === 'demo' ? 'Exit demo' : 'End session'}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="workout-controls">
            <Button
              variant="secondary"
              onClick={pause}
              disabled={saving || Boolean(rest) || session?.status === 'completed'}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />} {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              variant="secondary"
              onClick={finishSet}
              disabled={
                saving || paused || Boolean(rest) || currentSetReps === 0 || session?.status === 'completed'
              }
            >
              <Timer size={16} /> Finish set · rest {restPreset}s
            </Button>
            <Button variant="ghost" onClick={enableVoice} aria-pressed={voice}>
              {voice ? <Volume2 size={17} /> : <VolumeX size={17} />} Voice {voice ? 'on' : 'off'}
            </Button>
            <Button
              className="end-button"
              onClick={() => void end()}
              disabled={saving || session?.status === 'completed'}
            >
              <Square size={14} fill="currentColor" />{' '}
              {session?.source === 'demo' ? 'Exit demo' : saving ? 'Saving session…' : 'End session'}
            </Button>
          </div>
          <div className="voice-check" role="status">
            <span>{voiceStatus}</span>
            <Button
              size="small"
              variant="ghost"
              disabled={paused}
              onClick={() => {
                voiceCoach.stop();
                voiceCoach.unlock();
                if (!voice) toggleVoice();
                void voiceCoach.speak("Voice coach is ready. Let's get moving.", identity.authenticated, {
                  priority: PRIORITY.transition,
                });
                void voiceCoach.warmPhrases(selectedExerciseWarmPhrases(selected), identity.authenticated);
              }}
            >
              Test voice
            </Button>
          </div>
        </div>
        <aside className="live-sidebar">
          <section className="panel rep-panel">
            <span className="eyebrow">REPS THIS SET</span>
            <strong className="rep-number" data-testid="rep-count">
              {currentSetReps}
            </strong>
            <span className="rep-label">
              {trackedReps} {trackedReps === 1 ? 'total rep' : 'total reps'}
            </span>
            <span className="set-progress">
              {rest
                ? `Rest after set ${rest.completed_set}`
                                  : autoSets
                    ? `Set ${(session?.set_ranges?.length ?? 0) + 1} · ${currentSetReps} of ${targetReps} reps`
                    : `Set ${(session?.set_ranges?.length ?? 0) + 1} · ${currentSetReps} ${currentSetReps === 1 ? 'rep' : 'reps'}`}
            </span>
            {selected === 'curl' && (
              <div className="arm-tracking">
                {[0, 1].map((side) => {
                  const arm = result?.arms?.find((a) => a.side === side);
                  const count =
                    session?.reps.filter(
                      (r) => r.metrics_json.arm_side === side || r.metrics_json.arm_side === 2,
                    ).length ?? 0;
                  return (
                    <div key={side}>
                      <span>{side === 0 ? 'Left arm' : 'Right arm'}</span>
                      <strong>
                        {count} {count === 1 ? 'rep' : 'reps'}
                      </strong>
                      <small>
                        {rest
                          ? 'Resting'
                          : paused
                            ? 'Paused'
                            : !arm?.trackingValid
                              ? 'Not in view'
                              : !arm.calibrated
                                ? 'Straighten to start'
                                : arm.phase === 'ready'
                                  ? 'Ready'
                                  : arm.phase === 'eccentric'
                                    ? 'Lifting'
                                    : 'Lowering'}
                      </small>
                      <small>{arm?.trackingValid && arm.angle !== undefined ? `${arm.angle}°` : '—'}</small>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="phase-label">
              <span />
              {rest
                ? 'Resting between sets'
                : paused
                  ? 'Paused'
                  : !result?.trackingValid
                    ? 'Finding your position'
                    : !result.calibrated
                      ? 'Calibrating'
                      : result.phase === 'ready'
                        ? 'Ready for your next rep'
                        : result.phase === 'eccentric'
                          ? selected === 'curl'
                            ? 'Lifting'
                            : 'Lowering'
                          : selected === 'curl'
                            ? 'Lowering'
                            : selected === 'press'
                              ? 'Pressing'
                              : 'Returning'}
            </div>
          </section>
          <section className="coach-panel">
            <span className="eyebrow">
              <Volume2 size={14} /> YOUR COACH
            </span>
            <h3>
              {rest
                ? 'Recover, then go again.'
                : paused
                  ? 'Take a breath.'
                  : !result?.trackingValid || !result.calibrated
                    ? 'Get into frame.'
                    : cue
                      ? 'One small fix.'
                      : trackedReps > 0
                        ? `${trackedReps} ${trackedReps === 1 ? 'rep' : 'reps'} tracked`
                        : 'Tracking your form.'}
            </h3>
            <p>
              {rest
                ? `${restRemaining} seconds until set ${rest.completed_set + 1}.`
                : paused
                  ? 'Resume when you’re ready and settle back into the starting position.'
                  : result?.trackingValid && result.calibrated && cue
                    ? cue
                    : result?.guidance || 'Keep your full movement in view and turn slightly to the side.'}
            </p>
            <span className="coach-footer">
              {voice ? 'Voice coaching is on' : 'Visual coaching · voice is off'}
            </span>
          </section>
          <details className="workout-details">
            <summary>Movement details</summary>
            <MuscleDiagram exercise={selected} result={result} paused={paused || Boolean(rest)} />
            <section className="panel metrics-panel">
              <span className="eyebrow">LIVE MEASUREMENTS</span>
              {Object.entries(result?.jointAngles || {}).map(([key, value]) => (
                <div className="measurement" key={key}>
                  <span>{formatMetricName(key)}</span>
                  <strong>{formatMetricValue(value)}</strong>
                </div>
              ))}
              {!Object.keys(result?.jointAngles || {}).length && (
                <p className="small-muted">Joint angles appear when tracking is ready.</p>
              )}
              <div className="tracking-status">
                {result?.trackingValid ? <Check size={14} /> : <ScanLine size={14} />}{' '}
                {trackingStatusText(Boolean(result?.trackingValid))}
              </div>
            </section>
          </details>
        </aside>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
          {unsaved && (
            <Button onClick={() => exportSession(unsaved)}>
              <Download size={16} /> Download session
            </Button>
          )}
        </div>
      )}
      <p className="disclaimer">
        <Info size={14} /> Technique cues are approximate, not medical assessments.{' '}
        {session?.source === 'demo' && 'This is sample footage, not your workout.'} Video stays
        on your device.
      </p>
    </div>
  );
}
