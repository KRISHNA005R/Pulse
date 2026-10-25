import { expect, test } from '@playwright/test';
import { openDemo, state } from './helpers';

// LOAN-01: closing a loan with a typo'd amount asks before saving.
test('a typo in the closing amount asks "Is that right?" and can be corrected', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'You', exact: true }).first().click();
  await page.getByRole('button', { name: /^Debt/ }).first().click();
  const left0 = (await state(page)).debts[0].remaining;
  await page.getByRole('button', { name: 'Paid early / extra' }).click();
  const sheet = page.getByRole('dialog').last();
  await sheet.getByRole('radio', { name: /Closed the loan/ }).click();
  await sheet.getByLabel('Amount you paid').fill(String(left0 * 10));
  await sheet.getByRole('button', { name: /Record/ }).click();
  // Nothing saved yet: a question instead.
  await expect(sheet.getByRole('alert')).toContainText(/Is that right/);
  expect((await state(page)).debts[0].remaining).toBe(left0);
  // Correct it: the right amount saves straight away.
  await sheet.getByRole('button', { name: 'Change amount' }).click();
  await sheet.getByLabel('Amount you paid').fill(String(left0));
  await sheet.getByRole('button', { name: /Record/ }).click();
  await expect(page.getByText('Paid off. Nothing left to pay.')).toBeVisible();
});

test('a real big charge can still be saved after saying yes', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'You', exact: true }).first().click();
  await page.getByRole('button', { name: /^Debt/ }).first().click();
  const left0 = (await state(page)).debts[0].remaining;
  await page.getByRole('button', { name: 'Paid early / extra' }).click();
  const sheet = page.getByRole('dialog').last();
  await sheet.getByRole('radio', { name: /Closed the loan/ }).click();
  await sheet.getByLabel('Amount you paid').fill(String(left0 + 20000));
  await sheet.getByRole('button', { name: /Record/ }).click();
  await sheet.getByRole('button', { name: 'Yes, record it' }).click();
  await expect(page.getByText('Paid off. Nothing left to pay.')).toBeVisible();
  expect((await state(page)).transactions[0].amount).toBe(left0 + 20000);
});
