import { test } from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { VitalsEngine } from '../vitals-engine.js';

function tinyJpeg() {
  const w = 8, h = 8;
  const rgba = Buffer.alloc(w * h * 4, 128);
  return jpeg.encode({ data: rgba, width: w, height: h }, 80).data;
}

function metricPayload({ pulse, pulseConf, breath, breathConf }) {
  return Buffer.from(JSON.stringify({
    cardio: { pulseRate: [{ value: pulse, confidence: pulseConf }] },
    breathing: { rate: [{ value: breath, confidence: breathConf }] },
  }));
}

test('constructor throws without an API key', () => {
  assert.throws(() => new VitalsEngine({}), /PRESAGE_API_KEY/);
  assert.throws(() => new VitalsEngine({ apiKey: '' }), /PRESAGE_API_KEY/);
});

test('start/stop lifecycle', async () => {
  const engine = new VitalsEngine({ apiKey: 'test-key' });
  assert.equal(engine.stats().running, false);
  engine.start();
  assert.equal(engine.stats().running, true);
  assert.ok(engine.sdk.started);
  await engine.stop();
  assert.equal(engine.stats().running, false);
  assert.ok(engine.sdk === null);
});

test('pushJpeg decodes and forwards frames; invalid JPEG is dropped', () => {
  const engine = new VitalsEngine({ apiKey: 'test-key' });
  engine.start();
  assert.equal(engine.pushJpeg(tinyJpeg(), 1000), true);
  assert.equal(engine.stats().framesAccepted, 1);
  assert.equal(engine.pushJpeg(Buffer.from('not a jpeg'), 2000), false);
  assert.equal(engine.stats().framesAccepted, 1);
});

test('pushJpeg before start is dropped', () => {
  const engine = new VitalsEngine({ apiKey: 'test-key' });
  assert.equal(engine.pushJpeg(tinyJpeg(), 1000), false);
});

test('vitals events carry value + confidence (object samples)', async () => {
  const seen = [];
  const engine = new VitalsEngine({ apiKey: 'test-key', onVitals: (v) => seen.push(v) });
  engine.start();
  engine.sdk.emit('metrics', metricPayload({ pulse: 72, pulseConf: 85, breath: 14, breathConf: 70 }));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].type, 'vitals');
  assert.equal(seen[0].pulse_bpm, 72);
  assert.equal(seen[0].pulse_confidence, 85);
  assert.equal(seen[0].breathing_bpm, 14);
  assert.equal(seen[0].breathing_confidence, 70);
});

test('zero-confidence samples surface as Measuring state (value may be null)', async () => {
  const seen = [];
  const engine = new VitalsEngine({ apiKey: 'test-key', onVitals: (v) => seen.push(v) });
  engine.start();
  engine.sdk.emit('metrics', Buffer.from(JSON.stringify({
    cardio: { pulseRate: [{ value: null, confidence: 0 }] },
    breathing: { rate: [] },
  })));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].pulse_bpm, null);
  assert.equal(seen[0].pulse_confidence, 0);
  assert.equal(seen[0].breathing_bpm, null);
  assert.equal(seen[0].breathing_confidence, 0);
});

test('primitive samples degrade gracefully (confidence 0)', async () => {
  const seen = [];
  const engine = new VitalsEngine({ apiKey: 'test-key', onVitals: (v) => seen.push(v) });
  engine.start();
  engine.sdk.emit('metrics', Buffer.from(JSON.stringify({
    cardio: { pulseRate: [68] },
    breathing: { rate: [15] },
  })));
  assert.equal(seen[0].pulse_bpm, 68);
  assert.equal(seen[0].pulse_confidence, 0);
});

test('undecodable metrics payload does not crash; reports error', async () => {
  const errors = [];
  const vitals = [];
  const engine = new VitalsEngine({
    apiKey: 'test-key',
    onVitals: (v) => vitals.push(v),
    onError: (e) => errors.push(e),
  });
  engine.start();
  engine.sdk.emit('metrics', Buffer.from('{{{not json'));
  assert.equal(vitals.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /metrics decode failed/);
});

test('SDK error events are isolated to onError', async () => {
  const errors = [];
  const engine = new VitalsEngine({ apiKey: 'test-key', onError: (e) => errors.push(e) });
  engine.start();
  engine.sdk.emit('error', 3, 'boom', false);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'boom');
  assert.equal(engine.stats().running, true); // engine survives SDK errors
});

test('validation events pass through', async () => {
  const validations = [];
  const engine = new VitalsEngine({ apiKey: 'test-key', onValidation: (v) => validations.push(v) });
  engine.start();
  engine.sdk.emit('validationStatus', 7, 12345, 'face not visible');
  assert.equal(validations.length, 1);
  assert.equal(validations[0].type, 'validation');
});
