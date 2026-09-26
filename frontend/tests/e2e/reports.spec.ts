import { test, expect, type Page } from '@playwright/test';
import type { WorkoutSession } from '../../src/types/workout';

const recordedSession: WorkoutSession = {
  id: 'grounded-report',
  exercise: 'squat',
  source: 'camera',
  status: 'completed',
  local: true,
  started_at: '2026-09-26T12:00:00Z',
  ended_at: '2026-09-26T12:02:00Z',
  total_reps: 6,
  reps: Array.from({ length: 6 }, (_, index) => ({
    rep_number: index + 1,
    completed_at: `2026-09-26T12:00:${String(index + 10).padStart(2, '0')}Z`,
    metrics_json: { min_angle: 90 + index * 5, duration_ms: 2000 },
    faults_json:
      index === 3 || index === 4
        ? [{ code: 'insufficient_depth', message: 'Depth cue', severity: 'warning' }]
        : [],
  })),
  metrics: [],
  set_ranges: [
    { set_number: 1, start_rep: 1, end_rep: 6, completed_at: '2026-09-26T12:01:00Z', rest_seconds: 30 },
  ],
};

async function seed(page: Page, sessions: WorkoutSession[], owner = 'guest') {
  await page.addInitScript(
    ({ sessions, owner }) => {
      localStorage.setItem(`gym-lens:v1:sessions:${owner}`, JSON.stringify(sessions));
    },
    { sessions, owner },
  );
}

async function mockAccount(page: Page, owner: string) {
  await page.route('**/src/features/auth/AuthProvider.tsx*', async (route) => {
    // Reuse the exact API import URL, including Vite's HMR timestamp.
    const original = await (await route.fetch()).text();
    const apiModule = original.match(/from ["']([^"']*\/lib\/api\.ts[^"']*)["']/)?.[1] ?? '/src/lib/api.ts';
    return route.fulfill({
      contentType: 'application/javascript',
      body:
        'import { setTokenProvider } from ' +
        JSON.stringify(apiModule) +
        ';' +
        'setTokenProvider(async () => "test-token");' +
        'export const authConfigured = true;' +
        'export const useIdentity = () => ({ authenticated: true, owner: ' +
        JSON.stringify(owner) +
        ', name: "Test athlete", login() {}, signup() {}, logout() {} });' +
        'export function IdentityProvider({ children }) { return children; }',
    });
  });
}

test('account history handles summaries without rep arrays and loads report details on demand', async ({
  page,
}) => {
  await mockAccount(page, 'summary-account');
  await page.route('**/api/workouts**', (route) => {
    const detail = route.request().url().includes('/grounded-report');
    return route.fulfill({
      json: detail
        ? { ...recordedSession, local: false, set_ranges: undefined }
        : [{ ...recordedSession, reps: undefined, metrics: undefined, set_ranges: undefined, local: false }],
    });
  });
  await page.goto('/history');
  const card = page.getByRole('article', { name: 'Squat session' });
  await expect(card).toContainText('Open report');
  await expect(card).toContainText('Saved to account');
  await page.getByRole('link', { name: 'View Squat session' }).click();
  await expect(page.locator('.session-key-stats dd')).toHaveText(['6', '02:00', '2 / 6']);
  await expect(page.locator('.report-sets')).toContainText('Set boundaries are unavailable');
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.locator('.stat-card strong')).toHaveText([/1\s*sessions/, /6\s*reps/, /2\s*minutes/]);
});

test('report ties the next focus to recorded reps and reveals measurements on demand', async ({ page }) => {
  await seed(page, [recordedSession]);
  await page.goto('/session/grounded-report');
  await expect(page.getByRole('heading', { name: 'Squat session report' })).toBeVisible();
  await expect(page.locator('.session-key-stats dd')).toHaveText(['6', '02:00', '2 / 6']);
  await expect(page.locator('.report-focus')).toContainText(
    '2 of 6 detailed reps triggered this cue: reps 4, 5',
  );
  await expect(page.getByRole('region', { name: 'What the tracker observed' })).toContainText('Depth cue');
  await expect(page.getByRole('table')).toBeHidden();
  await page.getByText('Explore measurements and individual reps', { exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('.report-measurement-groups')).toContainText('95°');
  await expect(page.locator('.report-measurement-groups')).toContainText('110°');
  await expect(page.locator('.recorded-set-list')).toContainText('30s rest planned');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download session data' }).click();
  expect((await downloaded).suggestedFilename()).toBe('gym-lens-grounded-report.json');
});

test('missing details do not produce invented technique or timing findings', async ({ page }) => {
  await seed(page, [{ ...recordedSession, reps: [], set_ranges: undefined, total_reps: 5 }]);
  await page.goto('/session/grounded-report');
  await expect(page.getByRole('heading', { name: 'Get a recorded baseline' })).toBeVisible();
  await expect(page.locator('.report-focus')).toContainText('individual details are unavailable');
  await expect(page.locator('.report-coverage')).toContainText('do not match the session total');
  await expect(page.locator('.report-sets')).toContainText('Set boundaries are unavailable');
  await expect(page.getByRole('heading', { name: 'No rep-level findings yet' })).toBeVisible();
});

test('history filters by split and exercise on mobile, and repeat keeps the exercise', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, [
    recordedSession,
    { ...recordedSession, id: 'curl-demo', exercise: 'curl', source: 'demo' },
  ]);
  await page.goto('/history');
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('combobox', { name: 'Filter session type' })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Filter workout split' }).selectOption('legs');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('Camera workout');
  await page.getByRole('combobox', { name: 'Filter exercise' }).selectOption('lunge');
  await expect(page.getByRole('heading', { name: 'No sessions match these filters.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Filter workout split' }).selectOption('pull');
  await page.getByRole('combobox', { name: 'Filter exercise' }).selectOption('curl');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('link', { name: 'View Bicep curl session' }).click();
  await expect(page.getByText(/It demonstrates the report/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recorded reps by arm' })).toContainText('Arm not recorded');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Repeat this exercise' }).click();
  await expect(page).toHaveURL(/\/workout$/);
  await expect(page.getByRole('button', { name: 'Bicep curl', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('failed account save preserves the browser copy and retry confirms account saving', async ({ page }) => {
  await seed(page, [recordedSession], 'report-account');
  // Mock identity only; exercise the real frontend API and saving workflow.
  await mockAccount(page, 'report-account');
  let saves = 0;
  let insightRequests = 0;
  await page.route('**/api/workouts**', async (route) => {
    if (route.request().url().includes('/insights')) {
      insightRequests++;
      await route.fulfill({ status: 500, json: {} });
      return;
    }
    if (route.request().method() === 'POST') {
      saves++;
      await route.fulfill(
        saves === 1
          ? { status: 503, json: { detail: 'Unavailable' } }
          : { json: { ...recordedSession, local: false } },
      );
      return;
    }
    await route.fulfill({ json: { ...recordedSession, local: false } });
  });
  await page.goto('/session/grounded-report');
  await page.getByRole('button', { name: 'Save to account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your browser copy is still available');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('gym-lens:v1:sessions:report-account')!)[0].reps.length,
    ),
  ).toBe(6);
  await page.getByRole('button', { name: 'Retry account save' }).click();
  await expect(page.locator('.report-save-state')).toContainText('Saved to your account');
  expect(saves).toBe(2);
  expect(insightRequests).toBe(0);
  await page.getByText('Additional AI commentary', { exact: true }).click();
  await page.getByRole('button', { name: 'Request commentary' }).click();
  await expect(page.getByRole('alert')).toContainText('recorded findings above remain available');
  await expect(page.locator('.report-focus')).toContainText('2 of 6 detailed reps');
});
