/**
 * Headless smoke test for the vitals pipeline — no browser, no camera.
 *
 * Feeds a pre-recorded video file through the SmartSpectra SDK (useFile)
 * and prints validation + vitals events. Use a 30-60s, well-lit, mostly
 * still face clip for real numbers; without a face you still get
 * validation events proving the pipeline is alive.
 *
 *   PRESAGE_API_KEY=... node smoke.js <video.mp4>
 */
import {
  SmartSpectraSDK,
  decodeMetrics,
  breathingMetrics,
  cardioMetrics,
} from '@smartspectra/node-sdk';

const apiKey = process.env.PRESAGE_API_KEY;
const file = process.argv[2];
if (!apiKey || !file) {
  console.error('usage: PRESAGE_API_KEY=... node smoke.js <video.mp4>');
  process.exit(1);
}

const sdk = new SmartSpectraSDK({
  apiKey,
  requestedMetrics: [...breathingMetrics, ...cardioMetrics],
});

let vitalsSeen = 0;
sdk.on('validationStatus', (code, _ts, hint) => {
  console.log(`[validation] ${code} ${hint ?? ''}`);
});
sdk.on('metrics', (buf) => {
  const m = decodeMetrics(buf);
  if (Buffer.isBuffer(m)) return;
  vitalsSeen += 1;
  const pulse = m?.cardio?.pulseRate?.at?.(-1);
  const breath = m?.breathing?.rate?.at?.(-1);
  const pv = pulse?.value ?? pulse ?? null;
  const bv = breath?.value ?? breath ?? null;
  if (vitalsSeen % 30 === 1 || (pv != null && vitalsSeen % 30 === 0)) {
    console.log(`[metrics #${vitalsSeen}] pulse=${JSON.stringify(pv)} breathing=${JSON.stringify(bv)}`);
  }
});
sdk.on('processingStatus', (s) => console.log(`[status] ${s}`));
sdk.on('error', (code, message) => console.error(`[error] ${code}: ${message}`));

sdk.useFile(file);
sdk.start();
console.log('playing', file, '...');
const done = sdk.waitUntilComplete(120000);
console.log(done ? 'end of file reached' : 'timed out after 120s', `| metrics events: ${vitalsSeen}`);
await sdk.destroy();
process.exit(vitalsSeen > 0 ? 0 : 2);
