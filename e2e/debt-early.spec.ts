import { expect, test } from '@playwright/test';
import { openDemo, state } from './helpers';

// Loans → "Paid early / extra": an extra payment, then closing the loan.
async function openLoans(page: import('@playwright/test').Page) {
  await openDemo(page);
  await page.getByRole('button', { name: 'You', exact: true }).first().click();
  await page.getByRole('button', { name: /^(Debt|Loans)/ }).first().click();
  await expect(page.getByText('Education loan · SBI')).toBeVisible();
}

test('paid extra: the loan goes down by the whole amount, with savings shown first', async ({ page }) => {
  await openLoans(page);
  const left0 = (await state(page)).debts[0].remaining;
  await page.getByRole('button', { name: 'Paid early / extra' }).click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet.getByRole('radio')).toHaveCount(3);
  await sheet.getByRole('radio', { name: /Paid extra/ }).click();
  await sheet.getByLabel('Amount you paid').fill('10000');
  await expect(sheet.getByText(/sooner/)).toBeVisible();
  await expect(sheet.getByText(/interest/)).toBeVisible();
  await sheet.getByRole('button', { name: /Record/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await state(page)).debts[0].remaining).toBe(left0 - 10000);
});

test('closed the loan: amount is filled in, and the loan shows as paid off', async ({ page }) => {
  await openLoans(page);
  await page.getByRole('button', { name: 'Paid early / extra' }).click();
  const sheet = page.getByRole('dialog').last();
  await sheet.getByRole('radio', { name: /Closed the loan/ }).click();
  const left0 = (await state(page)).debts[0].remaining;
  await expect(sheet.getByLabel('Amount you paid')).toHaveValue(String(left0));
  await sheet.getByRole('button', { name: /Record/ }).click();
  await expect(page.getByText('Paid off. Nothing left to pay.')).toBeVisible();
  expect((await state(page)).debts[0].remaining).toBe(0);
  await expect(page.getByRole('button', { name: 'Paid early / extra' })).toHaveCount(0);
});

test('this month’s EMI early: recorded today, next EMI moves a month', async ({ page }) => {
  await openLoans(page);
  const before = (await state(page)).debts[0].nextDate;
  await page.getByRole('button', { name: 'Paid early / extra' }).click();
  const sheet = page.getByRole('dialog').last();
  await sheet.getByRole('radio', { name: /This month’s EMI/ }).click();
  await sheet.getByRole('button', { name: /Record/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await state(page)).debts[0].nextDate > before).toBe(true);
});
