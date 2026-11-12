import { expect, test } from '@playwright/test';
import { openDemo, setState, state } from './helpers';

// Real friends only: on a real account people come from your PULSE link, never from a typed name.

test('splitting: only friends connected on PULSE to pick, no box to type a new name, and "Add a friend" sends your link', async ({ page }) => {
  await openDemo(page, 'Krishna');
  await setState(
    page,
    `s.people = [
      { id: 'real', name: 'Rii Sharma', short: 'Rii', hue: 10, uid: 'u-rii', link: { chan: 'c'.repeat(32), key: 'k', token: 't', status: 'linked', since: s.today } },
      { id: 'old', name: 'Riya', short: 'Riya', hue: 20 },
    ];
    s.splits = [{ id: 'sp', description: 'Chai', amount: 100, date: s.today, paidBy: 'me', shares: [{ person: 'me', amount: 50 }, { person: 'old', amount: 50 }], category: 'food' }];`,
  );
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.locator('#composer-amount').fill('600');
  await page.locator('#composer-text').fill('Dinner with Riya');
  // "with Riya" is not a friend on PULSE: no offer to add her.
  await expect(page.getByRole('button', { name: /Split with/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^Split$/ }).click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog.getByRole('button', { name: /Rii/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Riya/ })).toHaveCount(0);
  await expect(dialog.getByPlaceholder(/add a friend|by name/i)).toHaveCount(0);
  await dialog.getByRole('button', { name: /Add a friend/ }).first().click();
  await expect(page.getByText('Your PULSE link')).toBeVisible();
});

test('opening PULSE tidies the list: the same friend twice becomes one, unused names go, names with history stay', async ({ page }) => {
  await openDemo(page, 'Krishna');
  await setState(
    page,
    `s.people = [
      { id: 'real', name: 'Rii', short: 'Rii', hue: 10, uid: 'u-rii', link: { chan: 'c'.repeat(32), key: 'k', token: 't', status: 'linked', since: s.today } },
      { id: 'copy', name: 'Rii', short: 'Rii', hue: 11, uid: 'u-rii' },
      { id: 'n1', name: 'Rii', short: 'Rii', hue: 12 },
      { id: 'n2', name: 'Rii', short: 'Rii', hue: 13 },
      { id: 'n3', name: 'Riya', short: 'Riya', hue: 14 },
      { id: 'kept', name: 'Riya', short: 'Riya', hue: 15 },
    ];
    s.splits = [
      { id: 'a', description: 'Chai', amount: 100, date: s.today, paidBy: 'me', shares: [{ person: 'me', amount: 50 }, { person: 'kept', amount: 50 }], category: 'food' },
      { id: 'b', description: 'Cab', amount: 200, date: s.today, paidBy: 'copy', shares: [{ person: 'me', amount: 100 }, { person: 'copy', amount: 100 }], category: 'transport' },
    ];
    s.groups = []; s.bhisis = []; s.settlements = [];`,
  );
  await page.reload();
  await expect.poll(async () => (await state(page)).people.map((p: { id: string }) => p.id).sort()).toEqual(['kept', 'real']);
  expect((await state(page)).splits.find((x: { id: string }) => x.id === 'b').paidBy).toBe('real');
});

test('groups: no "add someone by name" box; people join with the group link', async ({ page }) => {
  await openDemo(page, 'Krishna');
  await page.getByRole('button', { name: 'Plans', exact: true }).last().click();
  await page.getByRole('radio', { name: 'Splits' }).or(page.getByRole('button', { name: 'Splits', exact: true })).first().click();
  await page.getByRole('button', { name: /New group|Create a group|group/i }).first().click();
  const form = page.getByRole('dialog').last();
  await expect(form.getByPlaceholder(/add a friend|by name/i)).toHaveCount(0);
  await expect(form.getByText(/Pick friends on PULSE now/)).toBeVisible();
});
