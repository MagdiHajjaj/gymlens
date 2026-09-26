import { create } from 'zustand';
import type {
  ExerciseId,
  ExercisePlan,
  ExerciseResult,
  WorkoutSession,
  WorkoutSetRange,
} from '../../types/workout';

type RestPreset = 30 | 60 | 90;
interface WorkoutRest {
  completed_set: number;
  ends_at_ms: number;
}

// Fallback plan for a circuit exercise that has no explicit plan yet:
// 3 sets, using the global per-set rep target.
export const DEFAULT_CIRCUIT_SETS = 3;
export function resolveExercisePlan(
  plans: Partial<Record<ExerciseId, ExercisePlan>>,
  fallbackReps: number,
  id: ExerciseId,
): ExercisePlan {
  return plans[id] ?? { targetSets: DEFAULT_CIRCUIT_SETS, targetReps: fallbackReps };
}

interface Store {
  selected: ExerciseId;
  session: WorkoutSession | null;
  result: ExerciseResult | null;
  paused: boolean;
  voice: boolean;
  restPreset: RestPreset;
  targetReps: number;
  rest: WorkoutRest | null;
  currentSetStartRep: number;
  /** Ordered exercises in the active circuit. Empty means single-exercise mode. */
  circuit: ExerciseId[];
  /** Per-exercise sets × reps targets for the circuit. */
  exercisePlans: Partial<Record<ExerciseId, ExercisePlan>>;
  /** Completed sets per exercise, keyed by exercise. */
  circuitSets: Partial<Record<ExerciseId, number>>;
  select: (id: ExerciseId) => void;
  begin: (source: 'camera' | 'demo' | 'upload') => void;
  ingest: (result: ExerciseResult, timestamp: number) => void;
  pause: () => void;
  toggleVoice: () => void;
  setRestPreset: (preset: RestPreset) => void;
  setTargetReps: (reps: number) => void;
  startRest: (now?: number) => WorkoutSetRange | null;
  completeRest: () => void;
  cancelRest: () => void;
  finish: () => WorkoutSession;
  /** Toggle an exercise in/out of the circuit, preserving order. */
  toggleCircuitExercise: (id: ExerciseId) => void;
  /** Replace the whole circuit; resets per-exercise progress and selects the first exercise. */
  setCircuit: (ids: ExerciseId[]) => void;
  addToCircuit: (id: ExerciseId) => void;
  removeFromCircuit: (id: ExerciseId) => void;
  clearCircuit: () => void;
  /** Set the sets × reps target for one exercise. Values are clamped to >= 1. */
  setExercisePlan: (id: ExerciseId, plan: ExercisePlan) => void;
  /** Effective plan for an exercise (explicit plan or the 3-sets × global-reps default). */
  planFor: (id: ExerciseId) => ExercisePlan;
  /** Completed sets for an exercise in the current circuit. */
  setsDone: (id: ExerciseId) => number;
  isExerciseDone: (id: ExerciseId) => boolean;
  /** First circuit exercise whose sets are not all complete, or null. */
  nextCircuitExercise: () => ExerciseId | null;
}
let lastMetric = 0;

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
  session: null,
  result: null,
  paused: false,
  voice: false,
  restPreset: 30,
  targetReps: 8,
  rest: null,
  currentSetStartRep: 1,
  circuit: [],
  exercisePlans: {},
  circuitSets: {},
  select: (selected) => set({ selected }),
  begin: (source) => {
    lastMetric = 0;
    set({
      session: {
        id: crypto.randomUUID(),
        exercise: get().selected,
        source,
        started_at: new Date().toISOString(),
        total_reps: 0,
        status: 'active',
        reps: [],
        metrics: [],
        local: true,
      },
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
      return { result, session: { ...session, reps, total_reps: reps.length, metrics } };
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
    set((state) => ({
      session,
      rest: { completed_set: range.set_number, ends_at_ms: now + get().restPreset * 1000 },
      currentSetStartRep: range.end_rep + 1,
      circuitSets: {
        ...state.circuitSets,
        [current.exercise]: (state.circuitSets[current.exercise] ?? 0) + 1,
      },
    }));
    return range;
  },
  completeRest: () => set({ rest: null }),
  cancelRest: () => set({ rest: null }),
  finish: () => {
    const current = get().session;
    if (!current) throw new Error('No active workout');
    const [closed, range] = closeCurrentSet(current, get().currentSetStartRep, Date.now());
    const session: WorkoutSession = { ...closed, ended_at: new Date().toISOString(), status: 'completed' };
    set((state) => ({
      session,
      paused: true,
      rest: null,
      currentSetStartRep: session.reps.length + 1,
      // A session that ends mid-exercise still banked its final set.
      circuitSets: range
        ? { ...state.circuitSets, [current.exercise]: (state.circuitSets[current.exercise] ?? 0) + 1 }
        : state.circuitSets,
    }));
    return session;
  },
  toggleCircuitExercise: (id) =>
    set((state) => ({
      circuit: state.circuit.includes(id)
        ? state.circuit.filter((item) => item !== id)
        : [...state.circuit, id],
    })),
  setCircuit: (ids) => {
    const circuit = [...new Set(ids)];
    set({
      circuit,
      circuitSets: {},
      selected: circuit[0] ?? get().selected,
    });
  },
  addToCircuit: (id) =>
    set((state) => (state.circuit.includes(id) ? {} : { circuit: [...state.circuit, id] })),
  removeFromCircuit: (id) =>
    set((state) => ({ circuit: state.circuit.filter((item) => item !== id) })),
  clearCircuit: () => set({ circuit: [], circuitSets: {} }),
  setExercisePlan: (id, plan) =>
    set((state) => ({
      exercisePlans: {
        ...state.exercisePlans,
        [id]: {
          targetSets: Math.max(1, Math.floor(plan.targetSets)),
          targetReps: Math.max(1, Math.floor(plan.targetReps)),
        },
      },
    })),
  planFor: (id) => resolveExercisePlan(get().exercisePlans, get().targetReps, id),
  setsDone: (id) => get().circuitSets[id] ?? 0,
  isExerciseDone: (id) => get().setsDone(id) >= get().planFor(id).targetSets,
  nextCircuitExercise: () => get().circuit.find((id) => !get().isExerciseDone(id)) ?? null,
}));
