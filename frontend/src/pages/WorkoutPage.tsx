import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { ExerciseArt } from '../components/ExerciseArt';
import { CameraView } from '../features/camera/CameraView';
import { VoiceCoach } from '../features/coaching/VoiceCoach';
import { MuscleDiagram } from '../components/MuscleDiagram';
import { useWorkout } from '../features/workout/workoutStore';
import { exercises } from '../features/exercises/ExerciseRegistry';
import { useIdentity } from '../features/auth/AuthProvider';
import { exportSession, saveLocal, timeLabel } from '../lib/sessionBuffer';
import { api } from '../lib/api';
import type { ExerciseId, WorkoutSession } from '../types/workout';
export function WorkoutPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const identity = useIdentity();
  const { selected, select, session, begin, result, paused, pause, voice, toggleVoice, finish } =
    useWorkout();
  const [active, setActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [unsaved, setUnsaved] = useState<WorkoutSession | null>(null);
  const [cue, setCue] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('Tap Voice on to hear coaching.');
  const [voiceCoach] = useState(() => new VoiceCoach(setVoiceStatus));
  function enableVoice() {
    voiceCoach.stop();
    toggleVoice();
    if (!voice) void voiceCoach.speak("Voice coach is ready. Let's get moving.", false);
    else setVoiceStatus('Voice is off.');
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
  function start(source: 'camera' | 'demo') {
    setError('');
    setElapsed(0);
    setCue('');
    begin(source);
    setActive(true);
  }
  async function end() {
    const completed = finish();
    setSaving(true);
    setError('');
    setUnsaved(completed);
    try {
      saveLocal(completed, identity.owner);
    } catch {
      setError('Browser storage is full or unavailable. Download this session before leaving.');
      setSaving(false);
      return;
    }
    if (identity.authenticated) {
      try {
        const remote = await api.save(completed);
        saveLocal({ ...remote, local: false }, identity.owner);
      } catch {
        /* The report exposes the local backup and a retry action. */
      }
    }
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
                    Let the tracker find your joints. Extend your {exercise.category === 'LOWER BODY' ? 'legs' : 'arms'}{' '}
                    briefly to calibrate.
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
            <Button
              className="full-width"
              onClick={() => start(search.get('mode') === 'demo' ? 'demo' : 'camera')}
            >
              {search.get('mode') === 'demo' ? <Play size={18} /> : <Camera size={18} />}{' '}
              {search.get('mode') === 'demo' ? 'Start landmark demo' : 'Enable camera & start'}
              <ArrowRight size={17} />
            </Button>
            <Button variant="ghost" className="full-width" onClick={() => start('demo')}>
              No camera? Try the landmark demo
            </Button>
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
            {session?.source === 'demo' ? 'SYNTHETIC LANDMARK DEMO' : 'YOUR TRAINING STUDIO'}
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
          <CameraView onDemo={() => start('demo')} voiceCoach={voiceCoach} />
          <div className="workout-controls">
            <Button variant="secondary" onClick={pause} disabled={saving || session?.status === 'completed'}>
              {paused ? <Play size={16} /> : <Pause size={16} />} {paused ? 'Resume' : 'Pause'}
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
                void voiceCoach.speak("Voice coach is ready. Let's get moving.", identity.authenticated);
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
                        {paused
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
              {paused
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
              {paused
                ? 'Take a breath.'
                : !result?.trackingValid || !result.calibrated
                  ? 'Get into frame.'
                  : cue
                    ? 'One small fix.'
                    : 'You’ve got this.'}
            </h3>
            <p>
              {paused
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
          <MuscleDiagram exercise={selected} result={result} paused={paused} />
          <section className="panel metrics-panel">
            <span className="eyebrow">LIVE MEASUREMENTS</span>
            {Object.entries(result?.jointAngles || {}).map(([key, value]) => (
              <div className="measurement" key={key}>
                <span>{key.replaceAll('_', ' ')}</span>
                <strong>{value}°</strong>
              </div>
            ))}
            {!Object.keys(result?.jointAngles || {}).length && (
              <p className="small-muted">Joint angles appear when tracking is ready.</p>
            )}
            <div className="tracking-status">
              {result?.trackingValid ? <Check size={14} /> : <ScanLine size={14} />}{' '}
              {result?.trackingValid ? 'Required landmarks visible' : 'Waiting for clear landmarks'}
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
