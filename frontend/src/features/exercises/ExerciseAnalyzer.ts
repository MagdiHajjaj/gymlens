import type { ExerciseId, ExerciseResult, FormFault, PoseFrame } from '../../types/workout';
import { inclination, jointAngle, jointAngle3D } from '../../lib/biomechanics/angles';
import { Smoother } from '../../lib/biomechanics/smoothing';
export interface ExerciseAnalyzer {
  readonly id: ExerciseId;
  reset(): void;
  analyze(frame: PoseFrame): ExerciseResult;
}
export interface Thresholds {
  visibility: number;
  enter: number;
  exit: number;
  depth: number;
  minimumRange: number;
  reversal: number;
  minimumMs: number;
  maximumMs: number;
  calibrationMs: number;
  maximumLean: number;
  maximumArmSwing: number;
  minimumHipAlignment: number;
}
const defaults: Record<ExerciseId, Thresholds> = {
  squat: {
    visibility: 0.6,
    enter: 150,
    exit: 165,
    depth: 105,
    minimumRange: 25,
    reversal: 8,
    minimumMs: 800,
    maximumMs: 15000,
    calibrationMs: 600,
    maximumLean: 45,
    maximumArmSwing: 25,
    minimumHipAlignment: 155,
  },
  curl: {
    visibility: 0.6,
    enter: 140,
    exit: 150,
    depth: 65,
    minimumRange: 35,
    reversal: 8,
    minimumMs: 700,
    maximumMs: 15000,
    calibrationMs: 600,
    maximumLean: 45,
    maximumArmSwing: 25,
    minimumHipAlignment: 155,
  },
  pushup: {
    visibility: 0.6,
    enter: 145,
    exit: 160,
    depth: 95,
    minimumRange: 35,
    reversal: 8,
    minimumMs: 800,
    maximumMs: 15000,
    calibrationMs: 600,
    maximumLean: 45,
    maximumArmSwing: 25,
    minimumHipAlignment: 155,
  },
};
const fault = (code: string, message: string): FormFault => ({ code, message, severity: 'warning' });
export class MovementAnalyzer implements ExerciseAnalyzer {
  readonly config: Thresholds;
  private smoother = new Smoother();
  private previousTime = -1;
  private side = -1;
  private sideLostSince = -1;
  private readySince = -1;
  private armed = false;
  private phase: ExerciseResult['phase'] = 'ready';
  private started = 0;
  private minimum = 180;
  private maximumLean = 0;
  private cycleFaults = new Map<string, FormFault>();
  constructor(
    readonly id: ExerciseId,
    options: Partial<Thresholds> = {},
    private readonly fixedSide?: number,
  ) {
    this.config = { ...defaults[id], ...options };
  }
  reset() {
    this.smoother.reset();
    this.previousTime = -1;
    this.side = -1;
    this.sideLostSince = -1;
    this.readySince = -1;
    this.armed = false;
    this.phase = 'ready';
    this.minimum = 180;
    this.maximumLean = 0;
    this.cycleFaults.clear();
  }
  analyze(frame: PoseFrame): ExerciseResult {
    const empty = (guidance: string): ExerciseResult => ({
      phase: 'ready',
      trackingValid: false,
      calibrated: false,
      repCompleted: false,
      jointAngles: {},
      faults: [],
      guidance,
    });
    const l = frame.landmarks;
    const indices =
      this.id === 'squat' ? [11, 23, 25, 27] : this.id === 'curl' ? [11, 13, 15] : [11, 13, 15, 23, 27];
    const confidence = (offset: number) =>
      this.fixedSide !== undefined && offset !== this.fixedSide
        ? 0
        : Math.min(
            ...indices.map((i) => {
              const p = l[i + offset];
              return p &&
                [p.x, p.y, p.z].every(Number.isFinite) &&
                p.x >= 0 &&
                p.x <= 1 &&
                p.y >= 0 &&
                p.y <= 1
                ? (p.visibility ?? 0)
                : 0;
            }),
          );
    if (
      !Number.isFinite(frame.timestampMs) ||
      Math.max(confidence(0), confidence(1)) < this.config.visibility
    ) {
      const previousSide = this.side;
      const lostSince = this.sideLostSince < 0 ? frame.timestampMs : this.sideLostSince;
      this.reset();
      if (frame.timestampMs - lostSince < 350) {
        this.side = previousSide;
        this.sideLostSince = lostSince;
      }
      return empty(
        this.id === 'curl'
          ? 'Keep your shoulder, elbow, and wrist in frame. Move the camera back if your hand is cropped.'
          : 'Step back so your full movement is visible.',
      );
    }
    if (this.previousTime >= 0 && frame.timestampMs <= this.previousTime)
      return empty('Waiting for a fresh camera frame.');
    if (this.previousTime >= 0 && frame.timestampMs - this.previousTime > 500) this.reset();
    if (this.side >= 0 && confidence(this.side) < this.config.visibility) {
      const side = this.side;
      const lostSince = this.sideLostSince < 0 ? frame.timestampMs : this.sideLostSince;
      this.reset();
      if (frame.timestampMs - lostSince < 350) {
        this.side = side;
        this.sideLostSince = lostSince;
        return empty('Keep the same arm or leg in view. Reacquiring tracking.');
      }
    }
    this.sideLostSince = -1;
    if (this.side < 0) this.side = confidence(0) >= confidence(1) ? 0 : 1;
    const p = (i: number) => l[i + this.side];
    const aspect = frame.aspectRatio ?? 1;
    const hipVisible =
      p(23) &&
      (p(23).visibility ?? 0) >= this.config.visibility &&
      [p(23).x, p(23).y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
    const torso = hipVisible ? Math.hypot((p(11).x - p(23).x) * aspect, p(11).y - p(23).y) : 0;
    if (
      this.id !== 'curl' &&
      (torso < 0.04 ||
        ((l[11]?.visibility ?? 0) > 0.6 &&
          (l[12]?.visibility ?? 0) > 0.6 &&
          Math.abs(l[11].x - l[12].x) * aspect > torso * 0.65))
    ) {
      this.reset();
      return empty('Turn side-on to the camera for this exercise.');
    }
    let angle =
      this.id === 'squat' ? jointAngle(p(23), p(25), p(27), aspect) : jointAngle(p(11), p(13), p(15), aspect);
    if (this.id === 'curl' && frame.worldLandmarks) {
      const world = [11, 13, 15].map((i) => frame.worldLandmarks![i + this.side]);
      if (world.every((point) => point && [point.x, point.y, point.z].every(Number.isFinite))) {
        const spatial = jointAngle3D(world[0], world[1], world[2]);
        if (Number.isFinite(spatial)) angle = spatial;
      }
    }
    const alignment =
      this.id === 'pushup'
        ? jointAngle(p(11), p(23), p(27), aspect)
        : hipVisible
          ? inclination(p(11), p(23), aspect)
          : 0;
    if (!Number.isFinite(angle) || !Number.isFinite(alignment)) {
      this.reset();
      return empty('Move into clear view of the camera.');
    }
    const dt = this.previousTime < 0 ? 100 : frame.timestampMs - this.previousTime;
    this.previousTime = frame.timestampMs;
    const value = this.smoother.update('primary', angle, dt);
    const torsoAngle = this.smoother.update('alignment', alignment, dt);
    const angles: Record<string, number> = {
      [this.id === 'squat' ? 'knee_angle' : 'elbow_angle']: Math.round(value),
      [this.id === 'pushup' ? 'hip_alignment' : 'torso_lean']: Math.round(torsoAngle),
    };
    if (this.id === 'curl' && !hipVisible) delete angles.torso_lean;
    if (this.id === 'curl' && hipVisible)
      angles.upper_arm_angle = Math.round(
        this.smoother.update('arm', jointAngle(p(23), p(11), p(13), aspect), dt),
      );
    const result: ExerciseResult = {
      phase: this.phase,
      trackingValid: true,
      calibrated: this.armed,
      repCompleted: false,
      jointAngles: angles,
      faults: [],
      guidance: 'Hold your starting position to calibrate.',
      trackedSide: this.side,
    };
    if (!this.armed) {
      if (value >= this.config.exit) {
        if (this.readySince < 0) this.readySince = frame.timestampMs;
        if (frame.timestampMs - this.readySince >= this.config.calibrationMs) this.armed = true;
      } else this.readySince = -1;
      result.calibrated = this.armed;
      result.guidance = this.armed
        ? 'Ready. Move at a comfortable, controlled pace.'
        : this.id === 'curl'
          ? 'Lower your hand until your arm is comfortably straight. Hold briefly to start.'
          : this.id === 'pushup'
            ? 'Hold a side-on plank with arms extended.'
            : 'Stand side-on with your joints extended.';
      return result;
    }
    result.guidance = 'Keep your movement steady and controlled.';
    if (this.phase === 'ready' && value < this.config.enter) {
      this.phase = 'eccentric';
      this.started = frame.timestampMs;
      this.minimum = value;
      this.maximumLean = 0;
      this.cycleFaults.clear();
    }
    if (this.phase !== 'ready') {
      this.minimum = Math.min(this.minimum, value);
      this.maximumLean = Math.max(this.maximumLean, torsoAngle);
      if (this.id === 'squat' && torsoAngle > this.config.maximumLean)
        result.faults.push(fault('excessive_forward_lean', 'Keep your chest a little more upright.'));
      if (this.id === 'curl' && angles.upper_arm_angle > this.config.maximumArmSwing)
        result.faults.push(fault('upper_arm_movement', 'Keep your upper arm close to your side.'));
      if (this.id === 'pushup' && torsoAngle < this.config.minimumHipAlignment)
        result.faults.push(fault('hip_alignment', 'Keep your shoulders, hips, and ankles in line.'));
      for (const f of result.faults) this.cycleFaults.set(f.code, f);
      if (value > this.minimum + this.config.reversal) this.phase = 'concentric';
      if (frame.timestampMs - this.started > this.config.maximumMs) {
        this.reset();
        return empty('Reset your starting position before your next rep.');
      }
      if (this.phase === 'concentric' && value >= this.config.exit) {
        result.repCompleted =
          frame.timestampMs - this.started >= this.config.minimumMs &&
          this.minimum <= this.config.exit - this.config.minimumRange;
        if (result.repCompleted) {
          if (this.minimum > this.config.depth) {
            const f = fault(
              this.id === 'squat' ? 'insufficient_depth' : 'limited_range',
              this.id === 'squat'
                ? 'Try a little more depth within your comfortable range.'
                : 'Try a fuller range of motion at a comfortable pace.',
            );
            this.cycleFaults.set(f.code, f);
          }
          result.faults = [...this.cycleFaults.values()];
          result.repMetrics = {
            min_angle: Math.round(this.minimum),
            duration_ms: Math.round(frame.timestampMs - this.started),
            ...(this.id === 'squat' ? { max_torso_lean: Math.round(this.maximumLean) } : {}),
          };
        }
        this.phase = 'ready';
      }
    }
    result.phase = this.phase;
    if (this.id === 'curl')
      result.guidance =
        this.phase === 'ready' || (this.phase === 'eccentric' && this.minimum > this.config.depth)
          ? 'Curl your hand toward your shoulder. Keep your elbow steady.'
          : 'Lower your hand back to a comfortably straight arm to finish the rep.';
    return result;
  }
}
