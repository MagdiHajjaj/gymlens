import type { WorkoutGroup } from './workoutGroups';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day key: `2026-09-27`. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parse a day key back into a local Date. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Group workouts by the local day they started on. */
export function workoutsByDay(workouts: WorkoutGroup[]): Map<string, WorkoutGroup[]> {
  const map = new Map<string, WorkoutGroup[]>();
  workouts.forEach((workout) => {
    const key = dayKey(new Date(workout.startedAt));
    map.set(key, [...(map.get(key) ?? []), workout]);
  });
  return map;
}
