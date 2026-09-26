import type { Landmark } from '../../types/workout';
export function jointAngle(a: Landmark, b: Landmark, c: Landmark, aspect = 1): number {
  const u = [(a.x - b.x) * aspect, a.y - b.y];
  const v = [(c.x - b.x) * aspect, c.y - b.y];
  const divisor = Math.hypot(...u) * Math.hypot(...v);
  if (divisor < 1e-8) return NaN;
  return (Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / divisor))) * 180) / Math.PI;
}
export function inclination(a: Landmark, b: Landmark, aspect = 1): number {
  return (Math.atan2(Math.abs(a.x - b.x) * aspect, Math.abs(a.y - b.y)) * 180) / Math.PI;
}
