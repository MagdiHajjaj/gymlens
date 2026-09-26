import { mkdir, cp, writeFile, access } from 'node:fs/promises';
await mkdir('public/models', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/wasm', { recursive: true });
const path = 'public/models/pose_landmarker_full.task';
try {
  await access(path);
} catch {
  const response = await fetch(
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  );
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}
console.log('Local pose model and WASM assets ready.');
