/**
 * track-arms.test.ts — adversarial tracking-accuracy tests for curl + pushup.
 *
 * ALL frames here are SYNTHETIC (not recorded footage): the analyzers only
 * read their configured landmark indices, so each frame places exact 3-point
 * joint geometry (joint B, BA along a known direction, BC rotated by theta)
 * to dial a primary-joint angle of exactly `theta` degrees. Alignment
 * landmarks are neutral so fault checks stay quiet unless the test targets
 * them. Frame step is 50ms (20fps), matching the recorded fixtures.
 */
import { describe, expect, it } from 'vitest';
import { MovementAnalyzer } from '../src/features/exercises/ExerciseAnalyzer';
import { CurlAnalyzer } from '../src/features/exercises/CurlAnalyzer';
import { useWorkout } from '../src/features/workout/workoutStore';
import type { ExerciseResult, PoseFrame } from '../src/types/workout';

const STEP = 50;

type LM = { x: number; y: number; z: number; visibility: number };
const lm = (x: number, y: number, visibility = 0.99): LM => ({ x, y, z: 0, visibility });

/** Synthetic blank frame: every landmark invisible until a pose sets it. */
function blankFrame(timestampMs: number): PoseFrame {
  return {
    timestampMs,
    aspectRatio: 1,
    landmarks: Array.from({ length: 33 }, () => lm(0.5, 0.2, 0)),
  };
}

function rot(x: number, y: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
}

/**
 * Synthetic standing-curl arm pose (side 0 -> landmarks 11/13/15/23,
 * side 1 -> 12/14/16/24). Shoulder above, upper arm hangs down, wrist placed
 * so the shoulder-elbow-wrist angle is exactly `elbowDeg`. Torso vertical
 * (no pose-mismatch), upper-arm swing ~5deg (no upper_arm_movement fault).
 */
function poseCurlArm(frame: PoseFrame, side: 0 | 1, elbowDeg: number): void {
  const o = side;
  const Sx = 0.5, Sy = 0.25; // shoulder
  const Ex = 0.52, Ey = 0.48; // elbow
  const bl = Math.hypot(Sx - Ex, Sy - Ey);
  const [dx, dy] = rot((Sx - Ex) / bl, (Sy - Ey) / bl, elbowDeg);
  const L = 0.22;
  frame.landmarks[11 + o] = lm(Sx, Sy);
  frame.landmarks[13 + o] = lm(Ex, Ey);
  frame.landmarks[15 + o] = lm(Ex + dx * L, Ey + dy * L);
  frame.landmarks[23 + o] = lm(0.5, 0.62); // hip: torso vertical
}

/**
 * Synthetic side-on plank push-up pose (side 0). Shoulder/hip/ankle form a
 * horizontal line (hip angle 180, body inclination ~90 so the plank guard
 * passes); the elbow angle at 13 is exactly `elbowDeg`.
 */
function posePushup(frame: PoseFrame, elbowDeg: number): void {
  const Sx = 0.35, Sy = 0.5; // shoulder 11
  const Ex = 0.37, Ey = 0.72; // elbow 13
  const bl = Math.hypot(Sx - Ex, Sy - Ey);
  const [dx, dy] = rot((Sx - Ex) / bl, (Sy - Ey) / bl, elbowDeg);
  const L = 0.22;
  frame.landmarks[11] = lm(Sx, Sy);
  frame.landmarks[12] = lm(0.36, 0.5); // other shoulder nearby: front-on gate stays quiet
  frame.landmarks[13] = lm(Ex, Ey);
  frame.landmarks[15] = lm(Ex + dx * L, Ey + dy * L);
  frame.landmarks[23] = lm(0.56, 0.5); // hip
  frame.landmarks[27] = lm(0.79, 0.5); // ankle: hip alignment 180
}

/** Strictly-increasing timestamp frame sequencer. */
class FrameSeq {
  t = 0;
  frames: PoseFrame[] = [];
  push(ms: number, pose: (f: PoseFrame) => void): void {
    for (let e = 0; e < ms; e += STEP) {
      const f = blankFrame(this.t);
      pose(f);
      this.frames.push(f);
      this.t += STEP;
    }
  }
  ramp(ms: number, pose: (f: PoseFrame, k: number) => void): void {
    const steps = Math.max(1, Math.round(ms / STEP));
    for (let i = 0; i < steps; i += 1) {
      const f = blankFrame(this.t);
      pose(f, i / steps);
      this.frames.push(f);
      this.t += STEP;
    }
  }
}

const REST = 175;

/**
 * One curl cycle per side; null = that arm holds extended at REST.
 * normal: ~1350ms (> 700ms minimumMs). fast: ~500ms (< 700ms minimumMs).
 */
function curlCycle(
  seq: FrameSeq,
  minL: number | null,
  minR: number | null,
  speed: 'normal' | 'fast' = 'normal',
): void {
  const L = minL ?? REST;
  const R = minR ?? REST;
  const [downMs, holdMs, upMs] = speed === 'normal' ? [600, 150, 600] : [150, 200, 150];
  seq.ramp(downMs, (f, k) => {
    poseCurlArm(f, 0, REST + (L - REST) * k);
    poseCurlArm(f, 1, REST + (R - REST) * k);
  });
  seq.push(holdMs, (f) => {
    poseCurlArm(f, 0, L);
    poseCurlArm(f, 1, R);
  });
  seq.ramp(upMs, (f, k) => {
    poseCurlArm(f, 0, L + (REST - L) * k);
    poseCurlArm(f, 1, R + (REST - R) * k);
  });
  seq.push(300, (f) => {
    poseCurlArm(f, 0, REST);
    poseCurlArm(f, 1, REST);
  });
}

function calibrateCurl(seq: FrameSeq): void {
  seq.push(700, (f) => {
    poseCurlArm(f, 0, REST);
    poseCurlArm(f, 1, REST);
  });
}

/**
 * One push-up cycle. normal: ~1600ms (> 800ms minimumMs).
 * fast: 600ms total but with a 300ms bottom hold so the state machine fully
 * traverses (enter/reversal/exit) and the minimumMs gate does the rejecting.
 */
function pushupCycle(seq: FrameSeq, minDeg: number, speed: 'normal' | 'fast' = 'normal'): void {
  const [downMs, holdMs, upMs] =
    speed === 'normal' ? [700, 200, 700] : [150, 300, 150];
  seq.ramp(downMs, (f, k) => posePushup(f, REST + (minDeg - REST) * k));
  seq.push(holdMs, (f) => posePushup(f, minDeg));
  seq.ramp(upMs, (f, k) => posePushup(f, minDeg + (REST - minDeg) * k));
  seq.push(400, (f) => posePushup(f, REST));
}

function calibratePushup(seq: FrameSeq): void {
  seq.push(700, (f) => posePushup(f, REST));
}

function runCurl(seq: FrameSeq): { results: ExerciseResult[]; reps: ExerciseResult['completedReps'] } {
  const analyzer = new CurlAnalyzer();
  const results = seq.frames.map((f) => analyzer.analyze(f));
  const reps = results.flatMap((r) => r.completedReps ?? []);
  return { results, reps: reps as ExerciseResult['completedReps'] };
}

function runPushup(seq: FrameSeq): { results: ExerciseResult[]; analyzer: MovementAnalyzer } {
  const analyzer = new MovementAnalyzer('pushup');
  const results = seq.frames.map((f) => analyzer.analyze(f));
  return { results, analyzer };
}

describe('curl bilateral tracking (synthetic)', () => {
  it('counts alternating arms as L+R pairs without borrowing an incomplete cycle', () => {
    const seq = new FrameSeq();
    calibrateCurl(seq);
    const afterCal = seq.frames.length;
    curlCycle(seq, 45, null); // left curls alone, right rests extended
    const afterLeft = seq.frames.length;
    curlCycle(seq, null, 45); // right curls alone
    const afterRight = seq.frames.length;
    curlCycle(seq, 45, null);
    curlCycle(seq, null, 45);

    const { results, reps } = runCurl(seq);
    // Left's solo cycle must not pair with anything: no borrowing.
    expect(results.slice(afterCal, afterLeft).flatMap((r) => r.completedReps ?? [])).toHaveLength(0);
    // ...and not with right's incomplete (in-flight) cycle either.
    expect(results.slice(afterLeft, afterRight).flatMap((r) => r.completedReps ?? [])).toHaveLength(1);
    // L,R,L,R alternating = 2 counted reps, each credited to both arms.
    expect(reps).toHaveLength(2);
    expect(reps!.every((r) => r.metrics.arm_side === 2)).toBe(true);
    expect(reps![0].metrics.min_angle).toBeCloseTo(45, -1); // tens precision: smoother lags the raw turnaround by a few degrees
    expect(reps!.every((r) => r.faults.length === 0)).toBe(true);
  });

  it('one arm dropping out mid-set: no phantom reps, pairing resumes on return', () => {
    const seq = new FrameSeq();
    calibrateCurl(seq);
    curlCycle(seq, 45, 45); // one simultaneous rep -> 1 counted
    const dropoutStart = seq.frames.length;
    seq.push(3000, (f) => {
      poseCurlArm(f, 0, REST); // left visible, resting; right fully hidden
    });
    const soloStart = seq.frames.length;
    curlCycle(seq, 45, null); // left completes a full cycle alone (right hidden)
    const soloEnd = seq.frames.length;
    // Right returns, recalibrates, then curls -> pairs with left's pending rep.
    seq.push(700, (f) => {
      poseCurlArm(f, 0, REST);
      poseCurlArm(f, 1, REST);
    });
    curlCycle(seq, null, 45);

    const { results, reps } = runCurl(seq);
    // Nothing may count while an arm is invisible, and the solo cycle waits.
    expect(results.slice(dropoutStart, soloEnd).flatMap((r) => r.completedReps ?? [])).toHaveLength(0);
    // Mid-dropout the visible arm stays tracked and the pair stays uncalibrated.
    const mid = results[Math.floor((dropoutStart + soloStart) / 2)];
    expect(mid.arms![0].trackingValid).toBe(true);
    expect(mid.arms![1].trackingValid).toBe(false);
    expect(mid.calibrated).toBe(false);
    // After the right arm returns and completes, the pending left rep pairs: 2 total.
    expect(reps).toHaveLength(2);
    expect(reps!.every((r) => r.metrics.arm_side === 2)).toBe(true);
  });

  it('asymmetric ROM: shallow arm still pairs, rep counts with a depth cue', () => {
    const seq = new FrameSeq();
    calibrateCurl(seq);
    curlCycle(seq, 45, 80); // left full, right shallow-but-real

    const { reps } = runCurl(seq);
    expect(reps).toHaveLength(1);
    // The rep counts (both arms finished real cycles)...
    expect(reps![0].metrics.arm_side).toBe(2);
    expect(reps![0].metrics.min_angle).toBeCloseTo((45 + 80) / 2, -1); // tens precision: smoother lag, see above
    // ...but the shallow arm's limited range is flagged, not silently dropped.
    expect(reps![0].faults.map((f) => f.code)).toContain('limited_range');
  });

  it('jitter on one arm only: no phantom reps and the other arm is unaffected', () => {
    const seq = new FrameSeq();
    calibrateCurl(seq);
    const jitterStart = seq.frames.length;
    seq.push(3000, (f) => {
      const k = seq.frames.length;
      poseCurlArm(f, 0, REST + 5 * Math.sin(k * 0.7)); // +/-5deg jitter, never enters
      poseCurlArm(f, 1, REST);
    });
    const jitterEnd = seq.frames.length;
    curlCycle(seq, null, 45); // right completes while left holds still
    const afterRight = seq.frames.length;
    curlCycle(seq, 45, null); // left's real cycle pairs with right's pending rep

    const { results, reps } = runCurl(seq);
    expect(results.slice(jitterStart, jitterEnd).flatMap((r) => r.completedReps ?? [])).toHaveLength(0);
    // Right's completed cycle must not borrow from the jittering arm.
    expect(results.slice(jitterEnd, afterRight).flatMap((r) => r.completedReps ?? [])).toHaveLength(0);
    // ...but right's cycle was tracked fine: left's real rep pairs with it.
    expect(reps).toHaveLength(1);
    expect(reps![0].metrics.arm_side).toBe(2);
  });

  it('fast cadence under minimumMs is not counted on either arm', () => {
    const seq = new FrameSeq();
    calibrateCurl(seq);
    const fastStart = seq.frames.length;
    curlCycle(seq, 45, 45, 'fast'); // full ROM, ~500ms < 700ms minimumMs
    const fastEnd = seq.frames.length;
    curlCycle(seq, 45, 45, 'normal');

    const { results, reps } = runCurl(seq);
    expect(results.slice(fastStart, fastEnd).flatMap((r) => r.completedReps ?? [])).toHaveLength(0);
    expect(reps).toHaveLength(1);
  });
});

describe('pushup tracking (synthetic)', () => {
  it('calibrates promptly on a correct side-on plank', () => {
    const seq = new FrameSeq();
    calibratePushup(seq);
    const { results } = runPushup(seq);
    const firstCalibrated = results.findIndex((r) => r.calibrated);
    expect(firstCalibrated).toBeGreaterThanOrEqual(0);
    expect(seq.frames[firstCalibrated].timestampMs).toBeLessThanOrEqual(900);
    expect(results.every((r) => r.trackingValid)).toBe(true);
  });

  it('shallow rep just below depth counts clean; just above counts with a cue', () => {
    const below = new FrameSeq();
    calibratePushup(below);
    pushupCycle(below, 85); // smoothed min ~87 < depth 95
    const above = new FrameSeq();
    calibratePushup(above);
    pushupCycle(above, 105); // smoothed min ~103 > depth 95 but <= count boundary 125

    const belowReps = runPushup(below).results.flatMap((r) => (r.repCompleted ? [r] : []));
    const aboveReps = runPushup(above).results.flatMap((r) => (r.repCompleted ? [r] : []));
    expect(belowReps).toHaveLength(1);
    expect(belowReps[0].faults.map((f) => f.code)).not.toContain('limited_range');
    expect(aboveReps).toHaveLength(1);
    expect(aboveReps[0].faults.map((f) => f.code)).toContain('limited_range');
  });

  it('partial ROM past the count boundary does not count (quarter rep)', () => {
    const seq = new FrameSeq();
    calibratePushup(seq);
    pushupCycle(seq, 135); // smoothed min ~134 > exit - minimumRange (125)

    const { results } = runPushup(seq);
    expect(results.some((r) => r.repCompleted)).toBe(false);
  });

  it('fast cadence under minimumMs runs the full cycle but is not counted', () => {
    const seq = new FrameSeq();
    calibratePushup(seq);
    pushupCycle(seq, 80, 'fast'); // full ROM in ~600ms < 800ms minimumMs

    const { results } = runPushup(seq);
    const phases = new Set(results.map((r) => r.phase));
    // The cycle genuinely traversed the state machine...
    expect(phases.has('eccentric')).toBe(true);
    expect(phases.has('concentric')).toBe(true);
    // ...but the rep was rejected for speed, not silently miscounted.
    expect(results.some((r) => r.repCompleted)).toBe(false);
  });

  it('+/-5deg jitter held at the top counts nothing', () => {
    const seq = new FrameSeq();
    calibratePushup(seq);
    seq.push(4000, (f) => {
      const k = seq.frames.length;
      posePushup(f, REST + 5 * Math.sin(k * 0.6));
    });

    const { results } = runPushup(seq);
    expect(results.some((r) => r.repCompleted)).toBe(false);
  });

  it.each([200, 400])(
    '%ims tracking loss mid-rep kills the in-flight rep without a phantom; the next cycle counts',
    (lossMs) => {
      const seq = new FrameSeq();
      calibratePushup(seq);
      // Start a rep, then drop every landmark mid-descent.
      seq.ramp(500, (f, k) => posePushup(f, REST + (90 - REST) * k));
      const lossStart = seq.frames.length;
      seq.push(lossMs, () => {});
      const lossEnd = seq.frames.length;
      // Finish the interrupted descent at the bottom, return to top, recalibrate.
      seq.push(200, (f) => posePushup(f, 90));
      seq.ramp(500, (f, k) => posePushup(f, 90 + (REST - 90) * k));
      seq.push(700, (f) => posePushup(f, REST));
      // One clean cycle after reacquisition.
      pushupCycle(seq, 85);

      const { results } = runPushup(seq);
      expect(results.slice(lossStart, lossEnd).every((r) => !r.trackingValid)).toBe(true);
      expect(results.slice(0, lossEnd).some((r) => r.repCompleted)).toBe(false);
      expect(results.filter((r) => r.repCompleted)).toHaveLength(1);
    },
  );

  it('oscillation around exit after completion does not double count', () => {
    const seq = new FrameSeq();
    calibratePushup(seq);
    pushupCycle(seq, 85);
    const afterRep = seq.frames.length;
    seq.push(3000, (f) => {
      const k = seq.frames.length;
      posePushup(f, 160 + 5 * Math.sin(k * 0.5)); // oscillate around exit 160
    });

    const { results } = runPushup(seq);
    expect(results.filter((r) => r.repCompleted)).toHaveLength(1);
    expect(results.slice(afterRep).some((r) => r.repCompleted)).toBe(false);
  });

  it('repCompleted flows into session rep counts via useWorkout ingest', () => {
    const analyzer = new MovementAnalyzer('pushup');
    useWorkout.getState().select('pushup');
    useWorkout.getState().begin('demo');
    const seq = new FrameSeq();
    calibratePushup(seq);
    pushupCycle(seq, 85);
    pushupCycle(seq, 105);
    for (const frame of seq.frames)
      useWorkout.getState().ingest(analyzer.analyze(frame), frame.timestampMs);
    const reps = useWorkout.getState().session!.reps;
    expect(reps).toHaveLength(2);
    expect(reps.map((r) => r.rep_number)).toEqual([1, 2]);
    expect(reps[0].faults_json.map((f) => f.code)).not.toContain('limited_range');
    expect(reps[1].faults_json.map((f) => f.code)).toContain('limited_range');
    expect(reps[0].metrics_json.min_angle).toBeLessThan(95);
  });
});
