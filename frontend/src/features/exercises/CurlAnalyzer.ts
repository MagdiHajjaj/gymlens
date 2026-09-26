import { MovementAnalyzer, type ExerciseAnalyzer } from './ExerciseAnalyzer';
import type { ExerciseResult, PoseFrame } from '../../types/workout';

/** Each arm has its own calibration and cycle; one arm never borrows the other's state. */
export class CurlAnalyzer implements ExerciseAnalyzer {
  readonly id = 'curl' as const;
  private analyzers = [new MovementAnalyzer('curl', {}, 0), new MovementAnalyzer('curl', {}, 1)];
  private lastSeen = [-Infinity, -Infinity];
  reset() {
    this.analyzers.forEach((analyzer) => analyzer.reset());
    this.lastSeen = [-Infinity, -Infinity];
  }
  analyze(frame: PoseFrame): ExerciseResult {
    const results = this.analyzers.map((analyzer, side): ExerciseResult => {
      const visible = [11, 13, 15].every((index) => {
        const p = frame.landmarks[index + side];
        return (
          p &&
          (p.visibility ?? 0) >= 0.6 &&
          [p.x, p.y, p.z].every(Number.isFinite) &&
          p.x >= 0 &&
          p.x <= 1 &&
          p.y >= 0 &&
          p.y <= 1
        );
      });
      if (!visible && frame.timestampMs - this.lastSeen[side] <= 200) {
        return {
          phase: 'ready',
          trackingValid: false,
          calibrated: false,
          repCompleted: false,
          jointAngles: {},
          faults: [],
          guidance: 'Reacquiring arm.',
        };
      }
      if (frame.timestampMs - this.lastSeen[side] > 200) analyzer.reset();
      if (visible) this.lastSeen[side] = frame.timestampMs;
      return analyzer.analyze(frame);
    });
    const visible = results.filter((r) => r.trackingValid);
    const focus = visible.find((r) => r.phase !== 'ready') ?? visible[0] ?? results[0];
    const completedReps = results.flatMap((r, side) =>
      r.repCompleted ? [{ metrics: { ...r.repMetrics, arm_side: side }, faults: r.faults }] : [],
    );
    const jointAngles: Record<string, number> = {};
    results.forEach((r, side) => {
      if (r.trackingValid)
        jointAngles[side === 0 ? 'left_elbow_angle' : 'right_elbow_angle'] = r.jointAngles.elbow_angle;
    });
    if (visible.length)
      jointAngles.elbow_angle = Math.round(
        visible.reduce((sum, r) => sum + r.jointAngles.elbow_angle, 0) / visible.length,
      );
    const faults = [
      ...new Map(results.flatMap((r) => r.faults).map((fault) => [fault.code, fault])).values(),
    ];
    return {
      ...focus,
      jointAngles,
      faults,
      trackingValid: visible.length > 0,
      calibrated: visible.some((r) => r.calibrated),
      repCompleted: completedReps.length > 0,
      completedReps,
      arms: results.map((r, side) => ({
        side,
        angle: r.jointAngles.elbow_angle,
        trackingValid: r.trackingValid,
        calibrated: r.calibrated,
        phase: r.phase,
      })),
      guidance:
        visible.length === 0
          ? 'Keep your shoulders and elbows in view so the tracker can see the movement.'
          : !visible.some((r) => r.calibrated)
            ? 'Lower your arms and pause for a second to start clean.'
            : visible.length === 1
              ? 'One arm is visible. Keep both hands in frame to track both sides.'
              : 'Both arms are tracked. Curl together or alternate, then lower each arm to finish the rep.',
    };
  }
}
