import { expect, it } from 'vitest';
import { muscleIntensity } from '../src/features/camera/MuscleHeatmap';
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
