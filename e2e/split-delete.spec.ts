import { expect, test, type Page } from '@playwright/test';
import { openDemo, setState, state } from './helpers';

// Every expense in Splits can be opened: change its name or amount, or delete it (with Undo).
// A friend's own entry can only be changed by them.

type Sp = { id: string; amount: number; description: string; shares: { person: string; amount: number }[]; transactionId?: string };
const split = async (p: Page, id: string) => ((await state(p)).splits as Sp[]).find((x) => x.id === id);
const balance = async (p: Page, id: string) => ((await state(p)).accounts as { id: string; balance: number }[]).find((a) => a.id === id)!.balance;

async function openPerson(p: Page, name: string) {
  await p.locator('nav:visible').getByRole('button', { name: 'Plans' }).click();
  await p.getByRole('radio', { name: 'Splits' }).click();
  const row = p.getByRole('button', { name: new RegExp(`^${name}`) }).first();
  if (!(await row.isVisible())) await p.getByRole('button', { name: /See all \d+ people/ }).click();
  await p.getByRole('button', { name: new RegExp(`^${name}`) }).first().click();
}

test('a split I paid: change the amount (shares and my spend follow), then delete it with its spend, and Undo', async ({ page }) => {
  await openDemo(page);
  const friend = (await state(page)).people[0];
  await setState(
    page,
    `const acc = s.accounts.find((x) => x.spendable).id;
     s.transactions.unshift({ id: 't-dinner', merchant: 'Dinner', amount: 600, type: 'expense', category: 'food', date: s.today, account: acc, recurring: false, status: 'completed', splitId: 'sp-d', people: [a] });
     s.accounts.find((x) => x.id === acc).balance -= 600;
     s.splits.unshift({ id: 'sp-d', description: 'Dinner', amount: 600, paidBy: 'me', date: s.today, mode: 'equal', shares: [{ person: 'me', amount: 300 }, { person: a, amount: 300 }], category: 'food', transactionId: 't-dinner' });`,
    friend.id,
  );
  const acc = ((await state(page)).transactions as { id: string; account: string }[]).find((t) => t.id === 't-dinner')!.account;
  const before = await balance(page, acc);
  await openPerson(page, friend.name);

  await page.getByRole('button', { name: 'Edit Dinner' }).click();
  const sheet = page.getByRole('dialog', { name: 'Edit expense' });
  await sheet.locator('#se-amount').fill('900');
  await expect(sheet.getByTestId('se-shares')).toContainText('You ₹450');
  await sheet.locator('#se-desc').fill('Team dinner');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Saved. Your share is ₹450/)).toBeVisible();
  const sp = (await split(page, 'sp-d'))!;
  expect([sp.amount, sp.description, sp.shares.map((x) => x.amount)]).toEqual([900, 'Team dinner', [450, 450]]);
  const tx = ((await state(page)).transactions as { id: string; amount: number; merchant: string }[]).find((t) => t.id === 't-dinner')!;
  expect([tx.amount, tx.merchant]).toEqual([900, 'Team dinner']);
  expect(await balance(page, acc)).toBe(before - 300);

  // Delete: the split and its spend go, the money comes back; Undo puts both back.
  await page.getByRole('button', { name: 'Edit Team dinner' }).click();
  await sheet.getByRole('button', { name: 'Delete expense' }).click();
  await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
  expect(await split(page, 'sp-d')).toBeUndefined();
  expect(((await state(page)).transactions as { id: string }[]).some((t) => t.id === 't-dinner')).toBe(false);
  expect(await balance(page, acc)).toBe(before + 600);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await split(page, 'sp-d'))?.amount).toBe(900);
  expect(await balance(page, acc)).toBe(before - 300);
});

test('a split a friend paid can be deleted too; a friend’s own entry can only be seen', async ({ page }) => {
  await openDemo(page);
  const friend = (await state(page)).people[0];
  await setState(
    page,
    `s.splits.unshift({ id: 'sf1', description: 'Movie tickets', amount: 600, paidBy: a, date: s.today, mode: 'equal', shares: [{ person: 'me', amount: 300 }, { person: a, amount: 300 }], category: 'entertainment' });
     s.splits.unshift({ id: 'sr1', description: 'Their cab', amount: 400, paidBy: a, date: s.today, mode: 'equal', shares: [{ person: 'me', amount: 200 }, { person: a, amount: 200 }], category: 'transport', remote: 'chan1' });`,
    friend.id,
  );
  await openPerson(page, friend.name);
  await page.getByRole('button', { name: 'Edit Movie tickets' }).click();
  const sheet = page.getByRole('dialog', { name: 'Edit expense' });
  await sheet.getByRole('button', { name: 'Delete expense' }).click();
  await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
  expect(await split(page, 'sf1')).toBeUndefined();
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await split(page, 'sf1')).toBeDefined();

  await page.getByRole('button', { name: 'See Their cab' }).click();
  await expect(sheet.getByText(/Only they can change it/)).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Delete expense' })).toHaveCount(0);
  await expect(sheet.locator('#se-amount')).toHaveCount(0);
});

test('changing a split spend’s amount on the spend itself updates who owes what', async ({ page }) => {
  await openDemo(page);
  const friend = (await state(page)).people[0];
  await setState(
    page,
    `const acc = s.accounts.find((x) => x.spendable).id;
     s.transactions.unshift({ id: 't-pizza', merchant: 'Pizza', amount: 800, type: 'expense', category: 'food', date: s.today, account: acc, recurring: false, status: 'completed', splitId: 'sp-p', people: [a] });
     s.splits.unshift({ id: 'sp-p', description: 'Pizza', amount: 800, paidBy: 'me', date: s.today, mode: 'equal', shares: [{ person: 'me', amount: 400 }, { person: a, amount: 400 }], category: 'food', transactionId: 't-pizza' });`,
    friend.id,
  );
  await page.getByRole('button', { name: 'Activity', exact: true }).last().click();
  await page.getByText('Pizza').first().click();
  await page.getByRole('button', { name: /Amount ₹800. Edit/ }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('1000');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await split(page, 'sp-p'))?.shares.map((x) => x.amount)).toEqual([500, 500]);
});
