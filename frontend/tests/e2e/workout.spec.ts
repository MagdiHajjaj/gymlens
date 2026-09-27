import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function openCameraSetup(page: Page) {
  const plan = page.getByRole('button', { name: 'Plan your session', exact: true });
  const setup = page.getByRole('button', { name: 'Set up camera', exact: true });
  await expect(plan.or(setup)).toBeVisible();
  if (await plan.isVisible()) {
    await plan.click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    return;
  }
  await setup.click();
}

test('voice coach announces a set summary, rest countdown, and next-set transition', async ({ page }) => {
  test.setTimeout(65_000);
  await page.addInitScript(() => {
    const spoken: string[] = [];
    Object.assign(window, { __spoken: spoken });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        resume() {},
        speak(utterance: SpeechSynthesisUtterance) {
          spoken.push(utterance.text);
          utterance.dispatchEvent(new Event('start'));
          setTimeout(() => utterance.dispatchEvent(new Event('end')), 5);
        },
      },
    });
  });
  await page.goto('/workout?mode=demo&synthetic=1');
  await page.getByRole('button', { name: 'Enable voice', exact: true }).click();
  await page.getByRole('button', { name: 'Start video demo', exact: true }).click();
  await expect(page.getByTestId('rep-count')).toHaveText('1', { timeout: 12_000 });
  await page.getByRole('button', { name: 'Finish set · rest 30s', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Rest, then go again.' })).toBeVisible();
  await expect(page.getByRole('timer')).toContainText('30');
  const repsAtRest = await page.getByTestId('rep-count').textContent();
  await expect(page.getByRole('dialog', { name: 'Rest, then go again.' })).toBeHidden({ timeout: 35_000 });
  await expect(page.getByTestId('rep-count')).toHaveText(repsAtRest || '1');
  const spoken = await page.evaluate(() => (window as typeof window & { __spoken: string[] }).__spoken);
  expect(spoken).toContain('Set 1 complete. 1 rep. No technique cues detected.');
  expect(spoken).toContain('Rest 30 seconds.');
  for (const second of [10, 5, 4, 3, 2, 1]) expect(spoken).toContain(`${second}.`);
  expect(spoken).toContain('Set 2, go.');
  await page.getByRole('button', { name: 'Exit demo', exact: true }).click();
});

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
  await page.goto('/workout?mode=demo&synthetic=1');
  await page.getByRole('button', { name: 'Bicep curl', exact: true }).click();
  // Exercise selection now supports multiple picks; remove the default squat.
  await page.getByRole('button', { name: 'Squat', exact: true }).click();
  await page.getByRole('button', { name: 'Start video demo', exact: true }).click();
  await page.getByRole('button', { name: 'Voice off', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Voice on', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.voice-check')).toContainText('Voice ready');
  await page.getByText('Movement details', { exact: true }).click();
  await expect(page.getByRole('img', { name: /biceps.*front and back muscle diagrams/i })).toBeVisible();
  await expect(page.locator('.muscle-panel')).not.toHaveAttribute('data-intensity', '0.00');
  await page.screenshot({ path: 'test-results/curl-heatmap.png', fullPage: true });
  await page.getByRole('button', { name: 'Test voice', exact: true }).click();
  await expect(page.locator('.voice-check')).toContainText('Voice ready');
  await expect(page.getByTestId('rep-count')).toHaveText('1', { timeout: 12000 });
  await expect(page.locator('.arm-tracking > div').nth(0)).toContainText('1 rep');
  await expect(page.locator('.arm-tracking > div').nth(1)).toContainText('1 rep');
  await page.getByRole('button', { name: 'Exit demo', exact: true }).click();
  await page.getByRole('dialog', { name: 'Exit demo without saving?' })
    .getByRole('button', { name: 'Exit demo', exact: true }).click();
  await expect(page).toHaveURL(/\/workout$/);
  await expect(page.getByRole('button', { name: 'Plan your session', exact: true })).toBeVisible();
});
test('guest demo exits without creating a report or history entry', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?synthetic=1');
  await expect(page.getByRole('heading', { name: /Good form/ })).toBeVisible();
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.getByRole('button', { name: 'Start video demo', exact: true }).click();
  await expect(page.getByTestId('rep-count')).toHaveText('2', { timeout: 18000 });
  await page.getByRole('button', { name: 'Exit demo', exact: true }).click();
  await expect(page).toHaveURL(/\/workout$/);
  await expect(page.getByRole('button', { name: 'Set up camera', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('camera permission failure provides an actionable demo fallback', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.goto('/workout?synthetic=1');
  await page.getByRole('button', { name: 'Set up camera' }).click();
  await expect(page.getByRole('alert')).toContainText('Camera access was blocked');
  await page.getByRole('button', { name: 'Try the video demo', exact: true }).click();
  await expect(page.getByTestId('rep-count')).toHaveText('1', { timeout: 12000 });
  await page.getByRole('button', { name: 'Exit demo' }).click();
  await expect(page).toHaveURL(/\/workout$/);
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

test('mobile setup action stays in the page flow above the fixed navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workout');
  const action = page.getByRole('button', { name: 'Plan your session' });
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await action.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await expect(action).toBeVisible();
  const [actionBox, navigationBox] = await Promise.all([
    action.boundingBox(),
    navigation.boundingBox(),
  ]);
  expect(actionBox).not.toBeNull();
  expect(navigationBox).not.toBeNull();
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(navigationBox!.y);
});
test('local MediaPipe model initializes against a browser test camera', async ({ page }) => {
  await page.goto('/workout');
  await openCameraSetup(page);
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4, { timeout: 15000 });
  await expect(page.locator('.camera-stage')).toHaveAttribute('data-status', 'ready', { timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Let’s get you in frame' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeDisabled();
  await expect(page.getByTestId('rep-count')).toHaveCount(0);
  await page.getByRole('button', { name: 'Change exercise' }).click();
  await expect(page.locator('video')).toHaveCount(0);
});

test('leaving an active mobile demo discards it without a prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workout?mode=demo&synthetic=1');
  await page.getByRole('button', { name: 'Start video demo', exact: true }).click();
  await expect(page.getByTestId('rep-count')).toHaveText('1', { timeout: 12000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole('dialog', { name: 'End this workout and leave?' })).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('camera preview gates start, records no reps, and releases the camera when cancelled', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const tracks: MediaStreamTrack[] = [];
    Object.assign(window, { __cameraTracks: tracks });
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      tracks.push(...stream.getTracks());
      return stream;
    };
  });
  // Exercise the actual analyzer with deterministic poses; no real person is
  // available in Chromium's test camera. The separate model test uses MediaPipe.
  await page.route('**/src/features/pose/PoseEngine.ts*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export async function createPoseEngine() {
      const frames = await fetch('/exercises/squat.json').then(r => r.json());
      const started = performance.now();
      return {
        detectForVideo() {
          if (performance.now() - started < 1500 || window.__poseVisible === false) return { landmarks: [], worldLandmarks: [] };
          const frame = frames[0];
          return { landmarks: [frame.landmarks], worldLandmarks: [] };
        },
        close() {},
      };
    }`,
    }),
  );
  await page.goto('/workout');
  await openCameraSetup(page);
  await expect(page.getByRole('heading', { name: 'Get-ready checklist' })).toBeVisible();
  await expect(page.getByText('Auto-start waits until you are in frame')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Stay in position');
  const start = page.getByRole('button', { name: /Start workout|Start now/ });
  await page.evaluate(() => Object.assign(window, { __poseVisible: false }));
  await expect(start).toBeDisabled();
  await page.waitForTimeout(3500);
  await expect(page.getByTestId('rep-count')).toHaveCount(0);
  await page.evaluate(() => Object.assign(window, { __poseVisible: true }));
  await expect(page.getByTestId('rep-count')).toHaveText('0', { timeout: 5000 });
  await expect(page.locator('.mobile-live-status')).toBeVisible();
  await expect(page.locator('.workout-controls')).toBeInViewport();
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes('sessions')).length),
  ).toBe(0);
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await expect(page).toHaveURL(/\/workout/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as typeof window & { __cameraTracks: MediaStreamTrack[] }).__cameraTracks.every(
          (track) => track.readyState === 'ended',
        ),
      ),
    )
    .toBe(true);
});
