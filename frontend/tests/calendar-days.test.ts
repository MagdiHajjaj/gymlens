import { describe, expect, it } from 'vitest';
import { dayKey, parseDayKey, workoutsByDay, weekDays, weekLabel } from '../src/lib/calendarDays';
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

describe('week strip', () => {
  it('returns 7 days with the anchor in the middle', () => {
    const days = weekDays(new Date(2026, 8, 27, 12, 0, 0));
    expect(days.map(dayKey)).toEqual([
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
    ]);
  });

  it('spans month boundaries', () => {
    const days = weekDays(new Date(2026, 9, 1, 12, 0, 0));
    expect(dayKey(days[0])).toBe('2026-09-28');
    expect(dayKey(days[6])).toBe('2026-10-04');
  });

  it('labels a week within one month', () => {
    expect(weekLabel(weekDays(new Date(2026, 8, 27, 12, 0, 0)))).toBe('September 24 – 30, 2026');
  });

  it('labels a week spanning two months', () => {
    expect(weekLabel(weekDays(new Date(2026, 9, 1, 12, 0, 0)))).toBe(
      'September 28 – October 4, 2026',
    );
  });
});
