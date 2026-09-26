import { beforeEach, expect, it } from 'vitest';
import {
  usePlan,
  DEFAULT_REPS,
  MAX_REPS,
  MAX_SETS,
  MIN_REPS,
  MIN_SETS,
  MIN_WEIGHT_KG,
} from '../src/features/workout/planStore';

beforeEach(() => {
  usePlan.setState({ plan: [], completedExerciseIds: [] });
});

it('builds plan rows with sensible defaults per exercise', () => {
  usePlan.getState().setPlan(['squat', 'pushup', 'curl']);

  expect(usePlan.getState().plan).toEqual([
    { exerciseId: 'squat', weightKg: 20, sets: 3, reps: DEFAULT_REPS },
    { exerciseId: 'pushup', weightKg: 0, sets: 3, reps: DEFAULT_REPS },
    { exerciseId: 'curl', weightKg: 10, sets: 3, reps: DEFAULT_REPS },
  ]);
});

it('preserves edits when the plan is rebuilt for a changed exercise list', () => {
  usePlan.getState().setPlan(['squat', 'pushup']);
  usePlan.getState().updatePlanItem('squat', { weightKg: 60, sets: 5, reps: 12 });

  usePlan.getState().setPlan(['squat', 'deadlift']);

  expect(usePlan.getState().plan).toEqual([
    { exerciseId: 'squat', weightKg: 60, sets: 5, reps: 12 },
    { exerciseId: 'deadlift', weightKg: 20, sets: 3, reps: DEFAULT_REPS },
  ]);
});

it('patches weight, sets and reps independently and clamps to bounds', () => {
  usePlan.getState().setPlan(['row']);

  usePlan.getState().updatePlanItem('row', { weightKg: 42.5 });
  expect(usePlan.getState().plan[0]).toMatchObject({ weightKg: 42.5, sets: 3, reps: DEFAULT_REPS });

  usePlan.getState().updatePlanItem('row', { sets: 6 });
  expect(usePlan.getState().plan[0]).toMatchObject({ weightKg: 42.5, sets: 6 });

  usePlan.getState().updatePlanItem('row', { reps: 15 });
  expect(usePlan.getState().plan[0]).toMatchObject({ weightKg: 42.5, sets: 6, reps: 15 });

  usePlan.getState().updatePlanItem('row', { weightKg: -5, sets: MAX_SETS + 10, reps: MAX_REPS + 10 });
  expect(usePlan.getState().plan[0]).toMatchObject({
    weightKg: MIN_WEIGHT_KG,
    sets: MAX_SETS,
    reps: MAX_REPS,
  });

  usePlan.getState().updatePlanItem('row', { sets: MIN_SETS - 1, reps: MIN_REPS - 1 });
  expect(usePlan.getState().plan[0].sets).toBe(MIN_SETS);
  expect(usePlan.getState().plan[0].reps).toBe(MIN_REPS);
});

it('ignores patches for exercises not in the plan and clears cleanly', () => {
  usePlan.getState().setPlan(['lunge']);
  usePlan.getState().updatePlanItem('press', { weightKg: 30 });
  expect(usePlan.getState().plan).toEqual([
    { exerciseId: 'lunge', weightKg: 10, sets: 3, reps: DEFAULT_REPS },
  ]);

  usePlan.getState().completeExercise('lunge');
  usePlan.getState().clearPlan();
  expect(usePlan.getState().plan).toEqual([]);
  expect(usePlan.getState().completedExerciseIds).toEqual([]);
});

it('marks exercises complete idempotently', () => {
  usePlan.getState().setPlan(['squat', 'pushup']);

  expect(usePlan.getState().isExerciseComplete('squat')).toBe(false);

  usePlan.getState().completeExercise('squat');
  usePlan.getState().completeExercise('squat');

  expect(usePlan.getState().completedExerciseIds).toEqual(['squat']);
  expect(usePlan.getState().isExerciseComplete('squat')).toBe(true);
  expect(usePlan.getState().isExerciseComplete('pushup')).toBe(false);
});

it('keeps completion when the same plan is rebuilt, resets it for a new plan', () => {
  usePlan.getState().setPlan(['squat', 'pushup']);
  usePlan.getState().completeExercise('squat');

  // Rebuilding the identical list (e.g. reopening the plan step) keeps checkmarks.
  usePlan.getState().setPlan(['pushup', 'squat']);
  expect(usePlan.getState().isExerciseComplete('squat')).toBe(true);

  // A different exercise list is a fresh plan: completion starts over.
  usePlan.getState().setPlan(['squat', 'deadlift']);
  expect(usePlan.getState().completedExerciseIds).toEqual([]);
});

it('reorders plan rows by index, ignoring no-ops and out-of-range moves', () => {
  usePlan.getState().setPlan(['squat', 'pushup', 'curl']);
  const { reorderPlan } = usePlan.getState();
  const order = () => usePlan.getState().plan.map((item) => item.exerciseId);

  reorderPlan(1, 0);
  expect(order()).toEqual(['pushup', 'squat', 'curl']);

  reorderPlan(0, 2);
  expect(order()).toEqual(['squat', 'curl', 'pushup']);

  // No-ops: same index and out-of-range indices leave the plan untouched.
  reorderPlan(1, 1);
  reorderPlan(-1, 2);
  reorderPlan(0, 3);
  reorderPlan(5, 0);
  expect(order()).toEqual(['squat', 'curl', 'pushup']);
});

it('preserves a custom row order when the same plan is rebuilt', () => {
  usePlan.getState().setPlan(['squat', 'pushup', 'curl']);
  usePlan.getState().updatePlanItem('curl', { weightKg: 15 });
  usePlan.getState().reorderPlan(2, 0);

  usePlan.getState().setPlan(['pushup', 'squat', 'curl']);
  expect(usePlan.getState().plan.map((item) => item.exerciseId)).toEqual(['curl', 'squat', 'pushup']);
  expect(usePlan.getState().plan[0]).toMatchObject({ exerciseId: 'curl', weightKg: 15 });
});
