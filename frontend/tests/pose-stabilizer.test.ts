import { describe, expect, it } from 'vitest';
import { PoseStabilizer } from '../src/features/pose/PoseStabilizer';
import type { PoseFrame } from '../src/types/workout';

const frame = (timestampMs: number): PoseFrame => ({
  timestampMs,
  landmarks: Array.from({ length: 33 }, (_, i) => ({
    x: i % 2 ? 0.3 : 0.7,
    y: 0.2 + i * 0.015,
    z: 0,
    visibility: 0.9,
  })),
});
describe('pose stabilization', () => {
  it('smooths jitter while following sustained motion', () => {
    const tracker = new PoseStabilizer();
    tracker.update(frame(0));
    const moved = frame(50);
    moved.landmarks[15].x += 0.04;
    const filtered = tracker.update(moved).landmarks[15];
    expect(filtered.x).toBeGreaterThan(0.3);
    expect(filtered.x).toBeLessThan(0.34);
    for (let t = 100; t < 500; t += 50) {
      tracker.update({ ...moved, timestampMs: t });
      tracker.render(t);
    }
    expect(tracker.render(500)[15].x).toBeCloseTo(0.34, 2);
  });
  it('rejects one-frame teleports instead of drawing a detached wrist', () => {
    const tracker = new PoseStabilizer();
    tracker.update(frame(0));
    const jump = frame(50);
    jump.landmarks[15].x = 0.95;
    expect(tracker.update(jump).landmarks[15].visibility).toBe(0);
    expect(tracker.render(50)[15].x).toBeCloseTo(0.3);
    expect(tracker.update(frame(100)).landmarks[15].x).toBeCloseTo(0.3);
  });
  it('fades brief missing detections without feeding stale positions into counting', () => {
    const tracker = new PoseStabilizer();
    tracker.update(frame(0));
    const result = tracker.update({ timestampMs: 50, landmarks: [] });
    expect(result.landmarks.every((p) => p.visibility === 0)).toBe(true);
    expect(tracker.render(100)[15].visibility).toBeGreaterThan(0);
    expect(tracker.render(250)[15].visibility).toBe(0);
  });
  it('maintains spatial identity when the detector swaps left/right labels', () => {
    const tracker = new PoseStabilizer();
    tracker.update(frame(0));
    const swapped = frame(50);
    for (let i = 11; i < 33; i += 2) {
      [swapped.landmarks[i], swapped.landmarks[i + 1]] = [swapped.landmarks[i + 1], swapped.landmarks[i]];
    }
    expect(tracker.update(swapped).landmarks[15].x).toBeCloseTo(0.3);
  });
  it('does not mirror the skeleton for a front-facing curl when the wrists cross', () => {
    const tracker = new PoseStabilizer();
    const start = frame(0);
    for (let i = 11; i < 33; i += 2) {
      start.landmarks[i].x = 0.49;
      start.landmarks[i + 1].x = 0.51;
      start.landmarks[i].y = 0.2 + i * 0.014;
      start.landmarks[i + 1].y = 0.22 + i * 0.014;
    }
    tracker.update(start);
    const crossed = frame(50);
    for (let i = 11; i < 33; i += 2) {
      crossed.landmarks[i].x = 0.51;
      crossed.landmarks[i + 1].x = 0.49;
    }
    const result = tracker.update(crossed).landmarks;
    expect(result[11].x).toBeGreaterThan(0.49);
    expect(result[15].x).toBeGreaterThan(0.49);
    expect(result[12].x).toBeLessThan(0.51);
  });
  it('uses confidence hysteresis and clears old positions after a long gap', () => {
    const tracker = new PoseStabilizer();
    tracker.update(frame(0));
    const uncertain = frame(50);
    uncertain.landmarks[15].visibility = 0.55;
    expect(tracker.update(uncertain).landmarks[15].visibility).toBeGreaterThanOrEqual(0.6);
    tracker.update({ timestampMs: 1000, landmarks: [] });
    expect(tracker.render(1000)[15].visibility).toBe(0);
  });
});
