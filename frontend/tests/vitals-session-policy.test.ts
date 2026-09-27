import { describe, expect, it } from 'vitest';
import { shouldRunVitals } from '../src/features/vitals/vitalsSessionPolicy';
import type { WorkoutSession } from '../src/types/workout';

const sessionWith = (source: WorkoutSession['source']): WorkoutSession =>
  ({
    id: 's1',
    exercise: 'squat',
    source,
    status: 'active',
    started_at: new Date().toISOString(),
    reps: [],
    total_reps: 0,
    metrics: [],
  }) as WorkoutSession;

describe('shouldRunVitals', () => {
  it('runs on a live camera session', () => {
    expect(shouldRunVitals(sessionWith('camera'), true)).toBe(true);
  });

  it('never runs on demo footage — that pulse would belong to the footage subject', () => {
    expect(shouldRunVitals(sessionWith('demo'), true)).toBe(false);
  });

  it('never runs on uploaded videos', () => {
    expect(shouldRunVitals(sessionWith('upload'), true)).toBe(false);
  });

  it('does not run when the workout is paused or over', () => {
    expect(shouldRunVitals(sessionWith('camera'), false)).toBe(false);
  });

  it('does not run without a session', () => {
    expect(shouldRunVitals(null, true)).toBe(false);
  });
});
