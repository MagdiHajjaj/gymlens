import { test, expect } from '@playwright/test';

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
  await page.goto('/workout?mode=demo');
  await page.getByRole('button', { name: 'Enable voice', exact: true }).click();
  await page.getByRole('button', { name: 'Start landmark demo', exact: true }).click();
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
  await page.getByRole('button', { name: 'End session', exact: true }).click();
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
  await page.goto('/workout?mode=demo');
  await page.getByRole('button', { name: 'Bicep curl', exact: true }).click();
  await page.getByRole('button', { name: 'Start landmark demo', exact: true }).click();
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
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Recorded reps by arm' })).toContainText('Both arms together');
  await expect(page.locator('.session-key-stats')).toContainText('Simultaneous curls count as one rep');
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
  await expect(page.getByRole('heading', { name: 'Squat session report' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'What the tracker observed' })).toContainText('Depth cue');
  await expect(page.getByText(/Saved in this browser/)).toBeVisible();
  await page.reload();
  await page.getByText('Explore measurements and individual reps', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Individual reps' })).toBeVisible();
  await page.getByRole('link', { name: 'All sessions' }).click();
  await expect(page.getByRole('article', { name: 'Squat session' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('camera permission failure provides an actionable demo fallback', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.goto('/workout');
  await page.getByRole('button', { name: 'Set up camera' }).click();
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
  await page.getByRole('button', { name: 'Set up camera' }).click();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4, { timeout: 15000 });
  await expect(page.locator('.camera-stage')).toHaveAttribute('data-status', 'ready', { timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Let’s get you in frame' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeDisabled();
  await expect(page.getByTestId('rep-count')).toHaveCount(0);
  await page.getByRole('button', { name: 'Change exercise' }).click();
  await expect(page.locator('video')).toHaveCount(0);
});

test('leaving an active mobile workout preserves its completed reps', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workout?mode=demo');
  await page.getByRole('button', { name: 'Start landmark demo', exact: true }).click();
  await expect(page.getByTestId('rep-count')).toHaveText('1', { timeout: 12000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'End this workout and leave?' })).toBeVisible();
  await page.getByRole('button', { name: 'Save and leave', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Squat session' })).toContainText('1');
  await page.getByRole('link', { name: 'View Squat session' }).click();
  await expect(page.getByRole('heading', { name: 'Squat session report' })).toBeVisible();
});

test('camera preview gates start, records no reps, and releases the camera when cancelled', async ({
  page,
}) => {
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
  await page.getByRole('button', { name: 'Set up camera' }).click();
  const start = page.getByRole('button', { name: 'Start workout', exact: true });
  await expect(start).toBeDisabled();
  await expect(start).toBeEnabled({ timeout: 15000 });
  await expect(page.getByRole('status')).toContainText('You’re in position');
  await page.evaluate(() => Object.assign(window, { __poseVisible: false }));
  await expect(start).toBeDisabled();
  await page.evaluate(() => Object.assign(window, { __poseVisible: true }));
  await expect(start).toBeEnabled();
  await expect(page.getByTestId('rep-count')).toHaveCount(0);
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes('sessions')).length),
  ).toBe(0);
  await page.getByRole('button', { name: 'Change exercise' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as typeof window & { __cameraTracks: MediaStreamTrack[] }).__cameraTracks.every(
          (track) => track.readyState === 'ended',
        ),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Set up camera' }).click();
  await expect(start).toBeEnabled({ timeout: 15000 });
  await start.click();
  await expect(page.getByTestId('rep-count')).toHaveText('0');
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Squat session report' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Get a recorded baseline' })).toBeVisible();
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

test('cancel leaving keeps a workout open and browser back is guarded', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.getByRole('button', { name: 'Start landmark demo', exact: true }).click();
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'End this workout and leave?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stay in workout' })).toBeFocused();
  await page.getByRole('button', { name: 'Stay in workout' }).click();
  await expect(page).toHaveURL(/workout/);
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'End this workout and leave?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page).toHaveURL(/workout/);
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await expect(page).toHaveURL(/session\//);
});
