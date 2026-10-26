import { expect, test } from '@playwright/test';

// New onboarding: screen 1 shows what you get (a preview, not something to tap), screen 2 builds
// trust, then the questions, every one of which can be skipped.

test('screen 1: what you get, with a preview that is clearly not interactive and no demo button', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Know what you can spend/ })).toBeVisible();
  const preview = page.getByTestId('welcome-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('aria-hidden', 'true');
  expect(await preview.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  await expect(page.getByText(/Preview/)).toBeVisible();
  for (const line of ['Know what’s safe to spend', 'Plan goals that happen', 'Split with friends']) await expect(page.getByText(line)).toBeVisible();
  await expect(page.getByText(/Explore (a|with) demo/i)).toHaveCount(0);
});

test('screen 2: your money, your rules — a picture, three short promises, then on to the questions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Your money, your rules.' })).toBeVisible();
  for (const t of ['No bank login, ever', 'Skip anything, guess the rest', 'Delete everything, any time']) await expect(page.getByText(t)).toBeVisible();
  // The long version is gone, and so is the "another device" button.
  for (const t of ['Rough numbers are fine', 'About 60 seconds', 'PULSE never connects to your bank']) await expect(page.getByText(t, { exact: true })).toHaveCount(0);
  await expect(page.getByText(/never connects to your bank/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /another device/i })).toHaveCount(0);
  await expect(page.getByText('Takes about 60 seconds.', { exact: false })).toBeVisible();
  // The illustration loads, and screen readers skip it (it's decoration).
  const art = page.getByTestId('trust-art');
  await expect(art).toBeVisible();
  await expect(art).toHaveAttribute('alt', '');
  expect(await art.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'First, what should we call you?' })).toBeVisible();
  // Back goes to the promises, then to screen 1.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Your money, your rules.' })).toBeVisible();
});

// Tall phone (home-screen app), iPhone in Safari with its toolbars, and iPhone SE.
for (const [w, h] of [[390, 844], [390, 664], [375, 667]]) test(`screen 2 with sign-in on (${w}×${h}): picture, promises and the sign-in buttons all fit, no scrolling`, async ({ page }) => {
  await page.setViewportSize({ width: w, height: h });
  await page.route('**/api/auth', (r) => (r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ google: 'test.apps.googleusercontent.com', email: true }) }) : r.continue()));
  await page.route('https://accounts.google.com/**', (r) => r.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Your money, your rules.' })).toBeVisible();
  const email = page.getByRole('button', { name: 'Continue with email' });
  await expect(email).toBeVisible();
  await expect(page.getByRole('button', { name: /another device/i })).toHaveCount(0);
  for (const el of [page.getByTestId('trust-art'), page.getByText('Delete everything, any time'), email]) await expect(el).toBeInViewport({ ratio: 1 });
});

test('"you can skip anything" is true: every question can be skipped, and the app still opens', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  for (let i = 0; i < 5; i++) {
    const skip = page.getByRole('button', { name: 'Skip for now' });
    await expect(skip).toBeEnabled();
    await skip.click();
  }
  // Last question: priorities, also skippable.
  await expect(page.getByRole('button', { name: 'Build my dashboard' })).toBeEnabled();
  await page.getByRole('button', { name: 'Build my dashboard' }).click();
  await expect(page.getByText(/You.re set, Friend/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('SAFE TO SPEND', { exact: false }).first()).toBeVisible();
});

test('/?demo=1 opens the demo', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.getByText(/Aarav/).first()).toBeVisible({ timeout: 10000 });
});
