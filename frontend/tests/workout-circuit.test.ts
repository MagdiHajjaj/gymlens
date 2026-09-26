import { beforeEach, expect, it } from 'vitest';
import { useWorkout } from '../src/features/workout/workoutStore';
import type { ExerciseResult } from '../src/types/workout';

const completeResult = (): ExerciseResult => ({
  phase: 'ready',
  trackingValid: true,
  calibrated: true,
  repCompleted: true,
  jointAngles: { knee: 90 },
  faults: [],
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
    circuit: [],
    exercisePlans: {},
    circuitSets: {},
  });
});

function doSet(reps = 2) {
  for (let i = 0; i < reps; i++) useWorkout.getState().ingest(completeResult(), Date.now());
  const range = useWorkout.getState().startRest(Date.now());
  // Rest ends before the next set begins, mirroring the app's rest timer.
  useWorkout.getState().completeRest();
  return range;
}

it('toggles exercises in and out of the circuit in order', () => {
  const state = () => useWorkout.getState();
  state().toggleCircuitExercise('squat');
  state().toggleCircuitExercise('curl');
  expect(state().circuit).toEqual(['squat', 'curl']);
  // Toggling again removes it without disturbing the rest.
  state().toggleCircuitExercise('squat');
  expect(state().circuit).toEqual(['curl']);
  // Re-adding appends to the end.
  state().toggleCircuitExercise('squat');
  expect(state().circuit).toEqual(['curl', 'squat']);
});

it('does not add duplicates through addToCircuit', () => {
  const state = () => useWorkout.getState();
  state().addToCircuit('pushup');
  state().addToCircuit('pushup');
  expect(state().circuit).toEqual(['pushup']);
});

it('setCircuit replaces the circuit, resets progress, and selects the first exercise', () => {
  const state = () => useWorkout.getState();
  state().setCircuit(['curl', 'squat']);
  state().select('curl');
  state().begin('demo');
  doSet();
  expect(state().setsDone('curl')).toBe(1);

  state().setCircuit(['pushup', 'row']);
  expect(state().circuit).toEqual(['pushup', 'row']);
  expect(state().setsDone('curl')).toBe(0);
  expect(state().selected).toBe('pushup');
});

it('clearCircuit empties the circuit and its progress', () => {
  const state = () => useWorkout.getState();
  state().setCircuit(['curl']);
  state().select('curl');
  state().begin('demo');
  doSet();
  state().clearCircuit();
  expect(state().circuit).toEqual([]);
  expect(state().setsDone('curl')).toBe(0);
});

it('defaults plans to 3 sets of the global rep target and clamps custom plans', () => {
  const state = () => useWorkout.getState();
  expect(state().planFor('squat')).toEqual({ targetSets: 3, targetReps: 8 });
  state().setExercisePlan('squat', { targetSets: 0, targetReps: -5 });
  expect(state().planFor('squat')).toEqual({ targetSets: 1, targetReps: 1 });
  state().setExercisePlan('squat', { targetSets: 5, targetReps: 12 });
  expect(state().planFor('squat')).toEqual({ targetSets: 5, targetReps: 12 });
  // Other exercises keep the default.
  expect(state().planFor('curl')).toEqual({ targetSets: 3, targetReps: 8 });
});

it('counts completed sets per exercise and reports done/next', () => {
  const state = () => useWorkout.getState();
  state().setCircuit(['curl', 'squat']);
  state().setExercisePlan('curl', { targetSets: 2, targetReps: 10 });

  state().select('curl');
  state().begin('demo');
  doSet();
  expect(state().setsDone('curl')).toBe(1);
  expect(state().isExerciseDone('curl')).toBe(false);
  expect(state().nextCircuitExercise()).toBe('curl');

  doSet();
  expect(state().setsDone('curl')).toBe(2);
  expect(state().isExerciseDone('curl')).toBe(true);
  // The next incomplete exercise follows in circuit order.
  expect(state().nextCircuitExercise()).toBe('squat');

  // Sets tracked on one exercise do not leak into another.
  expect(state().setsDone('squat')).toBe(0);
  expect(state().nextCircuitExercise()).toBe('squat');
});

it('returns null from nextCircuitExercise when every exercise is done', () => {
  const state = () => useWorkout.getState();
  state().setCircuit(['curl']);
  state().setExercisePlan('curl', { targetSets: 1, targetReps: 10 });
  state().select('curl');
  state().begin('demo');
  doSet();
  expect(state().isExerciseDone('curl')).toBe(true);
  expect(state().nextCircuitExercise()).toBeNull();
});

it('removeFromCircuit keeps the remaining exercises and their progress', () => {
  const state = () => useWorkout.getState();
  state().setCircuit(['curl', 'squat']);
  state().select('curl');
  state().begin('demo');
  doSet();
  state().select('squat');
  state().begin('demo');
  doSet();
  doSet();

  state().removeFromCircuit('curl');
  expect(state().circuit).toEqual(['squat']);
  expect(state().setsDone('squat')).toBe(2);
  // squat still needs its third default set.
  expect(state().nextCircuitExercise()).toBe('squat');
});
