import type { ExerciseId, ExerciseResult, Landmark } from '../../types/workout';

export function muscleIntensity(exercise: ExerciseId, result: ExerciseResult | null): number {
  if (!result?.trackingValid) return 0;
  const activeAngles = Object.entries(result.jointAngles).filter(([key]) =>
    ['elbow_angle', 'knee_angle', 'hip_angle', 'upper_arm_angle', 'torso_lean', 'hip_alignment'].includes(key),
  );
  if (!activeAngles.length) return 0;
  const drive = activeAngles
    .map(([key, value]) => {
      if (!Number.isFinite(value)) return 0;
      if (key === 'torso_lean' || key === 'hip_alignment') {
        return Math.max(0, Math.min(1, (35 - value) / 35));
      }
      const target =
        key === 'knee_angle' || key === 'hip_angle' ? 105 : key === 'upper_arm_angle' ? 90 : 65;
      return Math.max(0, Math.min(1, (165 - value) / (165 - target)));
    })
    .reduce((sum, score) => sum + score, 0);
  return drive / activeAngles.length;
}

export function drawMuscleHeatmap(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  exercise: ExerciseId,
  result: ExerciseResult,
  width: number,
  height: number,
) {
  const segments: Partial<Record<ExerciseId, [number, number][]>> = {
    squat: [
      [23, 25],
      [25, 27],
    ],
    lunge: [
      [23, 25],
      [25, 27],
    ],
    deadlift: [
      [11, 23],
      [23, 25],
    ],
    glute_bridge: [
      [11, 23],
      [23, 25],
    ],
    pushup: [
      [11, 13],
      [13, 15],
    ],
    curl: [
      [11, 13],
      [13, 15],
    ],
    press: [
      [11, 13],
      [13, 15],
    ],
    row: [
      [11, 13],
      [13, 15],
    ],
    dips: [
      [11, 13],
      [13, 15],
    ],
    pullup: [
      [11, 13],
      [13, 15],
    ],
  };
  const exerciseSegments = segments[exercise] ?? [[11, 13]];
  const drawSegment = (side: number) => {
    if (!result.trackingValid || (exercise !== 'curl' && side === undefined)) return;
    const heat = muscleIntensity(exercise, result);
    const hue = 48 * (1 - heat);
    for (const [start, end] of exerciseSegments) {
      const a = landmarks[start + side];
      const b = landmarks[end + side];
      if (!a || !b || (a.visibility ?? 0) < 0.6 || (b.visibility ?? 0) < 0.6) continue;
      const dx = (b.x - a.x) * width,
        dy = (b.y - a.y) * height;
      const length = Math.hypot(dx, dy);
      if (length < 4) continue;
      ctx.save();
      ctx.translate(((a.x + b.x) * width) / 2, ((a.y + b.y) * height) / 2);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.scale(length * 0.48, Math.max(10, length * 0.19));
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, `hsla(${hue}, 100%, 56%, 0.85)`);
      gradient.addColorStop(0.55, `hsla(${hue}, 100%, 50%, 0.55)`);
      gradient.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  if (exercise === 'curl' && result.arms) {
    for (const arm of result.arms) {
      if (!arm.trackingValid || arm.angle === undefined) continue;
      drawMuscleHeatmap(
        ctx,
        landmarks,
        exercise,
        {
          ...result,
          arms: undefined,
          trackingValid: true,
          trackedSide: arm.side,
          jointAngles: { elbow_angle: arm.angle },
        },
        width,
        height,
      );
    }
    return;
  }
  if (!result.trackingValid) return;

  if (exercise === 'squat' || exercise === 'lunge') {
    for (const side of [0, 1]) {
      drawSegment(side);
    }
    return;
  }
  if (['pushup', 'press', 'row', 'dips', 'pullup'].includes(exercise)) {
    for (const side of [0, 1]) drawSegment(side);
    return;
  }
  if (result.trackedSide === undefined) return;
  drawSegment(result.trackedSide);
}
