import { expect, test, type Page } from '@playwright/test';
import { openDemo, setState } from './helpers';

// You → Net worth: a smooth line that draws itself in, the latest month picked by default, tap any
// month to see its value. A ₹0 line only when net worth crosses zero, labelled away from the end dot.

async function open(page: Page) {
  await page.locator('nav').getByRole('button', { name: 'You' }).first().click();
  await page.getByRole('button', { name: /Net worth/ }).first().click();
  const chart = page.getByTestId('nw-chart');
  await expect(chart).toBeVisible();
  return chart;
}

test('the line draws itself in, and the latest month is shown by default', async ({ page }) => {
  await openDemo(page);
  const chart = await open(page);
  const anim = await chart.locator('[data-testid="nw-line"]').evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).not.toBe('none');
  const months = await chart.locator('[data-month]').evaluateAll((els) => els.map((e) => e.getAttribute('data-month')));
  const readout = page.getByTestId('nw-readout');
  await expect(readout).toHaveAttribute('data-month', months[months.length - 1]!);
  await expect(readout).toContainText('₹');
});

test('tap a month to see what your net worth was then', async ({ page }) => {
  await openDemo(page);
  await setState(page, "s.netWorthHistory = [{ month: '2026-05', value: 11111 }, { month: '2026-06', value: 22222 }, { month: '2026-07', value: 18000 }, { month: '2026-08', value: 30000 }];");
  const chart = await open(page);
  await chart.locator('[data-month="2026-06"]').click();
  const readout = page.getByTestId('nw-readout');
  await expect(readout).toHaveAttribute('data-month', '2026-06');
  await expect(readout).toContainText('22,222');
  await expect(readout).toContainText('Jun');
});

test('no ₹0 line when it never goes below zero; a ₹0 line, labelled on the left, when it does', async ({ page }) => {
  await openDemo(page);
  await setState(page, "s.netWorthHistory = [{ month: '2026-05', value: 11111 }, { month: '2026-06', value: 22222 }];");
  let chart = await open(page);
  await expect(chart.getByTestId('nw-zero')).toHaveCount(0);

  await setState(page, "s.netWorthHistory = [{ month: '2026-05', value: -40000 }, { month: '2026-06', value: 22222 }];");
  chart = await open(page);
  const zero = chart.getByTestId('nw-zero-label');
  await expect(zero).toBeVisible();
  const zb = (await zero.boundingBox())!;
  const cb = (await chart.boundingBox())!;
  expect(zb.x - cb.x).toBeLessThan(cb.width / 3); // on the left, away from today's dot
});

test('people who prefer less motion get the finished line straight away', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDemo(page);
  const chart = await open(page);
  const anim = await chart.locator('[data-testid="nw-line"]').evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe('none');
});
