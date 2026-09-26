import { beforeEach, describe, expect, it } from 'vitest';
import {
  exercises,
  exercisesForMovement,
  type ExerciseMovement,
} from '../src/features/exercises/ExerciseRegistry';
import { useWorkout } from '../src/features/workout/workoutStore';
import type { ExerciseId } from '../src/types/workout';

const MOVEMENTS: ExerciseMovement[] = ['push', 'pull', 'legs'];

beforeEach(() => {
  useWorkout.setState({
    selected: 'squat',
    selectedIds: ['squat'],
    session: null,
    result: null,
    paused: false,
    voice: false,
    restPreset: 30,
    rest: null,
    currentSetStartRep: 1,
  });
});

describe('exercise movement taxonomy', () => {
  it('assigns every exercise a valid movement and keeps the existing category field', () => {
    for (const id of Object.keys(exercises) as ExerciseId[]) {
      expect(MOVEMENTS).toContain(exercises[id].movement);
      expect(exercises[id].category).toMatch(/BODY/);
    }
  });

  it('maps push/pull/legs to the right exercises in registry order', () => {
    expect(exercisesForMovement('push')).toEqual(['pushup', 'press', 'dips']);
    expect(exercisesForMovement('pull')).toEqual(['curl', 'row', 'pullup']);
    expect(exercisesForMovement('legs')).toEqual(['squat', 'deadlift', 'lunge', 'glute_bridge']);
  });

  it('covers all ten exercises exactly once (3 push, 3 pull, 4 legs)', () => {
    const all = MOVEMENTS.flatMap(exercisesForMovement);
    expect(all).toHaveLength(10);
    expect(new Set(all).size).toBe(10);
    expect(exercisesForMovement('push')).toHaveLength(3);
    expect(exercisesForMovement('pull')).toHaveLength(3);
    expect(exercisesForMovement('legs')).toHaveLength(4);
  });

  it('gives each movement the correct filtered subset of the grid', () => {
    const names = (movement: ExerciseMovement) =>
      exercisesForMovement(movement).map((id) => exercises[id].name);
    expect(names('push')).toEqual(['Push-up', 'Overhead press', 'Tricep dips']);
    expect(names('pull')).toEqual(['Bicep curl', 'Bent-over row', 'Pull-up']);
    expect(names('legs')).toEqual(['Squat', 'Romanian deadlift', 'Lunge', 'Glute bridge']);
  });
});

describe('workoutStore multi-select', () => {
  it('select() resets to a single exercise for backward compatibility', () => {
    useWorkout.getState().toggleExercise('press');
    useWorkout.getState().select('curl');
    expect(useWorkout.getState().selectedIds).toEqual(['curl']);
    expect(useWorkout.getState().selected).toBe('curl');
  });

  it('toggleExercise adds and removes exercises, keeping selected on the first pick', () => {
    useWorkout.getState().toggleExercise('press');
    expect(useWorkout.getState().selectedIds).toEqual(['squat', 'press']);
    expect(useWorkout.getState().selected).toBe('squat');
    useWorkout.getState().toggleExercise('squat');
    expect(useWorkout.getState().selectedIds).toEqual(['press']);
    expect(useWorkout.getState().selected).toBe('press');
  });

  it('toggleExercise never deselects the last exercise', () => {
    useWorkout.getState().toggleExercise('squat');
    expect(useWorkout.getState().selectedIds).toEqual(['squat']);
    expect(useWorkout.getState().selected).toBe('squat');
  });

  it('only selects exercise cards the athlete explicitly chooses', () => {
    useWorkout.getState().toggleExercise('curl');
    useWorkout.getState().toggleExercise('row');
    expect(useWorkout.getState().selectedIds).toEqual(['squat', 'curl', 'row']);
    expect(useWorkout.getState().selectedIds).not.toContain('pullup');
  });
});
