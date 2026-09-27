import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createAnalyzer } from '../src/features/exercises/ExerciseRegistry';
import { generateStatisticsInsight, hasDepthDecaySignal } from '../src/features/insights/insightEngine';
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

  it('pluralizes the most-common-cue rep count ("1 rep" vs "N reps")', () => {
    const singleFault = baseSession({
      reps: baseSession().reps.map((rep) =>
        rep.rep_number === 3 ? rep : { ...rep, faults_json: [] },
      ),
    });
    const oneRep = generateStatisticsInsight(singleFault);
    expect(oneRep.recap).toContain('on 1 of 6 reps (');
    expect(oneRep.recap).not.toContain('1 reps');

    const manyFaults = generateStatisticsInsight(baseSession());
    expect(manyFaults.recap).toContain('on 3 of 6 reps (');
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
    expect(insight.evidence.next_focus.why).toContain('4 of 4 reps');
  });

  it.each<ExerciseId>(['squat', 'curl', 'pushup'])(
    'labels %s demo fixture insights as simulated and reports measured fixture numbers',
    (id) => {
      const insight = generateStatisticsInsight(sessionFromFixture(id));

      expect(insight.recap).toMatch(/^Demo video:/);
      const expectedReps = 3;
      expect(insight.stats.totalReps).toBe(expectedReps);
      expect(insight.stats.measuredReps).toBe(expectedReps);
      expect(insight.strengths.join(' ')).toMatch(/\d/);
      expect(insight.evidence.next_focus.why).toMatch(/\d|No specific/);
    },
  );
});

describe('goal-oriented insights', () => {
  it('keeps form goal output identical to the goal-free default', () => {
    const session = baseSession();
    const withForm = generateStatisticsInsight(session, 'form');
    const withoutGoal = generateStatisticsInsight(session);

    expect(withForm.recap).toBe(withoutGoal.recap);
    expect(withForm.strengths).toEqual(withoutGoal.strengths);
    expect(withForm.improvements).toEqual(withoutGoal.improvements);
    expect(withForm.next_focus).toBe(withoutGoal.next_focus);
  });

  it('strength goal leads with progression when reps are clean and consistent', () => {
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
    const insight = generateStatisticsInsight(steady, 'strength');

    expect(insight.goalId).toBe('strength');
    expect(insight.next_focus).toContain('add 1 rep');
    expect(insight.evidence.next_focus.why).toContain('4 of 4 reps');
  });

  it('strength goal keeps the top fault as the next focus, framed as the one priority', () => {
    const insight = generateStatisticsInsight(baseSession(), 'strength');

    // The fault drill is also the first room-to-grow item; the focus must
    // still name the top priority, framed as the single thing to work on
    // rather than demoted to a weaker finding.
    expect(insight.improvements[0]).toContain('slow 3-second descent');
    expect(insight.next_focus).not.toBe(insight.improvements[0]);
    expect(insight.next_focus).toContain('slow 3-second descent');
    expect(insight.next_focus).toMatch(/priority/i);
    expect(insight.evidence.next_focus.why).toContain('3 of 6 reps');
  });

  it('never repeats a room-to-grow finding as the next focus when alternatives exist', () => {
    const goalIds = [undefined, 'form', 'strength', 'consistency', 'weight_loss'] as const;
    for (const goalId of goalIds) {
      const insight = generateStatisticsInsight(baseSession(), goalId);
      expect(insight.improvements).not.toContain(insight.next_focus);
    }
  });

  it('consistency goal focuses on the measured clean streak', () => {
    const insight = generateStatisticsInsight(baseSession(), 'consistency');

    expect(insight.next_focus).toContain('clean streak was 2 of 6');
    expect(insight.evidence.next_focus.why).toContain('Clean on 1–2');
  });

  it('does not tell a fully clean curl session that its clean streak is a weakness', () => {
    const session = baseSession({
      exercise: 'curl',
      total_reps: 4,
      reps: [62, 63, 64, 63].map((min_angle, index) => ({
        rep_number: index + 1,
        completed_at: `2026-01-01T00:00:${10 + index}.000Z`,
        metrics_json: { min_angle, duration_ms: 2000 },
        faults_json: [],
      })),
    });
    const insight = generateStatisticsInsight(session, 'consistency');

    expect(insight.next_focus).toContain('same controlled movement');
    expect(insight.next_focus).not.toContain('extend it');
    expect(insight.strengths.join(' ')).toContain('inside the 45–70° tracker reference');
    expect(insight.evidence.strengths.map((item) => item.why).join(' ')).toContain(
      'smaller angle means more elbow bend',
    );
  });

  it('weight_loss goal cites measured volume without diet or outcome claims', () => {
    const insight = generateStatisticsInsight(baseSession(), 'weight_loss');

    expect(insight.next_focus).toContain('6 squat reps');
    expect(insight.evidence.next_focus.why).toMatch(/\d/);
    expect(insight.next_focus).not.toMatch(/diet|calorie|lose \d|guarantee/i);
    expect(insight.recap).toContain('6 squat reps recorded');
  });

  it('falls back to the measured cue message for fault codes without drill entries', () => {
    const session = baseSession({
      total_reps: 2,
      reps: [1, 2].map((rep_number) => ({
        rep_number,
        completed_at: '2026-01-01T00:00:10.000Z',
        metrics_json: { min_angle: 95, duration_ms: 2000 },
        faults_json: [
          { code: 'brand_new_cue', message: 'Measured cue text.', severity: 'warning' as const },
        ],
      })),
    });
    const insight = generateStatisticsInsight(session, 'strength');

    expect(insight.next_focus).toContain('Measured cue text.');
  });
});

describe('set breakdown honesty', () => {
  it('returns an empty set breakdown when no rep carries set metadata', () => {
    const insight = generateStatisticsInsight(baseSession());
    expect(insight.stats.setBreakdown).toEqual([]);
  });

  it('groups reps by set when set metadata is present', () => {
    const session = baseSession({
      reps: [1, 2, 3].map((rep_number) => ({
        rep_number,
        completed_at: '2026-01-01T00:00:10.000Z',
        metrics_json: { min_angle: 95, duration_ms: 2000, set_number: rep_number <= 2 ? 1 : 2 },
        faults_json: [],
      })),
    });
    const insight = generateStatisticsInsight(session);
    expect(insight.stats.setBreakdown.map((set) => set.setNumber)).toEqual([1, 2]);
    expect(insight.stats.setBreakdown[0]?.reps).toEqual([1, 2]);
  });
});

describe('depth decay signal', () => {
  const flatSession = () =>
    baseSession({
      reps: [92, 92, 92, 92, 92, 92].map((min_angle, index) => ({
        rep_number: index + 1,
        completed_at: '2026-01-01T00:00:10.000Z',
        metrics_json: { min_angle, duration_ms: 2000 },
        faults_json: [],
      })),
    });

  it('treats a 0° change as no signal so the report suppresses the filler chart', () => {
    const insight = generateStatisticsInsight(flatSession());
    expect(insight.stats.depthDecay?.change).toBe(0);
    expect(hasDepthDecaySignal(insight.stats.depthDecay)).toBe(false);
  });

  it('treats a real change as a signal', () => {
    const insight = generateStatisticsInsight(baseSession());
    expect(insight.stats.depthDecay?.change).toBe(19);
    expect(hasDepthDecaySignal(insight.stats.depthDecay)).toBe(true);
  });

  it('treats missing decay data as no signal', () => {
    expect(hasDepthDecaySignal(undefined)).toBe(false);
  });
});

describe('why explanations in plain English', () => {
  it('never leaks internal metric names in why lines', () => {
    for (const goal of [undefined, 'strength', 'form', 'consistency', 'weight_loss'] as const) {
      const insight = generateStatisticsInsight(baseSession(), goal);
      const whys = [
        ...insight.evidence.strengths.map((item) => item.why),
        ...insight.evidence.improvements.map((item) => item.why),
        insight.evidence.next_focus.why,
      ];
      for (const why of whys) {
        expect(why).not.toMatch(/min_angle|duration_ms/);
      }
    }
  });

  it('describes depth fade in plain words', () => {
    const insight = generateStatisticsInsight(baseSession());
    const decay = insight.evidence.improvements.find((item) => item.why.includes('shallower'));
    expect(decay?.why).toContain('19°');
    expect(decay?.why).toContain('averaged 94° at your deepest point');
  });
});

describe('what went well honesty', () => {
  const allFaultedSession = (angles: number[]) =>
    baseSession({
      total_reps: angles.length,
      reps: angles.map((angle, index) => ({
        rep_number: index + 1,
        completed_at: `2026-01-01T00:00:${String(10 + index * 10).padStart(2, '0')}.000Z`,
        metrics_json: { min_angle: angle, duration_ms: 2000 },
        faults_json: [
          { code: 'insufficient_depth', message: 'Try a little more depth.', severity: 'warning' },
        ],
      })),
    });

  it('keeps a zero-clean stat out of the strengths list', () => {
    const insight = generateStatisticsInsight(allFaultedSession([95, 96, 97, 96, 95, 96]));

    expect(insight.stats.cleanReps).toBe(0);
    expect(insight.strengths.join(' ')).not.toMatch(/0 of \d+ reps had no supported technique cue/);
    // the zero stat is still reported neutrally in the recap
    expect(insight.recap).toMatch(/none were clean/);
    // the genuinely positive consistency finding remains
    expect(insight.strengths).toHaveLength(1);
    expect(insight.strengths[0]).toMatch(/stayed consistent/);
  });

  it('celebrates clean reps when they exist', () => {
    const insight = generateStatisticsInsight(baseSession());

    expect(insight.stats.cleanReps).toBe(2);
    expect(insight.strengths.join(' ')).toMatch(/2 of 6 reps had no supported technique cue/);
  });

  it('leaves strengths empty when nothing went well', () => {
    const insight = generateStatisticsInsight(allFaultedSession([80, 110, 90, 100, 85, 105]));

    expect(insight.stats.cleanReps).toBe(0);
    expect(insight.strengths).toEqual([]);
  });
});

describe('evaluation coherence', () => {
  // Mirrors the reported screenshot: 10 curl reps, limited range on every rep,
  // upper-arm movement on a scattered few.
  const screenshotSession = (): WorkoutSession =>
    baseSession({
      exercise: 'curl',
      total_reps: 10,
      reps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rep_number) => ({
        rep_number,
        completed_at: `2026-01-01T00:00:${String(rep_number * 5).padStart(2, '0')}.000Z`,
        metrics_json: { min_angle: 95 + rep_number, duration_ms: 2000 },
        faults_json: [
          { code: 'limited_range', message: 'Limited range of motion.', severity: 'warning' as const },
          ...([5, 7, 8].includes(rep_number)
            ? [{ code: 'upper_arm_movement', message: 'Upper arm moving.', severity: 'warning' as const }]
            : []),
        ],
      })),
    });

  it('keeps the most frequent cue as the next focus instead of a demoted runner-up', () => {
    const insight = generateStatisticsInsight(screenshotSession());

    expect(insight.next_focus).toContain('full comfortable curl path');
    expect(insight.next_focus).not.toContain('Pin your upper arms');
    expect(insight.next_focus).toMatch(/priority/i);
    expect(insight.evidence.next_focus.why).toContain('10 of 10 reps (100%)');
  });

  it('never calls a secondary cue the most frequent one', () => {
    const insight = generateStatisticsInsight(screenshotSession());
    const texts = [insight.next_focus, ...insight.improvements].join(' ');

    expect(texts).not.toMatch(/most frequent cue: Upper arm moving/);
    expect(insight.improvements[0]).toMatch(/most frequent cue: Limited range of motion/);
  });

  it('reserves "throughout" for cues that span the whole session', () => {
    const insight = generateStatisticsInsight(screenshotSession());
    const frequencies = insight.stats.faultFrequencies;
    const limited = frequencies.find((fault) => fault.code === 'limited_range');
    const upperArm = frequencies.find((fault) => fault.code === 'upper_arm_movement');

    expect(limited?.timing).toBe('throughout the session');
    expect(upperArm?.timing).toBe('in the last two-thirds of the session');
  });

  it('compresses full rep lists into ranges', () => {
    const insight = generateStatisticsInsight(screenshotSession());

    expect(insight.evidence.next_focus.why).toContain('on 1–10');
    expect(insight.improvements.join(' ')).not.toContain('1, 2, 3, 4, 5');
  });

  it('cites measured evidence in why lines instead of restating the claim', () => {
    const insight = generateStatisticsInsight(baseSession());
    const clean = insight.evidence.strengths.find((item) =>
      item.text.includes('no supported technique cue'),
    );

    expect(clean?.why).toContain('Clean on 1–2');
    const consistency = insight.evidence.strengths.find((item) =>
      item.text.includes('stayed consistent'),
    );
    // baseSession angles are not consistent enough for this strength; the
    // zero-clean fixture covers the range-based why instead.
    expect(consistency).toBeUndefined();
  });

  it('backs the consistency claim with the measured angle range', () => {
    const steady = baseSession({
      total_reps: 4,
      reps: [95, 96, 97, 96].map((min_angle, index) => ({
        rep_number: index + 1,
        completed_at: `2026-01-01T00:00:${String(10 + index * 10).padStart(2, '0')}.000Z`,
        metrics_json: { min_angle, duration_ms: 2000 },
        faults_json: [],
      })),
    });
    const insight = generateStatisticsInsight(steady);
    const consistency = insight.evidence.strengths.find((item) =>
      item.text.includes('stayed consistent'),
    );

    expect(consistency?.why).toContain('ranged from 95° to 97°');
  });

  it('names the fastest and slowest reps instead of repeating the spread', () => {
    const insight = generateStatisticsInsight(baseSession());
    const tempo = insight.evidence.improvements.find((item) => item.text.includes('steadier tempo'));

    expect(tempo?.why).toContain('Slowest was rep 6');
    expect(tempo?.why).toContain('fastest was rep 1');
  });

  it('contains no invented set or rep prescriptions in drill copy', () => {
    const insight = generateStatisticsInsight(screenshotSession());
    const allCopy = [
      insight.recap,
      ...insight.strengths,
      ...insight.improvements,
      insight.next_focus,
      ...insight.evidence.strengths.map((item) => item.why),
      ...insight.evidence.improvements.map((item) => item.why),
      insight.evidence.next_focus.why,
    ].join(' ');

    expect(allCopy).not.toMatch(/for two sets|for 2 sets/i);
  });
});

describe('formatRepList', () => {
  it('compresses contiguous runs into ranges', async () => {
    const { formatRepList } = await import('../src/features/insights/repList');

    expect(formatRepList([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe('1–10');
    expect(formatRepList([1, 2, 3, 5, 7, 8])).toBe('1–3, 5, 7–8');
    expect(formatRepList([5])).toBe('5');
    expect(formatRepList([])).toBe('');
    expect(formatRepList([8, 5, 7])).toBe('5, 7–8');
  });
});
