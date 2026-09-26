import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Play,
  ShieldCheck,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { ExerciseArt } from '../../components/ExerciseArt';
import { CameraView, type CameraReadiness } from '../camera/CameraView';
import { VoiceCoach } from '../coaching/VoiceCoach';
import { exercises } from '../exercises/ExerciseRegistry';
import { useWorkout } from './workoutStore';
import type { ExerciseId } from '../../types/workout';

const AUTO_START_MS = 3000;

function PlanStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <span className="plan-stepper">
      <span>{label}</span>
      <span className="stepper-controls">
        <button
          type="button"
          aria-label={`Fewer ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <strong aria-live="polite">{value}</strong>
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </span>
    </span>
  );
}

export function WorkoutSetup({
  demo,
  voiceCoach,
  onVoice,
  onStart,
}: {
  demo: boolean;
  voiceCoach: VoiceCoach;
  onVoice: () => void;
  onStart: (source: 'camera' | 'demo' | 'upload', file?: File) => void;
}) {
  const {
    selected,
    select,
    voice,
    restPreset,
    setRestPreset,
    targetReps,
    setTargetReps,
    circuit,
    toggleCircuitExercise,
    removeFromCircuit,
    clearCircuit,
    setExercisePlan,
    planFor,
    setsDone,
    isExerciseDone,
    nextCircuitExercise,
  } = useWorkout();
  const [preview, setPreview] = useState(false);
  const [multiSelect, setMultiSelect] = useState(false);
  const [error, setError] = useState('');
  const [readiness, setReadiness] = useState<CameraReadiness>({
    cameraReady: false,
    trackingValid: false,
    calibrated: false,
    guidance: '',
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const autoStartTimer = useRef<number | undefined>(undefined);
  const startRef = useRef(onStart);
  startRef.current = onStart;
  useEffect(() => {
    if (preview) {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [preview]);
  const exercise = exercises[selected];
  const ready = readiness.cameraReady && readiness.trackingValid && readiness.calibrated;
  const step = preview ? (ready ? 3 : 2) : 1;
  const [autoStartRemaining, setAutoStartRemaining] = useState(0);

  useEffect(() => {
    if (!preview || !ready) {
      if (autoStartTimer.current !== undefined) window.clearInterval(autoStartTimer.current);
      autoStartTimer.current = undefined;
      setAutoStartRemaining(0);
      return;
    }
    const deadline = Date.now() + AUTO_START_MS;
    const update = () => {
      const remaining = Math.max(0, deadline - Date.now());
      setAutoStartRemaining(Math.ceil(remaining / 1000));
      if (remaining > 0) return;
      if (autoStartTimer.current !== undefined) window.clearInterval(autoStartTimer.current);
      autoStartTimer.current = undefined;
      startRef.current('camera');
    };
    update();
    autoStartTimer.current = window.setInterval(update, 100);
    return () => {
      if (autoStartTimer.current !== undefined) window.clearInterval(autoStartTimer.current);
      autoStartTimer.current = undefined;
    };
  }, [preview, ready]);

  return (
    <div className="page workout-setup-page">
      <Link className="back-link" to="/">
        <ArrowLeft size={16} /> Back to overview
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WORKOUT</span>
          <h1 ref={heading} tabIndex={-1}>
            {preview ? 'Find your position.' : 'What are we training today?'}
          </h1>
          <p>
            {preview
              ? 'Check your framing before you start. Preview movements are not recorded.'
              : 'Choose an exercise. We’ll help you get into position and count your reps.'}
          </p>
        </div>
        <span className="tag green">
          <ShieldCheck size={15} /> Video stays on your device
        </span>
      </div>

      <ol className="workout-stepper" aria-label="Workout setup progress">
        {['Choose exercise', 'Set up camera', 'Start workout'].map((label, index) => (
          <li
            key={label}
            className={index + 1 <= step ? 'is-current' : ''}
            aria-current={index + 1 === step ? 'step' : undefined}
          >
            <span>{index + 1 < step ? <Check size={16} /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <div className="guided-setup-grid">
        <section
          className="panel exercise-picker"
          aria-label={preview ? 'Camera preview' : 'Choose exercise'}
        >
          {preview ? (
            <>
              <div className="section-heading">
                <h2>{exercise.name}</h2>
                <Button variant="ghost" size="small" onClick={() => setPreview(false)}>
                  <ArrowLeft size={16} /> Change exercise
                </Button>
              </div>
              <CameraView
                preview
                voiceCoach={voiceCoach}
                onDemo={() => onStart('demo')}
                onReadiness={setReadiness}
              />
              <p className="preview-note" aria-live="polite">
                {autoStartRemaining > 0
                  ? `Starting automatically in ${autoStartRemaining}… Move out of frame to cancel.`
                  : 'Your workout starts automatically when your position is ready.'}
              </p>
            </>
          ) : (
            <>
              <div className="section-heading">
                <h2>{multiSelect ? 'Build your circuit' : 'Choose your exercise'}</h2>
                <Button
                  variant={multiSelect ? 'secondary' : 'ghost'}
                  size="small"
                  onClick={() => setMultiSelect((value) => !value)}
                >
                  {multiSelect ? 'Done' : 'Select multiple'}
                </Button>
              </div>
              {multiSelect && (
                <p className="small-muted">
                  Tap exercises to add them to your circuit, in the order you want to train them.
                </p>
              )}
              <div className="workout-exercise-options" role="group" aria-label="Exercise">
                {(Object.keys(exercises) as ExerciseId[]).map((id) => {
                  const inCircuit = circuit.includes(id);
                  const order = circuit.indexOf(id) + 1;
                  const pressed = multiSelect ? inCircuit : id === selected;
                  return (
                    <button
                      key={id}
                      aria-label={exercises[id].name}
                      aria-pressed={pressed}
                      className={pressed ? 'is-selected' : ''}
                      onClick={() => (multiSelect ? toggleCircuitExercise(id) : select(id))}
                    >
                      <span>
                        <strong>{exercises[id].name}</strong>
                        <small>{exercises[id].muscles}</small>
                      </span>
                      <span className="exercise-choice-mark" aria-hidden="true">
                        {multiSelect ? (
                          inCircuit ? (
                            <strong className="circuit-order-badge">{order}</strong>
                          ) : null
                        ) : (
                          id === selected && <Check size={16} />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              {circuit.length > 0 && (
                <div className="circuit-panel" aria-label="Your circuit">
                  <div className="section-heading">
                    <h2>Your circuit</h2>
                    <Button variant="ghost" size="small" onClick={clearCircuit}>
                      Clear
                    </Button>
                  </div>
                  <ol className="circuit-list">
                    {circuit.map((id, index) => {
                      const plan = planFor(id);
                      const done = setsDone(id);
                      const complete = isExerciseDone(id);
                      return (
                        <li key={id} className={complete ? 'is-done' : ''}>
                          <span className="circuit-order" aria-hidden="true">
                            {complete ? <Check size={14} /> : index + 1}
                          </span>
                          <div className="circuit-exercise">
                            <strong>{exercises[id].name}</strong>
                            <small>
                              {done} of {plan.targetSets} sets done
                            </small>
                          </div>
                          <PlanStepper
                            label="Sets"
                            value={plan.targetSets}
                            min={1}
                            max={10}
                            onChange={(targetSets) => setExercisePlan(id, { ...plan, targetSets })}
                          />
                          <PlanStepper
                            label="Reps"
                            value={plan.targetReps}
                            min={1}
                            max={50}
                            onChange={(targetReps) => setExercisePlan(id, { ...plan, targetReps })}
                          />
                          <button
                            type="button"
                            className="circuit-remove"
                            aria-label={`Remove ${exercises[id].name} from circuit`}
                            onClick={() => removeFromCircuit(id)}
                          >
                            <X size={16} />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <Button
                    className="full-width setup-primary"
                    onClick={() => {
                      const next = nextCircuitExercise() ?? circuit[0];
                      if (next !== selected) select(next);
                      setPreview(true);
                    }}
                  >
                    <Play size={18} /> Start circuit · {circuit.length}{' '}
                    {circuit.length === 1 ? 'exercise' : 'exercises'}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        <aside className="panel workout-ready-panel">
          <div className={`position-guide ${exercise.color}`}>
            <ExerciseArt exercise={selected} />
            <span>{selected === 'curl' ? 'Face the camera' : 'Side view'}</span>
          </div>
          <span className="eyebrow">{preview ? 'POSITION CHECK' : 'YOUR NEXT STEP'}</span>
          <h2>{preview ? 'Get ready to move' : exercise.name}</h2>
          <p>{exercise.setup}</p>
          {preview ? (
            <>
              <ul className="readiness-list" aria-label="Camera readiness">
                {[
                  { label: 'Camera and tracker ready', complete: readiness.cameraReady },
                  { label: 'Required joints visible', complete: readiness.trackingValid },
                  { label: 'Starting position calibrated', complete: ready },
                ].map(({ label, complete }) => (
                  <li key={label} className={complete ? 'is-ready' : ''}>
                    <span aria-hidden="true">{complete ? <Check size={14} /> : '•'}</span>
                    {label}
                    <span className="sr-only">{complete ? ': ready' : ': waiting'}</span>
                  </li>
                ))}
              </ul>
              <p className={`setup-guidance ${ready ? 'is-ready' : ''}`} role="status">
                {ready
                  ? 'You’re in position. Start when you’re ready.'
                  : readiness.guidance || `${exercise.calibrate} and hold still for a moment.`}
              </p>
            </>
          ) : (
            <p className="position-tip">
              <strong>To calibrate:</strong> {exercise.calibrate} and hold still for a moment.
            </p>
          )}

          <div className="workout-preferences">
            <div className="setup-voice">
              <div>
                <strong>Voice coaching</strong>
                <span>Optional spoken counts and cues</span>
              </div>
              <Button size="small" variant="secondary" aria-pressed={voice} onClick={onVoice}>
                {voice ? <Volume2 size={16} /> : <VolumeX size={16} />}
                {voice ? 'Voice on' : 'Enable voice'}
              </Button>
            </div>
            <label className="rest-select">
              Reps per set
              {circuit.length > 0 ? (
                <span className="small-muted">Set per exercise in your circuit above.</span>
              ) : (
                <select value={targetReps} onChange={(event) => setTargetReps(Number(event.target.value))}>
                  <option value={0}>I’ll finish sets myself</option>
                  {[5, 6, 8, 10, 12, 15, 20].map((n) => (
                    <option key={n} value={n}>
                      {n} reps
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="rest-select">
              Rest between sets
              <select
                value={restPreset}
                onChange={(event) => setRestPreset(Number(event.target.value) as 30 | 60 | 90)}
              >
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds</option>
                <option value={90}>90 seconds</option>
              </select>
            </label>
          </div>

          {preview ? (
            <Button className="full-width setup-primary" disabled={!ready} onClick={() => onStart('camera')}>
              <Play size={18} /> {autoStartRemaining > 0 ? `Start now (${autoStartRemaining})` : 'Start workout'}
            </Button>
          ) : demo ? (
            <>
              <div className="demo-setup-note">Demo mode uses sample footage. You won’t need a camera.</div>
              <Button className="full-width setup-primary" onClick={() => onStart('demo')}>
                <Play size={18} /> Start video demo
              </Button>
              <Button variant="ghost" className="full-width" onClick={() => setPreview(true)}>
                <Camera size={17} /> Use my camera instead
              </Button>
            </>
          ) : (
            <Button
              className="full-width setup-primary"
              onClick={() => {
                if (circuit.length > 0) {
                  const next = nextCircuitExercise() ?? circuit[0];
                  if (next !== selected) select(next);
                }
                setPreview(true);
              }}
            >
              <Camera size={18} /> Set up camera <ArrowRight size={17} />
            </Button>
          )}
          <details className="workout-alternatives">
            <summary>Other ways to try a workout</summary>
            <Button variant="secondary" className="full-width" onClick={() => onStart('demo')}>
              <Play size={16} /> Try video demo
            </Button>
            <Button variant="secondary" className="full-width" onClick={() => fileInput.current?.click()}>
              <Upload size={16} /> Analyze a video
            </Button>
            <p>Choose a video up to 500 MB. It stays on your device.</p>
            <input
              ref={fileInput}
              type="file"
              accept="video/*"
              hidden
              aria-label="Choose workout video"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                if (file.size > 500 * 1024 * 1024) {
                  setError('That video is over 500 MB. Trim it to your set and try again.');
                  return;
                }
                onStart('upload', file);
              }}
            />
            {error && <p role="alert">{error}</p>}
          </details>
        </aside>
      </div>
    </div>
  );
}
