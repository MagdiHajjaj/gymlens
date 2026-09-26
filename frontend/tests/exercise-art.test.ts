import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ExerciseArt } from '../src/components/ExerciseArt';

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
