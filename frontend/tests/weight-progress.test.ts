import { describe, expect, it } from 'vitest';
import { weightProgress } from '../src/lib/weightProgress';
import type { WorkoutHistoryEntry } from '../src/types/workout';

const session = (
  id: string,
  exercise: WorkoutHistoryEntry['exercise'],
  started_at: string,
  weight_kg: number | null,
  status: WorkoutHistoryEntry['status'] = 'completed',
): WorkoutHistoryEntry => ({
  id,
  exercise,
  started_at,
  weight_kg,
  status,
  source: 'camera',
  total_reps: 10,
});

describe('weight progress', () => {
  it('keeps completed positive loads for one exercise and orders them oldest first', () => {
    const result = weightProgress(
      [
        session('new', 'squat', '2026-02-02T10:00:00Z', 55),
        session('other', 'curl', '2026-02-01T10:00:00Z', 12),
        session('old', 'squat', '2026-01-01T10:00:00Z', 50),
        session('bodyweight', 'squat', '2026-02-03T10:00:00Z', 0),
        session('active', 'squat', '2026-02-04T10:00:00Z', 60, 'active'),
      ],
      'squat',
    );

    expect(result.map((point) => point.sessionId)).toEqual(['old', 'new']);
    expect(result.map((point) => point.weightKg)).toEqual([50, 55]);
  });
});
