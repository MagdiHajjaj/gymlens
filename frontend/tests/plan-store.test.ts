import { beforeEach, expect, it } from 'vitest';
import { usePlan, MAX_SETS, MIN_SETS, MIN_WEIGHT_KG } from '../src/features/workout/planStore';

beforeEach(() => {
  usePlan.setState({ plan: [] });
});

it('builds plan rows with sensible defaults per exercise', () => {
  usePlan.getState().setPlan(['squat', 'pushup', 'curl']);

  expect(usePlan.getState().plan).toEqual([
    { exerciseId: 'squat', weightKg: 20, sets: 3 },
    { exerciseId: 'pushup', weightKg: 0, sets: 3 },
    { exerciseId: 'curl', weightKg: 10, sets: 3 },
  ]);
});

it('preserves edits when the plan is rebuilt for a changed exercise list', () => {
  usePlan.getState().setPlan(['squat', 'pushup']);
  usePlan.getState().updatePlanItem('squat', { weightKg: 60, sets: 5 });

  usePlan.getState().setPlan(['squat', 'deadlift']);

  expect(usePlan.getState().plan).toEqual([
    { exerciseId: 'squat', weightKg: 60, sets: 5 },
    { exerciseId: 'deadlift', weightKg: 20, sets: 3 },
  ]);
});

it('patches weight and sets independently and clamps to bounds', () => {
  usePlan.getState().setPlan(['row']);

  usePlan.getState().updatePlanItem('row', { weightKg: 42.5 });
  expect(usePlan.getState().plan[0]).toMatchObject({ weightKg: 42.5, sets: 3 });

  usePlan.getState().updatePlanItem('row', { sets: 6 });
  expect(usePlan.getState().plan[0]).toMatchObject({ weightKg: 42.5, sets: 6 });

  usePlan.getState().updatePlanItem('row', { weightKg: -5, sets: MAX_SETS + 10 });
  expect(usePlan.getState().plan[0]).toMatchObject({ weightKg: MIN_WEIGHT_KG, sets: MAX_SETS });

  usePlan.getState().updatePlanItem('row', { sets: MIN_SETS - 1 });
  expect(usePlan.getState().plan[0].sets).toBe(MIN_SETS);
});

it('ignores patches for exercises not in the plan and clears cleanly', () => {
  usePlan.getState().setPlan(['lunge']);
  usePlan.getState().updatePlanItem('press', { weightKg: 30 });
  expect(usePlan.getState().plan).toEqual([{ exerciseId: 'lunge', weightKg: 10, sets: 3 }]);

  usePlan.getState().clearPlan();
  expect(usePlan.getState().plan).toEqual([]);
});
