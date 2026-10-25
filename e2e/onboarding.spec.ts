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

test('screen 2: your money, your rules — the four promises, then on to the questions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Your money, your rules.' })).toBeVisible();
  for (const t of ['No bank login, ever', 'Rough numbers are fine', 'Delete everything, any time', 'About 60 seconds']) await expect(page.getByText(t)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'First, what should we call you?' })).toBeVisible();
  // Back goes to the promises, then to screen 1.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Your money, your rules.' })).toBeVisible();
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
