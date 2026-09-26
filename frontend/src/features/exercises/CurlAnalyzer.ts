import { MovementAnalyzer, type ExerciseAnalyzer } from './ExerciseAnalyzer';
import type { ExerciseResult, PoseFrame } from '../../types/workout';

const PAIR_WINDOW_MS = 250;
type CurlRep = { metrics: Record<string, number>; faults: ExerciseResult['faults'] };

/** Each arm has its own calibration and cycle; one arm never borrows the other's state. */
export class CurlAnalyzer implements ExerciseAnalyzer {
  readonly id = 'curl' as const;
  private analyzers = [new MovementAnalyzer('curl', {}, 0), new MovementAnalyzer('curl', {}, 1)];
  private lastSeen = [-Infinity, -Infinity];
  private pending: { side: number; at: number; rep: CurlRep }[] = [];
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
      if (frame.timestampMs - this.lastSeen[side] > 200) analyzer.reset();
      if (visible) this.lastSeen[side] = frame.timestampMs;
      return analyzer.analyze(frame);
    });
    const visible = results.filter((r) => r.trackingValid);
    const focus = visible.find((r) => r.phase !== 'ready') ?? visible[0] ?? results[0];
    results.forEach((r, side) => {
      if (r.repCompleted)
        this.pending.push({
          side,
          at: frame.timestampMs,
          rep: { metrics: { ...r.repMetrics, arm_side: side }, faults: r.faults },
        });
    });
    const completedReps: CurlRep[] = [];
    const left = this.pending.find((rep) => rep.side === 0);
    const right = this.pending.find((rep) => rep.side === 1);
    if (left && right && Math.abs(left.at - right.at) <= PAIR_WINDOW_MS) {
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
      this.pending = this.pending.filter((rep) => rep !== left && rep !== right);
    }
    const ready = this.pending.filter((rep) => frame.timestampMs - rep.at > PAIR_WINDOW_MS);
    completedReps.push(...ready.map((rep) => rep.rep));
    this.pending = this.pending.filter((rep) => !ready.includes(rep));
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
