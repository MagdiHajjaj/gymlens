import { test, expect, type Locator } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** The center of the element must hit the element itself, not an overlay. */
async function hitTest(locator: Locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });
}

test('dashboard goal chip links to workout picker; taps select and persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /change your training goal/i })).toBeVisible();

  // iPhone-width hit test: the tap must land on the chip link itself, not an overlay.
  const chip = page.getByRole('link', { name: /change your training goal/i });
  expect(await hitTest(chip)).toBe(true);
  const chipBox = await chip.boundingBox();
  expect(chipBox?.height).toBeGreaterThanOrEqual(44);
  await expect(chip).toContainText('Not set');

  await chip.click();
  await expect(page).toHaveURL(/\/workout/);

  // Every goal option is tappable at 390px and selects visibly.
  for (const name of ['Build Strength', 'Improve Form', 'Stay Consistent', 'Lose Weight']) {
    const option = page.getByRole('button', { name: new RegExp(name) });
    await expect(option).toBeVisible();
    expect(await hitTest(option)).toBe(true);
    const box = await option.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  const formOption = page.getByRole('button', { name: /Improve Form/ });
  await formOption.tap();
  await expect(formOption).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('gymlens.fitness_goal'))).toBe('form');

  // Tapping again deselects.
  await formOption.tap();
  await expect(formOption).toHaveAttribute('aria-pressed', 'false');

  // The dashboard chip reflects the picked goal after navigation.
  await page.getByRole('button', { name: /Lose Weight/ }).tap();
  await page.goto('/');
  await expect(page.getByRole('link', { name: /change your training goal/i })).toContainText('Lose Weight');
});

test('dashboard stat cards navigate to history', async ({ page }) => {
  await page.goto('/');
  const card = page.getByRole('link', { name: /Completed workouts/ });
  await expect(card).toBeVisible();
  expect(await hitTest(card)).toBe(true);
  await card.tap();
  await expect(page).toHaveURL(/\/history/);
});
