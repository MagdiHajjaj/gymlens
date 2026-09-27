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
 * The calendar never lets you browse past the current month.
 */
export function canGoNextMonth(now: Date, view: MonthView): boolean {
  return view.y < now.getFullYear() || (view.y === now.getFullYear() && view.m < now.getMonth());
}

/**
 * Only the last 7 days (including today) are selectable. You can scroll back
 * through the months to look at history, but older days are dimmed and
 * non-interactive.
 */
export function selectableWindow(now: Date): { minKey: string; maxKey: string } {
  const min = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  return { minKey: dayKey(min), maxKey: dayKey(now) };
}
