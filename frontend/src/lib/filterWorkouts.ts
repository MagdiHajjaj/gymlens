import { exercises } from '../features/exercises/ExerciseRegistry';
import type { WorkoutGroup } from './workoutGroups';
import type { ExerciseId } from '../types/workout';

export interface WorkoutFilter {
  query: string;
  exercise: ExerciseId | null;
}

/**
 * Filter whole workouts (never individual sessions) so a mixed workout like
 * "Bicep curl · Overhead press" is kept or dropped as one unit. Matches the
 * workout's display name — the saved name when present, otherwise the joined
 * exercise names.
 */
export function filterWorkouts(workouts: WorkoutGroup[], filter: WorkoutFilter): WorkoutGroup[] {
  const q = filter.query.trim().toLowerCase();
  return workouts.filter((workout) => {
    if (filter.exercise && !workout.sessions.some((row) => row.exercise === filter.exercise))
      return false;
    if (!q) return true;
    const searchable = [
      workout.name,
      ...workout.sessions.map((row) => exercises[row.exercise].name),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return searchable.includes(q);
  });
}
