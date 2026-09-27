import { describe, expect, it } from 'vitest';
import { dayKey, parseDayKey, workoutsByDay } from '../src/lib/calendarDays';
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
