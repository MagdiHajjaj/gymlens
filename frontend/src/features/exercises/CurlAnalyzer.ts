import { MovementAnalyzer, type ExerciseAnalyzer } from './ExerciseAnalyzer';
import type { ExerciseResult, PoseFrame } from '../../types/workout';

type CurlRep = { metrics: Record<string, number>; faults: ExerciseResult['faults'] };

/** Each arm has its own calibration and cycle; one arm never borrows the other's state. */
export class CurlAnalyzer implements ExerciseAnalyzer {
  readonly id = 'curl' as const;
  private analyzers: MovementAnalyzer[];
  constructor(preCalibrated = false) {
    this.analyzers = [
      new MovementAnalyzer('curl', {}, 0, preCalibrated),
      new MovementAnalyzer('curl', {}, 1, preCalibrated),
    ];
  }
  private lastSeen = [-Infinity, -Infinity];
  private pending: { side: number; rep: CurlRep }[] = [];
  reset() {
    this.analyzers.forEach((analyzer) => analyzer.reset());
    this.lastSeen = [-Infinity, -Infinity];
    this.pending = [];
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
      if (this.lastSeen[side] > -Infinity && frame.timestampMs - this.lastSeen[side] > 200)
        analyzer.reset();
      if (visible) this.lastSeen[side] = frame.timestampMs;
      return analyzer.analyze(frame);
    });
    const visible = results.filter((r) => r.trackingValid);
    const focus = visible.find((r) => r.phase !== 'ready') ?? visible[0] ?? results[0];
    results.forEach((r, side) => {
      if (r.repCompleted)
        this.pending.push({
          side,
          rep: { metrics: { ...r.repMetrics, arm_side: side }, faults: r.faults },
        });
    });
    const completedReps: CurlRep[] = [];
    let leftIndex = this.pending.findIndex((rep) => rep.side === 0);
    let rightIndex = this.pending.findIndex((rep) => rep.side === 1);
    while (leftIndex >= 0 && rightIndex >= 0) {
      const left = this.pending[leftIndex];
      const right = this.pending[rightIndex];
      const keys = new Set([...Object.keys(left.rep.metrics), ...Object.keys(right.rep.metrics)]);
      const metrics = Object.fromEntries(
        [...keys]
          .filter((key) => key !== 'arm_side')
          .map((key) => [key, ((left.rep.metrics[key] ?? 0) + (right.rep.metrics[key] ?? 0)) / 2]),
      );
      const faults = [
        ...new Map([...left.rep.faults, ...right.rep.faults].map((item) => [item.code, item])).values(),
      ];
      completedReps.push({ metrics: { ...metrics, arm_side: 2 }, faults });
      this.pending = this.pending.filter((_, index) => index !== leftIndex && index !== rightIndex);
      leftIndex = this.pending.findIndex((rep) => rep.side === 0);
      rightIndex = this.pending.findIndex((rep) => rep.side === 1);
    }
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
    const bothArmsReady = results.every((r) => r.trackingValid && r.calibrated);
    return {
      ...focus,
      jointAngles,
      faults,
      trackingValid: visible.length > 0,
      calibrated: bothArmsReady,
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
          : visible.length < 2
            ? 'Keep both arms in frame. One-arm curls do not count until both arms complete a rep.'
            : !bothArmsReady
              ? focus.guidance || 'Lower both arms and pause for a second to start clean.'
              : 'Both arms are tracked. Curl together or alternate, then lower each arm to finish the rep.',
    };
  }
}
