import { create } from 'zustand';
import type { ExerciseId } from '../../types/workout';
import { exercises } from '../exercises/ExerciseRegistry';
import { exerciseSplits, workoutSplits } from '../exercises/workoutSplits';

export interface PlanItem {
  exerciseId: ExerciseId;
  /** Target weight in kilograms. 0 means bodyweight. */
  weightKg: number;
  sets: number;
  /** Target reps per set. */
  reps: number;
}

/**
 * Sensible starting weights in kg. Bodyweight moves default to 0;
 * barbell-style compound lifts default higher than isolation moves.
 */
const DEFAULT_WEIGHT_KG: Record<ExerciseId, number> = {
  squat: 20,
  deadlift: 20,
  press: 20,
  row: 20,
  curl: 10,
  lunge: 10,
  glute_bridge: 10,
  pushup: 0,
  pullup: 0,
  dips: 0,
};

export const DEFAULT_SETS = 3;
export const MIN_SETS = 1;
export const MAX_SETS = 8;
export const DEFAULT_REPS = 10;
export const MIN_REPS = 1;
export const MAX_REPS = 50;
export const WEIGHT_STEP_KG = 2.5;
export const MIN_WEIGHT_KG = 0;

export const defaultWeightFor = (exerciseId: ExerciseId): number => DEFAULT_WEIGHT_KG[exerciseId];

interface PlanStore {
  plan: PlanItem[];
  workoutId: string | null;
  workoutName: string;
  /** Exercises marked finished in the current plan, in completion order. */
  completedExerciseIds: ExerciseId[];
  /** (Re)builds the plan for the given exercises, keeping any edits already made.
   *  When the exercise set is unchanged the current row order is preserved, so
   *  re-entering the plan step never undoes a custom order; a different exercise
   *  list is a fresh plan and resets completion. */
  setPlan: (exerciseIds: ExerciseId[]) => void;
  setWorkoutName: (name: string) => void;
  updatePlanItem: (exerciseId: ExerciseId, patch: { weightKg?: number; sets?: number; reps?: number }) => void;
  /** Moves the row at fromIndex to toIndex, shifting the rows between. No-op for
   *  out-of-range indices. Powers drag-and-drop reordering and keyboard reorder. */
  reorderPlan: (fromIndex: number, toIndex: number) => void;
  /** Marks an exercise finished. Idempotent; safe for exercises outside the plan. */
  completeExercise: (exerciseId: ExerciseId) => void;
  /** True when the exercise was marked finished in the current plan. */
  isExerciseComplete: (exerciseId: ExerciseId) => boolean;
  clearPlan: () => void;
}

export const usePlan = create<PlanStore>((set, get) => ({
  plan: [],
  workoutId: null,
  workoutName: '',
  completedExerciseIds: [],
  setPlan: (exerciseIds) =>
    set((state) => {
      const sameExercises =
        state.plan.length === exerciseIds.length &&
        exerciseIds.every((exerciseId) =>
          state.plan.some((item) => item.exerciseId === exerciseId),
        );
      // Same exercises: keep the current row order (a custom order survives
      // re-entering the plan step). New list: follow the given order.
      const orderedIds = sameExercises
        ? state.plan.map((item) => item.exerciseId)
        : exerciseIds;
      const splits = new Set(exerciseIds.map((exerciseId) => exerciseSplits[exerciseId]));
      const defaultName =
        exerciseIds.length === 1
          ? `${exercises[exerciseIds[0]].name} workout`
          : splits.size === 1
            ? `${workoutSplits[exerciseSplits[exerciseIds[0]]]} workout`
            : 'Full body workout';
      return {
        plan: orderedIds.map((exerciseId) => {
          const existing = state.plan.find((item) => item.exerciseId === exerciseId);
          return (
            existing ?? { exerciseId, weightKg: DEFAULT_WEIGHT_KG[exerciseId], sets: DEFAULT_SETS, reps: DEFAULT_REPS }
          );
        }),
        ...(sameExercises
          ? {}
          : { completedExerciseIds: [], workoutId: crypto.randomUUID(), workoutName: defaultName }),
      };
    }),
  setWorkoutName: (workoutName) => set({ workoutName: workoutName.slice(0, 80) }),
  updatePlanItem: (exerciseId, patch) =>
    set((state) => ({
      plan: state.plan.map((item) =>
        item.exerciseId === exerciseId
          ? {
              ...item,
              ...(patch.weightKg !== undefined
                ? { weightKg: Math.max(MIN_WEIGHT_KG, patch.weightKg) }
                : {}),
              ...(patch.sets !== undefined
                ? { sets: Math.min(MAX_SETS, Math.max(MIN_SETS, patch.sets)) }
                : {}),
              ...(patch.reps !== undefined
                ? { reps: Math.min(MAX_REPS, Math.max(MIN_REPS, patch.reps)) }
                : {}),
            }
          : item,
      ),
    })),
  reorderPlan: (fromIndex, toIndex) =>
    set((state) => {
      const count = state.plan.length;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= count ||
        toIndex >= count
      )
        return {};
      const plan = [...state.plan];
      const [moved] = plan.splice(fromIndex, 1);
      plan.splice(toIndex, 0, moved);
      return { plan };
    }),
  clearPlan: () => set({ plan: [], completedExerciseIds: [], workoutId: null, workoutName: '' }),
  completeExercise: (exerciseId) =>
    set((state) =>
      state.completedExerciseIds.includes(exerciseId)
        ? {}
        : { completedExerciseIds: [...state.completedExerciseIds, exerciseId] },
    ),
  isExerciseComplete: (exerciseId) => get().completedExerciseIds.includes(exerciseId),
}));
