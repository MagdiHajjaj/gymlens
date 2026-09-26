import { test, expect } from '@playwright/test';

test('curl heatmap responds to movement and voice can be enabled and tested', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        speak(utterance: SpeechSynthesisUtterance) {
          utterance.dispatchEvent(new Event('start'));
          setTimeout(() => utterance.dispatchEvent(new Event('end')), 30);
        },
      },
    });
  });
  await page.goto('/workout?mode=demo');
  await page.getByRole('button', { name: 'Bicep curl', exact: true }).click();
  await page.getByRole('button', { name: 'Start landmark demo', exact: true }).click();
  await page.getByRole('button', { name: 'Voice off', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Voice on', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.voice-check')).toContainText('Voice ready');
  await expect(page.getByRole('img', { name: /Biceps.*front and back muscle diagrams/ })).toBeVisible();
  await expect(page.locator('.muscle-panel')).not.toHaveAttribute('data-intensity', '0.00');
  await page.screenshot({ path: 'test-results/curl-heatmap.png', fullPage: true });
  await page.getByRole('button', { name: 'Test voice', exact: true }).click();
  await expect(page.locator('.voice-check')).toContainText('Voice ready');
  await expect(page.getByTestId('rep-count')).toHaveText('2', { timeout: 12000 });
  await expect(page.locator('.arm-tracking > div').nth(0)).toContainText('1 rep');
  await expect(page.locator('.arm-tracking > div').nth(1)).toContainText('1 rep');
  await page.getByRole('button', { name: 'End session', exact: true }).click();
});
test('guest demo completes reps, pauses, saves a report and survives reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Good form/ })).toBeVisible();
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.getByRole('button', { name: 'Start landmark demo', exact: true }).click();
  await expect(page.getByTestId('rep-count')).toHaveText('2', { timeout: 18000 });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('rep-count')).toHaveText('2');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'You showed up. That counts.' })).toBeVisible();
  await expect(page.getByText('insufficient depth', { exact: true })).toBeVisible();
  await expect(page.getByText(/Saved in this browser/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'One rep at a time' })).toBeVisible();
  await page.getByRole('link', { name: 'All sessions' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Squat' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('camera permission failure provides an actionable demo fallback', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Enable camera & start' }).click();
  await expect(page.getByRole('alert')).toContainText('Camera access was blocked');
  await page.getByRole('button', { name: 'Try landmark demo', exact: true }).click();
  await expect(page.getByTestId('rep-count')).toHaveText('1', { timeout: 12000 });
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByText(/synthetic landmark data/)).toBeVisible();
});
test('exercise selection and responsive navigation work without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /UPPER BODY.*Bicep curl/ }).click();
  await page.getByRole('button', { name: 'Let’s go' }).click();
  await expect(page.getByRole('heading', { name: 'Bicep curl', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workout history' })).toBeVisible();
});
test('local MediaPipe model initializes against a browser test camera', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Enable camera & start' }).click();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4, { timeout: 15000 });
  await expect(page.locator('.camera-stage')).toHaveAttribute('data-status', 'ready', { timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Let’s get you in frame' })).toHaveCount(0);
  await expect(page.getByTestId('rep-count')).toHaveText('0');
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByRole('heading', { name: 'A fresh start is still a start.' })).toBeVisible();
});

test('leaving an active mobile workout preserves its completed reps', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workout?mode=demo');
  await page.getByRole('button', { name: 'Start landmark demo', exact: true }).click();
  await expect(page.getByTestId('rep-count')).toHaveText('1', { timeout: 12000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Squat' })).toContainText('1');
  await page.getByRole('link', { name: 'View Squat session' }).click();
  await expect(page.getByRole('heading', { name: 'You showed up. That counts.' })).toBeVisible();
});
