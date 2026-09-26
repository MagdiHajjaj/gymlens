import { test, expect } from '@playwright/test';

test('overview narrows exercises by movement chips and starts the chosen movement on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const cards = page.locator('.exercise-card');
  await expect(cards).toHaveCount(10);
  await expect(page.getByRole('combobox', { name: 'Filter workout split' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Push (3)' }).click();
  await expect(cards.locator('h3')).toHaveText(['Push-up', 'Overhead press', 'Tricep dips']);
  await page.getByRole('button', { name: 'Legs (4)' }).click();
  await expect(cards.locator('h3')).toHaveText(['Squat', 'Romanian deadlift', 'Lunge', 'Glute bridge']);
  // Chips filter only — the selection is untouched, so the bar still shows the picked exercise.
  await expect(page.locator('.selection-bar strong')).toHaveText('Squat');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(cards).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.selection-bar button').click();
  await expect(page.getByRole('button', { name: 'Squat', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
