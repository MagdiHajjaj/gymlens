import { describe, expect, it } from 'vitest';
import { MovementAnalyzer } from '../src/features/exercises/ExerciseAnalyzer';
import { useWorkout } from '../src/features/workout/workoutStore';
import type { ExerciseResult, Landmark, PoseFrame } from '../src/types/workout';

// NOTE: every frame in this file is SYNTHETIC — built with exact 3-point joint
// geometry so the analyzer's configured primary angle equals a chosen value.
// The analyzer only reads its configured landmark indices, so the remaining
// landmarks are neutral: side-on (shoulders nearly overlapping in x), torso
// lean ~10-15 deg (below every fault threshold), high visibility, so no fault
// or view check can fire and each test isolates the state machine.
type LegId = 'squat' | 'deadlift';
const rad = (d: number) => (d * Math.PI) / 180;
const lm = (x: number, y: number, visibility = 0.95): Landmark => ({ x, y, z: 0, visibility });

function syntheticFrame(id: LegId, thetaDeg: number, timestampMs: number): PoseFrame {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => lm(0.5, 0.5, 0.95));
  if (id === 'squat') {
    // vertex = knee (25); angle(hip 23, knee 25, ankle 27) = theta
    const k = { x: 0.5, y: 0.5 };
    const thighDir = rad(115);
    const hip = { x: k.x + 0.18 * Math.cos(thighDir), y: k.y + 0.18 * Math.sin(thighDir) };
    const shinDir = rad(115 - thetaDeg);
    const ankle = { x: k.x + 0.18 * Math.cos(shinDir), y: k.y + 0.18 * Math.sin(shinDir) };
    // neutral torso: 15 deg lean, 0.30 long (view check needs >= 0.04)
    const shoulder = { x: hip.x + 0.3 * Math.sin(rad(15)), y: hip.y - 0.3 * Math.cos(rad(15)) };
    landmarks[25] = lm(k.x, k.y);
    landmarks[23] = lm(hip.x, hip.y);
    landmarks[27] = lm(ankle.x, ankle.y);
    landmarks[11] = lm(shoulder.x, shoulder.y);
    landmarks[12] = lm(shoulder.x + 0.02, shoulder.y + 0.01); // side-on: |dx| << torso*0.65
    landmarks[15] = lm(0.55, 0.45);
  } else {
    // vertex = hip (23); angle(shoulder 11, hip 23, knee 25) = theta
    const hip = { x: 0.5, y: 0.55 };
    const shoulder = { x: hip.x + 0.3 * Math.sin(rad(10)), y: hip.y - 0.3 * Math.cos(rad(10)) };
    const ux = shoulder.x - hip.x;
    const uy = shoulder.y - hip.y;
    const t = rad(thetaDeg);
    const vx = ux * Math.cos(t) - uy * Math.sin(t);
    const vy = ux * Math.sin(t) + uy * Math.cos(t);
    const knee = { x: hip.x + (0.35 * vx) / 0.3, y: hip.y + (0.35 * vy) / 0.3 };
    landmarks[23] = lm(hip.x, hip.y);
    landmarks[11] = lm(shoulder.x, shoulder.y);
    landmarks[25] = lm(knee.x, knee.y);
    landmarks[27] = lm(0.5, 0.95);
    landmarks[12] = lm(shoulder.x + 0.02, shoulder.y + 0.01);
    landmarks[15] = lm(0.55, 0.45);
  }
  // mirror side so the side-1 confidence path stays valid; side 0 wins ties
  for (const i of [11, 12, 15, 23, 25, 27])
    landmarks[i + 1] = { ...landmarks[i], x: Math.min(1, landmarks[i].x + 0.015) };
  return { timestampMs, landmarks, aspectRatio: 1 };
}

interface SeqOpts {
  bottomMs?: number;
  downMs?: number;
  upMs?: number;
  topMs?: number;
  stepMs?: number;
}
/** Calibrate at 170 deg, descend to `minAngle`, hold, ascend, hold at top. */
function repSequence(id: LegId, minAngle: number, opts: SeqOpts = {}): PoseFrame[] {
  const { bottomMs = 450, downMs = 700, upMs = 700, topMs = 400, stepMs = 50 } = opts;
  const frames: PoseFrame[] = [];
  let t = 0;
  const push = (theta: number, ms: number) => {
    for (let e = 0; e < ms; e += stepMs) {
      frames.push(syntheticFrame(id, theta, t));
      t += stepMs;
    }
  };
  const ramp = (from: number, to: number, ms: number) => {
    const n = Math.max(1, Math.round(ms / stepMs));
    for (let i = 1; i <= n; i++) {
      frames.push(syntheticFrame(id, from + ((to - from) * i) / n, t));
      t += stepMs;
    }
  };
  push(170, 700); // calibration hold (>= exit - 10 for 600ms)
  ramp(170, minAngle, downMs);
  push(minAngle, bottomMs);
  ramp(minAngle, 170, upMs);
  push(170, topMs);
  return frames;
}

const analyzeAll = (id: LegId, frames: PoseFrame[]): ExerciseResult[] => {
  const analyzer = new MovementAnalyzer(id);
  return frames.map((f) => analyzer.analyze(f));
};
const completed = (results: ExerciseResult[]) => results.filter((r) => r.repCompleted);
const faultCodes = (r: ExerciseResult) => r.faults.map((f) => f.code);

describe('squat tracking accuracy (synthetic frames)', () => {
  it('counts a full-depth squat with no depth cue', () => {
    const reps = completed(analyzeAll('squat', repSequence('squat', 90)));
    expect(reps).toHaveLength(1);
    expect(reps[0].faults).toEqual([]);
    expect(reps[0].repMetrics?.min_angle).toBe(90);
    expect(reps[0].repMetrics?.duration_ms).toBeGreaterThan(800);
  });

  it('counts a slightly-shallow squat WITH a depth cue (human buffer)', () => {
    const reps = completed(analyzeAll('squat', repSequence('squat', 115)));
    expect(reps).toHaveLength(1);
    expect(faultCodes(reps[0])).toContain('insufficient_depth');
  });

  it('counts at the ROM boundary (minimum 128 <= exit - minimumRange 130)', () => {
    const reps = completed(analyzeAll('squat', repSequence('squat', 128)));
    expect(reps).toHaveLength(1);
    expect(faultCodes(reps[0])).toContain('insufficient_depth');
  });

  it('rejects a quarter squat (minimum 145) but still cues depth (no silent miss)', () => {
    const results = analyzeAll('squat', repSequence('squat', 145));
    expect(completed(results)).toHaveLength(0);
    const flagged = results.filter((r) => faultCodes(r).includes('insufficient_depth'));
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged[0].guidance.startsWith('Rep not counted:')).toBe(true);
    expect(flagged[0].guidance).not.toContain('press');
  });

  it('counts a moderate partial rep with a depth cue under the looser range allowance', () => {
    const reps = completed(analyzeAll('squat', repSequence('squat', 133)));
    expect(reps).toHaveLength(1);
    expect(faultCodes(reps[0])).toContain('insufficient_depth');
  });

  it('does not count an impossibly fast full-ROM rep', () => {
    const results = analyzeAll(
      'squat',
      repSequence('squat', 90, { downMs: 200, bottomMs: 50, upMs: 200, topMs: 300 }),
    );
    expect(completed(results)).toHaveLength(0);
    expect(results.some((r) => r.guidance.startsWith('Rep not counted: slow down'))).toBe(true);
  });

  it('tolerates +-5 deg jitter on a held bottom without false reversal or double count', () => {
    // calibrate + descend, then jitter +-5 deg at the bottom, then ascend
    const seq: PoseFrame[] = [];
    let tt = 0;
    const pushJ = (theta: number, n: number) => {
      for (let i = 0; i < n; i++) {
        seq.push(syntheticFrame('squat', theta, tt));
        tt += 50;
      }
    };
    pushJ(170, 14);
    for (let i = 1; i <= 14; i++) {
      seq.push(syntheticFrame('squat', 170 - ((170 - 90) * i) / 14, tt));
      tt += 50;
    }
    for (let i = 0; i < 12; i++) {
      seq.push(syntheticFrame('squat', i % 2 === 0 ? 85 : 95, tt));
      tt += 50;
    }
    for (let i = 1; i <= 14; i++) {
      seq.push(syntheticFrame('squat', 90 + ((170 - 90) * i) / 14, tt));
      tt += 50;
    }
    pushJ(170, 8);
    const reps = completed(analyzeAll('squat', seq));
    expect(reps).toHaveLength(1);
  });

  it('resets an in-flight rep on 250ms tracking loss, keeps the side, then counts a fresh rep', () => {
    const analyzer = new MovementAnalyzer('squat');
    const results: ExerciseResult[] = [];
    let t = 0;
    const feed = (f: PoseFrame) => results.push(analyzer.analyze(f));
    for (let i = 0; i < 14; i++) {
      feed(syntheticFrame('squat', 170, t));
      t += 50;
    }
    for (let i = 1; i <= 6; i++) {
      feed(syntheticFrame('squat', 170 - ((170 - 130) * i) / 6, t));
      t += 50;
    }
    // 250ms of lost tracking mid-rep (inside the 350ms grace window)
    for (let i = 0; i < 5; i++) {
      const lost = syntheticFrame('squat', 130, t);
      lost.landmarks[25] = { ...lost.landmarks[25], visibility: 0 };
      feed(lost);
      t += 50;
    }
    const lossResults = results.slice(-5);
    expect(lossResults.every((r) => r.trackingValid === false)).toBe(true);
    // recover: stand still long enough to recalibrate, then one full rep
    for (let i = 0; i < 16; i++) {
      feed(syntheticFrame('squat', 170, t));
      t += 50;
    }
    expect(results.at(-1)!.trackedSide).toBe(0);
    // a fresh full rep, fed with continuous timestamps (its own calibration hold included)
    for (const f of repSequence('squat', 90)) feed({ ...f, timestampMs: t + f.timestampMs });
    t += 700 + 700 + 450 + 700 + 400;
    const reps = completed(results);
    expect(reps).toHaveLength(1);
    expect(reps[0].repMetrics?.min_angle).toBe(90);
  });

  it('does not double count when oscillating around the exit threshold', () => {
    const frames = repSequence('squat', 90);
    let t = frames.at(-1)!.timestampMs + 50;
    for (let i = 0; i < 20; i++) {
      frames.push(syntheticFrame('squat', i % 2 === 0 ? 160 : 170, t));
      t += 50;
    }
    expect(completed(analyzeAll('squat', frames))).toHaveLength(1);
  });

  it('flows repCompleted into the workout store rep count via ingest', () => {
    const analyzer = new MovementAnalyzer('squat');
    useWorkout.getState().select('squat');
    useWorkout.getState().begin('demo');
    for (const frame of repSequence('squat', 90))
      useWorkout.getState().ingest(analyzer.analyze(frame), frame.timestampMs);
    const reps = useWorkout.getState().session!.reps;
    expect(reps).toHaveLength(1);
    expect(reps[0].rep_number).toBe(1);
    expect(reps[0].metrics_json.min_angle).toBe(90);
    expect(reps[0].faults_json).toEqual([]);
  });
});

describe('deadlift tracking accuracy (synthetic frames)', () => {
  it('counts a full hinge with no depth cue and records max torso lean', () => {
    const reps = completed(analyzeAll('deadlift', repSequence('deadlift', 95)));
    expect(reps).toHaveLength(1);
    expect(reps[0].faults).toEqual([]);
    expect(reps[0].repMetrics?.min_angle).toBe(95);
    expect(reps[0].repMetrics?.max_torso_lean).toBeGreaterThan(0);
  });

  it('counts a slightly-shallow hinge WITH a depth cue (human buffer)', () => {
    const reps = completed(analyzeAll('deadlift', repSequence('deadlift', 120)));
    expect(reps).toHaveLength(1);
    expect(faultCodes(reps[0])).toContain('insufficient_hinge');
  });

  it('counts at the ROM boundary (minimum 132 <= exit - minimumRange 135)', () => {
    const reps = completed(analyzeAll('deadlift', repSequence('deadlift', 132)));
    expect(reps).toHaveLength(1);
    expect(faultCodes(reps[0])).toContain('insufficient_hinge');
  });

  it('rejects a quarter hinge (minimum 145) but still cues depth (no silent miss)', () => {
    const results = analyzeAll('deadlift', repSequence('deadlift', 145));
    expect(completed(results)).toHaveLength(0);
    const flagged = results.filter((r) => faultCodes(r).includes('insufficient_hinge'));
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged[0].guidance).toBe(
      'Rep not counted: Hinge deeper at the hips within your comfortable range.',
    );
  });

  it('counts a moderate partial hinge with a cue under the looser range allowance', () => {
    const reps = completed(analyzeAll('deadlift', repSequence('deadlift', 138)));
    expect(reps).toHaveLength(1);
    expect(faultCodes(reps[0])).toContain('insufficient_hinge');
  });

  it('does not count an impossibly fast full-ROM hinge', () => {
    const results = analyzeAll(
      'deadlift',
      repSequence('deadlift', 95, { downMs: 200, bottomMs: 50, upMs: 200, topMs: 300 }),
    );
    expect(completed(results)).toHaveLength(0);
  });

  it('does not double count when oscillating around the exit threshold', () => {
    const frames = repSequence('deadlift', 95);
    let t = frames.at(-1)!.timestampMs + 50;
    for (let i = 0; i < 20; i++) {
      frames.push(syntheticFrame('deadlift', i % 2 === 0 ? 160 : 170, t));
      t += 50;
    }
    expect(completed(analyzeAll('deadlift', frames))).toHaveLength(1);
  });
});
