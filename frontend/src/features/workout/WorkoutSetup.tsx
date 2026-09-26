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
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { ExerciseArt } from '../../components/ExerciseArt';
import { CameraView, type CameraReadiness } from '../camera/CameraView';
import { VoiceCoach } from '../coaching/VoiceCoach';
import { exercises } from '../exercises/ExerciseRegistry';
import { useWorkout } from './workoutStore';
import { usePlan } from './planStore';
import { PlanStep } from './PlanStep';
import type { ExerciseId } from '../../types/workout';

const AUTO_START_MS = 3000;

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
  const { selected, select, selectedIds, toggleExercise, voice, restPreset, setRestPreset } = useWorkout();
  const setPlan = usePlan((state) => state.setPlan);
  const [searchParams, setSearchParams] = useSearchParams();
  const plan = usePlan((state) => state.plan);
  const completedExerciseIds = usePlan((state) => state.completedExerciseIds);
  const hasPlan = plan.length > 0;
  const reviewRequested = searchParams.get('plan') === 'review';
  const [preview, setPreview] = useState(false);
  const [planning, setPlanning] = useState(() => reviewRequested && hasPlan);
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
  // After finishing, /workout?plan=review reopens the plan as an overview: rows show
  // checkmarks and the side panel previews the next incomplete exercise.
  const reviewMode = reviewRequested && hasPlan;
  const nextIncompleteId = plan.find(
    (item) => !completedExerciseIds.includes(item.exerciseId),
  )?.exerciseId;
  const focusId = reviewMode ? (nextIncompleteId ?? selected) : selected;
  const exercise = exercises[focusId];
  const doneCount = plan.filter((item) => completedExerciseIds.includes(item.exerciseId)).length;
  const allComplete = reviewMode && doneCount === plan.length;
  const ready = readiness.cameraReady && readiness.trackingValid && readiness.calibrated;
  const step = preview ? 3 : planning ? 2 : 1;
  const enterPlan = () => {
    setPlan(selectedIds);
    setPlanning(true);
  };
  const exitReview = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('plan');
    setSearchParams(next);
    setPlanning(false);
  };
  const continueReview = () => {
    if (!nextIncompleteId) return;
    select(nextIncompleteId);
    setPlanning(false);
    setPreview(true);
  };
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
            {preview
              ? 'Find your position.'
              : reviewMode
                ? 'Your plan.'
                : planning
                  ? 'Plan your session.'
                  : 'What are we training today?'}
          </h1>
          <p>
            {preview
              ? 'Check your framing before you start. Preview movements are not recorded.'
              : reviewMode
                ? allComplete
                  ? 'Every exercise is done. Nice work.'
                  : `${doneCount} of ${plan.length} complete. Keep going when you’re ready.`
                : planning
                  ? 'Set a target weight, sets and reps for each exercise.'
                  : 'Choose an exercise. We’ll help you get into position and count your reps.'}
          </p>
        </div>
        <span className="tag green">
          <ShieldCheck size={15} /> Video stays on your device
        </span>
      </div>

      <ol className="workout-stepper" aria-label="Workout setup progress">
        {['Choose exercise', 'Plan your session', 'Set up camera'].map((label, index) => (
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
          aria-label={
            preview
              ? 'Camera preview'
              : reviewMode
                ? 'Your plan'
                : planning
                  ? 'Plan your session'
                  : 'Choose exercise'
          }
        >
          {preview ? (
            <>
              <div className="section-heading">
                <h2>{exercise.name}</h2>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => {
                    setPreview(false);
                    setPlanning(false);
                  }}
                >
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
          ) : planning ? (
            reviewMode && allComplete ? (
              <div className="plan-complete">
                <span className="plan-complete-badge" aria-hidden="true">
                  <Check size={22} />
                </span>
                <h2>Plan complete</h2>
                <p>You finished every exercise in this session’s plan.</p>
                <Button variant="secondary" onClick={exitReview}>
                  Choose another exercise
                </Button>
              </div>
            ) : (
              <PlanStep
                exercises={reviewMode ? plan.map((item) => item.exerciseId) : selectedIds}
                onContinue={
                  reviewMode
                    ? continueReview
                    : () => {
                        setPlanning(false);
                        setPreview(true);
                      }
                }
                onBack={reviewMode ? exitReview : () => setPlanning(false)}
              />
            )
          ) : (
            <>
              <h2>Choose your exercise</h2>
              {selectedIds.length > 1 && (
                <p className="small-muted" role="status">
                  {selectedIds.length} picked — tap to add or remove
                </p>
              )}
              <div className="workout-exercise-options" role="group" aria-label="Exercise">
                {(Object.keys(exercises) as ExerciseId[]).map((id) => {
                  const picked = selectedIds.includes(id);
                  return (
                    <button
                      key={id}
                      aria-label={exercises[id].name}
                      aria-pressed={picked}
                      className={picked ? 'is-selected' : ''}
                      onClick={() => toggleExercise(id)}
                    >
                      <span>
                        <strong>{exercises[id].name}</strong>
                        <small>{exercises[id].muscles}</small>
                      </span>
                      <span className="exercise-choice-mark" aria-hidden="true">
                        {picked && <Check size={16} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <aside className="panel workout-ready-panel">
          <div className={`position-guide ${exercise.color}`}>
            <ExerciseArt exercise={focusId} />
            <span>{focusId === 'curl' ? 'Face the camera' : 'Side view'}</span>
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
          ) : planning ? null : demo ? (
            <>
              <div className="demo-setup-note">Demo mode uses sample footage. You won’t need a camera.</div>
              <Button className="full-width setup-primary" onClick={() => onStart('demo')}>
                <Play size={18} /> Start video demo
              </Button>
              <Button variant="ghost" className="full-width" onClick={enterPlan}>
                <Camera size={17} /> Use my camera instead
              </Button>
            </>
          ) : (
            <Button className="full-width setup-primary" onClick={enterPlan}>
              Plan your session <ArrowRight size={17} />
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
