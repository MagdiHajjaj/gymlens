import { expect, it } from 'vitest';
import { summarizeSession, summarizeSet } from '../src/features/coaching/sessionSummary';
import type { ExerciseId, FormFault, WorkoutSession } from '../src/types/workout';

const fault = (code: string): FormFault => ({ code, message: code, severity: 'warning' });

const session = (overrides: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: 'local',
  exercise: 'squat',
  started_at: '2024-01-01T00:00:00.000Z',
  total_reps: 0,
  status: 'active',
  source: 'demo',
  reps: [],
  metrics: [],
  local: true,
  ...overrides,
});

it('summarizes clean sets honestly', () => {
  const workout = session({
    total_reps: 2,
    reps: [
      { rep_number: 1, completed_at: 'now', metrics_json: {}, faults_json: [] },
      { rep_number: 2, completed_at: 'now', metrics_json: {}, faults_json: [] },
    ],
    set_ranges: [{ set_number: 1, start_rep: 1, end_rep: 2, completed_at: 'now' }],
  });

  const summary = summarizeSet(workout, workout.set_ranges![0]);

  expect(summary).toBe('Set 1 complete. 2 reps. No technique cues detected.');
  expect(summary.length).toBeLessThanOrEqual(160);
});

it('uses the exact top-fault focus mapping for set and session summaries', () => {
  const workout = session({
    total_reps: 3,
    reps: [
      { rep_number: 1, completed_at: 'now', metrics_json: {}, faults_json: [fault('upper_arm_movement')] },
      { rep_number: 2, completed_at: 'now', metrics_json: {}, faults_json: [fault('limited_range')] },
      { rep_number: 3, completed_at: 'now', metrics_json: {}, faults_json: [fault('limited_range')] },
    ],
    set_ranges: [{ set_number: 1, start_rep: 1, end_rep: 3, completed_at: 'now' }],
  });

  expect(summarizeSet(workout, workout.set_ranges![0])).toBe(
    'Set 1 complete. 3 reps. 3 technique cues. Use a fuller comfortable range next set.',
  );
  expect(summarizeSession(workout)).toBe(
    'Session complete. 3 reps across 1 set. 3 technique cues. Focus on a fuller comfortable range next session.',
  );
});

it('handles zero reps and curl arm-rep grammar without inventing cues', () => {
  expect(summarizeSession(session())).toBe(
    'Session complete. 0 reps across 0 sets. No technique cues detected.',
  );

  const workout = session({
    exercise: 'curl',
    total_reps: 1,
    reps: [{ rep_number: 1, completed_at: 'now', metrics_json: {}, faults_json: [] }],
    set_ranges: [{ set_number: 1, start_rep: 1, end_rep: 1, completed_at: 'now' }],
  });

  expect(summarizeSet(workout, workout.set_ranges![0])).toBe(
    'Set 1 complete. 1 arm rep. No technique cues detected.',
  );
});

it('maps newer-exercise fault codes to set and session focus phrases', () => {
  const workout = session({
    exercise: 'deadlift' as ExerciseId,
    total_reps: 2,
    reps: [
      { rep_number: 1, completed_at: 'now', metrics_json: {}, faults_json: [fault('insufficient_hinge')] },
      { rep_number: 2, completed_at: 'now', metrics_json: {}, faults_json: [fault('insufficient_hinge')] },
    ],
    set_ranges: [{ set_number: 1, start_rep: 1, end_rep: 2, completed_at: 'now' }],
  });

  const setSummary = summarizeSet(workout, workout.set_ranges![0]);
  expect(setSummary).toBe(
    'Set 1 complete. 2 reps. 2 technique cues. Hinge deeper at the hips next set.',
  );
  expect(setSummary.length).toBeLessThanOrEqual(160);
  expect(summarizeSession(workout)).toBe(
    'Session complete. 2 reps across 1 set. 2 technique cues. Focus on a deeper hip hinge next session.',
  );
});
