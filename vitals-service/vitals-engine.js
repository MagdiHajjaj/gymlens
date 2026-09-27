/**
 * VitalsEngine — thin wrapper around the Presage SmartSpectra Node.js SDK.
 *
 * One engine owns one SDK session. The native SDK keeps process-global state,
 * so only a single session may exist per process; the server enforces this.
 *
 * Input: JPEG frames (as sent by the browser) -> decoded to RGB -> SDK.
 * Output: vitals snapshots via the onVitals callback, always carrying
 * confidence. A confidence of 0 means "still measuring" — callers must never
 * present the value as a real reading in that state.
 */
import {
  SmartSpectraSDK,
  PixelFormat,
  decodeMetrics,
  breathingMetrics,
  cardioMetrics,
} from '@smartspectra/node-sdk';
import jpeg from 'jpeg-js';

function latestSample(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[arr.length - 1];
}

// Metric samples may be primitives or { value, confidence, ... } objects.
function readSample(sample) {
  if (sample == null) return { value: null, confidence: 0 };
  if (typeof sample === 'object') {
    return {
      value: typeof sample.value === 'number' ? sample.value : null,
      confidence: typeof sample.confidence === 'number' ? sample.confidence : 0,
    };
  }
  return { value: typeof sample === 'number' ? sample : null, confidence: 0 };
}

function rgbaToRgb(rgba, width, height) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  return rgb;
}

export class VitalsEngine {
  constructor({ apiKey, onVitals, onValidation, onError }) {
    if (!apiKey) throw new Error('PRESAGE_API_KEY is required');
    this.apiKey = apiKey;
    this.onVitals = onVitals ?? (() => {});
    this.onValidation = onValidation ?? (() => {});
    this.onError = onError ?? (() => {});
    this.sdk = null;
    this.running = false;
    this.framesAccepted = 0;
    this.framesDropped = 0;
  }

  start() {
    if (this.running) return;
    const sdk = new SmartSpectraSDK({
      apiKey: this.apiKey,
      requestedMetrics: [...breathingMetrics, ...cardioMetrics],
    });
    sdk.on('metrics', (buf) => {
      try {
        const m = decodeMetrics(buf);
        if (Buffer.isBuffer(m)) return; // undecodable payload
        const pulse = readSample(latestSample(m?.cardio?.pulseRate));
        const breathing = readSample(latestSample(m?.breathing?.rate));
        this.onVitals({
          type: 'vitals',
          pulse_bpm: pulse.value,
          pulse_confidence: pulse.confidence,
          breathing_bpm: breathing.value,
          breathing_confidence: breathing.confidence,
          ts: Date.now(),
        });
      } catch (err) {
        this.onError({ type: 'error', message: `metrics decode failed: ${err.message}` });
      }
    });
    sdk.on('validationStatus', (code, _ts, hint) => {
      this.onValidation({ type: 'validation', code: String(code), hint: String(hint ?? '') });
    });
    sdk.on('error', (code, message, retryable) => {
      this.onError({ type: 'error', message: String(message ?? code), retryable: !!retryable });
    });
    sdk.useCustomInput();
    sdk.start();
    this.sdk = sdk;
    this.running = true;
  }

  /** Push one JPEG frame. Returns false if the frame was dropped (backpressure). */
  pushJpeg(jpegBuffer, timestampUs) {
    if (!this.running || !this.sdk) return false;
    let decoded;
    try {
      decoded = jpeg.decode(jpegBuffer, { useTArray: true });
    } catch {
      return false;
    }
    const { width, height, data } = decoded;
    const rgb = rgbaToRgb(data, width, height);
    const ok = this.sdk.sendFrame(rgb, width, height, width * 3, PixelFormat.kRGB, timestampUs);
    if (ok) this.framesAccepted += 1;
    else this.framesDropped += 1;
    return ok;
  }

  async stop() {
    if (!this.running) return;
    this.running = false;
    try {
      await this.sdk.stopAsync();
    } finally {
      await this.sdk.destroy();
      this.sdk = null;
    }
  }

  stats() {
    return {
      running: this.running,
      framesAccepted: this.framesAccepted,
      framesDropped: this.framesDropped,
    };
  }
}
