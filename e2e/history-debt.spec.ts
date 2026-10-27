import { expect, test, type Page } from '@playwright/test';
import { openDemo, setState, state } from './helpers';

// Spending history and Debt, redesigned: charts first, very little text, the long lists folded away.

async function openHistory(page: Page) {
  await openDemo(page);
  await page.locator('nav').getByRole('button', { name: 'You' }).first().click();
  await page.getByRole('button', { name: /Spending history/ }).click();
  await expect(page.getByRole('heading', { name: 'Spending history' })).toBeVisible();
}
async function openDebt(page: Page, change?: string) {
  await openDemo(page);
  if (change) await setState(page, change);
  await page.locator('nav').getByRole('button', { name: 'You' }).first().click();
  await page.getByRole('button', { name: /^(Debt|Loans)/ }).first().click();
  await expect(page.getByText('Education loan · SBI')).toBeVisible();
}

// ---------- Spending history ----------
test('history: the picked bar carries its own amount, and tapping another bar moves it', async ({ page }) => {
  await openHistory(page);
  const label = page.getByTestId('bar-label');
  await expect(label).toHaveCount(1);
  await expect(label).toContainText('₹');
  const bars = page.getByRole('radio');
  const n = await bars.count();
  expect(n).toBeGreaterThan(1);
  await bars.nth(0).click();
  await expect(bars.nth(0)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('sel-month')).toContainText('January');
});

test('history: the picked month splits into a coloured bar of its top categories', async ({ page }) => {
  await openHistory(page);
  const split = page.getByTestId('month-split');
  await expect(split).toBeVisible();
  expect(await split.locator('[data-cat]').count()).toBeGreaterThan(1);
});

test('history: where it went is a donut with the top five, the rest folded away', async ({ page }) => {
  await openHistory(page);
  const donut = page.getByTestId('cat-donut');
  await expect(donut).toBeVisible();
  expect(await donut.locator('circle[data-cat]').count()).toBeGreaterThan(1);
  const legend = page.getByTestId('cat-legend').locator('li');
  expect(await legend.count()).toBeLessThanOrEqual(5);
  const more = page.getByRole('button', { name: /All categories/ });
  if (await more.count()) {
    await more.click();
    expect(await legend.count()).toBeGreaterThan(5);
  }
});

test('history: month by month shows the last three, the rest behind "Show all"', async ({ page }) => {
  await openHistory(page);
  const rows = page.getByTestId('month-row');
  expect(await rows.count()).toBeLessThanOrEqual(3);
  const all = page.getByRole('button', { name: /Show all \d+ months/ });
  if (await all.count()) {
    await all.click();
    expect(await rows.count()).toBeGreaterThan(3);
  }
  await rows.first().click();
  await expect(page.getByRole('dialog').last()).toBeVisible(); // the recap
});

test('history: a shorter page with less text', async ({ page }) => {
  await openHistory(page);
  await expect(page.getByText('Tap a bar to see that month', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Export a backup from You', { exact: false })).toHaveCount(0);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(h).toBeLessThan(1650);
});

// ---------- Debt ----------
test('debt: EMI, next date and rate as three chips', async ({ page }) => {
  await openDebt(page);
  const s = await state(page);
  const d = s.debts[0];
  await expect(page.getByTestId('chip-emi')).toContainText(`₹${d.minPayment.toLocaleString('en-IN')}`);
  await expect(page.getByTestId('chip-next')).toBeVisible();
  await expect(page.getByTestId('chip-rate')).toContainText(`${d.rate}%`);
});

test('debt: the next EMI is a two-colour bar (off the loan vs interest), not a sentence', async ({ page }) => {
  await openDebt(page);
  const split = page.getByTestId('emi-split');
  await expect(split).toBeVisible();
  await expect(split.getByText('Off the loan')).toBeVisible();
  await expect(split.getByText('Interest')).toBeVisible();
  await expect(page.getByText(/PULSE records/)).toHaveCount(0);
});

test('debt: debt-free date up front; the extra-payment slider opens only when asked', async ({ page }) => {
  await openDebt(page);
  await expect(page.getByTestId('debt-free-date')).toContainText(/\d{4}/);
  await expect(page.getByRole('slider')).toHaveCount(0);
  await page.getByRole('button', { name: /What if I pay extra/ }).click();
  const slider = page.getByRole('slider');
  await expect(slider).toBeVisible();
  await slider.fill('2000');
  await expect(page.getByText(/sooner/)).toBeVisible();
});

test('debt: a manual loan shows "Mark as paid" next to "Paid early / extra"', async ({ page }) => {
  await openDebt(page, 's.debts[0].autoDebit = false;');
  await expect(page.getByRole('button', { name: 'Mark as paid' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Paid early / extra' })).toBeVisible();
});

test('debt: no credit cards row (cards have their own section)', async ({ page }) => {
  await openDebt(page);
  await expect(page.getByRole('button', { name: /Credit cards/ })).toHaveCount(0);
});
