import { expect, test } from '@playwright/test';
import { openDemo, setState } from './helpers';

// Payday, salary not added yet: Home must not drop to ₹0 by taking next month's bills from
// last month's leftover. It shows what's free today, and the new month starts once the salary is in.

test('on payday before the salary is added, Safe to spend is what is free today, not ₹0', async ({ page }) => {
  await openDemo(page);
  await setState(
    page,
    `const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
     const m = s.incomes.find((i) => i.main) ?? [...s.incomes].filter((i) => i.cycle === 'monthly' && i.nextDate).sort((a, b) => b.expected - a.expected)[0];
     m.autoCredit = false; m.nextDate = today;
     s.transactions = s.transactions.filter((t) => t.type !== 'income');
     s.accounts.find((a) => a.spendable).balance = 80000;`,
  );
  const hero = page.locator('.hero-amt .sr-only').first();
  await expect(hero).not.toHaveText('₹0');
  await expect(page.getByText('today · add salary')).toBeVisible();
  await expect(page.getByText('until salary is in')).toBeVisible();

  // Add the salary: the new month starts.
  await page.getByRole('button', { name: /^Yes, add/ }).click();
  await expect(page.getByText('today · add salary')).toHaveCount(0);
});

test('How it works shows where the money came from, and it adds up to Available now', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: /How it works/ }).first().click();
  const line = page.getByTestId('carry-over');
  await expect(line).toBeVisible();
  const text = (await line.textContent()) ?? '';
  if (/isn't added yet/.test(text)) return; // payday with the salary not in: nothing to add up
  const num = (m: string) => Number(m.replace(/[−]/g, '-').replace(/[₹,]/g, ''));
  const [left, cameIn, wentOut] = [...text.matchAll(/[−-]?₹[\d,.]+/g)].map((m) => num(m[0]));
  const row = (await page.getByText('Available now').locator('xpath=../..').textContent()) ?? '';
  const avail = num([...row.matchAll(/[−-]?₹[\d,.]+/g)].at(-1)?.[0] ?? 'NaN');
  expect(text).toMatch(/left from before .* came in − .* went out/);
  expect(left + cameIn - wentOut).toBeCloseTo(avail, 0);
});

test('salary 2 days late and not enough for rent: says "2 days late" and how short, not a bare ₹0', async ({ page }) => {
  await openDemo(page);
  await setState(
    page,
    `const iso = (d) => new Date(Date.now() + 5.5 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
     const m = s.incomes.find((i) => i.main) ?? [...s.incomes].filter((i) => i.cycle === 'monthly' && i.nextDate).sort((a, b) => b.expected - a.expected)[0];
     m.autoCredit = false; m.nextDate = iso(-2);
     s.transactions = s.transactions.filter((t) => t.type !== 'income');
     s.cards.forEach((c) => (c.balance = 0)); s.plans.forEach((p) => (p.cycleReserve = 0));
     s.accounts.forEach((a) => { if (a.spendable) a.balance = 0; });
     s.accounts.find((a) => a.spendable).balance = 8000;
     s.subscriptions = [{ id: 'rent-x', name: 'Rent', amount: 18000, cycle: 'monthly', nextDate: iso(2), category: 'bills', status: 'active', kind: 'bill', account: s.accounts[0].id, autoDebit: false }];`,
  );
  await expect(page.getByText('salary 2 days late')).toBeVisible();
  const note = page.getByTestId('short-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('short for Rent');
  await expect(note).toContainText("covered when your salary comes in");
});
