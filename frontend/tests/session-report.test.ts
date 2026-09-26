import { describe, expect, it } from 'vitest';
import { buildSessionReport } from '../src/features/insights/sessionReport';
import type { RepEvent, WorkoutSession } from '../src/types/workout';

const rep = (number: number, angle = 90): RepEvent => ({
  rep_number: number,
  completed_at: '2026-09-26T12:00:01Z',
  metrics_json: { min_angle: angle, duration_ms: 2000 },
  faults_json: [],
});
const session = (reps: RepEvent[], overrides: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: 'report-test',
  exercise: 'squat',
  source: 'camera',
  started_at: '2026-09-26T12:00:00Z',
  ended_at: '2026-09-26T12:02:00Z',
  total_reps: reps.length,
  reps,
  metrics: [],
  status: 'completed',
  ...overrides,
});
const ranges = (...pairs: [number, number][]) =>
  pairs.map(([start_rep, end_rep], index) => ({
    set_number: index + 1,
    start_rep,
    end_rep,
    completed_at: '2026-09-26T12:01:00Z',
  }));

describe('session report evidence', () => {
  it('counts a repeated cue once per rep and cites the exact affected reps', () => {
    const cue = { code: 'insufficient_depth', message: 'Depth', severity: 'warning' as const };
    const report = buildSessionReport(
      session([rep(1), { ...rep(2), faults_json: [cue, cue] }, { ...rep(3), faults_json: [cue] }]),
    );
    expect(report.cues[0]).toMatchObject({ count: 2, reps: [2, 3] });
    expect(report.cuedReps).toBe(2);
    expect(report.focus.evidence).toContain('2 of 3 detailed reps');
    expect(report.focus.evidence).toContain('reps 2, 3');
  });

  it('does not turn no cues into a form score or a progression recommendation', () => {
    const report = buildSessionReport(session([rep(1), rep(2), rep(3)]));
    expect(report.focus.title).toBe('Use this session as your baseline');
    expect(report.focus.evidence).toContain('does not establish perfect form');
    expect(report.focus.action).not.toMatch(/add.*rep|increase.*load|calorie|weight loss/i);
  });

  it('does not assess movement when there are no rep details', () => {
    expect(buildSessionReport(session([])).focus.evidence).toContain('No completed reps');
    const report = buildSessionReport(session([], { total_reps: 12 }));
    expect(report.total).toBe(12);
    expect(report.completeDetails).toBe(false);
    expect(report.focus.evidence).toContain('individual details are unavailable');
  });

  it('excludes invalid angles and times and describes incomplete measurements', () => {
    const reps = [rep(1, NaN), rep(2, 181), rep(3, -1), rep(4, 95)];
    reps[0].metrics_json.duration_ms = 0;
    reps[1].metrics_json.duration_ms = Infinity;
    reps[2].metrics_json.duration_ms = -4;
    const report = buildSessionReport(session(reps));
    expect(report.measured).toBe(1);
    expect(report.timed).toBe(1);
    expect(report.focus.title).toBe('Capture more complete measurements');
    expect(report.focus.evidence).toContain('1 include a valid');
  });

  it('does not invent sets or compare angles across unknown set boundaries', () => {
    const report = buildSessionReport(
      session(Array.from({ length: 8 }, (_, index) => rep(index + 1, 80 + index))),
    );
    expect(report.sets).toEqual([]);
    expect(report.groups).toEqual([]);
    expect(report.hasCompleteSets).toBe(false);
  });

  it('keeps angle comparisons within each recorded set', () => {
    const report = buildSessionReport(
      session(
        Array.from({ length: 12 }, (_, index) => rep(index + 1, index < 6 ? 80 : 120)),
        { set_ranges: ranges([1, 6], [7, 12]) },
      ),
    );
    expect(report.hasCompleteSets).toBe(true);
    expect(report.groups.map((group) => group.change?.delta)).toEqual([0, 0]);
    expect(report.groups[1].change?.firstReps).toEqual([7, 8, 9]);
  });

  it('keeps curls separate by arm, including unknown arm metadata', () => {
    const reps = Array.from({ length: 7 }, (_, index) => ({
      ...rep(index + 1, index % 2 ? 120 : 80),
      metrics_json: { ...rep(index + 1).metrics_json, arm_side: index < 6 ? index % 2 : 7 },
    }));
    const report = buildSessionReport(session(reps, { exercise: 'curl', set_ranges: ranges([1, 7]) }));
    expect(report.arms).toEqual({ left: 3, right: 3, both: 0, unknown: 1 });
    expect(report.groups).toHaveLength(2);
    expect(report.groups.every((group) => group.change === undefined)).toBe(true);
  });

  it('requires six valid angles in a group before comparing its endpoints', () => {
    const reps = Array.from({ length: 6 }, (_, index) => rep(index + 1, 90 + index * 2));
    const report = buildSessionReport(session(reps, { set_ranges: ranges([1, 6]) }));
    expect(report.groups[0].change).toEqual({
      first: 92,
      last: 98,
      delta: 6,
      firstReps: [1, 2, 3],
      lastReps: [4, 5, 6],
    });
    delete reps[2].metrics_json.min_angle;
    expect(
      buildSessionReport(session(reps, { set_ranges: ranges([1, 6]) })).groups[0].change,
    ).toBeUndefined();
  });

  it('rejects overlapping set boundaries instead of double-counting reps', () => {
    const report = buildSessionReport(
      session([rep(1), rep(2), rep(3)], { set_ranges: ranges([1, 2], [2, 3]) }),
    );
    expect(report.sets).toEqual([]);
    expect(report.groups).toEqual([]);
  });

  it('does not treat partially grouped reps as a complete set breakdown', () => {
    const report = buildSessionReport(session([rep(1), rep(2), rep(3)], { set_ranges: ranges([1, 2]) }));
    expect(report.sets).toHaveLength(1);
    expect(report.hasCompleteSets).toBe(false);
  });
});

it('keeps bilateral curl measurements distinct from individual arms', () => {
  const reps = Array.from({ length: 8 }, (_, index) => ({
    ...rep(index + 1),
    metrics_json: { ...rep(index + 1).metrics_json, arm_side: index < 6 ? 2 : index - 6 },
  }));
  const report = buildSessionReport(session(reps, { exercise: 'curl', set_ranges: ranges([1, 8]) }));
  expect(report.total).toBe(8);
  expect(report.arms).toEqual({ left: 1, right: 1, both: 6, unknown: 0 });
  const bilateral = report.groups.find((group) => group.label.includes('Both arms'));
  expect(bilateral?.change?.firstReps).toEqual([1, 2, 3]);
  expect(bilateral?.change?.lastReps).toEqual([4, 5, 6]);
});
