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
  // Romanian deadlift: primary joint is the hip. Standing hip angle is ~170-175,
  // a full hinge reaches ~90-100. depth 105 flags a shallow hinge; the rep still
  // counts while minimum <= exit - minimumRange (140). maximumLean is a proxy for
  // back rounding: a braced hinge keeps the torso at or above ~parallel, so torso
  // inclination past 80 suggests loss of neutral spine.
  deadlift: {
    visibility: 0.6,
    enter: 150,
    exit: 165,
    depth: 105,
    minimumRange: 25,
    reversal: 8,
    minimumMs: 900,
    maximumMs: 15000,
    calibrationMs: 600,
    maximumLean: 80,
    maximumArmSwing: 25,
    minimumHipAlignment: 155,
  },
  // Lunge: primary joint is the front knee, same ranges as the squat. depth 100
  // flags a shallow lunge. kneeOverToes tolerance is normalized x * aspect: a
  // vertical front shin keeps |knee.x - ankle.x| near zero; 0.06 allows natural
  // forward travel while flagging the knee clearly passing the toes.
  lunge: {
    visibility: 0.6,
    enter: 150,
    exit: 165,
    depth: 100,
    minimumRange: 25,
    reversal: 8,
    minimumMs: 900,
    maximumMs: 15000,
    calibrationMs: 600,
    maximumLean: 40,
    maximumArmSwing: 25,
    minimumHipAlignment: 155,
  },
  // Overhead press: primary joint is the elbow. Calibration pose is arms extended
  // overhead (elbow ~170+), the rack position is ~90. depth 100 flags a shallow
  // press (a full rack bottoms near 85); the rep counts while
  // minimum <= exit - minimumRange (115). maximumLean is a proxy for back arch:
  // a braced press keeps the torso near vertical, so inclination past 30 suggests
  // the ribs flaring and back arching.
  press: {
    visibility: 0.6,
    enter: 140,
    exit: 160,
    depth: 100,
    minimumRange: 45,
    reversal: 8,
    minimumMs: 700,
    maximumMs: 15000,
    calibrationMs: 600,
    maximumLean: 30,
    maximumArmSwing: 25,
    minimumHipAlignment: 155,
  },
  // Glute bridge: primary joint is the hip, calibrated holding the top bridged
  // position (hip ~170+). The bottom rests near ~110. depth 125 flags a shallow
  // lower (minimum > 125); the rep counts while minimum <= exit - minimumRange
  // (140). minimumHipAlignment is reused here as a torso-inclination floor: a
  // braced bridge keeps the torso at ~35 degrees at the top, so inclination
  // dropping below 30 suggests the shoulders dragging toward the hips and the
  // low back overarching (approximate proxy, documented).
  glute_bridge: {
    visibility: 0.6,
    enter: 150,
    exit: 165,
    depth: 125,
    minimumRange: 25,
    reversal: 8,
    minimumMs: 900,
    maximumMs: 15000,
    calibrationMs: 600,
    maximumLean: 45,
    maximumArmSwing: 25,
    minimumHipAlignment: 30,
  },
  // Bent-over row: primary joint is the elbow. Calibration is arms hanging
  // extended (~170+) from a ~45-degree hinge. A full pull reaches ~65; depth 100
  // flags a short pull. minimumHipAlignment is reused as a torso-inclination
  // floor: the hinge holds ~45 degrees, so inclination dropping below 30 means
  // the lifter is standing up to muscle the weight (approximate momentum proxy).
  row: {
    visibility: 0.6,
    enter: 140,
    exit: 160,
    depth: 100,
    minimumRange: 45,
    reversal: 8,
    minimumMs: 800,
    maximumMs: 15000,
    calibrationMs: 600,
    maximumLean: 45,
    maximumArmSwing: 25,
    minimumHipAlignment: 30,
  },
  // Tricep dips: primary joint is the elbow, calibrated in the top support
  // position (~168). A full dip reaches ~80; depth 100 flags a shallow dip.
  // maximumLean is a proxy for pitching forward: the torso hangs near vertical
  // (~8 degrees), so inclination past 35 suggests leaning over the hands.
  dips: {
    visibility: 0.6,
    enter: 145,
    exit: 160,
    depth: 100,
    minimumRange: 35,
    reversal: 8,
    minimumMs: 800,
    maximumMs: 15000,
    calibrationMs: 600,
    maximumLean: 35,
    maximumArmSwing: 25,
    minimumHipAlignment: 155,
  },
  // Pull-up: primary joint is the elbow, calibrated in a dead hang (~180). A
  // full pull reaches ~60; depth 70 flags chin-not-over-bar. maximumLean is a
  // proxy for swinging: a still hang keeps the torso near vertical (~2 degrees),
  // so inclination past 25 suggests kipping/swinging (approximate proxy --
  // true oscillation would need time-series analysis).
  pullup: {
    visibility: 0.6,
    enter: 140,
    exit: 160,
    depth: 70,
    minimumRange: 60,
    reversal: 8,
    minimumMs: 800,
    maximumMs: 15000,
    calibrationMs: 600,
    maximumLean: 25,
    maximumArmSwing: 25,
    minimumHipAlignment: 155,
  },
};
export type CycleFaultCheck =
  // smoothed alignment value exceeds maximumLean
  | { kind: 'alignmentExceeds'; code: string; message: string }
  // smoothed alignment value drops below minimumHipAlignment
  | { kind: 'alignmentBelow'; code: string; message: string }
  // a named extra angle exceeds maximumArmSwing
  | { kind: 'extraAngleExceeds'; code: string; message: string; angle: string }
  // |knee.x - ankle.x| * aspect exceeds tolerance (side-view shin tracking)
  | { kind: 'kneeOverToes'; code: string; message: string; knee: number; ankle: number; tolerance: number };
export interface ExerciseConfig {
  landmarks: number[];
  primaryJoints: [number, number, number];
  /** when true, refine the 2D primary angle with world-landmark 3D angle if available */
  refinePrimary3D?: boolean;
  alignment: { mode: 'inclination'; joints: [number, number] } | { mode: 'hipAngle'; joints: [number, number, number] };
  angleNames: { primary: string; alignment: string };
  extraAngles: { name: string; joints: [number, number, number]; smoothKey: string; requiresHip?: boolean }[];
  calibrationGuidance: string;
  cycleFaults: CycleFaultCheck[];
  depthFault: { code: string; message: string };
  trackMaxLean: boolean;
}
const configs: Record<ExerciseId, ExerciseConfig> = {
  squat: {
    landmarks: [11, 23, 25, 27],
    primaryJoints: [23, 25, 27],
    alignment: { mode: 'inclination', joints: [11, 23] },
    angleNames: { primary: 'knee_angle', alignment: 'torso_lean' },
    extraAngles: [],
    calibrationGuidance: 'Stand side-on with your joints extended.',
    cycleFaults: [
      {
        kind: 'alignmentExceeds',
        code: 'excessive_forward_lean',
        message: 'Keep your chest a little more upright.',
      },
    ],
    depthFault: {
      code: 'insufficient_depth',
      message: 'Try a little more depth within your comfortable range.',
    },
    trackMaxLean: true,
  },
  curl: {
    landmarks: [11, 13, 15],
    primaryJoints: [11, 13, 15],
    refinePrimary3D: true,
    alignment: { mode: 'inclination', joints: [11, 23] },
    angleNames: { primary: 'elbow_angle', alignment: 'torso_lean' },
    extraAngles: [{ name: 'upper_arm_angle', joints: [23, 11, 13], smoothKey: 'arm', requiresHip: true }],
    calibrationGuidance: 'Lower your hand until your arm is comfortably straight. Hold briefly to start.',
    cycleFaults: [
      {
        kind: 'extraAngleExceeds',
        code: 'upper_arm_movement',
        message: 'Keep your upper arm close to your side.',
        angle: 'upper_arm_angle',
      },
    ],
    depthFault: {
      code: 'limited_range',
      message: 'Try a fuller range of motion at a comfortable pace.',
    },
    trackMaxLean: false,
  },
  pushup: {
    landmarks: [11, 13, 15, 23, 27],
    primaryJoints: [11, 13, 15],
    alignment: { mode: 'hipAngle', joints: [11, 23, 27] },
    angleNames: { primary: 'elbow_angle', alignment: 'hip_alignment' },
    extraAngles: [],
    calibrationGuidance: 'Hold a side-on plank with arms extended.',
    cycleFaults: [
      {
        kind: 'alignmentBelow',
        code: 'hip_alignment',
        message: 'Keep your shoulders, hips, and ankles in line.',
      },
    ],
    depthFault: {
      code: 'limited_range',
      message: 'Try a fuller range of motion at a comfortable pace.',
    },
    trackMaxLean: false,
  },
  deadlift: {
    landmarks: [11, 23, 25, 27],
    primaryJoints: [11, 23, 25],
    alignment: { mode: 'inclination', joints: [11, 23] },
    angleNames: { primary: 'hip_angle', alignment: 'torso_lean' },
    extraAngles: [],
    calibrationGuidance: 'Stand side-on, then hinge at the hips with a flat back.',
    cycleFaults: [
      {
        kind: 'alignmentExceeds',
        code: 'excessive_back_rounding',
        message: 'Keep your back flat — hinge at the hips, chest proud.',
      },
    ],
    depthFault: {
      code: 'insufficient_hinge',
      message: 'Hinge deeper at the hips within your comfortable range.',
    },
    trackMaxLean: true,
  },
  lunge: {
    landmarks: [11, 23, 25, 27],
    primaryJoints: [23, 25, 27],
    alignment: { mode: 'inclination', joints: [11, 23] },
    angleNames: { primary: 'knee_angle', alignment: 'torso_lean' },
    extraAngles: [],
    calibrationGuidance: 'Stand side-on with your joints extended.',
    cycleFaults: [
      {
        kind: 'kneeOverToes',
        code: 'knee_over_toes',
        message: 'Keep your front knee behind your toes.',
        knee: 25,
        ankle: 27,
        tolerance: 0.06,
      },
    ],
    depthFault: {
      code: 'insufficient_depth',
      message: 'Try a little more depth within your comfortable range.',
    },
    trackMaxLean: false,
  },
  press: {
    landmarks: [11, 13, 15, 23],
    primaryJoints: [11, 13, 15],
    alignment: { mode: 'inclination', joints: [11, 23] },
    angleNames: { primary: 'elbow_angle', alignment: 'torso_lean' },
    extraAngles: [],
    calibrationGuidance: 'Stand side-on, arms extended overhead.',
    cycleFaults: [
      {
        kind: 'alignmentExceeds',
        code: 'excessive_back_arch',
        message: "Keep your ribs down — don't arch your back.",
      },
    ],
    depthFault: {
      code: 'limited_range',
      message: 'Try a fuller range of motion at a comfortable pace.',
    },
    trackMaxLean: false,
  },
  glute_bridge: {
    landmarks: [11, 23, 25, 27],
    primaryJoints: [11, 23, 25],
    alignment: { mode: 'inclination', joints: [11, 23] },
    angleNames: { primary: 'hip_angle', alignment: 'torso_lean' },
    extraAngles: [],
    calibrationGuidance: 'Lie on your back and hold the top of your bridge.',
    cycleFaults: [
      {
        kind: 'alignmentBelow',
        code: 'excessive_back_arch',
        message: 'Keep your ribs down — squeeze your glutes, not your low back.',
      },
    ],
    depthFault: {
      code: 'incomplete_extension',
      message: 'Lower your hips all the way down, then drive up to a full bridge.',
    },
    trackMaxLean: true,
  },
  row: {
    landmarks: [11, 13, 15, 23],
    primaryJoints: [11, 13, 15],
    alignment: { mode: 'inclination', joints: [11, 23] },
    angleNames: { primary: 'elbow_angle', alignment: 'torso_lean' },
    extraAngles: [],
    calibrationGuidance: 'Hinge at the hips and let your arms hang. Hold still to calibrate.',
    cycleFaults: [
      {
        kind: 'alignmentBelow',
        code: 'torso_rising',
        message: "Keep your torso still — don't stand up to pull the weight.",
      },
    ],
    depthFault: {
      code: 'incomplete_pull',
      message: 'Pull your elbow all the way up toward your hip.',
    },
    trackMaxLean: false,
  },
  dips: {
    landmarks: [11, 13, 15, 23],
    primaryJoints: [11, 13, 15],
    alignment: { mode: 'inclination', joints: [11, 23] },
    angleNames: { primary: 'elbow_angle', alignment: 'torso_lean' },
    extraAngles: [],
    calibrationGuidance: 'Press up into support with arms extended. Hold still to calibrate.',
    cycleFaults: [
      {
        kind: 'alignmentExceeds',
        code: 'excessive_forward_lean',
        message: "Keep your torso upright — don't pitch forward over your hands.",
      },
    ],
    depthFault: {
      code: 'insufficient_depth',
      message: 'Lower a little deeper within your comfortable range.',
    },
    trackMaxLean: false,
  },
  pullup: {
    landmarks: [11, 13, 15, 23],
    primaryJoints: [11, 13, 15],
    alignment: { mode: 'inclination', joints: [11, 23] },
    angleNames: { primary: 'elbow_angle', alignment: 'torso_lean' },
    extraAngles: [],
    calibrationGuidance: 'Hang from the bar with arms fully extended.',
    cycleFaults: [
      {
        kind: 'alignmentExceeds',
        code: 'excessive_swing',
        message: "Keep your body still — don't swing or kip.",
      },
    ],
    depthFault: {
      code: 'incomplete_pull',
      message: 'Pull all the way up — chin over the bar.',
    },
    trackMaxLean: false,
  },
};
const fault = (code: string, message: string): FormFault => ({ code, message, severity: 'warning' });
export class MovementAnalyzer implements ExerciseAnalyzer {
  private static readonly PHASE_HOLD_MS = 100;
  readonly config: Thresholds;
  private readonly exercise: ExerciseConfig;
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
  private enterSince = -1;
  private reversalSince = -1;
  private exitSince = -1;
  private cycleFaults = new Map<string, FormFault>();
  private pressDirection: 'up' | 'down' | undefined;
  constructor(
    readonly id: ExerciseId,
    options: Partial<Thresholds> = {},
    private readonly fixedSide?: number,
  ) {
    this.config = { ...defaults[id], ...options };
    this.exercise = configs[id];
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
    this.enterSince = -1;
    this.reversalSince = -1;
    this.exitSince = -1;
    this.cycleFaults.clear();
    this.pressDirection = undefined;
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
    const indices = this.exercise.primaryJoints;
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
    const bodyInclination = hipVisible ? inclination(p(11), p(23), aspect) : 0;
    if (
      this.id !== 'curl' &&
      this.id !== 'press' &&
      ((hipVisible && torso < 0.04) ||
      (hipVisible &&
          (l[11]?.visibility ?? 0) > 0.6 &&
          (l[12]?.visibility ?? 0) > 0.6 &&
            Math.abs(l[11].x - l[12].x) * aspect > torso * 0.65))
    ) {
      this.reset();
      return empty('Turn side-on to the camera for this exercise.');
    }
    const [a0, a1, a2] = this.exercise.primaryJoints;
    let angle = jointAngle(p(a0), p(a1), p(a2), aspect);
    if (this.exercise.refinePrimary3D && frame.worldLandmarks) {
      const world = this.exercise.primaryJoints.map((i) => frame.worldLandmarks![i + this.side]);
      if (world.every((point) => point && [point.x, point.y, point.z].every(Number.isFinite))) {
        const spatial = jointAngle3D(world[0], world[1], world[2]);
        if (Number.isFinite(spatial)) angle = spatial;
      }
    }
    const alignment =
      this.exercise.alignment.mode === 'hipAngle'
        ? [
            p(this.exercise.alignment.joints[0]),
            p(this.exercise.alignment.joints[1]),
            p(this.exercise.alignment.joints[2]),
          ].every((point) => point && (point.visibility ?? 0) >= this.config.visibility)
          ? jointAngle(
              p(this.exercise.alignment.joints[0]),
              p(this.exercise.alignment.joints[1]),
              p(this.exercise.alignment.joints[2]),
              aspect,
            )
          : 0
        : hipVisible
          ? inclination(
              p(this.exercise.alignment.joints[0]),
              p(this.exercise.alignment.joints[1]),
              aspect,
            )
          : 0;
    if (!Number.isFinite(angle)) {
      this.reset();
      return empty('Move into clear view of the camera.');
    }
    const wrist = p(15);
    const shoulder = p(11);
    const poseMismatch =
      this.id === 'curl' && hipVisible && alignment > 65
        ? 'This looks more like a push-up position. Stand upright for bicep curls, with your elbows beside your torso.'
        : this.id === 'pushup' && !this.armed && bodyInclination < 50
          ? 'Set up in a horizontal plank for push-ups. Keep your shoulders, hips, and ankles in one line.'
            : !this.armed &&
              ((this.id === 'press' && angle > this.config.enter) || this.id === 'pullup') &&
              wrist.y > shoulder.y - 0.04
            ? this.id === 'press'
              ? 'Raise your hands overhead and straighten your arms to begin the overhead press.'
              : 'Start from a dead hang with your hands above your shoulders.'
            : this.id === 'row' && !this.armed && alignment < 25
              ? 'Hinge forward and hold your torso still before starting the row.'
              : null;
    if (poseMismatch) {
      this.readySince = -1;
      this.armed = false;
      this.phase = 'ready';
      this.enterSince = -1;
      this.reversalSince = -1;
      this.exitSince = -1;
      this.cycleFaults.clear();
      this.previousTime = frame.timestampMs;
      this.smoother.reset();
      return {
        phase: 'ready',
        trackingValid: true,
        calibrated: false,
        repCompleted: false,
        jointAngles: { [this.exercise.angleNames.primary]: Math.round(angle) },
        faults: [],
        guidance: poseMismatch,
        trackedSide: this.side,
      };
    }
    const dt = this.previousTime < 0 ? 100 : frame.timestampMs - this.previousTime;
    this.previousTime = frame.timestampMs;
    const value = this.smoother.update('primary', angle, dt);
    const torsoAngle = this.smoother.update('alignment', alignment, dt);
    const angles: Record<string, number> = {
      [this.exercise.angleNames.primary]: Math.round(value),
      [this.exercise.angleNames.alignment]: Math.round(torsoAngle),
    };
    for (const extra of this.exercise.extraAngles) {
      if (extra.requiresHip && !hipVisible) continue;
      angles[extra.name] = Math.round(
        this.smoother.update(
          extra.smoothKey,
          jointAngle(p(extra.joints[0]), p(extra.joints[1]), p(extra.joints[2]), aspect),
          dt,
        ),
      );
    }
    if (this.exercise.alignment.mode === 'inclination' && !hipVisible)
      delete angles[this.exercise.angleNames.alignment];
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
      const pressRack = this.id === 'press' && value <= this.config.enter;
      const pressOverhead = this.id === 'press' && value >= this.config.exit;
      if (pressRack || pressOverhead || (this.id !== 'press' && value >= this.config.exit)) {
        if (this.readySince < 0) this.readySince = frame.timestampMs;
        if (frame.timestampMs - this.readySince >= this.config.calibrationMs) {
          this.armed = true;
          if (this.id === 'press') this.pressDirection = pressRack ? 'up' : 'down';
        }
      } else this.readySince = -1;
      result.calibrated = this.armed;
      result.guidance = this.armed
        ? 'Ready. Move at a comfortable, controlled pace.'
        : this.id === 'press' && value > this.config.enter
          ? 'Lower your hands to shoulder height and hold the rack position before starting.'
          : this.exercise.calibrationGuidance;
      return result;
    }
    result.guidance = 'Keep your movement steady and controlled.';
    if (this.phase === 'ready') {
      const movingUp = this.id === 'press' && this.pressDirection === 'up';
      const entering = movingUp ? value > this.config.enter : value < this.config.enter;
      if (entering) {
        if (this.enterSince < 0) this.enterSince = frame.timestampMs;
        if (frame.timestampMs - this.enterSince >= MovementAnalyzer.PHASE_HOLD_MS) {
          this.phase = 'eccentric';
          this.started = this.enterSince;
          this.minimum = movingUp ? 180 : value;
          this.maximumLean = 0;
          this.reversalSince = -1;
          this.exitSince = -1;
          this.cycleFaults.clear();
        }
      } else this.enterSince = -1;
    }
    if (this.phase !== 'ready') {
      const movingUp = this.id === 'press' && this.pressDirection === 'up';
      this.minimum = movingUp ? Math.min(this.minimum, 180 - value) : Math.min(this.minimum, value);
      this.maximumLean = Math.max(this.maximumLean, torsoAngle);
      for (const check of this.exercise.cycleFaults) {
        let hit = false;
        if (check.kind === 'alignmentExceeds') hit = hipVisible && torsoAngle > this.config.maximumLean;
        else if (check.kind === 'alignmentBelow') hit = alignment !== 0 && torsoAngle < this.config.minimumHipAlignment;
        else if (check.kind === 'extraAngleExceeds')
          hit = (angles[check.angle] ?? 0) > this.config.maximumArmSwing;
        else if (check.kind === 'kneeOverToes')
          hit =
            p(check.knee) &&
            p(check.ankle) &&
            (p(check.knee).visibility ?? 0) >= this.config.visibility &&
            (p(check.ankle).visibility ?? 0) >= this.config.visibility &&
            Math.abs((p(check.knee).x - p(check.ankle).x) * aspect) > check.tolerance;
        if (hit) result.faults.push(fault(check.code, check.message));
      }
      for (const f of result.faults) this.cycleFaults.set(f.code, f);
      if (this.phase === 'eccentric') {
        const reversing = movingUp
          ? value < 180 - this.minimum - this.config.reversal
          : value > this.minimum + this.config.reversal;
        if (reversing) {
          if (this.reversalSince < 0) this.reversalSince = frame.timestampMs;
          if (frame.timestampMs - this.reversalSince >= MovementAnalyzer.PHASE_HOLD_MS) {
            this.phase = 'concentric';
            this.exitSince = -1;
          }
        } else this.reversalSince = -1;
      }
      if (frame.timestampMs - this.started > this.config.maximumMs) {
        this.reset();
        return empty('Reset your starting position before your next rep.');
      }
      const atEnd = movingUp ? value <= this.config.enter : value >= this.config.exit;
      if (this.phase === 'concentric' && atEnd) {
        if (this.exitSince < 0) this.exitSince = frame.timestampMs;
      } else if (this.phase === 'concentric') this.exitSince = -1;
      if (
        this.phase === 'concentric' &&
        this.exitSince >= 0 &&
        frame.timestampMs - this.exitSince >= MovementAnalyzer.PHASE_HOLD_MS
      ) {
        const duration = frame.timestampMs - this.started;
        const rangeReached = movingUp
          ? 180 - this.minimum >= this.config.exit
          : this.minimum <= this.config.exit - this.config.minimumRange;
        result.repCompleted = duration >= this.config.minimumMs && rangeReached;
        if (result.repCompleted) {
          if (!movingUp && this.minimum > this.config.depth) {
            const f = fault(this.exercise.depthFault.code, this.exercise.depthFault.message);
            this.cycleFaults.set(f.code, f);
          }
          result.faults = [...this.cycleFaults.values()];
          result.repMetrics = {
            min_angle: Math.round(this.minimum),
            duration_ms: Math.round(duration),
            ...(this.exercise.trackMaxLean ? { max_torso_lean: Math.round(this.maximumLean) } : {}),
          };
        } else {
          result.guidance = duration < this.config.minimumMs
            ? `Rep not counted: keep the press moving for at least ${this.config.minimumMs / 1000} seconds.`
            : `Rep not counted: press overhead until your arms are straight, then return to your shoulders.`;
        }
        this.phase = 'ready';
        this.enterSince = -1;
        this.reversalSince = -1;
        this.exitSince = -1;
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
