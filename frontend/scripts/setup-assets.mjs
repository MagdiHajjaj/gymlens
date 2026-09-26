import { mkdir, cp, writeFile, access, stat } from 'node:fs/promises';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// MediaPipe pose assets (WASM + model)
// ---------------------------------------------------------------------------
await mkdir('public/models', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/wasm', { recursive: true });
const modelPath = 'public/models/pose_landmarker_full.task';
try {
  await access(modelPath);
} catch {
  const response = await fetch(
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  );
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  await writeFile(modelPath, Buffer.from(await response.arrayBuffer()));
}
console.log('Local pose model and WASM assets ready.');

// ---------------------------------------------------------------------------
// Demo videos: real humans performing each exercise.
//
// These are downloaded at build/setup time (not committed) so the repo stays
// lean and the app serves them from its own domain (no CORS issues).
// Every clip was visually verified: real human, good form, steady camera,
// full movement visible. `bytes` is the expected file size; a mismatch
// triggers a re-download.
// ---------------------------------------------------------------------------
const DEMO_VIDEOS = [
  {
    id: 'squat',
    url: 'https://videos.pexels.com/video-files/8837221/8837221-sd_506_960_25fps.mp4',
    bytes: 911733,
    credit: 'MART PRODUCTION',
    source: 'https://www.pexels.com/video/a-woman-in-activewear-doing-squats-at-home-8837221/',
    license: 'Pexels License',
  },
  {
    id: 'deadlift',
    url: 'https://videos.pexels.com/video-files/14180867/14180867-sd_960_480_24fps.mp4',
    bytes: 3124488,
    credit: 'Navdeep Singh',
    source: 'https://www.pexels.com/video/deadlift-back-workout-14180867/',
    license: 'Pexels License',
  },
  {
    id: 'lunge',
    url: 'https://assets.mixkit.co/videos/52112/52112-720.mp4',
    bytes: 2562354,
    credit: 'Mixkit',
    source: 'https://mixkit.co/free-stock-video/a-young-woman-clad-in-snugly-black-sportswear-doing-lunges-52112/',
    license: 'Mixkit Stock Video Free License',
  },
  {
    id: 'curl',
    url: 'https://videos.pexels.com/video-files/5319439/5319439-sd_360_640_25fps.mp4',
    bytes: 1080937,
    credit: 'Tima Miroshnichenko',
    source: 'https://www.pexels.com/video/man-holding-dumbbells-5319431/',
    license: 'Pexels License',
  },
  {
    id: 'press',
    url: 'https://videos.pexels.com/video-files/4367541/4367541-sd_640_360_30fps.mp4',
    bytes: 1015456,
    credit: 'Pavel Danilyuk',
    source: 'https://www.pexels.com/video/a-man-doing-dumbbell-shoulder-press-4367541/',
    license: 'Pexels License',
  },
  {
    id: 'glute_bridge',
    url: 'https://videos.pexels.com/video-files/8502835/8502835-sd_640_360_25fps.mp4',
    bytes: 877756,
    credit: 'Ivan S',
    source: 'https://www.pexels.com/video/a-woman-lifting-her-hips-8502835/',
    license: 'Pexels License',
  },
  {
    id: 'pushup',
    url: 'https://videos.pexels.com/video-files/4804819/4804819-hd_1280_720_25fps.mp4',
    bytes: 4537731,
    credit: 'Ketut Subiyanto',
    source: 'https://www.pexels.com/video/topless-man-doing-push-ups-4804819/',
    license: 'Pexels License',
  },
  {
    id: 'pullup',
    url: 'https://assets.mixkit.co/videos/735/735-720.mp4',
    bytes: 6803097,
    credit: 'Mixkit',
    source: 'https://mixkit.co/free-stock-video/man-doing-pull-ups-735/',
    license: 'Mixkit Stock Video Free License',
  },
  {
    id: 'dips',
    url: 'https://cdn.coverr.co/videos/coverr-a-man-does-bar-dips-2608/720p.mp4',
    bytes: 3463389,
    credit: 'Coverr',
    source: 'https://coverr.co/videos/a-man-does-bar-dips',
    license: 'Coverr License (free for personal and commercial use, no attribution required)',
  },
  {
    id: 'row',
    url: 'https://upload.wikimedia.org/wikipedia/commons/b/b2/Bent-over_row_-_exercise_demonstration_video.webm',
    bytes: 376097,
    ext: 'webm',
    credit: 'FitnessScape',
    source: 'https://commons.wikimedia.org/wiki/File:Bent-over_row_-_exercise_demonstration_video.webm',
    license: 'CC BY 3.0',
  },
];

const videoDir = 'public/exercises/videos';
await mkdir(videoDir, { recursive: true });

async function needsDownload(path, expectedBytes) {
  try {
    const s = await stat(path);
    return s.size !== expectedBytes;
  } catch {
    return true;
  }
}

for (const v of DEMO_VIDEOS) {
  const ext = v.ext || 'mp4';
  const dest = join(videoDir, `${v.id}.${ext}`);
  if (await needsDownload(dest, v.bytes)) {
    console.log(`Downloading demo video: ${v.id}.${ext} ...`);
    const res = await fetch(v.url);
    if (!res.ok) throw new Error(`Demo video download failed (${v.id}): ${res.status}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    const s = await stat(dest);
    if (s.size !== v.bytes) {
      console.warn(
        `Warning: ${v.id}.${ext} size ${s.size} != expected ${v.bytes}; keeping download but verify the clip.`,
      );
    }
  }
}

// Attribution file served alongside the videos.
const credits = [
  '# Demo video credits',
  '',
  'Sample footage used for the GymLens video demo. All clips show real humans',
  'performing the exercise with good form, analyzed on-device by the same',
  'pose pipeline as live camera sessions.',
  '',
  ...DEMO_VIDEOS.flatMap((v) => [
    `## ${v.id}`,
    `- File: \`${v.id}.${v.ext || 'mp4'}\``,
    `- Credit: ${v.credit}`,
    `- Source: ${v.source}`,
    `- License: ${v.license}`,
    '',
  ]),
].join('\n');
await writeFile(join(videoDir, 'CREDITS.md'), credits);

console.log(`Demo videos ready (${DEMO_VIDEOS.length} clips).`);
