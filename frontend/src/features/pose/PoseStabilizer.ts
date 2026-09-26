import type { Landmark, PoseFrame } from '../../types/workout';

type Track = { point: Landmark; drawn: Landmark; seen: number; rejected: number; visible: boolean };
const distance = (a: Landmark, b: Landmark, aspect: number) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
const usable = (p?: Landmark) =>
  p && [p.x, p.y, p.z].every(Number.isFinite) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

/** Short visual hold is display-only; stale landmarks never enter rep analysis. */
export class PoseStabilizer {
  private tracks = new Map<number, Track>();
  private previous = -1;
  private lastDraw = -1;
  reset() {
    this.tracks.clear();
    this.previous = this.lastDraw = -1;
  }

  update(frame: PoseFrame): PoseFrame {
    const now = frame.timestampMs;
    if (this.previous >= 0 && (now <= this.previous || now - this.previous > 500)) this.reset();
    const dt = this.previous < 0 ? 50 : now - this.previous;
    this.previous = now;
    const points = frame.landmarks.map((p) => ({ ...p }));
    const world = frame.worldLandmarks?.map((p) => ({ ...p }));
    const aspect = frame.aspectRatio ?? 1;
    // Only torso anchors can justify relabelling the whole body. Moving/crossing
    // hands must never vote to swap the shoulders, hips, and legs.
    const shoulderSpread =
      (points[11] && points[12] ? Math.abs(points[11].x - points[12].x) : 0) +
      (points[23] && points[24] ? Math.abs(points[23].x - points[24].x) : 0);
    const hipSpread = points[23] && points[24] ? Math.abs(points[23].x - points[24].x) : 0;
    let same = 0,
      swapped = 0,
      pairs = 0;
    for (const i of [11, 23]) {
      const left = this.tracks.get(i),
        right = this.tracks.get(i + 1);
      if (
        !left ||
        !right ||
        now - left.seen > 200 ||
        now - right.seen > 200 ||
        !usable(points[i]) ||
        !usable(points[i + 1]) ||
        (points[i].visibility ?? 0) < 0.6 ||
        (points[i + 1].visibility ?? 0) < 0.6
      )
        continue;
      same += distance(left.point, points[i], aspect) + distance(right.point, points[i + 1], aspect);
      swapped += distance(left.point, points[i + 1], aspect) + distance(right.point, points[i], aspect);
      pairs++;
    }
    const torsoIsFrontal = shoulderSpread < 0.12 && hipSpread < 0.12;
    if (pairs === 2 && same > 0.15 * pairs && swapped < same * 0.35 && !torsoIsFrontal) {
      for (let i = 11; i < 33; i += 2) {
        [points[i], points[i + 1]] = [points[i + 1], points[i]];
        if (world) [world[i], world[i + 1]] = [world[i + 1], world[i]];
      }
    }
    // Reject isolated wrist teleports as a hand group. Never exchange wrists
    // based on screen position: crossed hands are a valid pose.
    const measured: Landmark[] = [];
    for (let i = 0; i < 33; i++) {
      const p = points[i];
      const track = this.tracks.get(i);
      const threshold = track?.visible ? 0.45 : 0.65;
      if (!usable(p) || (p.visibility ?? 0) < threshold) {
        if (track) track.visible = false;
        measured[i] = { x: 0, y: 0, z: 0, visibility: 0 };
        continue;
      }
      const jump = track && now - track.seen < 300 && distance(track.point, p, aspect) > 0.06 + dt * 0.0018;
      if (jump && track.rejected < 2) {
        track.rejected++;
        measured[i] = { ...track.point, visibility: 0 };
        continue;
      }
      const fresh = !track || now - track.seen > 250 || jump;
      const alpha = fresh ? 1 : 1 - Math.exp(-dt / 45);
      const point = {
        ...p,
        x: track ? track.point.x + alpha * (p.x - track.point.x) : p.x,
        y: track ? track.point.y + alpha * (p.y - track.point.y) : p.y,
        // Visibility hysteresis avoids flickering at the analyzer's threshold.
        visibility: Math.max(0.6, p.visibility ?? 0),
      };
      this.tracks.set(i, {
        point,
        drawn: fresh ? { ...point } : track.drawn,
        seen: now,
        rejected: 0,
        visible: true,
      });
      measured[i] = point;
    }
    return { ...frame, landmarks: measured, worldLandmarks: world };
  }

  render(now: number): Landmark[] {
    const dt = this.lastDraw < 0 ? 16 : Math.max(0, now - this.lastDraw);
    this.lastDraw = now;
    const alpha = 1 - Math.exp(-dt / 30);
    return Array.from({ length: 33 }, (_, i) => {
      const track = this.tracks.get(i);
      if (!track) return { x: 0, y: 0, z: 0, visibility: 0 };
      track.drawn.x += alpha * (track.point.x - track.drawn.x);
      track.drawn.y += alpha * (track.point.y - track.drawn.y);
      const age = now - track.seen;
      return { ...track.drawn, visibility: Math.max(0, 1 - Math.max(0, age - 80) / 160) };
    });
  }
}
