import { expect, test } from '@playwright/test';
import { openDemo, setState, state } from './helpers';

// Krishna's case: Chicken ₹1,305 (his half ₹653) was marked paid, then Chicken changed so he's not in
// it, and saloni "owed" him ₹653. Balances now says it comes from the payment only, and it can go.

test('a balance from a payment only: Balances says so, and removing the payment settles it', async ({ page }) => {
  await openDemo(page);
  await setState(
    page,
    `s.people.push({ id: 'sal', name: 'saloni', short: 'saloni', hue: 1 });
     s.groups.unshift({ id: 'hc', name: 'Hum chaar', emoji: '🍜', members: ['me', 'sal'], createdAt: s.today });
     s.splits.unshift({ id: 'chicken', group: 'hc', description: 'Chicken', amount: 1305, paidBy: 'sal', date: s.today, mode: 'exact', shares: [{ person: 'sal', amount: 1305 }], category: 'food' });
     s.settlements.unshift({ id: 'st-x', group: 'hc', from: 'me', to: 'sal', amount: 653, date: s.today });`,
  );
  await page.locator('nav:visible').getByRole('button', { name: 'Plans' }).click();
  await page.getByRole('radio', { name: 'Splits' }).click();
  await page.getByText('Hum chaar').first().click();
  await page.getByRole('radio', { name: 'Balances' }).click();
  await expect(page.getByText('Owes you ₹653')).toBeVisible();
  await page.getByRole('button', { name: /Didn’t pay\? Remove it/ }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Remove payment' }).click();
  await expect(page.getByText('Settled').first()).toBeVisible();
  expect((await state(page)).settlements.some((x: { id: string }) => x.id === 'st-x')).toBe(false);
  // Undo brings it back.
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await state(page)).settlements.some((x: { id: string }) => x.id === 'st-x')).toBe(true);
});

test('Paid tab: tap a payment to remove it', async ({ page }) => {
  await openDemo(page);
  await setState(
    page,
    `s.people.push({ id: 'sal', name: 'saloni', short: 'saloni', hue: 1 });
     s.groups.unshift({ id: 'hc', name: 'Hum chaar', emoji: '🍜', members: ['me', 'sal'], createdAt: s.today });
     s.splits.unshift({ id: 'chicken', group: 'hc', description: 'Chicken', amount: 1305, paidBy: 'sal', date: s.today, mode: 'exact', shares: [{ person: 'sal', amount: 1305 }], category: 'food' });
     s.settlements.unshift({ id: 'st-x', group: 'hc', from: 'me', to: 'sal', amount: 653, date: s.today });`,
  );
  await page.locator('nav:visible').getByRole('button', { name: 'Plans' }).click();
  await page.getByRole('radio', { name: 'Splits' }).click();
  await page.getByText('Hum chaar').first().click();
  await page.getByRole('radio', { name: /Paid/ }).click();
  await page.getByText('You → saloni').click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Remove' }).click();
  await expect.poll(async () => (await state(page)).settlements.some((x: { id: string }) => x.id === 'st-x')).toBe(false);
});
