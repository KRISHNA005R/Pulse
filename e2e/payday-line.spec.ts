import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

// Home → Safe to spend card: the "days to payday" strip is one line all month (no switch to day bars),
// and today's dot moves right as the days go by. Bill days stay as dots under the line.

async function progressOn(page: import('@playwright/test').Page, day: string) {
  await page.clock.install({ time: new Date(`${day}T12:00:00+05:30`) });
  await openDemo(page);
  const line = page.getByTestId('payday-line');
  await expect(line).toBeVisible();
  await expect(page.getByTestId('payday-days')).toHaveCount(0); // never the per-day bars
  return Number(await line.getAttribute('data-progress'));
}

test('early in the month: one line, dot near the start', async ({ page }) => {
  const p = await progressOn(page, '2026-10-08');
  expect(p).toBeGreaterThan(0);
  expect(p).toBeLessThan(0.4);
});

test('near payday: still one line (not bars), dot near the end', async ({ page }) => {
  const p = await progressOn(page, '2026-10-30');
  expect(p).toBeGreaterThan(0.75);
  expect(p).toBeLessThanOrEqual(1);
});

test('payday tomorrow: the line still shows, almost full', async ({ page }) => {
  const p = await progressOn(page, '2026-11-03');
  expect(p).toBeGreaterThan(0.9);
});

test('bill days show as dots under the line, and the labels are start, today and payday', async ({ page }) => {
  await progressOn(page, '2026-10-20');
  const line = page.getByTestId('payday-line');
  expect(await line.locator('[data-bill]').count()).toBeGreaterThan(0);
  await expect(line).toContainText('Today');
  await expect(line).toContainText('4 Nov');
});
