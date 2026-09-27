import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MovementAnalyzer } from '../src/features/exercises/ExerciseAnalyzer';
import { createAnalyzer } from '../src/features/exercises/ExerciseRegistry';
import { useWorkout } from '../src/features/workout/workoutStore';
import type { ExerciseId, PoseFrame } from '../src/types/workout';

const fixture = (id: ExerciseId): PoseFrame[] =>
  JSON.parse(readFileSync(new URL(`../public/exercises/${id}.json`, import.meta.url), 'utf-8'));

describe('pre-calibrated session handoff', () => {
  it('reports calibrated on the very first start-position frame', () => {
    const frames = fixture('squat');
    const analyzer = new MovementAnalyzer('squat', {}, undefined, true);
    const first = analyzer.analyze(frames[0]);
    expect(first.trackingValid).toBe(true);
    expect(first.calibrated).toBe(true);
  });

  it('still requires the hold-still calibration without the flag', () => {
    const frames = fixture('squat');
    const analyzer = new MovementAnalyzer('squat');
    const first = analyzer.analyze(frames[0]);
    expect(first.trackingValid).toBe(true);
    // One frame is not enough to satisfy the calibration hold.
    expect(first.calibrated).toBe(false);
  });

  it('counts full rep cycles identically when starting pre-calibrated', () => {
    const frames = fixture('squat');
    const preCalibrated = new MovementAnalyzer('squat', {}, undefined, true);
    const reps = frames.map((frame) => preCalibrated.analyze(frame)).filter((r) => r.repCompleted);
    expect(reps).toHaveLength(3);
  });

  it('carries calibration through createAnalyzer for curl (both arms)', () => {
    const frames = fixture('curl');
    const analyzer = createAnalyzer('curl', true);
    const first = analyzer.analyze(frames[0]);
    expect(first.trackingValid).toBe(true);
    expect(first.calibrated).toBe(true);
  });

  it('createAnalyzer leaves calibration off by default', () => {
    const frames = fixture('squat');
    const analyzer = createAnalyzer('squat');
    expect(analyzer.analyze(frames[0]).calibrated).toBe(false);
  });

  it('re-calibrates after tracking is lost mid-session', () => {
    const frames = fixture('squat');
    const analyzer = new MovementAnalyzer('squat', {}, undefined, true);
    expect(analyzer.analyze(frames[0]).calibrated).toBe(true);
    analyzer.reset();
    // After a reset (e.g. the user walked out of frame) the hold is required again.
    expect(analyzer.analyze(frames[0]).calibrated).toBe(false);
  });
});

describe('workout store preCalibrated flag', () => {
  beforeEach(() => {
    useWorkout.setState({ session: null, selected: 'squat' });
  });

  it('marks camera sessions pre-calibrated and leaves demo/upload unmarked', () => {
    useWorkout.getState().begin('camera', { preCalibrated: true });
    expect(useWorkout.getState().session?.preCalibrated).toBe(true);

    useWorkout.getState().begin('demo');
    expect(useWorkout.getState().session?.preCalibrated).toBe(false);
  });
});
