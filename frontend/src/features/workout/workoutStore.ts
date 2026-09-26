import { create } from 'zustand';
import type { ExerciseId, ExerciseResult, WorkoutSession, WorkoutSetRange } from '../../types/workout';
import { exercisesForMovement, type ExerciseMovement } from '../exercises/ExerciseRegistry';
import { usePlan } from './planStore';

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
  selectMovement: (movement: ExerciseMovement | null) => void;
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
  toggleExercise: (id) =>
    set((state) => {
      const selectedIds = state.selectedIds.includes(id)
        ? state.selectedIds.filter((entry) => entry !== id)
        : [...state.selectedIds, id];
      // Always keep at least one exercise picked so the workout always has a target.
      if (selectedIds.length === 0) return {};
      return { selectedIds, selected: selectedIds[0] };
    }),
  selectMovement: (movement) => {
    // null only clears the dashboard filter; the current selection is kept.
    if (!movement) return;
    const selectedIds = exercisesForMovement(movement);
    set({ selectedIds, selected: selectedIds[0] });
  },
  begin: (source) => {
    lastMetric = 0;
    const selectedId = get().selected;
    // A planned exercise brings its own rep target; otherwise the global target stands.
    const planItem = usePlan.getState().plan.find((item) => item.exerciseId === selectedId);
    set({
      session: {
        id: crypto.randomUUID(),
        exercise: selectedId,
        source,
        started_at: new Date().toISOString(),
        total_reps: 0,
        status: 'active',
        reps: [],
        metrics: [],
        local: true,
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
    set({
      session,
      rest: { completed_set: range.set_number, ends_at_ms: now + get().restPreset * 1000 },
      currentSetStartRep: range.end_rep + 1,
    });
    return range;
  },
  completeRest: () => set({ rest: null }),
  cancelRest: () => set({ rest: null }),
  finish: () => {
    const current = get().session;
    if (!current) throw new Error('No active workout');
    const [closed] = closeCurrentSet(current, get().currentSetStartRep, Date.now());
    const session: WorkoutSession = { ...closed, ended_at: new Date().toISOString(), status: 'completed' };
    set({ session, paused: true, rest: null, currentSetStartRep: session.reps.length + 1 });
    // A finished real session completes the exercise on the plan; sample-footage
    // demos are not the user's workout, so they never earn a checkmark.
    if (session.source !== 'demo') usePlan.getState().completeExercise(session.exercise);
    return session;
  },
}));
