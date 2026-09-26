import type { Landmark } from '../../types/workout';

/** Bounds of the detected pose, including an upper-body-only view. */
export function personBounds(landmarks: Landmark[]) {
  const visible = (p?: Landmark) =>
    p &&
    (p.visibility ?? 0) > 0.3 &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.x >= 0 &&
    p.x <= 1 &&
    p.y >= 0 &&
    p.y <= 1;
  if (![11, 12, 23, 24].filter((i) => visible(landmarks[i])).length) return null;
  const points = landmarks.filter((p, i) => (i === 0 || i >= 11) && visible(p));
  if (points.length < 4) return null;
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  return {
    left: Math.max(0.015, Math.min(...xs) - 0.06),
    top: Math.max(0.025, Math.min(...ys) - 0.08),
    right: Math.min(0.985, Math.max(...xs) + 0.06),
    bottom: Math.min(0.98, Math.max(...ys) + 0.05),
  };
}

export function drawPersonBox(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  width: number,
  height: number,
  mirrored = false,
) {
  const box = personBounds(landmarks);
  if (!box) return;
  const x = box.left * width,
    y = box.top * height;
  const w = (box.right - box.left) * width,
    h = (box.bottom - box.top) * height;
  ctx.save();
  ctx.strokeStyle = '#b8efbf55';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = '#b8efbf';
  ctx.lineWidth = 3;
  const corner = Math.min(22, w / 4, h / 4);
  for (const [cx, cy, sx, sy] of [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * corner, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * corner);
    ctx.stroke();
  }
  ctx.font = `${Math.max(12, width * 0.016)}px sans-serif`;
  ctx.fillStyle = '#b8efbf';
  if (mirrored) {
    ctx.translate(x + w - 9, y + 20);
    ctx.scale(-1, 1);
    ctx.fillText('PERSON · POSE TRACKED', 0, 0);
  } else ctx.fillText('PERSON · POSE TRACKED', x + 9, y + 20);
  ctx.restore();
}
