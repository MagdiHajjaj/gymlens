import { describe, expect, it } from 'vitest';
import { MovementAnalyzer } from '../src/features/exercises/ExerciseAnalyzer';
import type { ExerciseId, ExerciseResult, Landmark, PoseFrame } from '../src/types/workout';

/**
 * SYNTHETIC tracking-accuracy tests for press, dips, and pullup.
 *
 * The analyzer only reads its configured landmark indices, so these frames are
 * built with exact 3-point elbow geometry: the elbow sits at a fixed point,
 * the upper arm points along a fixed direction, and the forearm is placed so
 * the joint angle at the elbow is exactly the dialed value. The torso is kept
 * vertical and neutral so alignment fault checks stay quiet; only the depth
 * (range) faults under test can fire. Nothing here replaces analyzer logic --
 * every frame still flows through MovementAnalyzer.analyze with its real
 * smoother, calibration, hysteresis, and debounce.
 */
type SyntheticPose = 'side' | 'overhead' | 'slouch';

function buildLandmarks(pose: SyntheticPose, angleDeg: number, dropout: boolean): Landmark[] {
  const rad = (angleDeg * Math.PI) / 180;
  const pts: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  const put = (i: number, x: number, y: number) => {
    pts[i] = { x, y, z: 0, visibility: dropout ? 0 : 0.9 };
  };
  if (pose === 'side') {
    // Press/dips: upper arm along +x, forearm rotated so the elbow angle is exact.
    const phi = Math.PI - rad;
    put(11, 0.5, 0.4);
    put(13, 0.65, 0.4);
    put(15, 0.65 + 0.15 * Math.cos(phi), 0.4 + 0.15 * Math.sin(phi));
    put(23, 0.5, 0.72);
  } else if (pose === 'overhead') {
    // Pull-up dead hang: upper arm straight up (-y), forearm at the dialed angle.
    put(11, 0.5, 0.5);
    put(13, 0.5, 0.35);
    put(15, 0.5 + 0.15 * Math.sin(rad), 0.35 + 0.15 * Math.cos(rad));
    put(23, 0.5, 0.82);
  } else {
    // Slouch: bent arm with the hands below the shoulders -- not a dead hang.
    put(11, 0.5, 0.42);
    put(13, 0.6, 0.52);
    put(15, 0.52, 0.6);
    put(23, 0.5, 0.74);
  }
  return pts;
}

interface DriveOpts {
  dt?: number;
  jitterDeg?: number;
  /** [startFrame, endFrame) ranges rendered with landmarks dropped */
  dropout?: Array<[number, number]>;
  pose?: SyntheticPose;
}

interface Stage {
  angle: number;
  frames: number;
}

/** Feed linearly-interpolated angle stages through a fresh analyzer; fixedSide=0. */
function drive(id: ExerciseId, stages: Stage[], opts: DriveOpts = {}): ExerciseResult[] {
  const analyzer = new MovementAnalyzer(id, {}, 0);
  const dt = opts.dt ?? 50;
  const pose = opts.pose ?? (id === 'pullup' ? 'overhead' : 'side');
  const targets: number[] = [];
  let prev = stages[0].angle;
  for (const s of stages) {
    for (let i = 1; i <= s.frames; i += 1) targets.push(prev + ((s.angle - prev) * i) / s.frames);
    prev = s.angle;
  }
  const inDropout = (f: number) => (opts.dropout ?? []).some(([a, b]) => f >= a && f < b);
  return targets.map((target, f) => {
    const jittered = opts.jitterDeg ? target + (f % 2 === 0 ? opts.jitterDeg : -opts.jitterDeg) : target;
    const frame: PoseFrame = {
      timestampMs: f * dt,
      landmarks: buildLandmarks(pose, jittered, inDropout(f)),
      aspectRatio: 1,
    };
    return analyzer.analyze(frame);
  });
}

const completed = (results: ExerciseResult[]) => results.filter((r) => r.repCompleted);
const faultCodes = (r: ExerciseResult) => r.faults.map((f) => f.code);

/** Dip/pull-up cycle: settle at the top, lower to the bottom, return to the top. */
const downUp = (top: number, bottom: number, bottomHold = 12): Stage[] => [
  { angle: top, frames: 16 },
  { angle: bottom, frames: 24 },
  { angle: bottom, frames: bottomHold },
  { angle: top, frames: 24 },
  { angle: top, frames: 10 },
];

/** Press cycle: settle in the rack, press to lockout, return to the rack. */
const pressRep = (rack: number, lockout: number): Stage[] => [
  { angle: rack, frames: 16 },
  { angle: lockout, frames: 24 },
  { angle: lockout, frames: 10 },
  { angle: rack, frames: 24 },
  { angle: rack, frames: 10 },
];

describe('press tracking accuracy (synthetic)', () => {
  it('calibrates promptly in a correct rack position', () => {
    const results = drive('press', [{ angle: 100, frames: 20 }]);
    expect(results.at(-1)?.calibrated).toBe(true);
    expect(results.at(-1)?.phase).toBe('ready');
    expect(completed(results)).toHaveLength(0);
  });

  it('guides to the rack instead of counting when starting overhead', () => {
    const results = drive('press', [{ angle: 175, frames: 40 }]);
    expect(results.every((r) => !r.calibrated)).toBe(true);
    expect(results.at(-1)?.guidance).toContain('rack position');
    expect(completed(results)).toHaveLength(0);
  });

  it('counts a full press to lockout', () => {
    const results = drive('press', pressRep(100, 175));
    const reps = completed(results);
    expect(reps).toHaveLength(1);
    expect(reps[0].repMetrics?.min_angle).toBeLessThanOrEqual(8);
    expect(reps[0].faults).toEqual([]);
  });

  it('does not count a shallow press that never reaches lockout', () => {
    const results = drive('press', pressRep(100, 145));
    expect(completed(results)).toHaveLength(0);
  });

  it('counts a slightly-shallow-but-real press (human buffer)', () => {
    const results = drive('press', pressRep(100, 158));
    expect(completed(results)).toHaveLength(1);
  });

  it('does not count a full-ROM rep faster than minimumMs', () => {
    const results = drive('press', [
      { angle: 100, frames: 16 },
      { angle: 175, frames: 4 },
      { angle: 175, frames: 2 },
      { angle: 100, frames: 4 },
      { angle: 100, frames: 4 },
    ]);
    expect(completed(results)).toHaveLength(0);
  });

  it('a high-but-valid rack hold never phantom-enters a cycle, then completes', () => {
    // 132deg is inside the core rack gate (<=135) but above enter (140 is the
    // gate now): holding it must not start a cycle, and the return target
    // (value <= enter) stays reachable from this exact calibration pose.
    const results = drive('press', [
      { angle: 132, frames: 40 },
      { angle: 175, frames: 24 },
      { angle: 175, frames: 10 },
      { angle: 132, frames: 24 },
      { angle: 132, frames: 12 },
    ]);
    expect(results.slice(0, 40).every((r) => r.phase === 'ready')).toBe(true);
    expect(completed(results)).toHaveLength(1);
  });

  it('oscillation around enter does not double-count', () => {
    // One full press, then oscillate 138<->142: it crosses enter but never
    // locks out or reverses, so no second rep may complete.
    const analyzer = new MovementAnalyzer('press', {}, 0);
    const seq: number[] = [];
    let prevA = 100;
    for (const s of pressRep(100, 175)) {
      for (let i = 1; i <= s.frames; i += 1) seq.push(prevA + ((s.angle - prevA) * i) / s.frames);
      prevA = s.angle;
    }
    for (let i = 0; i < 40; i += 1) seq.push(i % 2 === 0 ? 138 : 142);
    const out = seq.map((a, f) =>
      analyzer.analyze({ timestampMs: f * 50, landmarks: buildLandmarks('side', a, false), aspectRatio: 1 }),
    );
    expect(completed(out)).toHaveLength(1);
  });

  it('300ms tracking loss mid-press abandons the rep but the tracker recovers', () => {
    const results = drive(
      'press',
      [
        { angle: 100, frames: 16 },
        { angle: 175, frames: 12 },
        { angle: 175, frames: 8 },
        { angle: 100, frames: 24 },
        { angle: 100, frames: 20 },
      ],
      { dropout: [[28, 34]] },
    );
    expect(results.slice(28, 34).every((r) => !r.trackingValid)).toBe(true);
    expect(completed(results)).toHaveLength(0);
    expect(results.at(-1)?.calibrated).toBe(true);
    expect(results.at(-1)?.trackingValid).toBe(true);
  });

  it('plus-minus 5deg jitter on a held rack never starts a cycle', () => {
    const results = drive('press', [{ angle: 100, frames: 60 }], { jitterDeg: 5 });
    expect(results.every((r) => r.phase === 'ready')).toBe(true);
    expect(completed(results)).toHaveLength(0);
  });
});

describe('dips tracking accuracy (synthetic)', () => {
  it('calibrates promptly in top support', () => {
    const results = drive('dips', [{ angle: 168, frames: 20 }]);
    expect(results.at(-1)?.calibrated).toBe(true);
    expect(results.at(-1)?.phase).toBe('ready');
    expect(completed(results)).toHaveLength(0);
  });

  it('a bottom start guides to support instead of counting garbage', () => {
    const results = drive('dips', [{ angle: 90, frames: 40 }]);
    expect(results.every((r) => !r.calibrated)).toBe(true);
    expect(results.at(-1)?.guidance).toContain('Press up into support');
    expect(completed(results)).toHaveLength(0);
  });

  it('counts a full dip with no depth fault', () => {
    const results = drive('dips', downUp(168, 80));
    const reps = completed(results);
    expect(reps).toHaveLength(1);
    expect(reps[0].repMetrics?.min_angle).toBeGreaterThanOrEqual(76);
    expect(reps[0].repMetrics?.min_angle).toBeLessThanOrEqual(84);
    expect(reps[0].faults).toEqual([]);
  });

  it('counts a shallow-but-real dip with a depth cue (human buffer)', () => {
    const results = drive('dips', downUp(168, 110));
    const reps = completed(results);
    expect(reps).toHaveLength(1);
    expect(faultCodes(reps[0])).toContain('insufficient_depth');
  });

  it('does not count a quarter dip', () => {
    const results = drive('dips', downUp(168, 140));
    expect(completed(results)).toHaveLength(0);
  });

  it('pins the count threshold: 124 counts with a cue, 128 does not count', () => {
    const shallow = completed(drive('dips', downUp(168, 124, 16)));
    expect(shallow).toHaveLength(1);
    expect(faultCodes(shallow[0])).toContain('insufficient_depth');
    expect(completed(drive('dips', downUp(168, 128, 16)))).toHaveLength(0);
  });

  it('completes when returning to a soft top instead of a hard lockout', () => {
    // exit 155 -> return target 152; the old 160/157 pairing would strand this rep.
    const results = drive('dips', [
      { angle: 168, frames: 16 },
      { angle: 80, frames: 24 },
      { angle: 80, frames: 12 },
      { angle: 154, frames: 16 },
      { angle: 154, frames: 16 },
    ]);
    expect(completed(results)).toHaveLength(1);
  });

  it('does not count a full-ROM dip faster than minimumMs', () => {
    const results = drive('dips', [
      { angle: 168, frames: 16 },
      { angle: 80, frames: 4 },
      { angle: 80, frames: 2 },
      { angle: 168, frames: 4 },
      { angle: 168, frames: 4 },
    ]);
    expect(completed(results)).toHaveLength(0);
  });

  it('plus-minus 5deg jitter at top support never starts a rep', () => {
    const results = drive('dips', [{ angle: 168, frames: 60 }], { jitterDeg: 5 });
    expect(results.every((r) => r.phase === 'ready')).toBe(true);
    expect(completed(results)).toHaveLength(0);
  });

  it('oscillation around the return target does not double-count', () => {
    const analyzer = new MovementAnalyzer('dips', {}, 0);
    const seq: number[] = [];
    let prevA = 168;
    for (const s of downUp(168, 80)) {
      for (let i = 1; i <= s.frames; i += 1) seq.push(prevA + ((s.angle - prevA) * i) / s.frames);
      prevA = s.angle;
    }
    for (let i = 0; i < 40; i += 1) seq.push(i % 2 === 0 ? 150 : 154);
    const out = seq.map((a, f) =>
      analyzer.analyze({ timestampMs: f * 50, landmarks: buildLandmarks('side', a, false), aspectRatio: 1 }),
    );
    expect(completed(out)).toHaveLength(1);
  });

  it('300ms tracking loss mid-dip abandons the rep but the tracker recovers', () => {
    const results = drive(
      'dips',
      [
        { angle: 168, frames: 16 },
        { angle: 80, frames: 12 },
        { angle: 80, frames: 8 },
        { angle: 168, frames: 24 },
        { angle: 168, frames: 20 },
      ],
      { dropout: [[28, 34]] },
    );
    expect(results.slice(28, 34).every((r) => !r.trackingValid)).toBe(true);
    expect(completed(results)).toHaveLength(0);
    expect(results.at(-1)?.calibrated).toBe(true);
  });
});

describe('pullup tracking accuracy (synthetic)', () => {
  it('calibrates promptly in a dead hang', () => {
    const results = drive('pullup', [{ angle: 180, frames: 20 }]);
    expect(results.at(-1)?.calibrated).toBe(true);
    expect(results.at(-1)?.phase).toBe('ready');
    expect(completed(results)).toHaveLength(0);
  });

  it('a bent-arm start with hands below the shoulders guides to a dead hang', () => {
    const results = drive('pullup', [{ angle: 120, frames: 40 }], { pose: 'slouch' });
    expect(results.every((r) => !r.calibrated)).toBe(true);
    expect(results.at(-1)?.guidance).toContain('dead hang');
    expect(completed(results)).toHaveLength(0);
  });

  it('counts a full pull-up with no depth fault', () => {
    const results = drive('pullup', downUp(180, 60));
    const reps = completed(results);
    expect(reps).toHaveLength(1);
    expect(reps[0].repMetrics?.min_angle).toBeGreaterThanOrEqual(56);
    expect(reps[0].repMetrics?.min_angle).toBeLessThanOrEqual(64);
    expect(reps[0].faults).toEqual([]);
  });

  it('counts a slightly-shallow pull-up with a chin-over-bar cue (human buffer)', () => {
    const results = drive('pullup', downUp(180, 85));
    const reps = completed(results);
    expect(reps).toHaveLength(1);
    expect(faultCodes(reps[0])).toContain('incomplete_pull');
  });

  it('pins the count threshold: minimum 99 counts with a cue, 101 does not count', () => {
    const shallow = completed(drive('pullup', downUp(180, 99, 16)));
    expect(shallow).toHaveLength(1);
    expect(faultCodes(shallow[0])).toContain('incomplete_pull');
    expect(completed(drive('pullup', downUp(180, 101, 16)))).toHaveLength(0);
  });

  it('does not count a quarter pull-up', () => {
    const results = drive('pullup', downUp(180, 135));
    expect(completed(results)).toHaveLength(0);
  });

  it('completes when returning near but not fully to a dead hang', () => {
    // exit 155 -> return target 152; the old 160/157 pairing would strand this rep.
    const results = drive('pullup', [
      { angle: 180, frames: 16 },
      { angle: 60, frames: 24 },
      { angle: 60, frames: 12 },
      { angle: 154, frames: 16 },
      { angle: 154, frames: 16 },
    ]);
    expect(completed(results)).toHaveLength(1);
  });

  it('does not count a full-ROM pull-up faster than minimumMs', () => {
    const results = drive('pullup', [
      { angle: 180, frames: 16 },
      { angle: 60, frames: 4 },
      { angle: 60, frames: 2 },
      { angle: 180, frames: 4 },
      { angle: 180, frames: 4 },
    ]);
    expect(completed(results)).toHaveLength(0);
  });

  it('plus-minus 5deg jitter in a dead hang never starts a rep', () => {
    const results = drive('pullup', [{ angle: 180, frames: 60 }], { jitterDeg: 5 });
    expect(results.every((r) => r.phase === 'ready')).toBe(true);
    expect(completed(results)).toHaveLength(0);
  });

  it('oscillation around the return target does not double-count', () => {
    const analyzer = new MovementAnalyzer('pullup', {}, 0);
    const seq: number[] = [];
    let prevA = 180;
    for (const s of downUp(180, 60)) {
      for (let i = 1; i <= s.frames; i += 1) seq.push(prevA + ((s.angle - prevA) * i) / s.frames);
      prevA = s.angle;
    }
    for (let i = 0; i < 40; i += 1) seq.push(i % 2 === 0 ? 150 : 154);
    const out = seq.map((a, f) =>
      analyzer.analyze({ timestampMs: f * 50, landmarks: buildLandmarks('overhead', a, false), aspectRatio: 1 }),
    );
    expect(completed(out)).toHaveLength(1);
  });

  it('300ms tracking loss mid-pull abandons the rep but the tracker recovers', () => {
    const results = drive(
      'pullup',
      [
        { angle: 180, frames: 16 },
        { angle: 60, frames: 12 },
        { angle: 60, frames: 8 },
        { angle: 180, frames: 24 },
        { angle: 180, frames: 20 },
      ],
      { dropout: [[28, 34]] },
    );
    expect(results.slice(28, 34).every((r) => !r.trackingValid)).toBe(true);
    expect(completed(results)).toHaveLength(0);
    expect(results.at(-1)?.calibrated).toBe(true);
  });
});
