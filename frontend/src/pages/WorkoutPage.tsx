import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  ScanLine,
  Info,
  Download,
  Upload,
  SkipForward,
  Timer,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { ExerciseArt } from '../components/ExerciseArt';
import { CameraView } from '../features/camera/CameraView';
import { VoiceCoach } from '../features/coaching/VoiceCoach';
import { PRIORITY, selectedExerciseWarmPhrases } from '../features/coaching/Phrasebook';
import { summarizeSession, summarizeSet } from '../features/coaching/sessionSummary';
import { MuscleDiagram } from '../components/MuscleDiagram';
import { useWorkout } from '../features/workout/workoutStore';
import { exercises } from '../features/exercises/ExerciseRegistry';
import { useIdentity } from '../features/auth/AuthProvider';
import { exportSession, saveLocal, timeLabel } from '../lib/sessionBuffer';
import { formatMetricName, formatMetricValue, trackingStatusText } from '../features/camera/measurementDisplay';
import { api } from '../lib/api';
import type { ExerciseId, WorkoutSession } from '../types/workout';

const COUNTDOWN_CALLOUTS = new Set([10, 5, 4, 3, 2, 1]);

export function WorkoutPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const identity = useIdentity();
  const {
    selected,
    select,
    session,
    begin,
    result,
    paused,
    pause,
    voice,
    toggleVoice,
    restPreset,
    rest,
    currentSetStartRep,
    setRestPreset,
    startRest,
    completeRest,
    finish,
  } = useWorkout();
  const [active, setActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [unsaved, setUnsaved] = useState<WorkoutSession | null>(null);
  const [cue, setCue] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [voiceStatus, setVoiceStatus] = useState('Tap Voice on to hear coaching.');
  const [restRemaining, setRestRemaining] = useState(0);
  const announcedCountdown = useRef(new Set<number>());
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [voiceCoach] = useState(() => new VoiceCoach(setVoiceStatus));
  const currentSetReps = Math.max(0, (session?.total_reps ?? 0) - currentSetStartRep + 1);
  const trackedReps = session?.total_reps ?? 0;
  const measurements = Object.entries(result?.jointAngles || {});

  function enableVoice() {
    voiceCoach.stop();
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
    if (!active || session?.status !== 'active') return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active, session?.status]);
  useEffect(() => {
    if (!result?.faults.length) return;
    setCue(result.faults[0].message);
    const timer = setTimeout(() => setCue(''), 4000);
    return () => clearTimeout(timer);
  }, [result?.faults[0]?.code]);
  function start(source: 'camera' | 'demo' | 'upload') {
    setError('');
    setElapsed(0);
    setCue('');
    begin(source);
    setActive(true);
  }
  async function end() {
    if (saving) return;
    setSaving(true);
    setError('');
    voiceCoach.stop();
    const completed = finish();
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
    navigate(`/session/${completed.id}`);
  }
  const exercise = exercises[selected];
  if (!active)
    return (
      <div className="page">
        <Link className="back-link" to="/">
          <ArrowLeft size={16} /> Back to overview
        </Link>
        <div className="page-heading">
          <div>
            <span className="eyebrow">YOUR TRAINING STUDIO</span>
            <h1>A little space. A fresh start.</h1>
            <p>Choose your movement and get comfortably in frame.</p>
          </div>
        </div>
        <div className="setup-grid">
          <section className="panel setup-panel">
            <div className="exercise-tabs">
              {(Object.keys(exercises) as ExerciseId[]).map((id) => (
                <button key={id} className={id === selected ? 'active' : ''} onClick={() => select(id)}>
                  {exercises[id].name}
                </button>
              ))}
            </div>
            <div className={`setup-art ${exercise.color}`}>
              <ExerciseArt exercise={selected} large />
            </div>
            <span className="eyebrow">{exercise.category}</span>
            <h2>{exercise.name}</h2>
            <p>{exercise.setup}</p>
          </section>
          <section className="panel ready-panel">
            <span className="tag green">
              <ScanLine size={14} /> ON-DEVICE TRACKING
            </span>
            <h2>
              Set yourself up
              <br />
              for a good session.
            </h2>
            <ol className="setup-steps">
              <li>
                <span>01</span>
                <div>
                  <h3>{selected === 'curl' ? 'Keep both arms in view' : 'Find your side view'}</h3>
                  <p>Place your camera at a steady angle with good lighting and room to move.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Hold your starting position</h3>
                  <p>
                    Let the tracker find your joints. {exercise.calibrate} briefly to calibrate.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Make it your pace</h3>
                  <p>
                    Complete each movement and return to the start. We’ll count full cycles and offer
                    supported cues.
                  </p>
                </div>
              </li>
            </ol>
            <div className="coach-preferences">
              <fieldset className="rest-presets">
                <legend>Rest timer</legend>
                <div role="group" aria-label="Rest duration">
                  {([30, 60, 90] as const).map((seconds) => (
                    <Button
                      key={seconds}
                      size="small"
                      variant={restPreset === seconds ? 'secondary' : 'ghost'}
                      aria-pressed={restPreset === seconds}
                      onClick={() => setRestPreset(seconds)}
                    >
                      {seconds}s
                    </Button>
                  ))}
                </div>
              </fieldset>
              <div className="setup-voice">
                <div>
                  <strong>Real-time voice coach</strong>
                  <span>
                    {voice ? 'Ready for counts, cues, and summaries' : 'Enable once before you start'}
                  </span>
                </div>
                <Button
                  size="small"
                  variant={voice ? 'secondary' : 'ghost'}
                  aria-pressed={voice}
                  onClick={enableVoice}
                >
                  {voice ? <Volume2 size={15} /> : <VolumeX size={15} />}
                  {voice ? 'Voice on' : 'Enable voice'}
                </Button>
              </div>
            </div>
            <Button
              className="full-width"
              onClick={() => start(search.get('mode') === 'demo' ? 'demo' : 'camera')}
            >
              {search.get('mode') === 'demo' ? <Play size={18} /> : <Camera size={18} />}{' '}
              {search.get('mode') === 'demo' ? 'Start landmark demo' : 'Enable camera & start'}
              <ArrowRight size={17} />
            </Button>
            <Button
              className="full-width"
              variant="secondary"
              onClick={() => uploadInputRef.current?.click()}
            >
              <Upload size={18} /> Upload a workout video
            </Button>
            <input
              ref={uploadInputRef}
              type="file"
              accept="video/*"
              hidden
              aria-label="Choose a workout video to analyze"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                if (file.size > 500 * 1024 * 1024) {
                  setError('That video is over 500 MB. Trim it to just your set and try again.');
                  return;
                }
                setVideoFile(file);
                start('upload');
              }}
            />
            <p className="disclaimer">Analyzed on your device — the video never leaves this browser.</p>
            {error && !active && (
              <p className="disclaimer" role="alert">
                {error}
              </p>
            )}
            {search.get('mode') !== 'demo' && (
              <Button variant="ghost" className="full-width" onClick={() => start('demo')}>
                No camera? Try the landmark demo
              </Button>
            )}
            <p className="disclaimer">
              <Info size={15} /> Cues are approximate and depend on camera position. Move within your
              comfortable range.
            </p>
          </section>
        </div>
      </div>
    );
  return (
    <div className="page workout-page">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">
            {session?.source === 'demo'
              ? 'SYNTHETIC LANDMARK DEMO'
              : session?.source === 'upload'
                ? 'VIDEO ANALYSIS'
                : 'YOUR TRAINING STUDIO'}
          </span>
          <h1>
            {exercise.name} <span className="light-heading">/ in focus</span>
          </h1>
        </div>
        <div className="session-clock">
          <span className={paused ? '' : 'live-dot'} />
          {timeLabel(elapsed)}
        </div>
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
                    <Square size={13} fill="currentColor" /> End session
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
              <Square size={14} fill="currentColor" /> {saving ? 'Saving session…' : 'End session'}
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
            <span className="eyebrow">EVERY REP COUNTS</span>
            <strong className="rep-number" data-testid="rep-count">
              {session?.total_reps || 0}
            </strong>
            <span className="rep-label">{selected === 'curl' ? 'completed arm reps' : 'completed reps'}</span>
            <span className="set-progress">
              {rest
                ? `Rest after set ${rest.completed_set}`
                : `Set ${(session?.set_ranges?.length ?? 0) + 1} · ${currentSetReps} ${currentSetReps === 1 ? 'rep' : 'reps'}`}
            </span>
            {selected === 'curl' && (
              <div className="arm-tracking">
                {[0, 1].map((side) => {
                  const arm = result?.arms?.find((a) => a.side === side);
                  const count = session?.reps.filter((r) => r.metrics_json.arm_side === side).length ?? 0;
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
              {voice
                ? identity.authenticated
                  ? 'Cloud voice with browser fallback'
                  : 'Browser voice enabled'
                : 'Visual coaching · voice is off'}
            </span>
          </section>
          <MuscleDiagram exercise={selected} result={result} paused={paused || Boolean(rest)} />
          <section className="panel metrics-panel">
            <span className="eyebrow">LIVE MEASUREMENTS</span>
            {measurements.map(([key, value]) => (
              <div className="measurement" key={key}>
                <span>{formatMetricName(key)}</span>
                <strong>{formatMetricValue(value)}</strong>
              </div>
            ))}
            {!measurements.length && (
              <p className="small-muted">Joint angles appear when tracking is ready.</p>
            )}
            <div className="tracking-status">
              {result?.trackingValid ? <Check size={14} /> : <ScanLine size={14} />}{' '}
              {trackingStatusText(Boolean(result?.trackingValid))}
            </div>
          </section>
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
        {session?.source === 'demo' && 'This is synthetic movement data, not a measured workout.'} Video stays
        on your device.
      </p>
    </div>
  );
}
