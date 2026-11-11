import { expect, test } from '@playwright/test';
import { openDemo, setState, state } from './helpers';

// A split a friend paid has no spend of yours, so it used to have no way to be removed.

test('a split a friend paid can be removed from the person screen (with Undo); one with a spend of yours cannot', async ({ page }) => {
  await openDemo(page);
  const friend = (await state(page)).people[0];
  await setState(
    page,
    `s.splits.unshift({ id: 'sf1', description: 'Movie tickets', amount: 600, paidBy: a, date: s.today, mode: 'equal', shares: [{ person: 'me', amount: 300 }, { person: a, amount: 300 }], category: 'entertainment' });`,
    friend.id,
  );
  await page.locator('nav:visible').getByRole('button', { name: 'Plans' }).click();
  await page.getByRole('radio', { name: 'Splits' }).click();
  await page.getByText(friend.name).first().click();
  const row = page.getByRole('button', { name: 'Remove Movie tickets' });
  await row.click();
  expect((await state(page)).splits.some((x: { id: string }) => x.id === 'sf1')).toBe(false);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await state(page)).splits.some((x: { id: string }) => x.id === 'sf1')).toBe(true);
  // Splits with a spend of yours are removed with that spend, so they get no button here.
  const withTx = (await state(page)).splits.filter((x: { transactionId?: string; shares: { person: string }[] }) => x.transactionId && x.shares.some((y) => y.person === friend.id));
  for (const sp of withTx) await expect(page.getByRole('button', { name: `Remove ${sp.description}` })).toHaveCount(0);
});
