import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MovementAnalyzer } from '../src/features/exercises/ExerciseAnalyzer';
import { jointAngle } from '../src/lib/biomechanics/angles';
import { FeedbackEngine } from '../src/features/coaching/FeedbackEngine';
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
describe.each<ExerciseId>(['squat', 'curl', 'pushup'])('%s recorded synthetic movement', (id) => {
  it('counts exactly three full cycles, including the shallow cycle with a cue', () => {
    const analyzer = new MovementAnalyzer(id);
    const reps = fixture(id)
      .map((f) => analyzer.analyze(f))
      .filter((r) => r.repCompleted);
    expect(reps).toHaveLength(3);
    expect(reps[0].faults).toEqual([]);
    expect(reps[1].faults.map((f) => f.code)).toContain(
      id === 'squat' ? 'insufficient_depth' : 'limited_range',
    );
    if (id === 'squat') expect(reps[2].faults.map((f) => f.code)).toContain('excessive_forward_lean');
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
it('rejects a front-facing squat during calibration', () => {
  const analyzer = new MovementAnalyzer('squat');
  const frame = structuredClone(fixture('squat')[0]);
  frame.landmarks[12].x = frame.landmarks[11].x + 0.4;
  expect(analyzer.analyze(frame).trackingValid).toBe(false);
});

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
  expect(engine.next(result, 12000)).toBe('Stand tall');
  expect(engine.next({ ...result, trackingValid: false }, 24000)).toBeNull();
});
