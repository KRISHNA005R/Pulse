import { expect, test } from '@playwright/test';
import { blockedCalls, log, openDemo, state } from './helpers';

// Journey 3: logging money. A spend, money in, and money got back, all checked against the numbers
// the app shows (Activity, Income) and the saved balances.

test('logging a spend takes it off the bank and shows it in Activity', async ({ page }) => {
  const errors = await openDemo(page);
  const before = await state(page);
  const bank0 = before.accounts[0].balance;

  const l = await log(page, 450, 'Dinner at Toit');
  await l.save();

  const after = await state(page);
  expect(after.transactions[0]).toMatchObject({ merchant: 'Dinner at Toit', amount: 450, type: 'expense', category: 'food' });
  expect(after.accounts[0].balance).toBe(bank0 - 450);

  await page.getByRole('button', { name: 'Activity', exact: true }).first().click();
  await expect(page.getByText('Dinner at Toit')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Got it back: a payback is not income and comes off spending', async ({ page }) => {
  const errors = await openDemo(page);
  const bank0 = (await state(page)).accounts[0].balance;

  await (await log(page, 3000, 'Dinner at Toit')).save();

  // "paid back" picks Got it back by itself, and "dinner" picks Food.
  const l = await log(page, 500, 'Rahul paid back dinner', 'Got');
  await expect(page.getByRole('button', { name: /Got it back/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Not income\. It comes off your/)).toBeVisible();
  await l.save();

  // Plain income stays income.
  await (await log(page, 2000, 'Gift from mom', 'Got')).save();

  const s = await state(page);
  const payback = s.transactions.find((t: { merchant: string }) => t.merchant === 'Rahul paid back dinner');
  expect(payback).toMatchObject({ type: 'income', category: 'food', back: true });
  expect(s.transactions.find((t: { merchant: string }) => t.merchant === 'Gift from mom').back).toBeUndefined();
  expect(s.accounts[0].balance).toBe(bank0 - 3000 + 500 + 2000);

  // Activity: today's spend is 3,000 − 500.
  await page.getByRole('button', { name: 'Activity', exact: true }).first().click();
  await expect(page.getByText(/spent ₹2,500/).first()).toBeVisible();

  // Income: the gift is there, the payback is not.
  await page.getByRole('button', { name: 'You', exact: true }).first().click();
  await page.getByRole('button', { name: /^Income/ }).first().click();
  await expect(page.getByText('Gift from mom')).toBeVisible();
  await expect(page.getByText('Rahul paid back dinner')).toHaveCount(0);

  expect(await blockedCalls(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('an old Money in can be switched to Got it back from Income', async ({ page }) => {
  await openDemo(page);
  await (await log(page, 400, 'Priya', 'Got')).save();
  expect((await state(page)).transactions[0].back).toBeUndefined();

  await page.getByRole('button', { name: 'You', exact: true }).first().click();
  await page.getByRole('button', { name: /^Income/ }).first().click();
  await page.getByText('Priya', { exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Category' }).selectOption('__back');
  await expect(page.getByRole('combobox', { name: 'Comes off which spending' })).toBeVisible();

  expect((await state(page)).transactions[0].back).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByText('Priya', { exact: true })).toHaveCount(0);
});
