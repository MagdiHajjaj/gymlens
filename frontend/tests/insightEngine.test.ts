import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createAnalyzer } from '../src/features/exercises/ExerciseRegistry';
import { generateStatisticsInsight } from '../src/features/insights/insightEngine';
import type { ExerciseId, PoseFrame, WorkoutSession } from '../src/types/workout';

const fixture = (id: ExerciseId): PoseFrame[] =>
  JSON.parse(readFileSync(new URL(`../public/exercises/${id}.json`, import.meta.url), 'utf-8'));

function baseSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'session-1',
    exercise: 'squat',
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: '2026-01-01T00:05:00.000Z',
    total_reps: 6,
    status: 'completed',
    source: 'camera',
    metrics: [],
    reps: [
      {
        rep_number: 1,
        completed_at: '2026-01-01T00:00:10.000Z',
        metrics_json: { min_angle: 92, duration_ms: 1900 },
        faults_json: [],
      },
      {
        rep_number: 2,
        completed_at: '2026-01-01T00:00:20.000Z',
        metrics_json: { min_angle: 96, duration_ms: 2000 },
        faults_json: [],
      },
      {
        rep_number: 3,
        completed_at: '2026-01-01T00:00:30.000Z',
        metrics_json: { min_angle: 101, duration_ms: 2300 },
        faults_json: [
          { code: 'insufficient_depth', message: 'Try a little more depth.', severity: 'warning' },
        ],
      },
      {
        rep_number: 4,
        completed_at: '2026-01-01T00:00:40.000Z',
        metrics_json: { min_angle: 108, duration_ms: 2500 },
        faults_json: [
          { code: 'insufficient_depth', message: 'Try a little more depth.', severity: 'warning' },
        ],
      },
      {
        rep_number: 5,
        completed_at: '2026-01-01T00:00:50.000Z',
        metrics_json: { min_angle: 111, duration_ms: 3300 },
        faults_json: [
          { code: 'insufficient_depth', message: 'Try a little more depth.', severity: 'warning' },
        ],
      },
      {
        rep_number: 6,
        completed_at: '2026-01-01T00:01:00.000Z',
        metrics_json: { min_angle: 114, duration_ms: 3600 },
        faults_json: [
          { code: 'excessive_forward_lean', message: 'Keep your chest upright.', severity: 'warning' },
        ],
      },
    ],
    ...overrides,
  };
}

function sessionFromFixture(id: ExerciseId): WorkoutSession {
  const analyzer = createAnalyzer(id);
  const frames = fixture(id);
  const lastFrame = frames[frames.length - 1];
  if (!lastFrame) throw new Error(`Missing ${id} fixture frames`);
  const started = Date.parse('2026-01-01T00:00:00.000Z');
  const reps: WorkoutSession['reps'] = [];
  const metrics: WorkoutSession['metrics'] = [];
  let lastMetric = -Infinity;
  for (const frame of frames) {
    const result = analyzer.analyze(frame);
    const recorded_at = new Date(started + frame.timestampMs).toISOString();
    if (result.trackingValid && result.calibrated && frame.timestampMs - lastMetric >= 1000) {
      lastMetric = frame.timestampMs;
      metrics.push(
        ...Object.entries(result.jointAngles).map(([metric_name, metric_value]) => ({
          recorded_at,
          metric_name,
          metric_value,
        })),
      );
    }
    const completed =
      result.completedReps ??
      (result.repCompleted ? [{ metrics: result.repMetrics ?? {}, faults: result.faults }] : []);
    reps.push(
      ...completed.map((rep, index) => ({
        rep_number: reps.length + index + 1,
        completed_at: recorded_at,
        metrics_json: rep.metrics,
        faults_json: rep.faults,
      })),
    );
  }
  return {
    id: `${id}-demo`,
    exercise: id,
    started_at: new Date(started).toISOString(),
    ended_at: new Date(started + lastFrame.timestampMs).toISOString(),
    total_reps: reps.length,
    status: 'completed',
    source: 'demo',
    reps,
    metrics,
    local: true,
  };
}

describe('generateStatisticsInsight', () => {
  it('grounds recommendations in fault frequency, clean streaks, decay, and duration spread', () => {
    const insight = generateStatisticsInsight(baseSession());

    expect(insight.source).toBe('statistics');
    expect(insight.recap).toContain('6 squat reps recorded');
    expect(insight.stats.cleanReps).toBe(2);
    expect(insight.stats.longestCleanStreak).toBe(2);
    expect(insight.stats.faultFrequencies[0]).toMatchObject({
      code: 'insufficient_depth',
      count: 3,
      percent: 50,
      reps: [3, 4, 5],
    });
    expect(insight.stats.depthDecay).toMatchObject({ firstAverage: 94, lastAverage: 113, change: 19 });
    expect(insight.improvements.join(' ')).toContain('3 of 6 reps (50%)');
    expect(insight.improvements.join(' ')).toContain('94° → 113°');
    expect(insight.evidence.improvements.every((item) => item.why.match(/\d/))).toBe(true);
  });

  it('uses depth decay as the next focus when cues are clean but range fades', () => {
    const cleanDecay = baseSession({
      reps: baseSession().reps.map((rep) => ({ ...rep, faults_json: [] })),
    });
    const insight = generateStatisticsInsight(cleanDecay);

    expect(insight.next_focus).toContain('pause');
    expect(insight.evidence.next_focus.why).toContain('19°');
  });

  it('offers a progression cue only when measured reps are clean and consistent', () => {
    const steady = baseSession({
      total_reps: 4,
      reps: baseSession()
        .reps.slice(0, 4)
        .map((rep, index) => ({
          ...rep,
          rep_number: index + 1,
          faults_json: [],
          metrics_json: { min_angle: 95 + index, duration_ms: 2000 },
        })),
    });
    const insight = generateStatisticsInsight(steady);

    expect(insight.next_focus).toContain('add 1 rep');
    expect(insight.evidence.next_focus.why).toContain('4/4 reps');
  });

  it.each<ExerciseId>(['squat', 'curl', 'pushup'])(
    'labels %s demo fixture insights as simulated and reports measured fixture numbers',
    (id) => {
      const insight = generateStatisticsInsight(sessionFromFixture(id));

      expect(insight.recap).toMatch(/^Simulated demo movement:/);
      const expectedReps = id === 'curl' ? 6 : 3;
      expect(insight.stats.totalReps).toBe(expectedReps);
      expect(insight.stats.measuredReps).toBe(expectedReps);
      expect(insight.strengths.join(' ')).toMatch(/\d/);
      expect(insight.evidence.next_focus.why).toMatch(/\d|No specific/);
    },
  );
});
