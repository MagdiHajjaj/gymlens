/**
 * Frame grabber: captures downscaled JPEG frames from a <video> element
 * using an offscreen canvas. No second camera stream is needed — it
 * reuses the pixels already on screen.
 *
 * Desktop default: ~320px wide at ~10fps. Callers (mobile) can pass a
 * smaller width / longer interval to save battery.
 */

export interface FrameGrabberOptions {
  /** Target frame width in px; height follows the video aspect ratio. */
  width?: number;
  /** JPEG quality 0–1. */
  quality?: number;
}

export class FrameGrabber {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private quality: number;

  constructor(options: FrameGrabberOptions = {}) {
    this.width = options.width ?? 320;
    this.quality = options.quality ?? 0.7;
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  /**
   * Capture one frame from the video element. Returns the JPEG bytes,
   * or null when the video has no playable frame yet.
   */
  grab(video: HTMLVideoElement): Uint8Array | null {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return null;
    const scale = this.width / vw;
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = this.canvas.toDataURL('image/jpeg', this.quality);
    // dataUrl is "data:image/jpeg;base64,..." — decode the payload.
    const base64 = dataUrl.split(',', 2)[1] ?? '';
    if (!base64) return null;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  dispose() {
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
