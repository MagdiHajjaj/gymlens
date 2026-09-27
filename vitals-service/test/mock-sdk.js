/**
 * Mock of @smartspectra/node-sdk for unit/protocol tests.
 * Mirrors the real module's export surface; decodeMetrics parses JSON
 * so tests can inject synthetic metric payloads.
 */
export const PixelFormat = { kRGB: 0 };
export const breathingMetrics = [0, 1, 2];
export const cardioMetrics = [15, 16];
export const ValidationCode = { OK: 0 };

export function decodeMetrics(buf) {
  return JSON.parse(Buffer.from(buf).toString('utf8'));
}

export class SmartSpectraSDK {
  constructor(opts = {}) {
    if (!opts.apiKey) throw new Error('apiKey is required');
    this.opts = opts;
    this.handlers = {};
    this.frames = [];
    this.started = false;
    this.destroyed = false;
  }
  on(event, cb) {
    (this.handlers[event] ??= []).push(cb);
    return this;
  }
  emit(event, ...args) {
    for (const cb of this.handlers[event] ?? []) cb(...args);
  }
  useCustomInput() {}
  start() {
    this.started = true;
  }
  sendFrame(rgb, width, height, stride, pixelFormat, timestampUs) {
    this.frames.push({ width, height, timestampUs });
    return true;
  }
  async stopAsync() {
    this.started = false;
  }
  async destroy() {
    this.destroyed = true;
  }
}
