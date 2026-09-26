import { beforeEach, expect, it } from 'vitest';
import { useWorkout } from '../src/features/workout/workoutStore';
import { usePlan } from '../src/features/workout/planStore';
import type { ExerciseResult } from '../src/types/workout';

const completeResult = (faults: ExerciseResult['faults'] = []): ExerciseResult => ({
  phase: 'ready',
  trackingValid: true,
  calibrated: true,
  repCompleted: true,
  jointAngles: { knee: 90 },
  faults,
  guidance: '',
  repMetrics: {},
});

beforeEach(() => {
  useWorkout.setState({
    selected: 'squat',
    session: null,
    result: null,
    paused: false,
    voice: false,
    restPreset: 30,
    targetReps: 8,
    rest: null,
    currentSetStartRep: 1,
  });
  usePlan.setState({ plan: [], completedExerciseIds: [] });
});

it('starts rest only after closing a nonempty real rep range', () => {
  useWorkout.getState().begin('demo');

  expect(useWorkout.getState().startRest(1_000)).toBeNull();
  expect(useWorkout.getState().session?.set_ranges).toBeUndefined();

  useWorkout.getState().ingest(completeResult(), 1_000);
  useWorkout.getState().ingest(completeResult(), 2_000);
  useWorkout.getState().setRestPreset(60);
  const range = useWorkout.getState().startRest(10_000);

  expect(range).toMatchObject({ set_number: 1, start_rep: 1, end_rep: 2, rest_seconds: 60 });
  expect(useWorkout.getState().rest).toEqual({ completed_set: 1, ends_at_ms: 70_000 });
  expect(useWorkout.getState().currentSetStartRep).toBe(3);
});

it('does not let ingest mutate rest and finish clears rest without duplicate ranges', () => {
  useWorkout.getState().begin('demo');
  useWorkout.getState().ingest(completeResult(), 1_000);
  useWorkout.getState().startRest(5_000);
  const rest = useWorkout.getState().rest;

  useWorkout.getState().ingest(completeResult(), 2_000);
  expect(useWorkout.getState().rest).toEqual(rest);
  expect(useWorkout.getState().session?.total_reps).toBe(1);
  useWorkout.getState().completeRest();
  expect(useWorkout.getState().rest).toBeNull();
  useWorkout.getState().ingest(completeResult(), 6_000);

  const session = useWorkout.getState().finish();
  expect(session.set_ranges).toMatchObject([
    { set_number: 1, start_rep: 1, end_rep: 1 },
    { set_number: 2, start_rep: 2, end_rep: 2 },
  ]);
  expect(useWorkout.getState().rest).toBeNull();
});

it('resets rest state when beginning a new session', () => {
  useWorkout.getState().begin('demo');
  useWorkout.getState().ingest(completeResult(), 1_000);
  useWorkout.getState().startRest(1_000);
  useWorkout.getState().begin('camera');

  expect(useWorkout.getState().rest).toBeNull();
  expect(useWorkout.getState().currentSetStartRep).toBe(1);
  expect(useWorkout.getState().session?.set_ranges).toBeUndefined();
});

it('marks the exercise complete on the plan when a real session finishes', () => {
  usePlan.getState().setPlan(['squat', 'pushup']);
  useWorkout.getState().begin('camera');
  useWorkout.getState().ingest(completeResult(), 1_000);

  const session = useWorkout.getState().finish();

  expect(session.status).toBe('completed');
  expect(usePlan.getState().isExerciseComplete('squat')).toBe(true);
  expect(usePlan.getState().isExerciseComplete('pushup')).toBe(false);
});

it('does not mark the plan complete for sample-footage demo sessions', () => {
  usePlan.getState().setPlan(['squat']);
  useWorkout.getState().begin('demo');

  useWorkout.getState().finish();

  expect(usePlan.getState().completedExerciseIds).toEqual([]);
});

it('uses the plan rep target when beginning a session for a planned exercise', () => {
  usePlan.getState().setPlan(['squat']);
  usePlan.getState().updatePlanItem('squat', { reps: 12 });

  useWorkout.getState().begin('camera');

  expect(useWorkout.getState().targetReps).toBe(12);
});

it('keeps the global rep target when the exercise has no plan item', () => {
  usePlan.getState().setPlan(['pushup']);
  useWorkout.getState().setTargetReps(15);

  useWorkout.getState().begin('camera');

  expect(useWorkout.getState().session?.exercise).toBe('squat');
  expect(useWorkout.getState().targetReps).toBe(15);
});
