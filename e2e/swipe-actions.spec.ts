import { expect, test, type Page } from '@playwright/test';
import { log, openDemo, state } from './helpers';

// Swipe a transaction left, like iPhone's Phone app: two round buttons (Split, Delete). Swipe all the
// way and Delete stretches into a long pill; letting go deletes it.

async function swipe(page: Page, row: import('@playwright/test').Locator, distance: number) {
  const b = (await row.boundingBox())!;
  const y = b.y + b.height / 2;
  const x0 = b.x + b.width - 20;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - (distance * i) / steps, y }] });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(120); // slow finish: no flick
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const rowFor = (page: Page, name: string) => page.locator('li', { has: page.getByText(name, { exact: true }) }).first();

test('a short swipe shows two round buttons: Split and Delete', async ({ page }) => {
  await openDemo(page);
  await (await log(page, 345, 'chai and samosa')).save();
  await page.locator('nav').getByRole('button', { name: 'Activity' }).first().click();
  const li = rowFor(page, 'Chai and samosa');
  await swipe(page, li.getByRole('button').last(), 150);
  const split = li.getByRole('button', { name: 'Split' });
  const del = li.getByRole('button', { name: 'Delete' });
  await expect(split).toBeVisible();
  await expect(del).toBeVisible();
  for (const btn of [split, del]) {
    await expect.poll(async () => {
      const b = (await btn.boundingBox())!;
      return Math.abs(b.width - b.height) < 2 && (await btn.evaluate((e) => getComputedStyle(e).borderRadius)) !== '0px';
    }).toBe(true);
  }
  // Icons only, no text labels inside.
  expect(((await split.textContent()) ?? '').trim()).toBe('');
  expect(((await del.textContent()) ?? '').trim()).toBe('');
  // Tap Delete: it goes (with Undo).
  await del.click();
  await expect.poll(async () => (await state(page)).transactions.some((t: { amount: number }) => t.amount === 345)).toBe(false);
});

test('a full swipe stretches Delete into a long pill and deletes on release', async ({ page }) => {
  await openDemo(page);
  await (await log(page, 456, 'pen refill')).save();
  await page.locator('nav').getByRole('button', { name: 'Activity' }).first().click();
  const li = rowFor(page, 'Pen refill');
  const w = (await li.boundingBox())!.width;
  // Hold at a full swipe and look before letting go.
  const b = (await li.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const y = b.y + b.height / 2;
  const x0 = b.x + b.width - 10;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 16; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - (w * 0.8 * i) / 16, y }] });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(400);
  // (Mid-swipe the buttons aren't announced yet, so find it by its label.)
  const del = li.locator('button[aria-label="Delete"]');
  const db = (await del.boundingBox())!;
  expect(db.width).toBeGreaterThan(db.height * 2.5); // a long pill now
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await state(page)).transactions.some((t: { amount: number }) => t.amount === 456)).toBe(false);
});
