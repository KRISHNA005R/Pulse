import { expect, test, type Page } from '@playwright/test';
import { openDemo } from './helpers';

// Beta: the walking buddy on the Safe to spend card. B (default) walks on the payday line; A walks
// along the top of the card. He stands where the line's progress is. The switch is in You → Appearance.

/** Measure only once the fade-ins on the page have finished. */
const settled = (p: Page) =>
  p.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))));
const pct = async (p: Page) => Number((await p.getByTestId('payday-line').getAttribute('data-progress')) ?? 'NaN');

async function pick(page: Page, label: RegExp) {
  await page.locator('nav').getByRole('button', { name: 'You' }).first().click();
  await page.getByRole('button', { name: /Appearance/ }).click();
  await page.getByRole('radio', { name: label }).click();
  await page.locator('nav').getByRole('button', { name: 'Home' }).first().click();
}

test('B, on the line: he stands where today is on the payday line, in a pose for this part of the month', async ({ page }) => {
  await openDemo(page);
  const w = page.getByTestId('walker');
  await expect(w).toBeVisible();
  await expect(w).toHaveAttribute('data-variant', 'line');
  await expect(w).toHaveAttribute('alt', '');
  expect(['fresh', 'easy', 'phone', 'focus', 'almost', 'payday']).toContain(await w.getAttribute('data-stage'));
  expect(await w.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // His feet are on the line, at today's spot.
  await settled(page);
  const line = page.getByTestId('payday-line').locator('div').first();
  const lb = (await line.boundingBox())!;
  const wb = (await w.boundingBox())!;
  const p = await pct(page);
  expect(Math.abs(wb.x + wb.width / 2 - (lb.x + lb.width * p))).toBeLessThan(4);
  expect(Math.abs(wb.y + wb.height - (lb.y + lb.height / 2))).toBeLessThan(6);
});

test('A, on the card: he walks along the top edge of the card instead', async ({ page }) => {
  await openDemo(page);
  await pick(page, /On the card/);
  const w = page.getByTestId('walker');
  await expect(w).toHaveAttribute('data-variant', 'card');
  await settled(page);
  const card = page.locator('section[aria-labelledby="sts-label"]');
  const cb = (await card.boundingBox())!;
  const wb = (await w.boundingBox())!;
  expect(Math.abs(wb.y + wb.height - cb.y)).toBeLessThan(4); // feet on the card's top edge
  expect(wb.y).toBeGreaterThanOrEqual(0); // nothing cut off above
});

test('Off: no buddy at all, and the usual dot is back', async ({ page }) => {
  await openDemo(page);
  await pick(page, /^Off/);
  await expect(page.getByTestId('walker')).toHaveCount(0);
  await expect(page.getByTestId('payday-dot')).toBeVisible();
});

test('the demo has no buddy (it is for people using their own money)', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForTimeout(1500);
  await expect(page.getByText(/exploring/).first()).toBeVisible();
  await expect(page.getByTestId('walker')).toHaveCount(0);
});
