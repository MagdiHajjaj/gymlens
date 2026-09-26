import type { ExerciseId, ExerciseResult, FormFault, PoseFrame } from '../../types/workout';
import { inclination, jointAngle } from '../../lib/biomechanics/angles';
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
    exit: 160,
    depth: 65,
    minimumRange: 45,
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
  ) {
    this.config = { ...defaults[id], ...options };
  }
  reset() {
    this.smoother.reset();
    this.previousTime = -1;
    this.side = -1;
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
      this.id === 'squat' ? [11, 23, 25, 27] : this.id === 'curl' ? [11, 13, 15, 23] : [11, 13, 15, 23, 27];
    const confidence = (offset: number) =>
      Math.min(
        ...indices.map((i) => {
          const p = l[i + offset];
          return p && [p.x, p.y, p.z].every(Number.isFinite) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
            ? (p.visibility ?? 0)
            : 0;
        }),
      );
    if (
      !Number.isFinite(frame.timestampMs) ||
      Math.max(confidence(0), confidence(1)) < this.config.visibility
    ) {
      this.reset();
      return empty('Step back so your full movement is visible.');
    }
    if (this.previousTime >= 0 && frame.timestampMs <= this.previousTime)
      return empty('Waiting for a fresh camera frame.');
    if (this.previousTime >= 0 && frame.timestampMs - this.previousTime > 500) this.reset();
    if (this.side >= 0 && confidence(this.side) < this.config.visibility) this.reset();
    if (this.side < 0) this.side = confidence(0) >= confidence(1) ? 0 : 1;
    const p = (i: number) => l[i + this.side];
    const aspect = frame.aspectRatio ?? 1;
    const torso = Math.hypot((p(11).x - p(23).x) * aspect, p(11).y - p(23).y);
    if (
      torso < 0.04 ||
      ((l[11]?.visibility ?? 0) > 0.6 &&
        (l[12]?.visibility ?? 0) > 0.6 &&
        Math.abs(l[11].x - l[12].x) * aspect > torso * 0.65)
    ) {
      this.reset();
      return empty('Turn side-on to the camera for this exercise.');
    }
    const angle =
      this.id === 'squat' ? jointAngle(p(23), p(25), p(27), aspect) : jointAngle(p(11), p(13), p(15), aspect);
    const alignment =
      this.id === 'pushup' ? jointAngle(p(11), p(23), p(27), aspect) : inclination(p(11), p(23), aspect);
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
    if (this.id === 'curl')
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
    };
    if (!this.armed) {
      if (value >= this.config.exit) {
        if (this.readySince < 0) this.readySince = frame.timestampMs;
        if (frame.timestampMs - this.readySince >= this.config.calibrationMs) this.armed = true;
      } else this.readySince = -1;
      result.calibrated = this.armed;
      result.guidance = this.armed
        ? 'Ready. Move at a comfortable, controlled pace.'
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
    return result;
  }
}
