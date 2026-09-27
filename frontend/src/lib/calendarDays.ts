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
 * The 7 calendar days shown in the week strip: 3 days before the anchor,
 * the anchor itself in the middle, and 3 days after.
 */
export function weekDays(anchor: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - 3 + i),
  );
}

/** Header label for the week strip, e.g. "September 24 – 30, 2026". */
export function weekLabel(days: Date[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  const firstPart = first.toLocaleDateString('en', { month: 'long', day: 'numeric' });
  const lastPart =
    first.getMonth() === last.getMonth()
      ? last.toLocaleDateString('en', { day: 'numeric' })
      : last.toLocaleDateString('en', { month: 'long', day: 'numeric' });
  return `${firstPart} – ${lastPart}, ${last.getFullYear()}`;
}
