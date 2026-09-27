import { expect, it } from 'vitest';
import { duration, timeLabel } from '../src/lib/sessionBuffer';
import type { WorkoutSession } from '../src/types/workout';

const base: WorkoutSession = {
  id: 's1',
  exercise: 'squat',
  started_at: '2026-09-26T18:00:00.000Z',
  ended_at: '2026-09-26T20:18:30.000Z',
  total_reps: 0,
  status: 'completed',
  source: 'camera',
  reps: [],
  metrics: [],
};

it('measures from tracking start, excluding the calibration window', () => {
  // 2.5 minutes of "finding your position" before tracking went live.
  const session = { ...base, tracking_started_at: '2026-09-26T18:02:30.000Z' };
  expect(duration(session)).toBe(2 * 3600 + 16 * 60);
});

it('falls back to started_at when tracking never stamped', () => {
  expect(duration(base)).toBe(2 * 3600 + 18 * 60 + 30);
});

it('reports zero when the session ended before tracking began', () => {
  const session = { ...base, ended_at: '2026-09-26T18:00:00.000Z' };
  expect(duration(session)).toBe(0);
});

it('formats durations as mm:ss', () => {
  expect(timeLabel(0)).toBe('00:00');
  expect(timeLabel(65)).toBe('01:05');
  expect(timeLabel(2 * 3600 + 5 * 60)).toBe('125:00');
});
