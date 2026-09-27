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

export interface MonthView {
  y: number;
  m: number;
}

/**
 * Month navigation limits for the training calendar: never browse past the
 * current month, and never further back than one week before today.
 */
export function monthNavLimits(now: Date, view: MonthView): { canGoPrev: boolean; canGoNext: boolean } {
  const earliest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const canGoPrev =
    view.y > earliest.getFullYear() ||
    (view.y === earliest.getFullYear() && view.m > earliest.getMonth());
  const canGoNext =
    view.y < now.getFullYear() || (view.y === now.getFullYear() && view.m < now.getMonth());
  return { canGoPrev, canGoNext };
}
