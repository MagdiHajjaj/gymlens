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

/**
 * Focal point for each photo, as a CSS `object-position` value.
 * The card banners are wide and short while most photos are portrait,
 * so `object-fit: cover` crops hard — these keep the person's head and
 * torso in frame instead of the default dead-center crop.
 * Tuned against the actual photo files in public/exercises/photos/.
 */
const FOCUS: Record<string, string> = {
  squat: '50% 62%',
  curl: '50% 50%',
  pushup: '50% 55%',
  deadlift: '50% 50%',
  lunge: '50% 50%',
  press: '50% 28%',
  glute_bridge: '50% 50%',
  row: '50% 45%',
  dips: '65% 42%',
  pullup: '50% 55%',
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
      style={{ objectPosition: FOCUS[key] ?? '50% 50%' }}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Push/Pull/Legs training split. Mirrors the `movement` taxonomy on
 * ExerciseRegistry (push: push-up/press/dips, pull: pull-up/row/curl,
 * legs: squat/deadlift/lunge/glute bridge).
 */
export type Movement = 'push' | 'pull' | 'legs';

/** Representative exercise photo for each movement category. */
const MOVEMENT_EXERCISE: Record<Movement, ExerciseId> = {
  push: 'pushup',
  pull: 'pullup',
  legs: 'squat',
};

const MOVEMENT_LABELS: Record<Movement, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
};

/**
 * Compact circular category artwork for the dashboard filter chips.
 * Reuses the exercise photo + tuned object-position focal point of the
 * category's representative exercise, so crops stay consistent with
 * ExerciseArt.
 */
export function CategoryArt({
  movement,
  size = 44,
  alt,
}: {
  movement: Movement;
  size?: number;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  const exercise = MOVEMENT_EXERCISE[movement];
  const key = exercise as string;
  const src = exercise ? PHOTOS[key] : undefined;
  if (!src || failed) {
    return (
      <div
        className="category-art category-art-fallback"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <span>{MOVEMENT_LABELS[movement] ?? 'Category'}</span>
      </div>
    );
  }
  return (
    <img
      className="category-art"
      src={src}
      alt={alt ?? `${MOVEMENT_LABELS[movement]} exercises`}
      loading="lazy"
      width={size}
      height={size}
      style={{ objectPosition: FOCUS[key] ?? '50% 50%' }}
      onError={() => setFailed(true)}
    />
  );
}
