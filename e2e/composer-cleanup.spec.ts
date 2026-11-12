import { expect, test, type Page } from '@playwright/test';
import { log, openDemo, state, setState } from './helpers';

// The add screen, simplified:
// 1. No "Plan" on a spend: a spend is never money put into a plan (that's Add money, or Moved → plan).
// 2. Typing a friend's name doesn't turn it into a split; a small hint offers it instead.
// 3. On a laptop, the sideways rows scroll with the mouse wheel, by dragging, or with arrows.
// 4. No category chip at the bottom: the top row has every category, and scrolls to the picked one.

const details = (p: Page) => p.getByTestId('composer-details');

test('a spend has no Plan option, typing a plan name does not tag it, and the message never says "Added to"', async ({ page }) => {
  await openDemo(page);
  const plan = (await state(page)).plans.find((p: { status: string }) => p.status === 'active');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(details(page).getByRole('button', { name: /^Plan$/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).first().click().catch(() => page.keyboard.press('Escape'));
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const before = (await state(page)).plans.find((p: { id: string }) => p.id === plan.id).saved;
  await (await log(page, 4180, `${plan.name} hotel`)).save();
  await expect(page.getByText(/Added to /)).toHaveCount(0);
  const s = await state(page);
  const tx = s.transactions.find((t: { amount: number; type: string }) => t.amount === 4180 && t.type === 'expense');
  expect(tx.plan).toBeUndefined();
  expect(s.plans.find((p: { id: string }) => p.id === plan.id).saved).toBe(before);
});

test('Moved → a plan still puts money into the plan', async ({ page }) => {
  await openDemo(page);
  const plan = (await state(page)).plans.find((p: { status: string }) => p.status === 'active');
  const before = plan.saved;
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByRole('radio', { name: /Moved/ }).click();
  await page.locator('#composer-amount').fill('4180');
  await page.getByRole('dialog').locator('select').nth(1).selectOption(`pot:${plan.id}`);
  await page.locator('#composer-text').press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5000 });
  expect((await state(page)).plans.find((p: { id: string }) => p.id === plan.id).saved).toBe(before + 4180);
});

test('a friend\'s name in the text does not split by itself; the hint does it on a tap', async ({ page }) => {
  await openDemo(page);
  // A friend connected on PULSE (only they are offered for a split).
  await setState(page, "s.people[0].link = { chan: 'c'.repeat(32), key: 'k', token: 't', status: 'linked', since: s.today }; s.people[0].uid = 'u-friend';");
  const friend = (await state(page)).people[0];
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.locator('#composer-amount').fill('600');
  await page.locator('#composer-text').fill(`dinner w/ ${friend.short ?? friend.name}`);
  // Still a plain spend: the Split chip hasn't changed, no split section.
  await expect(details(page).getByRole('button', { name: /^Split$/ })).toBeVisible();
  await expect(page.getByText(/^Split \d+ ways$/)).toHaveCount(0);
  const hint = page.getByRole('button', { name: new RegExp(`Split with ${friend.short ?? friend.name}`) });
  await expect(hint).toBeVisible();
  // Saving now: a normal spend, no split.
  const splits0 = (await state(page)).splits.length;
  await page.locator('#composer-text').press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5000 });
  let s = await state(page);
  expect(s.splits.length).toBe(splits0);
  expect(s.transactions.find((t: { amount: number }) => t.amount === 600).people).toBeUndefined();

  // With the hint: it becomes a split with that friend.
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.locator('#composer-amount').fill('800');
  await page.locator('#composer-text').fill(`lunch w/ ${friend.short ?? friend.name}`);
  await page.getByRole('button', { name: new RegExp(`Split with ${friend.short ?? friend.name}`) }).click();
  await expect(details(page).getByRole('button', { name: /2 people/ })).toBeVisible();
  await expect(page.getByText('Split 2 ways')).toBeVisible();
  await page.locator('#composer-text').press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5000 });
  s = await state(page);
  expect(s.splits.length).toBe(splits0 + 1);
});

test('no category chip at the bottom; the top row scrolls to the category picked from the text', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(details(page).getByRole('button', { expanded: false }).filter({ hasText: /Other|Food/ })).toHaveCount(0);
  // Pick the last category in the row by typing its name: it must end up in view.
  const row = page.getByRole('group', { name: 'Quick picks' });
  const last = (await row.getByRole('button').filter({ hasNotText: 'New' }).last().textContent())!.trim();
  await page.locator('#composer-text').fill(last);
  const on = row.locator('[aria-pressed="true"]');
  await expect(on).toHaveCount(1);
  await expect.poll(async () => {
    const r = await row.boundingBox();
    const b = await on.boundingBox();
    return b!.x >= r!.x - 1 && b!.x + b!.width <= r!.x + r!.width + 1;
  }).toBe(true);
});

test('"Got it back" can still choose which spending it comes off', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByRole('radio', { name: /Got/ }).first().click();
  await page.getByRole('button', { name: 'Got it back' }).click();
  await page.getByRole('button', { name: /spending$/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Category' })).toBeVisible();
});

test.describe('laptop with a mouse', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test('the categories row scrolls with the mouse wheel and with the arrows', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Add expense' }).first().click();
    const row = page.getByRole('group', { name: 'Quick picks' });
    const scroller = page.getByTestId('hscroll-quick-picks');
    const left = () => scroller.evaluate((e) => e.scrollLeft);
    expect(await left()).toBe(0);
    await row.hover();
    await page.mouse.wheel(0, 300);
    await expect.poll(left).toBeGreaterThan(50);
    const after = await left();
    await page.getByRole('button', { name: 'Scroll back' }).first().click();
    await expect.poll(left).toBeLessThan(after);
    await page.getByRole('button', { name: 'Scroll on' }).first().click();
    await expect.poll(left).toBeGreaterThan(0);
  });
});

test('transaction screen: the Plan row only shows on a spend that already has a plan', async ({ page }) => {
  await openDemo(page);
  await (await log(page, 222, 'chai')).save();
  await page.getByText('Chai').first().click();
  await expect(page.getByLabel('Assign to plan')).toHaveCount(0);
});
