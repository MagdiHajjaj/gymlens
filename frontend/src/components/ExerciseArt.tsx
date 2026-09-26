import { useState } from 'react';
import type { ExerciseId } from '../types/workout';

const PHOTOS: Record<string, string> = {
  squat: '/exercises/photos/squat.jpg',
  curl: '/exercises/photos/curl.jpg',
  pushup: '/exercises/photos/pushup.jpg',
  deadlift: '/exercises/photos/deadlift.jpg',
  lunge: '/exercises/photos/lunge.jpg',
  press: '/exercises/photos/press.jpg',
  glute_bridge: '/exercises/photos/glute-bridge.jpg',
  row: '/exercises/photos/bent-over-row.jpg',
  dips: '/exercises/photos/tricep-dips.jpg',
  pullup: '/exercises/photos/pull-up.jpg',
};

const LABELS: Record<string, string> = {
  squat: 'Squat',
  curl: 'Bicep curl',
  pushup: 'Push-up',
  deadlift: 'Romanian deadlift',
  lunge: 'Lunge',
  press: 'Overhead press',
  glute_bridge: 'Glute bridge',
  row: 'Bent-over row',
  dips: 'Tricep dips',
  pullup: 'Pull-up',
};

export function ExerciseArt({ exercise, large = false }: { exercise: ExerciseId; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const key = exercise as string;
  const src = PHOTOS[key];
  if (!src || failed) {
    return (
      <div
        className={`exercise-art exercise-art-fallback ${large ? 'large-art' : ''}`}
        aria-hidden="true"
      >
        <span>{LABELS[key] ?? 'Exercise'}</span>
      </div>
    );
  }
  return (
    <img
      className={`exercise-art ${large ? 'large-art' : ''}`}
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
