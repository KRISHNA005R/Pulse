import { expect, test, type Page } from '@playwright/test';
import { openDemo, state } from './helpers';

// Motion: rolling numbers, charts that bounce in, cards that rise as you scroll, and a stamp for big wins.
// People who ask for less motion get everything finished and still.

async function you(page: Page, row: RegExp) {
  await page.locator('nav').getByRole('button', { name: 'You' }).first().click();
  await page.getByRole('button', { name: row }).first().click();
}
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

test('big amounts roll like a meter and land on the right number', async ({ page }) => {
  await openDemo(page);
  await you(page, /^Debt/);
  const s = await state(page);
  const roll = page.getByTestId('debt-left').first();
  await expect(roll).toHaveText(inr(s.debts[0].remaining)); // the real number is what's read out
  const wheels = roll.locator('[data-wheel]');
  expect(await wheels.count()).toBe(String(s.debts[0].remaining).length);
  await page.waitForTimeout(2200);
  const landed = await wheels.evaluateAll((els) => els.map((e) => Math.round(Number(getComputedStyle(e).getPropertyValue('--p'))) % 10).join(''));
  expect(landed).toBe(String(s.debts[0].remaining));
});

test('history bars bounce in, and the picked bar label pops when you change month', async ({ page }) => {
  await openDemo(page);
  await you(page, /Spending history/);
  const bars = page.locator('[data-bar]');
  expect(await bars.count()).toBeGreaterThan(1);
  await page.waitForTimeout(2000);
  const settled = await bars.evaluateAll((els) => els.every((e) => getComputedStyle(e).transform === 'none' || getComputedStyle(e).transform === 'matrix(1, 0, 0, 1, 0, 0)'));
  expect(settled).toBe(true);
  await page.getByRole('radio').first().click();
  await expect(page.getByTestId('bar-label')).toBeVisible();
});

test('cards lower down rise in as you scroll to them', async ({ page }) => {
  await openDemo(page);
  await you(page, /Spending history/);
  const last = page.locator('[data-reveal]').last();
  expect(Number(await last.evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(1);
  await last.scrollIntoViewIfNeeded();
  await expect.poll(async () => Number(await last.evaluate((e) => getComputedStyle(e).opacity)), { timeout: 4000 }).toBe(1);
});

test('closing a loan slams a "Debt-free" stamp on screen, then it goes', async ({ page }) => {
  await openDemo(page);
  await you(page, /^Debt/);
  await page.getByRole('button', { name: 'Paid early / extra' }).click();
  const sheet = page.getByRole('dialog').last();
  await sheet.getByRole('radio', { name: /Closed the loan/ }).click();
  await sheet.getByRole('button', { name: /Record/ }).click();
  const stamp = page.locator('[data-stamp]');
  await expect(stamp).toHaveAttribute('data-stamp', 'Debt-free!');
  await expect(stamp).toHaveCount(0, { timeout: 6000 });
});

test('less motion: nothing hidden, nothing rolling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDemo(page);
  await you(page, /Spending history/);
  const ops = await page.locator('[data-reveal]').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
  expect(ops.every((o) => o === '1')).toBe(true);
  await page.locator('nav').getByRole('button', { name: 'You' }).first().click();
  await page.getByRole('button', { name: /^Debt/ }).first().click();
  await expect(page.locator('[data-wheel]')).toHaveCount(0);
});

test('when the roll ends, the wheels give way to plain text, so no half-digits can stay stuck (iPhone bug)', async ({ page }) => {
  await openDemo(page);
  await you(page, /^Debt/);
  const roll = page.getByTestId('debt-left').first();
  // While rolling, every wheel is hard-clipped (Safari ignores plain overflow on the moving strip).
  const clip = await roll.locator('[data-wheel]').first().evaluate((e) => getComputedStyle(e).clipPath);
  expect(clip).toContain('inset');
  // After it lands: only the final number is drawn, and the wheels are gone from view.
  await expect(roll).toHaveClass(/roll-done/, { timeout: 4000 });
  expect(await roll.locator('[data-wheel]').first().evaluate((e) => getComputedStyle(e).display)).toBe('none');
  const shown = await roll.locator('.roll-final').evaluate((e) => getComputedStyle(e, '::before').content);
  const s = await state(page);
  expect(shown.replace(/"/g, '')).toBe(`₹${s.debts[0].remaining.toLocaleString('en-IN')}`);
});
