import { test, expect } from '@playwright/test';

test('plan rows reorder with a press-and-drag on the handle', async ({ page }) => {
  // Tall viewport so the drag has room without hitting the auto-scroll edge.
  await page.setViewportSize({ width: 390, height: 1600 });
  await page.goto('/workout');

  // Pick two exercises, then open the plan step.
  await page.getByRole('button', { name: 'Squat', exact: true }).click();
  await page.getByRole('button', { name: 'Push-up', exact: true }).click();
  await page.getByRole('button', { name: /plan your session/i }).click();
  await page.locator('.plan-rows').waitFor();

  const rows = page.locator('.plan-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator('strong')).toHaveText('Squat');

  // Drag the first row's handle below the second row's midpoint, like a playlist reorder.
  const handle = rows.first().getByRole('button', { name: 'Reorder Squat' });
  const box = await handle.boundingBox();
  if (!box) throw new Error('drag handle has no bounding box');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 340, { steps: 20 });
  // The dragged row lifts and the other row slides aside mid-drag.
  await expect(rows.first()).toHaveClass(/is-dragging/);
  await expect(rows.nth(1)).toHaveCSS('transform', /matrix/);
  await page.mouse.up();

  // After the drop animation the store commits the new order.
  await expect(rows.first().locator('strong')).toHaveText('Push-up');
  await expect(rows.nth(1).locator('strong')).toHaveText('Squat');

  // Continuing starts with the reordered first exercise, not the first-picked one.
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByRole('heading', { name: /push-up/i })).toBeVisible();
});
