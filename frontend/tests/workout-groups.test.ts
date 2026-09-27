import { describe, expect, it } from 'vitest';
import { groupWorkouts } from '../src/lib/workoutGroups';
import { filterWorkouts } from '../src/lib/filterWorkouts';
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
    const second = row('session-2', 'row', '2026-01-01T10:05:00Z', '2026-01-01T10:10:00Z', 8);
    const first = row('session-1', 'curl', '2026-01-01T10:00:00Z', '2026-01-01T10:04:00Z', 10);
    first.workout_name = second.workout_name = 'Pull power';
    const groups = groupWorkouts([second, first]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sessions.map((session) => session.exercise)).toEqual(['curl', 'row']);
    expect(groups[0].totalReps).toBe(18);
    expect(groups[0].durationSeconds).toBe(600);
    expect(groups[0].name).toBe('Pull power');
  });

  it('keeps legacy sessions as separate workouts', () => {
    const legacy = row('legacy', 'squat', '2026-01-01T10:00:00Z', '2026-01-01T10:01:00Z', 5);
    delete legacy.workout_id;
    expect(groupWorkouts([legacy])[0].id).toBe('legacy');
  });
});

describe('workout history filter', () => {
  const squatRow = row('s3', 'squat', '2026-01-02T10:00:00Z', '2026-01-02T10:05:00Z', 12);
  squatRow.workout_id = 'workout-2';
  const mixed = groupWorkouts([
    { ...row('s1', 'curl', '2026-01-01T10:00:00Z', '2026-01-01T10:04:00Z', 10), workout_name: 'Pull power' },
    { ...row('s2', 'row', '2026-01-01T10:05:00Z', '2026-01-01T10:10:00Z', 8), workout_name: 'Pull power' },
    squatRow,
  ]);

  it('keeps a mixed workout whole when one of its exercises matches', () => {
    const result = filterWorkouts(mixed, { query: '', exercise: 'row' });
    expect(result).toHaveLength(1);
    expect(result[0].sessions).toHaveLength(2);
    expect(result[0].name).toBe('Pull power');
  });

  it('searches the saved workout name case-insensitively', () => {
    const result = filterWorkouts(mixed, { query: 'pull POW', exercise: null });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Pull power');
  });

  it('searches exercise names even when the workout has a saved name', () => {
    const result = filterWorkouts(mixed, { query: 'bicep curl', exercise: null });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Pull power');
  });

  it('searches exercise names when the workout has no saved name', () => {
    const result = filterWorkouts(mixed, { query: 'squat', exercise: null });
    expect(result).toHaveLength(1);
    expect(result[0].sessions[0].exercise).toBe('squat');
  });

  it('returns everything when no filter is set', () => {
    expect(filterWorkouts(mixed, { query: '  ', exercise: null })).toHaveLength(2);
  });

  it('combines exercise and text filters', () => {
    expect(filterWorkouts(mixed, { query: 'squat', exercise: 'row' })).toHaveLength(0);
    expect(filterWorkouts(mixed, { query: 'pull', exercise: 'row' })).toHaveLength(1);
  });
});
