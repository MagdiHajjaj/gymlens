import { describe, expect, it } from 'vitest';
import { dayKey, parseDayKey, workoutsByDay, monthNavLimits } from '../src/lib/calendarDays';
import { groupWorkouts } from '../src/lib/workoutGroups';
import type { WorkoutHistoryEntry } from '../src/types/workout';

const row = (
  id: string,
  workoutId: string,
  exercise: WorkoutHistoryEntry['exercise'],
  start: string,
): WorkoutHistoryEntry => ({
  id,
  workout_id: workoutId,
  exercise,
  source: 'camera',
  started_at: start,
  ended_at: start,
  total_reps: 10,
  status: 'completed',
});

describe('calendar day helpers', () => {
  it('builds a local day key', () => {
    expect(dayKey(new Date(2026, 8, 27, 18, 30))).toBe('2026-09-27');
  });

  it('round-trips a day key', () => {
    const date = parseDayKey('2026-09-27');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8);
    expect(date.getDate()).toBe(27);
  });

  it('groups workouts by their local start day', () => {
    const workouts = groupWorkouts([
      row('s1', 'w1', 'curl', '2026-09-27T10:00:00'),
      row('s2', 'w1', 'row', '2026-09-27T10:05:00'),
      row('s3', 'w2', 'squat', '2026-09-25T10:00:00'),
    ]);
    const byDay = workoutsByDay(workouts);
    expect(byDay.get('2026-09-27')).toHaveLength(1);
    expect(byDay.get('2026-09-27')![0].sessions).toHaveLength(2);
    expect(byDay.get('2026-09-25')).toHaveLength(1);
    expect(byDay.get('2026-09-26')).toBeUndefined();
  });
});

describe('month navigation limits', () => {
  it('blocks going back when today is more than a week into the month', () => {
    // Sept 27 -> earliest is Sept 20, same month: no back navigation.
    const limits = monthNavLimits(new Date(2026, 8, 27), { y: 2026, m: 8 });
    expect(limits.canGoPrev).toBe(false);
    expect(limits.canGoNext).toBe(false);
  });

  it('allows one month back when the week window spans two months', () => {
    // Oct 3 -> earliest is Sept 26: September is viewable, August is not.
    expect(monthNavLimits(new Date(2026, 9, 3), { y: 2026, m: 9 }).canGoPrev).toBe(true);
    const sept = monthNavLimits(new Date(2026, 9, 3), { y: 2026, m: 8 });
    expect(sept.canGoPrev).toBe(false);
    expect(sept.canGoNext).toBe(true);
  });

  it('never allows navigating into the future', () => {
    const limits = monthNavLimits(new Date(2026, 8, 27), { y: 2026, m: 8 });
    expect(limits.canGoNext).toBe(false);
  });
});
