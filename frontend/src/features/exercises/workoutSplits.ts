import type { ExerciseId } from '../../types/workout';

export const workoutSplits = { push: 'Push', pull: 'Pull', legs: 'Legs' } as const;
export type WorkoutSplit = keyof typeof workoutSplits;
export type SplitFilter = WorkoutSplit | 'all';
export type ExerciseFilter = ExerciseId | 'all';

export const exerciseSplits: Record<ExerciseId, WorkoutSplit> = {
  pushup: 'push',
  press: 'push',
  dips: 'push',
  curl: 'pull',
  row: 'pull',
  pullup: 'pull',
  squat: 'legs',
  deadlift: 'legs',
  lunge: 'legs',
  glute_bridge: 'legs',
};

export const matchesSplit = (exercise: ExerciseId, split: SplitFilter) =>
  split === 'all' || exerciseSplits[exercise] === split;
