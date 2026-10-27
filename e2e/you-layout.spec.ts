import { expect, test, type Page } from '@playwright/test';
import { openDemo } from './helpers';

// The You tab, tighter: your month up top, money as tiles, settings as short rows in two cards.

async function openYou(page: Page) {
  await openDemo(page);
  await page.locator('nav').getByRole('button', { name: 'You' }).first().click();
  await expect(page.getByRole('button', { name: /^Net worth/ })).toBeVisible();
}

test('a much shorter page than before (about 2,500px)', async ({ page }) => {
  await openYou(page);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(h).toBeLessThan(1900);
});

test('monthly recap and Rewind sit side by side at the top', async ({ page }) => {
  await openYou(page);
  const recap = (await page.getByRole('button', { name: /Monthly recap/ }).boundingBox())!;
  const rewind = (await page.getByRole('button', { name: /PULSE Rewind/ }).boundingBox())!;
  expect(Math.abs(recap.y - rewind.y)).toBeLessThan(4);
  expect(rewind.x).toBeGreaterThan(recap.x + recap.width - 1);
});

test('money tiles show the numbers at a glance', async ({ page }) => {
  await openYou(page);
  await expect(page.getByRole('button', { name: /^Net worth/ })).toContainText('₹');
  await expect(page.getByRole('button', { name: /^Investments/ })).toContainText('/mo');
  await expect(page.getByRole('button', { name: /^Subscriptions & bills/ })).toContainText('/mo');
  await expect(page.getByRole('button', { name: /^Debt/ })).toContainText('left');
});

test('every place is still one tap away', async ({ page }) => {
  await openYou(page);
  for (const n of [/^Spending history/, /^Income/, /^Credit cards/, /^Accounts/, /^Profile/, /^Categories/, /^Budget preferences/, /^Reminders/, /^Appearance/, /^Currency/, /^Data & privacy/, /^Backup code/, /^Send feedback/, /^Install PULSE|^PULSE is installed/, /^Erase all data/, /^Explore demo data/]) {
    await expect(page.getByRole('button', { name: n }).first()).toBeVisible();
  }
  await expect(page.getByRole('link', { name: /How PULSE works/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'How to install' })).toHaveCount(0); // no big install card
});
