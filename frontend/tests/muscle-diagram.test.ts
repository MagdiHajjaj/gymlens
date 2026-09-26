import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { MuscleDiagram } from '../src/components/MuscleDiagram';

it.each([
  ['curl', 'Biceps · Forearms · Shoulders', 'biceps'],
  ['squat', 'Quads · Glutes · Core', 'quads'],
  ['pushup', 'Chest · Triceps · Shoulders', 'chest'],
] as const)('shows the active joint map for %s without locking to only the selected exercise', (exercise, label, primary) => {
  const html = renderToStaticMarkup(createElement(MuscleDiagram, { exercise, result: null, paused: false }));
  expect(html).toContain('MUSCLE MAP');
  expect(html).toContain(label);
  expect(html).toContain(`data-muscle="${primary}"`);
  expect(html).toContain('FRONT');
  expect(html).toContain('BACK');
  expect(html).toContain('Muscles for this exercise');
});
