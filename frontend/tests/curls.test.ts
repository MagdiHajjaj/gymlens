import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { CurlAnalyzer } from '../src/features/exercises/CurlAnalyzer';
import { useWorkout } from '../src/features/workout/workoutStore';
import { personBounds } from '../src/features/camera/PersonBox';
import { jointAngle3D } from '../src/lib/biomechanics/angles';
import type { PoseFrame } from '../src/types/workout';
const frames = (): PoseFrame[] =>
  JSON.parse(readFileSync(new URL('../public/exercises/curl.json', import.meta.url), 'utf8'));

it('counts a synchronized two-arm curl once while crediting both arms', () => {
  const analyzer = new CurlAnalyzer();
  useWorkout.getState().select('curl');
  useWorkout.getState().begin('demo');
  for (const frame of frames()) useWorkout.getState().ingest(analyzer.analyze(frame), frame.timestampMs);
  const reps = useWorkout.getState().session!.reps;
  expect(reps).toHaveLength(3);
  expect(reps.every((r) => r.metrics_json.arm_side === 2)).toBe(true);
  expect(reps.map((r) => r.rep_number)).toEqual([1, 2, 3]);
});

it('continues pairing bilateral curls across repeated movement cycles', () => {
  const analyzer = new CurlAnalyzer();
  const sequence = frames();
  const completed = [];
  const cycleDuration = sequence.at(-1)!.timestampMs + 50;
  for (let cycle = 0; cycle < 3; cycle += 1) {
    for (const original of sequence) {
      const frame = structuredClone(original);
      frame.timestampMs += cycle * cycleDuration;
      completed.push(...(analyzer.analyze(frame).completedReps ?? []));
    }
  }
  expect(completed).toHaveLength(9);
  expect(completed.every((rep) => rep.metrics.arm_side === 2)).toBe(true);
});

it('tracks alternating arms without borrowing the other arm cycle', () => {
  const analyzer = new CurlAnalyzer();
  const sequence = frames();
  const completions = [];
  for (const side of [0, 1]) {
    for (const original of sequence) {
      const frame = structuredClone(original);
      frame.timestampMs += side * (sequence.at(-1)!.timestampMs + 50);
      for (const index of [11, 13, 15, 23])
        frame.landmarks[index + (1 - side)] = sequence[0].landmarks[index + (1 - side)];
      completions.push(...analyzer.analyze(frame).completedReps!);
    }
  }
  expect(completions.map((r) => r.metrics.arm_side)).toEqual([2, 2, 2]);
});

it('does not count a complete cycle from only one visible arm', () => {
  const analyzer = new CurlAnalyzer();
  const results = frames().map((frame) => {
    frame.landmarks[16].visibility = 0;
    return analyzer.analyze(frame);
  });
  expect(results.flatMap((r) => r.completedReps ?? [])).toHaveLength(0);
  expect(results.every((r) => !r.arms![1].trackingValid)).toBe(true);
  expect(results.every((r) => !r.calibrated)).toBe(true);
});

it('does not count a one-arm partial movement as a completed rep', () => {
  const analyzer = new CurlAnalyzer();
  const results = frames().slice(0, 40).map((frame) => {
    frame.landmarks[16].visibility = 0;
    return analyzer.analyze(frame);
  });
  expect(results.flatMap((result) => result.completedReps ?? [])).toHaveLength(0);
});

it('tolerates a brief dropout but never counts while an arm is invisible', () => {
  const analyzer = new CurlAnalyzer();
  const results = frames().map((frame, i) => {
    if (i === 55) frame.landmarks[15].visibility = 0;
    return analyzer.analyze(frame);
  });
  expect(results[55].completedReps).toHaveLength(0);
  expect(results.flatMap((r) => r.completedReps!)).toHaveLength(3);
});

it('uses depth to resolve an elbow bend toward the camera', () => {
  expect(jointAngle3D({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBe(90);
  const frame = frames()[0];
  frame.worldLandmarks = structuredClone(frame.landmarks);
  frame.worldLandmarks[11] = { x: 0, y: 1, z: 0 };
  frame.worldLandmarks[13] = { x: 0, y: 0, z: 0 };
  frame.worldLandmarks[15] = { x: 0, y: 0, z: 1 };
  expect(new CurlAnalyzer().analyze(frame).arms![0].angle).toBe(90);
});

it('only draws person bounds around a visible body', () => {
  expect(personBounds([])).toBeNull();
  const box = personBounds(frames()[0].landmarks)!;
  expect(box.left).toBeLessThan(box.right);
  expect(box.top).toBeLessThan(box.bottom);
  expect(box.bottom).toBeLessThanOrEqual(1);
  expect(personBounds(frames()[0].landmarks.map((p) => ({ ...p, visibility: 0 })))).toBeNull();
});
