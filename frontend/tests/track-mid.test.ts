import { describe, expect, it } from 'vitest';
import { MovementAnalyzer } from '../src/features/exercises/ExerciseAnalyzer';
import type { ExerciseId, ExerciseResult, Landmark, PoseFrame } from '../src/types/workout';

// ---------------------------------------------------------------------------
// Adversarial tracking tests: lunge, glute_bridge, row (Worker B).
//
// SYNTHETIC FRAMES (not recorded data): each pose places the primary joint
// with an exact interior angle via 3-point geometry (joint B, BA along a known
// direction, BC rotated so angle(BA,BC) == theta). All other required
// landmarks sit in neutral positions so fault checks don't fire, and every
// landmark is fully visible so confidence checks pass.
// ---------------------------------------------------------------------------

const D = Math.PI / 180;
type Pt = { x: number; y: number };
const pt = (x: number, y: number): Pt => ({ x, y });
const polar = (len: number, deg: number): Pt => pt(len * Math.cos(deg * D), len * Math.sin(deg * D));

/** Point C such that the interior angle at B between BA and BC is exactly thetaDeg. */
function jointC(b: Pt, a: Pt, len: number, thetaDeg: number, dirSign: 1 | -1): Pt {
  const baDeg = (Math.atan2(a.y - b.y, a.x - b.x) / D);
  const c = polar(len, baDeg + dirSign * thetaDeg);
  return pt(b.x + c.x, b.y + c.y);
}

function blankLandmarks(): Landmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
}

function toLandmarks(placed: Record<number, Pt>): Landmark[] {
  const l = blankLandmarks();
  for (const [i, p] of Object.entries(placed)) l[Number(i)] = { x: p.x, y: p.y, z: 0, visibility: 1 };
  return l;
}

// --- Synthetic poses --------------------------------------------------------
// Lunge: fixed knee B, ankle C straight below (knee-over-toes stays 0), hip A
// swings forward as theta closes (thigh goes horizontal at the bottom).
function lungePose(theta: number): Landmark[] {
  const knee = pt(0.5, 0.6);
  const ankle = pt(0.5, 0.78);
  const hip = jointC(knee, ankle, 0.18, theta, -1);
  const shoulder = pt(hip.x + polar(0.25, -80).x, hip.y + polar(0.25, -80).y);
  return toLandmarks({ 11: shoulder, 12: pt(shoulder.x + 0.01, shoulder.y), 23: hip, 25: knee, 27: ankle });
}

// Glute bridge: fixed hip B and shoulder A (torso inclination locked at 35deg,
// above the 30deg back-arch floor), knee C swings as theta closes.
function bridgePose(theta: number): Landmark[] {
  const hip = pt(0.5, 0.5);
  const shoulder = pt(0.5 - 0.25 * Math.sin(35 * D), 0.5 - 0.25 * Math.cos(35 * D));
  const knee = jointC(hip, shoulder, 0.2, theta, 1);
  const ankle = pt(0.78, 0.72);
  return toLandmarks({ 11: shoulder, 12: pt(shoulder.x + 0.01, shoulder.y), 23: hip, 25: knee, 27: ankle });
}

// Row: fixed shoulder A and hip H (torso hinge locked at 45deg, above the
// 30deg torso-rising floor and the 25deg calibration hinge floor), elbow B
// hangs below the shoulder, wrist C swings up as theta closes.
function rowPose(theta: number): Landmark[] {
  const shoulder = pt(0.5, 0.35);
  const hip = pt(0.5 - 0.25 * Math.sin(45 * D), 0.35 + 0.25 * Math.cos(45 * D));
  const elbow = pt(shoulder.x + 0.045, shoulder.y + 0.175);
  const wrist = jointC(elbow, shoulder, 0.16, theta, 1);
  return toLandmarks({ 11: shoulder, 12: pt(shoulder.x + 0.01, shoulder.y), 13: elbow, 15: wrist, 23: hip });
}

// --- Sequence builders ------------------------------------------------------

type Segment = [theta: number, ms: number];

/** Emit frames for (angle, hold-ms) segments at a fixed frame step. */
function framesFor(
  pose: (theta: number) => Landmark[],
  segments: Segment[],
  stepMs = 50,
  startMs = 0,
): PoseFrame[] {
  const frames: PoseFrame[] = [];
  let t = startMs;
  for (const [theta, ms] of segments) {
    const n = Math.max(1, Math.round(ms / stepMs));
    for (let i = 0; i < n; i += 1) {
      t += stepMs;
      frames.push({ landmarks: pose(theta), timestampMs: t, aspectRatio: 1 });
    }
  }
  return frames;
}

/** One full rep: calibrate, descend in stepDeg increments, hold the bottom so
 *  the smoother converges, ascend, settle at the top. */
function fullRep(top: number, bottom: number, stepDeg = 5, bottomHoldMs = 700): Segment[] {
  const segs: Segment[] = [[top, 700]];
  for (let a = top - stepDeg; a >= bottom; a -= stepDeg) segs.push([a, 50]);
  segs.push([bottom, bottomHoldMs]);
  for (let a = bottom + stepDeg; a <= top; a += stepDeg) segs.push([a, 50]);
  segs.push([top, 300]);
  return segs;
}

/** A rep compressed under minimumMs: fast frame steps, short bottom hold. */
function fastRep(top: number, bottom: number, stepMs: number, stepDeg: number): Segment[] {
  const segs: Segment[] = [[top, 700]];
  for (let a = top - stepDeg; a >= bottom; a -= stepDeg) segs.push([a, stepMs]);
  segs.push([bottom, 40]);
  for (let a = bottom + stepDeg; a <= top; a += stepDeg) segs.push([a, stepMs]);
  segs.push([top, 200]);
  return segs;
}

function withLoss(frames: PoseFrame[], atIndex: number, lossMs: number, stepMs: number): PoseFrame[] {
  const out = frames.slice(0, atIndex);
  let t = out[out.length - 1].timestampMs;
  const n = Math.max(1, Math.round(lossMs / stepMs));
  for (let i = 0; i < n; i += 1) {
    t += stepMs;
    out.push({
      landmarks: blankLandmarks().map((p) => ({ ...p, visibility: 0 })),
      timestampMs: t,
      aspectRatio: 1,
    });
  }
  for (const f of frames.slice(atIndex)) out.push({ ...f, timestampMs: f.timestampMs + lossMs });
  return out;
}

function run(id: ExerciseId, frames: PoseFrame[]) {
  const analyzer = new MovementAnalyzer(id);
  const results = frames.map((f) => analyzer.analyze(f));
  return { analyzer, results };
}

const completed = (results: ExerciseResult[]) => results.filter((r) => r.repCompleted);

// --- Exercise battery -------------------------------------------------------

interface Battery {
  id: ExerciseId;
  pose: (theta: number) => Landmark[];
  top: number;
  fullBottom: number;
  depthCode: string;
  fastStepMs: number;
  fastStepDeg: number;
}

const batteries: Battery[] = [
  { id: 'lunge', pose: lungePose, top: 172, fullBottom: 95, depthCode: 'insufficient_depth', fastStepMs: 20, fastStepDeg: 4 },
  { id: 'glute_bridge', pose: bridgePose, top: 170, fullBottom: 111, depthCode: 'incomplete_extension', fastStepMs: 20, fastStepDeg: 4 },
  { id: 'row', pose: rowPose, top: 170, fullBottom: 68, depthCode: 'incomplete_pull', fastStepMs: 20, fastStepDeg: 6 },
];

describe.each(batteries)('$id synthetic adversarial tracking', (b) => {
  const cfg = (id: ExerciseId) => new MovementAnalyzer(id).config;

  it('places the primary joint at the dialed angle', () => {
    const { results } = run(b.id, framesFor(b.pose, [[b.top, 700]]));
    const last = results.at(-1)!;
    expect(last.trackingValid).toBe(true);
    expect(last.calibrated).toBe(true);
    const primaryKey = Object.keys(last.jointAngles).find((k) => k !== 'torso_lean' && k !== 'hip_alignment')!;
    expect(Math.abs(last.jointAngles[primaryKey] - b.top)).toBeLessThanOrEqual(2);
  });

  it('counts one full synthetic rep with no depth cue', () => {
    const { results } = run(b.id, framesFor(b.pose, fullRep(b.top, b.fullBottom)));
    const reps = completed(results);
    expect(reps).toHaveLength(1);
    expect(reps[0].faults.map((f) => f.code)).not.toContain(b.depthCode);
  });

  it('counts a rep just below the depth threshold cleanly, and just above it with a cue', () => {
    const { depth } = cfg(b.id);
    const deep = run(b.id, framesFor(b.pose, fullRep(b.top, depth - 5)));
    const deepReps = completed(deep.results);
    expect(deepReps).toHaveLength(1);
    expect(deepReps[0].faults.map((f) => f.code)).not.toContain(b.depthCode);
    const shallow = run(b.id, framesFor(b.pose, fullRep(b.top, depth + 5)));
    const shallowReps = completed(shallow.results);
    expect(shallowReps).toHaveLength(1);
    expect(shallowReps[0].faults.map((f) => f.code)).toContain(b.depthCode);
  });

  it('counts at the inner edge of the ROM buffer but rejects just outside it', () => {
    const { exit, minimumRange } = cfg(b.id);
    const cutoff = exit - minimumRange;
    const inside = run(b.id, framesFor(b.pose, fullRep(b.top, cutoff - 2)));
    expect(completed(inside.results)).toHaveLength(1);
    const outside = run(b.id, framesFor(b.pose, fullRep(b.top, cutoff + 2)));
    const outsideReps = completed(outside.results);
    expect(outsideReps).toHaveLength(0);
    // A rejected rep is not silent: the failed cycle carries the exercise's own
    // depth cue so the user knows why it didn't count (#39 core fix).
    const outsideFaults = outside.results.flatMap((r) => r.faults);
    expect(outsideFaults).toHaveLength(1);
    expect(outsideFaults[0].code).toBe(b.depthCode);
  });

  it('rejects a full-ROM rep that is faster than minimumMs', () => {
    const { results } = run(
      b.id,
      framesFor(b.pose, fastRep(b.top, b.fullBottom, b.fastStepMs, b.fastStepDeg), b.fastStepMs),
    );
    expect(completed(results)).toHaveLength(0);
    // The cycle was genuinely tracked (not a tracking failure): minimumMs is the rejector.
    expect(results.some((r) => r.phase === 'eccentric')).toBe(true);
  });

  it('ignores +/-5deg jitter on a held top position', () => {
    const { exit } = cfg(b.id);
    const jitter: Segment[] = [];
    for (let i = 0; i < 40; i += 1) jitter.push([i % 2 === 0 ? exit + 1 : exit + 9, 50]);
    const { results } = run(b.id, framesFor(b.pose, jitter));
    expect(completed(results)).toHaveLength(0);
    expect(results.every((r) => r.phase === 'ready')).toBe(true);
  });

  it('survives a 300ms tracking loss mid-rep without counting the interrupted rep', () => {
    const stepMs = 50;
    const rep = framesFor(b.pose, fullRep(b.top, b.fullBottom), stepMs);
    const midDescent = Math.floor(rep.length * 0.25);
    const interrupted = withLoss(rep, midDescent, 300, stepMs);
    const second = framesFor(b.pose, fullRep(b.top, b.fullBottom), stepMs, interrupted.at(-1)!.timestampMs);
    const { results } = run(b.id, [...interrupted, ...second]);
    expect(completed(results)).toHaveLength(1);
  });

  it('recovers from a 400ms tracking loss (past the grace window) with no phantom rep', () => {
    const stepMs = 50;
    const rep = framesFor(b.pose, fullRep(b.top, b.fullBottom), stepMs);
    const midDescent = Math.floor(rep.length * 0.25);
    const interrupted = withLoss(rep, midDescent, 400, stepMs);
    const second = framesFor(b.pose, fullRep(b.top, b.fullBottom), stepMs, interrupted.at(-1)!.timestampMs);
    const { results } = run(b.id, [...interrupted, ...second]);
    expect(completed(results)).toHaveLength(1);
  });

  it('does not double-count when oscillating around exit after a rep', () => {
    const { exit } = cfg(b.id);
    const stepMs = 50;
    const first = framesFor(b.pose, fullRep(b.top, b.fullBottom), stepMs);
    let t = first.at(-1)!.timestampMs;
    const wobble: Segment[] = [];
    for (let i = 0; i < 20; i += 1) wobble.push([i % 2 === 0 ? exit - 3 : exit + 3, stepMs]);
    const wobbleFrames = framesFor(b.pose, wobble, stepMs, t);
    t = wobbleFrames.at(-1)!.timestampMs;
    const second = framesFor(b.pose, fullRep(b.top, b.fullBottom), stepMs, t);
    const { results } = run(b.id, [...first, ...wobbleFrames, ...second]);
    expect(completed(results)).toHaveLength(2);
  });
});
