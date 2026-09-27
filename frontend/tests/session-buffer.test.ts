// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { duration, localSessions, saveLocal, timeLabel } from '../src/lib/sessionBuffer';
import type { WorkoutSession } from '../src/types/workout';

const OWNER = 'fresh-test-owner';

const makeSession = (overrides: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: 's1',
  exercise: 'squat',
  started_at: '2026-09-26T18:00:00.000Z',
  ended_at: '2026-09-26T20:18:30.000Z',
  total_reps: 5,
  status: 'completed',
  source: 'camera',
  reps: [],
  metrics: [],
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
});

it('measures from tracking start, excluding the calibration window', () => {
  // 2.5 minutes of "finding your position" before tracking went live.
  const session = makeSession({
    total_reps: 0,
    tracking_started_at: '2026-09-26T18:02:30.000Z',
  });
  expect(duration(session)).toBe(2 * 3600 + 16 * 60);
});

it('falls back to started_at when tracking never stamped', () => {
  expect(duration(makeSession({ total_reps: 0 }))).toBe(2 * 3600 + 18 * 60 + 30);
});

it('reports zero when the session ended before tracking began', () => {
  const session = makeSession({ ended_at: '2026-09-26T18:00:00.000Z' });
  expect(duration(session)).toBe(0);
});

it('formats durations as mm:ss', () => {
  expect(timeLabel(0)).toBe('00:00');
  expect(timeLabel(65)).toBe('01:05');
  expect(timeLabel(2 * 3600 + 5 * 60)).toBe('125:00');
});

it('starts with an empty history for a fresh browser (nothing is pre-seeded)', () => {
  expect(localSessions(OWNER)).toEqual([]);
});

it('round-trips a saved camera session', () => {
  saveLocal(makeSession({ id: 'abc' }), OWNER);
  const sessions = localSessions(OWNER);
  expect(sessions).toHaveLength(1);
  expect(sessions[0].id).toBe('abc');
});

it('never stores demo sessions in local history', () => {
  saveLocal(makeSession({ id: 'demo1', source: 'demo' }), OWNER);
  expect(localSessions(OWNER)).toEqual([]);
});

it('filters out demo entries that predate the guard', () => {
  localStorage.setItem(
    'gym-lens:v1:sessions:' + OWNER,
    JSON.stringify([makeSession({ id: 'demo2', source: 'demo' }), makeSession({ id: 'real' })]),
  );
  const sessions = localSessions(OWNER);
  expect(sessions.map((s) => s.id)).toEqual(['real']);
});
