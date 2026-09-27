import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MovementAnalyzer } from '../src/features/exercises/ExerciseAnalyzer';
import { CurlAnalyzer } from '../src/features/exercises/CurlAnalyzer';
import { jointAngle } from '../src/lib/biomechanics/angles';
import { FeedbackEngine } from '../src/features/coaching/FeedbackEngine';
import { PoseStabilizer } from '../src/features/pose/PoseStabilizer';
import type { ExerciseId, ExerciseResult, PoseFrame } from '../src/types/workout';
const fixture = (id: ExerciseId): PoseFrame[] =>
  JSON.parse(readFileSync(new URL(`../public/exercises/${id}.json`, import.meta.url), 'utf-8'));
describe('joint geometry', () => {
  const p = (x: number, y: number) => ({ x, y, z: 0 });
  it('calculates known angles and rejects degenerate joints', () => {
    expect(jointAngle(p(0, 0), p(0, 1), p(1, 1))).toBeCloseTo(90);
    expect(jointAngle(p(0, 0), p(0, 1), p(0, 2))).toBeCloseTo(180);
    expect(jointAngle(p(0, 0), p(0, 0), p(0, 2))).toBeNaN();
  });
  it('corrects normalized coordinates for the video aspect ratio', () => {
    expect(jointAngle(p(0, 0), p(0, 1), p(0.5, 0), 2)).toBeCloseTo(45);
  });
});
describe.each<ExerciseId>(['squat', 'curl', 'pushup', 'deadlift', 'lunge', 'press', 'glute_bridge', 'row', 'dips', 'pullup'])(
  '%s preserves full-cycle counts through camera position smoothing',
  (id) => {
    it('counts three full cycles via the stabilizer', () => {
      const analyzer = new MovementAnalyzer(id);
      const tracker = new PoseStabilizer();
      const results = fixture(id).map((frame) => analyzer.analyze(tracker.update(frame)));
      expect(results.filter((r) => r.repCompleted)).toHaveLength(id === 'press' ? 2 : 3);
    });
  },
);
describe.each<ExerciseId>(['squat', 'curl', 'pushup', 'deadlift', 'lunge', 'press', 'glute_bridge', 'row', 'dips', 'pullup'])(
  '%s recorded sample movement',
  (id) => {
    const depthFault: Record<ExerciseId, string> = {
      squat: 'insufficient_depth',
      curl: 'limited_range',
      pushup: 'limited_range',
      deadlift: 'insufficient_hinge',
      lunge: 'insufficient_depth',
      press: 'limited_range',
      glute_bridge: 'incomplete_extension',
      row: 'incomplete_pull',
      dips: 'insufficient_depth',
      pullup: 'incomplete_pull',
    };
    const formFault: Partial<Record<ExerciseId, string>> = {
      squat: 'excessive_forward_lean',
      deadlift: 'excessive_back_rounding',
      lunge: 'knee_over_toes',
      press: 'excessive_back_arch',
      glute_bridge: 'excessive_back_arch',
      row: 'torso_rising',
      dips: 'excessive_forward_lean',
      pullup: 'excessive_swing',
    };
    it('counts exactly three full cycles, including the shallow cycle with a cue', () => {
      const analyzer = new MovementAnalyzer(id);
      const reps = fixture(id)
        .map((f) => analyzer.analyze(f))
        .filter((r) => r.repCompleted);
      expect(reps).toHaveLength(id === 'press' ? 2 : 3);
      expect(reps[0].faults).toEqual([]);
      if (id === 'press') {
        expect(reps[1].faults.map((f) => f.code)).toContain(formFault[id]);
      } else {
        expect(reps[1].faults.map((f) => f.code)).toContain(depthFault[id]);
        if (formFault[id]) expect(reps[2].faults.map((f) => f.code)).toContain(formFault[id]);
      }
    });
  it('does not count a partial cycle when starting at the bottom', () => {
    const analyzer = new MovementAnalyzer(id);
    const results = fixture(id)
      .slice(58, 104)
      .map((f) => analyzer.analyze(f));
    expect(results.some((r) => r.repCompleted)).toBe(false);
  });
  it('does not count jitter or motion that is too fast', () => {
    const analyzer = new MovementAnalyzer(id);
    const frames = fixture(id);
    frames.slice(0, 24).forEach((f) => analyzer.analyze(f));
    const short = frames.slice(24, 104).map((f, i) => ({ ...f, timestampMs: 1200 + i * 3 }));
    expect(short.map((f) => analyzer.analyze(f)).some((r) => r.repCompleted)).toBe(false);
    const standing = frames[0];
    const outcomes = Array.from({ length: 100 }, (_, i) =>
      analyzer.analyze({ ...standing, timestampMs: 2000 + i * 50 }),
    );
    expect(outcomes.some((r) => r.repCompleted)).toBe(false);
  });
  it('resets on lost landmarks, missing visibility, and long frame gaps', () => {
    for (const loss of ['hidden', 'missing', 'gap']) {
      const analyzer = new MovementAnalyzer(id),
        frames = fixture(id);
      frames.slice(0, 55).forEach((f) => analyzer.analyze(f));
      let offset = 0;
      if (loss === 'gap') offset = 1000;
      else {
        const landmarks = frames[55].landmarks.map((p) => ({
          ...p,
          visibility: loss === 'hidden' ? 0.1 : undefined,
        }));
        const result = analyzer.analyze({ ...frames[55], landmarks });
        expect(result.trackingValid).toBe(false);
        expect(result.faults).toEqual([]);
      }
      const returned = frames
        .slice(56, 104)
        .map((f) => analyzer.analyze({ ...f, timestampMs: f.timestampMs + offset }));
      expect(returned.some((r) => r.repCompleted)).toBe(false);
    }
  });
});
it('tracks curl cycles with cropped hips and a wider shoulder view', () => {
  const analyzer = new MovementAnalyzer('curl');
  const results = fixture('curl').map((original) => {
    const frame = structuredClone(original);
    frame.landmarks[23].visibility = 0;
    frame.landmarks[24].visibility = 0;
    frame.landmarks[12].x += 0.2;
    frame.landmarks[14].visibility = 0;
    return analyzer.analyze(frame);
  });
  expect(results.filter((r) => r.repCompleted)).toHaveLength(3);
  expect(results.every((r) => r.jointAngles.upper_arm_angle === undefined)).toBe(true);
});

it('keeps the press tracking but waits for rack when only overhead arm joints are visible', () => {
  const analyzer = new MovementAnalyzer('press');
  const results = fixture('press').slice(0, 40).map((original) => {
    const frame = structuredClone(original);
    frame.landmarks[23].visibility = 0;
    frame.landmarks[24].visibility = 0;
    return analyzer.analyze(frame);
  });
  expect(results.every((result) => result.trackingValid)).toBe(true);
  expect(results.at(-1)?.calibrated).toBe(false);
  expect(results.at(-1)?.guidance).toContain('rack position');
});

it('keeps tracking overhead but requires the rack position before calibration', () => {
  const analyzer = new MovementAnalyzer('press');
  const results = fixture('press').slice(0, 40).map((original) => {
    const frame = structuredClone(original);
    frame.landmarks[12].x = frame.landmarks[11].x + 0.2;
    frame.landmarks[14].x = frame.landmarks[13].x + 0.2;
    frame.landmarks[16].x = frame.landmarks[15].x + 0.2;
    return analyzer.analyze(frame);
  });
  expect(results.every((result) => result.trackingValid)).toBe(true);
  expect(results.every((result) => !result.calibrated)).toBe(true);
  expect(results.at(-1)?.guidance).toContain('rack position');
});

it('calibrates overhead press at the rack position and counts an upward press', () => {
  const analyzer = new MovementAnalyzer('press');
  const frames = Array.from({ length: 20 }, (_, index) => {
    const frame = structuredClone(fixture('press')[0]);
    frame.timestampMs = index * 50;
    for (const side of [0, 1]) {
      const shoulder = frame.landmarks[11 + side];
      const elbow = frame.landmarks[13 + side];
      const wrist = frame.landmarks[15 + side];
      elbow.x = shoulder.x;
      elbow.y = shoulder.y + 0.12;
      wrist.x = shoulder.x + 0.12;
      wrist.y = elbow.y;
    }
    return frame;
  });
  const results = frames.map((frame) => analyzer.analyze(frame));
  expect(results.at(-1)?.calibrated).toBe(true);
  expect(results.at(-1)?.guidance).not.toContain('rack position');
});

it('starts counting after the press fixture reaches rack instead of calibrating at lockout', () => {
  const analyzer = new MovementAnalyzer('press', { enter: 120, exit: 150, minimumRange: 30 });
  const reps = fixture('press')
    .map((frame) => analyzer.analyze(frame))
    .filter((result) => result.repCompleted);
  expect(reps).toHaveLength(2);
});

it('counts curls returning to 155 degrees without requiring elbow lockout', () => {
  const analyzer = new MovementAnalyzer('curl');
  const results = fixture('curl').map((original) => {
    const frame = structuredClone(original);
    for (const side of [0, 1]) {
      const shoulder = frame.landmarks[11 + side];
      const elbow = frame.landmarks[13 + side];
      const wrist = frame.landmarks[15 + side];
      if (jointAngle(shoulder, elbow, wrist) > 155) {
        const length = Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y);
        const angle = Math.atan2(shoulder.y - elbow.y, shoulder.x - elbow.x) + (155 * Math.PI) / 180;
        wrist.x = elbow.x + Math.cos(angle) * length;
        wrist.y = elbow.y + Math.sin(angle) * length;
      }
    }
    return analyzer.analyze(frame);
  });
  expect(results.filter((r) => r.repCompleted)).toHaveLength(3);
});

it('calibrates a natural slightly bent curl start and still requires full measured range', () => {
  const analyzer = new MovementAnalyzer('curl');
  const source = fixture('curl');
  const results = source.map((original) => {
    const frame = structuredClone(original);
    for (const side of [0, 1]) {
      const shoulder = frame.landmarks[11 + side];
      const elbow = frame.landmarks[13 + side];
      const wrist = frame.landmarks[15 + side];
      if (jointAngle(shoulder, elbow, wrist) > 145) {
        const length = Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y);
        const direction = Math.atan2(shoulder.y - elbow.y, shoulder.x - elbow.x) + (145 * Math.PI) / 180;
        wrist.x = elbow.x + Math.cos(direction) * length;
        wrist.y = elbow.y + Math.sin(direction) * length;
      }
    }
    return analyzer.analyze(frame);
  });
  expect(results.filter((result) => result.repCompleted)).toHaveLength(3);
});

it('does not switch arms during a brief visibility dropout', () => {
  const analyzer = new MovementAnalyzer('curl');
  const first = fixture('curl')[0];
  const initial = analyzer.analyze(first);
  const side = initial.trackedSide!;
  const missing = structuredClone(first);
  missing.timestampMs += 50;
  missing.landmarks[15 + side].visibility = 0;
  expect(analyzer.analyze(missing).trackingValid).toBe(false);
  expect(analyzer.analyze({ ...first, timestampMs: 100 }).trackedSide).toBe(side);
});

it('rejects a front-facing squat during calibration', () => {
  const analyzer = new MovementAnalyzer('squat');
  const frame = structuredClone(fixture('squat')[0]);
  frame.landmarks[12].x = frame.landmarks[11].x + 0.4;
  expect(analyzer.analyze(frame).trackingValid).toBe(false);
});

it('rejects push-up motion when bicep curls are selected and explains how to correct it', () => {
  const analyzer = new CurlAnalyzer();
  const results = fixture('pushup').map((frame) => analyzer.analyze(frame));
  expect(results.flatMap((result) => result.completedReps ?? [])).toHaveLength(0);
  expect(results.some((result) => result.guidance.includes('push-up position'))).toBe(true);
  expect(results.every((result) => !result.calibrated)).toBe(true);
});

it('does not start a rep from one noisy threshold crossing', () => {
  const analyzer = new MovementAnalyzer('curl');
  const frames = fixture('curl');
  frames.slice(0, 24).forEach((frame) => analyzer.analyze(frame));
  const spike = structuredClone(frames[58]);
  spike.timestampMs = frames[23].timestampMs + 50;
  expect(analyzer.analyze(spike).phase).toBe('ready');
  const standing = structuredClone(frames[0]);
  standing.timestampMs = spike.timestampMs + 50;
  expect(analyzer.analyze(standing).repCompleted).toBe(false);
});

describe.each<ExerciseId>(['squat', 'curl', 'pushup', 'deadlift', 'lunge', 'press', 'glute_bridge', 'row', 'dips', 'pullup'])(
  '%s live measurements',
  (id) => {
    const expected: Record<ExerciseId, string[]> = {
      squat: ['knee_angle', 'torso_lean'],
      curl: ['elbow_angle', 'torso_lean', 'upper_arm_angle'],
      pushup: ['elbow_angle', 'hip_alignment'],
      deadlift: ['hip_angle', 'torso_lean'],
      lunge: ['knee_angle', 'torso_lean'],
      press: ['elbow_angle', 'torso_lean'],
      glute_bridge: ['hip_angle', 'torso_lean'],
      row: ['elbow_angle', 'torso_lean'],
      dips: ['elbow_angle', 'torso_lean'],
      pullup: ['elbow_angle', 'torso_lean'],
    };
    it('reports the configured joint-angle measurements once calibrated', () => {
      const analyzer = new MovementAnalyzer(id);
      const frames = fixture(id);
      let result: ExerciseResult | undefined;
      for (const f of frames.slice(0, 40)) result = analyzer.analyze(f);
      expect(result?.trackingValid).toBe(true);
      expect(result?.calibrated).toBe(id !== 'press');
      expect(Object.keys(result?.jointAngles ?? {}).sort()).toEqual([...expected[id]].sort());
    });
    it('records min angle, max angle, duration, and tempo split for every completed rep', () => {
      const analyzer = new MovementAnalyzer(id);
      const reps = fixture(id)
        .map((f) => analyzer.analyze(f))
        .filter((r) => r.repCompleted);
      expect(reps).toHaveLength(id === 'press' ? 2 : 3);
      for (const rep of reps) {
        expect(rep.repMetrics?.min_angle).toBeGreaterThan(0);
        expect(rep.repMetrics?.duration_ms).toBeGreaterThan(0);
        // max_angle is the top/start position: range of motion is max - min.
        expect(rep.repMetrics?.max_angle).toBeGreaterThan(rep.repMetrics?.min_angle ?? 0);
        // eccentric + concentric should account for the whole rep (within rounding).
        const eccentric = rep.repMetrics?.eccentric_ms ?? 0;
        const concentric = rep.repMetrics?.concentric_ms ?? 0;
        const duration = rep.repMetrics?.duration_ms ?? 0;
        expect(eccentric).toBeGreaterThan(0);
        expect(concentric).toBeGreaterThan(0);
        expect(Math.abs(eccentric + concentric - duration)).toBeLessThanOrEqual(2);
      }
      if (id === 'deadlift') expect(reps[0].repMetrics?.max_torso_lean).toBeGreaterThan(0);
    });
  },
);

it('detects supported curl upper-arm movement and push-up hip alignment cues', () => {
  for (const id of ['curl', 'pushup'] as const) {
    const analyzer = new MovementAnalyzer(id);
    const frames = fixture(id);
    frames.slice(0, 48).forEach((frame) => analyzer.analyze(frame));
    const modified = structuredClone(frames.slice(48, 65));
    for (const frame of modified) {
      if (id === 'curl') {
        frame.landmarks[23].x += 0.25;
        frame.landmarks[24].x += 0.25;
      } else {
        frame.landmarks[23].y += 0.2;
        frame.landmarks[24].y += 0.2;
      }
    }
    const results = modified.map((frame) => analyzer.analyze(frame));
    expect(
      results.some((result) =>
        result.faults.some(
          (fault) => fault.code === (id === 'curl' ? 'upper_arm_movement' : 'hip_alignment'),
        ),
      ),
      `${id} should report its supported form cue`,
    ).toBe(true);
  }
});
it('coaching requires persistence and obeys message cooldowns', () => {
  const engine = new FeedbackEngine();
  const result: ExerciseResult = {
    phase: 'eccentric',
    trackingValid: true,
    calibrated: true,
    repCompleted: false,
    jointAngles: {},
    faults: [{ code: 'lean', message: 'Stand tall', severity: 'warning' }],
    guidance: '',
  };
  expect(engine.next(result, 0)).toBeNull();
  expect(engine.next(result, 500)).toBeNull();
  expect(engine.next(result, 1000)).toBe('Stand tall');
  expect(engine.next(result, 2000)).toBeNull();
  expect(engine.next(result, 12000)).toBe('Reset your position. Stand tall');
  expect(engine.next({ ...result, trackingValid: false }, 24000)).toBeNull();
});
