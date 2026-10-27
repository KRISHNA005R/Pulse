import { expect, test, type Page } from '@playwright/test';
import { openDemo, state } from './helpers';

// Investments, layout A: portfolio first. A short page: what it's worth and how it's split, total put
// in / current value / per year, this month's SIPs, then two small cards that open the growth
// calculator and the recent debits in a sheet.

async function open(page: Page) {
  await openDemo(page);
  await page.locator('nav').getByRole('button', { name: 'You' }).first().click();
  await page.getByRole('button', { name: /Investments & SIPs/ }).click();
  await expect(page.getByRole('heading', { name: 'Investments' })).toBeVisible();
}
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

test('portfolio first: value, split by holding, and total put in / current value / per year', async ({ page }) => {
  await open(page);
  const s = await state(page);
  const card = page.locator('section[aria-labelledby="inv-hold"]');
  await expect(card.getByText('Your portfolio')).toBeVisible();
  await expect(card.getByText('Total put in')).toBeVisible();
  await expect(card.getByText('Current value')).toBeVisible();
  await expect(card.getByText('Per year now')).toBeVisible();
  for (const h of s.accounts.filter((a: { type: string }) => a.type === 'investment')) {
    await expect(card.getByRole('button', { name: new RegExp(h.name) })).toBeVisible();
  }
  const total = s.accounts.filter((a: { type: string }) => a.type === 'investment').reduce((a: number, x: { balance: number }) => a + x.balance, 0);
  await expect(card.getByTestId('portfolio-value')).toHaveText(inr(total));
});

test('tap a holding to edit it; "Add holding" is in the portfolio card', async ({ page }) => {
  await open(page);
  const card = page.locator('section[aria-labelledby="inv-hold"]');
  await card.getByRole('button', { name: /Mutual funds/ }).click();
  await expect(page.getByRole('dialog').last().getByRole('heading', { name: 'Edit holding' })).toBeVisible();
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Add holding' }).click();
  await expect(page.getByRole('dialog').last().getByRole('heading', { name: 'Add holding' })).toBeVisible();
});

test('every month and next debit tiles, and the SIPs open to edit', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('tile-monthly')).toContainText('₹3,000');
  await expect(page.getByTestId('tile-next')).toContainText('Next debit');
  await page.getByRole('button', { name: /Parag Parikh Flexi Cap/ }).first().click();
  await expect(page.getByRole('dialog').last().getByRole('heading', { name: 'Edit investment' })).toBeVisible();
});

test('the growth calculator and recent debits live inside, not on the page', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Keep going for')).toHaveCount(0);
  await expect(page.getByText(/^SIP · /)).toHaveCount(0); // no debits list on the page
  await page.getByRole('button', { name: /could be/i }).click();
  const growth = page.getByRole('dialog').last();
  await expect(growth.getByText('Keep going for')).toBeVisible();
  await expect(growth.getByText('Could be worth')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Recent debits/ }).click();
  const debits = page.getByRole('dialog').last();
  await expect(debits.getByText(/SIP · /).first()).toBeVisible();
});

test('a short page: no more than about two screens tall on a phone', async ({ page }) => {
  await open(page);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(h).toBeLessThan(1700);
});
