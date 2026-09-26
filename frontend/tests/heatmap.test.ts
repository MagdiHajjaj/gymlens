import { expect, it } from 'vitest';
import { drawMuscleHeatmap, muscleIntensity } from '../src/features/camera/MuscleHeatmap';
import type { ExerciseResult } from '../src/types/workout';
const result = (angle: number, valid = true): ExerciseResult => ({
  phase: 'ready',
  trackingValid: valid,
  calibrated: false,
  repCompleted: false,
  faults: [],
  guidance: '',
  jointAngles: { elbow_angle: angle },
});
it('shows bend intensity before calibration without implying a completed rep', () => {
  expect(muscleIntensity('curl', result(165))).toBe(0);
  expect(muscleIntensity('curl', result(115))).toBeCloseTo(0.5);
  expect(muscleIntensity('curl', result(65))).toBe(1);
  expect(muscleIntensity('curl', result(20))).toBe(1);
});
it('clears intensity on tracking loss and missing measurements', () => {
  expect(muscleIntensity('curl', result(65, false))).toBe(0);
  expect(muscleIntensity('curl', null)).toBe(0);
  expect(muscleIntensity('curl', result(NaN))).toBe(0);
});

it('uses hip angle for hinge and bridge heat', () => {
  expect(muscleIntensity('deadlift', { ...result(135), jointAngles: { hip_angle: 135 } })).toBeCloseTo(0.5);
  expect(muscleIntensity('glute_bridge', { ...result(135), jointAngles: { hip_angle: 135 } })).toBeCloseTo(0.5);
});

it('draws squat heat on both legs when both knees are visible', () => {
  const calls: string[] = [];
  const ctx = {
    save: () => {},
    translate: () => calls.push('translate'),
    rotate: () => {},
    scale: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillStyle: '',
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    restore: () => {},
  } as unknown as CanvasRenderingContext2D;
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
  landmarks[23] = { x: 0.3, y: 0.7, z: 0, visibility: 0.9 };
  landmarks[25] = { x: 0.35, y: 0.9, z: 0, visibility: 0.9 };
  landmarks[24] = { x: 0.7, y: 0.7, z: 0, visibility: 0.9 };
  landmarks[26] = { x: 0.65, y: 0.9, z: 0, visibility: 0.9 };
  const result: ExerciseResult = {
    phase: 'ready',
    trackingValid: true,
    calibrated: true,
    repCompleted: false,
    faults: [],
    guidance: '',
    jointAngles: { knee_angle: 120 },
    trackedSide: 0,
  };

  drawMuscleHeatmap(ctx, landmarks, 'squat', result, 800, 600);

  expect(calls.filter((call) => call === 'translate')).toHaveLength(4);
});

it('draws the full overhead press arm path instead of only the upper arm', () => {
  const calls: string[] = [];
  const ctx = {
    save: () => {},
    translate: () => calls.push('translate'),
    rotate: () => {},
    scale: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillStyle: '',
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    restore: () => {},
  } as unknown as CanvasRenderingContext2D;
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
  landmarks[11] = { x: 0.45, y: 0.35, z: 0, visibility: 0.9 };
  landmarks[13] = { x: 0.45, y: 0.5, z: 0, visibility: 0.9 };
  landmarks[15] = { x: 0.45, y: 0.65, z: 0, visibility: 0.9 };
  const result: ExerciseResult = {
    phase: 'ready',
    trackingValid: true,
    calibrated: true,
    repCompleted: false,
    faults: [],
    guidance: '',
    jointAngles: { elbow_angle: 110 },
    trackedSide: 0,
  };

  drawMuscleHeatmap(ctx, landmarks, 'press', result, 800, 600);

  expect(calls.filter((call) => call === 'translate')).toHaveLength(2);
});

it.each([
  'squat',
  'curl',
  'pushup',
  'deadlift',
  'lunge',
  'press',
  'glute_bridge',
  'row',
  'dips',
  'pullup',
] as const)('uses visible required joints for %s heat', (exercise) => {
  const calls: string[] = [];
  const ctx = {
    save: () => {},
    translate: () => calls.push('translate'),
    rotate: () => {},
    scale: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillStyle: '',
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    restore: () => {},
  } as unknown as CanvasRenderingContext2D;
  const landmarks = Array.from({ length: 33 }, (_, index) => ({
    x: 0.2 + index * 0.01,
    y: 0.2 + index * 0.01,
    z: 0,
    visibility: 0.9,
  }));
  const result: ExerciseResult = {
    phase: 'ready',
    trackingValid: true,
    calibrated: true,
    repCompleted: false,
    faults: [],
    guidance: '',
    jointAngles: exercise === 'squat' || exercise === 'lunge' ? { knee_angle: 120 } : { elbow_angle: 110 },
    trackedSide: 0,
    arms: exercise === 'curl' ? [{ side: 0, angle: 110, trackingValid: true, calibrated: true, phase: 'ready' }] : undefined,
  };

  drawMuscleHeatmap(ctx, landmarks, exercise, result, 800, 600);

  expect(calls.filter((call) => call === 'translate').length).toBeGreaterThan(0);
});
