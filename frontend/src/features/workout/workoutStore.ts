import { create } from 'zustand';
import type { ExerciseId, ExerciseResult, WorkoutSession, WorkoutSetRange } from '../../types/workout';
import type { VitalsReading } from '../vitals/vitalsClient';
import { usePlan } from './planStore';
import { exercises } from '../exercises/ExerciseRegistry';

type RestPreset = 30 | 60 | 90;
interface WorkoutRest {
  completed_set: number;
  ends_at_ms: number;
}
interface Store {
  selected: ExerciseId;
  /** Multi-selection, in the order exercises were picked. `selected` always mirrors the first entry. */
  selectedIds: ExerciseId[];
  session: WorkoutSession | null;
  result: ExerciseResult | null;
  paused: boolean;
  voice: boolean;
  restPreset: RestPreset;
  targetReps: number;
  rest: WorkoutRest | null;
  currentSetStartRep: number;
  select: (id: ExerciseId) => void;
  toggleExercise: (id: ExerciseId) => void;
  /** Points the focused exercise at the given id without changing the
   *  multi-selection. Used when the plan order (not pick order) decides
   *  which exercise starts next. */
  focusExercise: (id: ExerciseId) => void;
  begin: (source: 'camera' | 'demo' | 'upload', opts?: { preCalibrated?: boolean }) => void;
  ingest: (result: ExerciseResult, timestamp: number) => void;
  pause: () => void;
  toggleVoice: () => void;
  setRestPreset: (preset: RestPreset) => void;
  setTargetReps: (reps: number) => void;
  startRest: (now?: number) => WorkoutSetRange | null;
  completeRest: () => void;
  cancelRest: () => void;
  finish: () => WorkoutSession;
  /** Persist a confident vitals reading into the session metrics (throttled). */
  recordVitals: (reading: VitalsReading) => void;
}
let lastMetric = 0;
let lastVitalsMetric = 0;

/** Reset the vitals throttle clock. Tests only. */
export function __resetVitalsThrottleForTests() {
  lastVitalsMetric = 0;
}

const closeCurrentSet = (
  session: WorkoutSession,
  startRep: number,
  now: number,
  restSeconds?: number,
): [WorkoutSession, WorkoutSetRange | null] => {
  const endRep = session.reps.length;
  if (startRep > endRep) return [session, null];
  const existing = session.set_ranges ?? [];
  const duplicate = existing.find((range) => range.start_rep === startRep && range.end_rep === endRep);
  if (duplicate) return [session, null];
  const range: WorkoutSetRange = {
    set_number: existing.length + 1,
    start_rep: startRep,
    end_rep: endRep,
    completed_at: new Date(now).toISOString(),
    ...(restSeconds ? { rest_seconds: restSeconds } : {}),
  };
  return [{ ...session, set_ranges: [...existing, range] }, range];
};

export const useWorkout = create<Store>((set, get) => ({
  selected: 'squat',
  selectedIds: ['squat'],
  session: null,
  result: null,
  paused: false,
  voice: false,
  restPreset: 30,
  targetReps: 8,
  rest: null,
  currentSetStartRep: 1,
  select: (selected) => set({ selected, selectedIds: [selected] }),
  focusExercise: (id) => set({ selected: id }),
  toggleExercise: (id) =>
    set((state) => {
      const selectedIds = state.selectedIds.includes(id)
        ? state.selectedIds.filter((entry) => entry !== id)
        : [...state.selectedIds, id];
      // Always keep at least one exercise picked so the workout always has a target.
      if (selectedIds.length === 0) return {};
      return { selectedIds, selected: selectedIds[0] };
    }),
  begin: (source, opts) => {
    lastMetric = 0;
    const selectedId = get().selected;
    // A planned exercise brings its own rep target; otherwise the global target stands.
    const planState = usePlan.getState();
    const planItem = planState.plan.find((item) => item.exerciseId === selectedId);
    const sessionId = crypto.randomUUID();
    set({
      session: {
        id: sessionId,
        workout_id: planItem ? (planState.workoutId ?? sessionId) : sessionId,
        workout_name: planItem
          ? planState.workoutName.trim() || `${exercises[selectedId].name} workout`
          : `${exercises[selectedId].name} workout`,
        weight_kg: planItem?.weightKg ?? null,
        target_sets: planItem?.sets ?? null,
        target_reps: planItem?.reps ?? get().targetReps,
        exercise: selectedId,
        source,
        started_at: new Date().toISOString(),
        total_reps: 0,
        status: 'active',
        reps: [],
        metrics: [],
        local: true,
        preCalibrated: opts?.preCalibrated ?? false,
      },
      targetReps: planItem ? planItem.reps : get().targetReps,
      result: null,
      paused: false,
      rest: null,
      currentSetStartRep: 1,
    });
  },
  ingest: (result, timestamp) =>
    set((state) => {
      if (!state.session || state.paused || state.rest || state.session.status !== 'active') return {};
      const session = state.session;
      const completed_at = new Date().toISOString();
      const completed =
        result.completedReps ??
        (result.repCompleted ? [{ metrics: result.repMetrics || {}, faults: result.faults }] : []);
      const reps = [
        ...session.reps,
        ...completed.map((rep, index) => ({
          rep_number: session.reps.length + index + 1,
          completed_at,
          metrics_json: rep.metrics,
          faults_json: rep.faults,
        })),
      ];
      let metrics = session.metrics;
      if (
        result.trackingValid &&
        result.calibrated &&
        timestamp - lastMetric >= 1000 &&
        metrics.length < 29000
      ) {
        lastMetric = timestamp;
        metrics = [
          ...metrics,
          ...Object.entries(result.jointAngles).map(([metric_name, metric_value]) => ({
            recorded_at: completed_at,
            metric_name,
            metric_value,
          })),
        ];
      }
      return {
        result,
        session: {
          ...session,
          reps,
          total_reps: reps.length,
          metrics,
          // The workout clock starts when tracking actually begins — the
          // "find your position" calibration window doesn't count.
          tracking_started_at:
            session.tracking_started_at ??
            (result.trackingValid && result.calibrated ? completed_at : undefined),
        },
      };
    }),
  pause: () => set((s) => ({ paused: !s.paused, result: null })),
  toggleVoice: () => set((s) => ({ voice: !s.voice })),
  setRestPreset: (restPreset) => set({ restPreset }),
  setTargetReps: (targetReps) => set({ targetReps }),
  startRest: (now = Date.now()) => {
    const current = get().session;
    if (!current || current.status !== 'active') return null;
    const [session, range] = closeCurrentSet(current, get().currentSetStartRep, now, get().restPreset);
    if (!range) return null;
    set({
      session,
      rest: { completed_set: range.set_number, ends_at_ms: now + get().restPreset * 1000 },
      currentSetStartRep: range.end_rep + 1,
    });
    return range;
  },
  completeRest: () => set({ rest: null }),
  cancelRest: () => set({ rest: null }),
  recordVitals: (reading) =>
    set((state) => {
      const session = state.session;
      if (!session || session.status !== 'active') return {};
      const now = Date.now();
      // Throttle: at most one vitals sample batch per 5s.
      if (now - lastVitalsMetric < 5000) return {};
      const recorded_at = new Date().toISOString();
      const samples: { recorded_at: string; metric_name: string; metric_value: number }[] = [];
      const push = (name: string, value: number | null, confidence: number) => {
        if (value != null && confidence > 0) {
          samples.push({ recorded_at, metric_name: `vitals.${name}`, metric_value: value });
          samples.push({
            recorded_at,
            metric_name: `vitals.${name}_confidence`,
            metric_value: confidence,
          });
        }
      };
      push('pulse_bpm', reading.pulse_bpm, reading.pulse_confidence);
      push('breathing_bpm', reading.breathing_bpm, reading.breathing_confidence);
      if (!samples.length || session.metrics.length + samples.length > 29000) return {};
      lastVitalsMetric = now;
      return { session: { ...session, metrics: [...session.metrics, ...samples] } };
    }),
  finish: () => {
    const current = get().session;
    if (!current) throw new Error('No active workout');
    const [closed] = closeCurrentSet(current, get().currentSetStartRep, Date.now());
    const session: WorkoutSession = { ...closed, ended_at: new Date().toISOString(), status: 'completed' };
    set({ session, paused: true, rest: null, currentSetStartRep: session.reps.length + 1 });
    // A finished real session completes the exercise on the plan; sample-footage
    // demos are not the user's workout, so they never earn a checkmark.
    if (session.source !== 'demo' && session.total_reps > 0)
      usePlan.getState().completeExercise(session.exercise);
    return session;
  },
}));
