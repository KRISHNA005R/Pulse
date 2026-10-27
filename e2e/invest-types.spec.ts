import { expect, test, type Page } from '@playwright/test';
import { openDemo, state } from './helpers';

// Investments beyond SIPs: pick the type first, and the form only asks what that type needs.

async function openAdd(page: Page) {
  await openDemo(page);
  await page.locator('nav').getByRole('button', { name: 'You' }).first().click();
  await page.getByRole('button', { name: /^Investments/ }).click();
  await page.getByRole('button', { name: 'Add investment' }).click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet.getByRole('heading', { name: 'Add investment' })).toBeVisible();
  return sheet;
}

test('the add button says "Add investment" and offers every type', async ({ page }) => {
  const sheet = await openAdd(page);
  for (const t of ['Mutual fund SIP', 'Recurring deposit', 'Fixed deposit', 'PPF', 'NPS', 'Gold', 'Other']) {
    await expect(sheet.getByRole('radio', { name: new RegExp(t) })).toBeVisible();
  }
});

test('SIP keeps the step-up; RD has no step-up and no "Repeats"', async ({ page }) => {
  const sheet = await openAdd(page);
  await sheet.getByRole('radio', { name: /Mutual fund SIP/ }).click();
  await expect(sheet.getByText('Step-up every year')).toBeVisible();
  await sheet.getByRole('radio', { name: /Recurring deposit/ }).click();
  await expect(sheet.getByText('Step-up every year')).toHaveCount(0);
  await expect(sheet.getByLabel('Repeats')).toHaveCount(0);
  await expect(sheet.getByText('Monthly deposit', { exact: true })).toBeVisible();
  await expect(sheet.getByRole('group', { name: 'Tenure' })).toBeVisible();
});

test('add an FD: one deposit, a tenure, and the maturity amount shown before saving', async ({ page }) => {
  const sheet = await openAdd(page);
  await sheet.getByRole('radio', { name: /Fixed deposit/ }).click();
  await expect(sheet.getByText('Step-up every year')).toHaveCount(0);
  await expect(sheet.getByLabel('Next debit date')).toHaveCount(0);
  await sheet.getByLabel('Name').fill('SBI FD');
  await sheet.getByLabel('Bank or post office').fill('SBI');
  await sheet.locator('#inv-amount').fill('100000');
  await sheet.getByLabel('Interest rate, % a year').fill('7');
  await sheet.getByRole('group', { name: 'Tenure' }).getByRole('button', { name: '1 year' }).click();
  await expect(sheet.getByTestId('inv-maturity')).toContainText('₹1,07,186');
  await sheet.getByRole('radio', { name: /Already have it/ }).click();
  await sheet.getByRole('button', { name: 'Add FD' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const s = await state(page);
  const fd = s.investments.find((i: { name: string }) => i.name === 'SBI FD');
  expect(fd).toMatchObject({ kind: 'fd', name: 'SBI FD', amount: 100000, tenureMonths: 12, expectedReturn: 7 });
  const row = page.locator('section[aria-labelledby="inv-list"]').getByRole('button', { name: /SBI FD/ });
  await expect(row).toContainText('FD');
  await expect(row).toContainText(/Matures/);
});

test('PULSE AI can add an FD from one sentence', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Ask PULSE AI' }).click();
  await page.locator('#ai-input').fill('add fd of 50000 at 7.5% for 2 years in SBI');
  await page.locator('#ai-input').press('Enter');
  const card = page.getByTestId('ai-action').last();
  await expect(card).toContainText('New FD');
  await expect(card).toContainText('₹50,000');
  await expect(card).toContainText('2 years');
  await card.getByRole('button', { name: 'Add FD' }).click();
  await expect.poll(async () => (await state(page)).investments.some((i: { kind: string; amount: number }) => i.kind === 'fd' && i.amount === 50000)).toBe(true);
});

test('PULSE AI answers about all investments, not just SIPs', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Ask PULSE AI' }).click();
  await page.locator('#ai-input').fill('how much am I investing?');
  await page.locator('#ai-input').press('Enter');
  await expect(page.getByText(/a month across/).filter({ visible: true }).last()).toBeVisible();
  await expect(page.getByText(/HDFC FD/).filter({ visible: true }).last()).toBeVisible(); // the demo FD is listed with its maturity
});

test('the monthly recap has a page for your investments', async ({ page }) => {
  await openDemo(page);
  await page.locator('nav').getByRole('button', { name: 'You' }).first().click();
  await page.getByRole('button', { name: /Spending history/ }).click();
  await page.getByTestId('month-row').nth(1).click(); // last full month, which has SIP debits
  const recap = page.getByRole('dialog').last();
  await recap.getByRole('tab', { name: 'Investments' }).click();
  await expect(recap.getByText('Went in this month')).toBeVisible();
  await expect(recap.getByText('Mutual fund SIP')).toBeVisible();
});
