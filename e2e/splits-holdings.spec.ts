import { expect, test, type Page } from '@playwright/test';
import { openDemo, setState, state } from './helpers';

// Plans → Splits shows only 3 people up top; everyone else is behind "See all". No "I have a link".
// Investments → Holdings: adding or editing a holding never offers "Count toward safe-to-spend".

const tab = (p: Page, n: string) => p.locator('nav').getByRole('button', { name: n }).first().click();
async function splits(page: Page) {
  await tab(page, 'Plans');
  await page.getByRole('radio', { name: 'Splits' }).first().click();
}

test('Splits: 3 people on top, the rest under "See all N people", and no "I have a link"', async ({ page }) => {
  await openDemo(page);
  // Five people with a balance, so more than three would show today.
  await setState(page, "s.people.forEach((p, i) => { p.link = { chan: 'c' + i, status: 'linked' }; });");
  await splits(page);
  const list = page.locator('section[aria-labelledby="people-h"] ul > li');
  await expect(list).toHaveCount(3);
  const total = (await state(page)).people.length;
  await expect(page.getByRole('button', { name: new RegExp(`See all ${total} people`) })).toBeVisible();
  await expect(page.getByRole('button', { name: /I have a link/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Invite friends/ })).toBeVisible();
});

test('Splits with 4 people: still 3 on top plus "See all"', async ({ page }) => {
  await openDemo(page);
  await setState(page, "s.people = s.people.slice(0, 4); s.people.forEach((p, i) => { p.link = { chan: 'c' + i, status: 'linked' }; });");
  await splits(page);
  await expect(page.locator('section[aria-labelledby="people-h"] ul > li')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /See all 4 people/ })).toBeVisible();
});

test('Add holding: no safe-to-spend option, and the new holding never counts as spendable', async ({ page }) => {
  await openDemo(page);
  await tab(page, 'You');
  await page.getByRole('button', { name: /^Investments/ }).click();
  await page.getByRole('button', { name: 'Add holding' }).click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet.getByRole('heading', { name: 'Add holding' })).toBeVisible();
  await expect(sheet.getByText(/safe-to-spend/i)).toHaveCount(0);
  await sheet.getByLabel('Name').fill('Gold ETF');
  await sheet.getByLabel(/Balance|Current value/).fill('12000');
  await sheet.getByRole('button', { name: 'Add holding' }).click();
  const gold = (await state(page)).accounts.find((a: { name: string }) => a.name === 'Gold ETF');
  expect(gold).toMatchObject({ type: 'investment', spendable: false, balance: 12000 });
});

test('Edit a holding: no safe-to-spend option either', async ({ page }) => {
  await openDemo(page);
  await tab(page, 'You');
  await page.getByRole('button', { name: /^Investments/ }).click();
  await page.locator('section[aria-labelledby="inv-hold"]').getByRole('button', { name: /Mutual funds/ }).click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet.getByRole('heading', { name: 'Edit holding' })).toBeVisible();
  await expect(sheet.getByText(/safe-to-spend/i)).toHaveCount(0);
});

test('a normal bank account still has the safe-to-spend option', async ({ page }) => {
  await openDemo(page);
  await tab(page, 'You');
  await page.getByRole('button', { name: /^Accounts/ }).click();
  await page.getByRole('button', { name: /Add account|Account$/ }).first().click();
  await expect(page.getByRole('dialog').last().getByText('Count this toward safe-to-spend')).toBeVisible();
});
