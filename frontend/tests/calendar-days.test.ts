import { describe, expect, it } from 'vitest';
import { dayKey, parseDayKey, workoutsByDay, selectableWindow, canGoNextMonth } from '../src/lib/calendarDays';
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

describe('selectable week window', () => {
  it('covers the last 7 days including today', () => {
    const { minKey, maxKey } = selectableWindow(new Date(2026, 8, 27, 12, 0, 0));
    expect(minKey).toBe('2026-09-21');
    expect(maxKey).toBe('2026-09-27');
  });

  it('spans month boundaries correctly', () => {
    const { minKey, maxKey } = selectableWindow(new Date(2026, 9, 3, 12, 0, 0));
    expect(minKey).toBe('2026-09-27');
    expect(maxKey).toBe('2026-10-03');
  });
});

describe('next-month navigation', () => {
  it('never allows navigating into the future', () => {
    expect(canGoNextMonth(new Date(2026, 8, 27), { y: 2026, m: 8 })).toBe(false);
    expect(canGoNextMonth(new Date(2026, 8, 27), { y: 2026, m: 7 })).toBe(true);
  });
});
