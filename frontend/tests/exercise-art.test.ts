import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { CategoryArt, ExerciseArt, type Movement } from '../src/components/ExerciseArt';
import { exercises } from '../src/features/exercises/ExerciseRegistry';
import type { ExerciseId } from '../src/types/workout';

const EXERCISES = [
  'squat',
  'curl',
  'pushup',
  'deadlift',
  'lunge',
  'press',
  'glute_bridge',
  'row',
  'dips',
  'pullup',
] as const;

it.each(EXERCISES)('renders %s photo with an explicit object-position focal point', (exercise) => {
  const html = renderToStaticMarkup(createElement(ExerciseArt, { exercise }));
  expect(html).toContain('<img');
  expect(html).toMatch(/object-position:\s*\d+%\s+\d+%/);
});

it('biases the overhead-press crop toward the head instead of dead center', () => {
  const html = renderToStaticMarkup(createElement(ExerciseArt, { exercise: 'press' }));
  expect(html).toContain('object-position:50% 28%');
});

it('biases the tricep-dips crop toward the subject on the right', () => {
  const html = renderToStaticMarkup(createElement(ExerciseArt, { exercise: 'dips' }));
  expect(html).toContain('object-position:65% 42%');
});

it('falls back to a labeled div when the exercise has no photo', () => {
  const html = renderToStaticMarkup(
    createElement(ExerciseArt, { exercise: 'not-a-real-exercise' as never }),
  );
  expect(html).not.toContain('<img');
  expect(html).toContain('exercise-art-fallback');
});

const PHOTOS_DIR = fileURLToPath(new URL('../public/exercises/photos', import.meta.url));

const EXPECTED_PHOTOS: Record<ExerciseId, string> = {
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

it.each(Object.keys(EXPECTED_PHOTOS) as ExerciseId[])(
  'resolves the correct photo for %s',
  (exercise) => {
    const html = renderToStaticMarkup(createElement(ExerciseArt, { exercise }));
    expect(html).toContain('<img');
    expect(html).toContain(`src="${EXPECTED_PHOTOS[exercise]}"`);
  },
);

it('covers every exercise in the registry so the workout setup panel never renders a broken image', () => {
  const registryIds = Object.keys(exercises) as ExerciseId[];
  expect(registryIds.length).toBeGreaterThan(0);
  for (const id of registryIds) {
    const html = renderToStaticMarkup(createElement(ExerciseArt, { exercise: id }));
    // Either a real photo or the labeled fallback — never an <img> with a missing src.
    if (html.includes('<img')) {
      expect(html).toMatch(/src="\/exercises\/photos\/[^"]+\.jpg"/);
    } else {
      expect(html).toContain('exercise-art-fallback');
    }
  }
});

it('maps every photo to a file that actually ships in public/exercises/photos', () => {
  const shipped = new Set(readdirSync(PHOTOS_DIR));
  for (const [exercise, src] of Object.entries(EXPECTED_PHOTOS)) {
    const file = src.split('/').pop()!;
    expect(
      shipped.has(file),
      `${exercise} maps to ${src} but ${file} is not in public/exercises/photos`,
    ).toBe(true);
    expect(existsSync(`${PHOTOS_DIR}/${file}`)).toBe(true);
  }
});

const EXPECTED_CATEGORY_PHOTOS: Record<Movement, string> = {
  push: '/exercises/photos/pushup.jpg',
  pull: '/exercises/photos/pull-up.jpg',
  legs: '/exercises/photos/squat.jpg',
};

it.each(Object.keys(EXPECTED_CATEGORY_PHOTOS) as Movement[])(
  'CategoryArt renders the %s category photo',
  (movement) => {
    const html = renderToStaticMarkup(createElement(CategoryArt, { movement }));
    expect(html).toContain('<img');
    expect(html).toContain(`src="${EXPECTED_CATEGORY_PHOTOS[movement]}"`);
  },
);

it('CategoryArt reuses the representative exercise focal point so crops match ExerciseArt', () => {
  // push -> pushup (50% 55%), pull -> pullup (50% 55%), legs -> squat (50% 62%)
  const expectations: Record<Movement, string> = {
    push: 'object-position:50% 55%',
    pull: 'object-position:50% 55%',
    legs: 'object-position:50% 62%',
  };
  for (const [movement, position] of Object.entries(expectations) as [Movement, string][]) {
    const html = renderToStaticMarkup(createElement(CategoryArt, { movement }));
    expect(html).toContain(position);
  }
});

it('CategoryArt applies a custom size and a descriptive alt', () => {
  const html = renderToStaticMarkup(createElement(CategoryArt, { movement: 'legs', size: 64 }));
  expect(html).toContain('width="64"');
  expect(html).toContain('height="64"');
  expect(html).toContain('alt="Legs exercises"');
});

it('CategoryArt falls back to a labeled chip when the movement has no photo', () => {
  const html = renderToStaticMarkup(
    createElement(CategoryArt, { movement: 'not-a-real-movement' as never }),
  );
  expect(html).not.toContain('<img');
  expect(html).toContain('category-art-fallback');
});
