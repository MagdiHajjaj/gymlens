import { describe, expect, it } from 'vitest';
import { groupWorkouts } from '../src/lib/workoutGroups';
import type { WorkoutHistoryEntry } from '../src/types/workout';

const row = (id: string, exercise: WorkoutHistoryEntry['exercise'], start: string, end: string, reps: number): WorkoutHistoryEntry => ({
  id,
  workout_id: 'workout-1',
  exercise,
  source: 'camera',
  started_at: start,
  ended_at: end,
  total_reps: reps,
  status: 'completed',
});

describe('workout history groups', () => {
  it('combines planned exercises into one workout with aggregate totals', () => {
    const groups = groupWorkouts([
      row('session-2', 'row', '2026-01-01T10:05:00Z', '2026-01-01T10:10:00Z', 8),
      row('session-1', 'curl', '2026-01-01T10:00:00Z', '2026-01-01T10:04:00Z', 10),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sessions.map((session) => session.exercise)).toEqual(['curl', 'row']);
    expect(groups[0].totalReps).toBe(18);
    expect(groups[0].durationSeconds).toBe(600);
  });

  it('keeps legacy sessions as separate workouts', () => {
    const legacy = row('legacy', 'squat', '2026-01-01T10:00:00Z', '2026-01-01T10:01:00Z', 5);
    delete legacy.workout_id;
    expect(groupWorkouts([legacy])[0].id).toBe('legacy');
  });
});
