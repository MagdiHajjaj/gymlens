import type { Landmark, ExerciseId, ExerciseResult } from '../../types/workout';
import { drawMuscleHeatmap } from './MuscleHeatmap';
import { drawPersonBox } from './PersonBox';
const connections = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 31],
  [28, 32],
];
export function drawSkeleton(
  canvas: HTMLCanvasElement,
  landmarks: Landmark[],
  demo: boolean,
  valid: boolean,
  exercise?: ExerciseId,
  result?: ExerciseResult,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (demo) {
    ctx.strokeStyle = '#ffffff0a';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#b9d6be30';
    ctx.beginPath();
    ctx.moveTo(width * 0.15, height * 0.92);
    ctx.lineTo(width * 0.85, height * 0.92);
    ctx.stroke();
  }
  drawPersonBox(ctx, landmarks, width, height, !demo);
  if (exercise && result) drawMuscleHeatmap(ctx, landmarks, exercise, result, width, height);
  ctx.strokeStyle = valid ? '#c5f277' : '#d8dacf';
  ctx.lineWidth = demo ? 8 : 3;
  ctx.lineCap = 'round';
  const visible = (i: number) => landmarks[i] && (landmarks[i].visibility ?? 0) > 0.05;
  for (const [a, b] of connections) {
    if (!visible(a) || !visible(b)) continue;
    ctx.globalAlpha = Math.min(landmarks[a].visibility ?? 0, landmarks[b].visibility ?? 0);
    ctx.beginPath();
    ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height);
    ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height);
    ctx.stroke();
  }
  landmarks.forEach((p, i) => {
    if (!visible(i) || i > 32 || (i < 11 && i !== 0)) return;
    ctx.globalAlpha = p.visibility ?? 0;
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, demo && i === 0 ? 22 : demo ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 && demo ? '#c5f277' : '#f4ffde';
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}
