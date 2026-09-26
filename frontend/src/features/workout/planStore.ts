import { create } from 'zustand';
import type { ExerciseId } from '../../types/workout';

export interface PlanItem {
  exerciseId: ExerciseId;
  /** Target weight in kilograms. 0 means bodyweight. */
  weightKg: number;
  sets: number;
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
export const WEIGHT_STEP_KG = 2.5;
export const MIN_WEIGHT_KG = 0;

export const defaultWeightFor = (exerciseId: ExerciseId): number => DEFAULT_WEIGHT_KG[exerciseId];

interface PlanStore {
  plan: PlanItem[];
  /** Exercises marked finished in the current plan, in completion order. */
  completedExerciseIds: ExerciseId[];
  /** (Re)builds the plan for the given exercises, keeping any edits already made.
   *  Completion resets when the exercise list changes (a new plan); rebuilding the
   *  same list keeps it so returning to the plan step never wipes checkmarks. */
  setPlan: (exerciseIds: ExerciseId[]) => void;
  updatePlanItem: (exerciseId: ExerciseId, patch: { weightKg?: number; sets?: number }) => void;
  /** Marks an exercise finished. Idempotent; safe for exercises outside the plan. */
  completeExercise: (exerciseId: ExerciseId) => void;
  /** True when the exercise was marked finished in the current plan. */
  isExerciseComplete: (exerciseId: ExerciseId) => boolean;
  clearPlan: () => void;
}

export const usePlan = create<PlanStore>((set, get) => ({
  plan: [],
  completedExerciseIds: [],
  setPlan: (exerciseIds) =>
    set((state) => {
      const sameExercises =
        state.plan.length === exerciseIds.length &&
        exerciseIds.every((exerciseId) =>
          state.plan.some((item) => item.exerciseId === exerciseId),
        );
      return {
        plan: exerciseIds.map((exerciseId) => {
          const existing = state.plan.find((item) => item.exerciseId === exerciseId);
          return (
            existing ?? { exerciseId, weightKg: DEFAULT_WEIGHT_KG[exerciseId], sets: DEFAULT_SETS }
          );
        }),
        ...(sameExercises ? {} : { completedExerciseIds: [] }),
      };
    }),
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
            }
          : item,
      ),
    })),
  clearPlan: () => set({ plan: [], completedExerciseIds: [] }),
  completeExercise: (exerciseId) =>
    set((state) =>
      state.completedExerciseIds.includes(exerciseId)
        ? {}
        : { completedExerciseIds: [...state.completedExerciseIds, exerciseId] },
    ),
  isExerciseComplete: (exerciseId) => get().completedExerciseIds.includes(exerciseId),
}));
