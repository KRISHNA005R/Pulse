import { devices, expect, test, type Page } from '@playwright/test';
import { state } from './helpers';

// The demo (Aarav's sample month) never ends up in someone's own data or their account, by any
// route, and if it ever did, PULSE takes it out and brings back what it dropped.

/** A fresh sync code for each run, so runs never see each other's data. */
const fresh = (tag: string) => `PULSE-${tag}-${Math.random().toString().slice(2, 6)}-${Math.random().toString().slice(2, 6)}-2345`;
const DEMO_ID = /^t\d+$/; // the demo's entries are t1…t96; real ones are t-xxxxxxx

/** This page with the person's own data (no demo in it), optionally syncing under `code`. */
async function own(p: Page, mine: { id: string; merchant: string }[], opts: { mixed?: boolean; code?: string; testSwitch?: boolean } = {}) {
  await p.goto('/?demo=1');
  await p.waitForTimeout(1200);
  await p.evaluate(
    ({ mine, opts }) => {
      const demo = JSON.parse(localStorage.getItem('pulse-state-v1')!);
      const s = structuredClone(demo);
      s.mode = 'personal';
      s.user = { ...s.user, name: 'Krishna', fullName: 'Krishna Rao', handle: '@krishna' };
      s.settings.newStuffSeen = true;
      s.settings.soundsAsked = true;
      for (const k of ['transactions', 'plans', 'people', 'splits', 'groups', 'settlements', 'cards', 'debts', 'budgets', 'subscriptions', 'investments', 'incomes']) s[k] = [];
      s.accounts = s.accounts.filter((a: { id: string }) => a.id === 'cash');
      s.transactions = mine.map((t) => ({ ...t, amount: 50, type: 'expense', category: 'food', date: demo.today, account: 'cash', status: 'completed' }));
      // Mixed: the demo's own items got in too, under Krishna's name.
      if (opts.mixed) for (const k of ['transactions', 'plans', 'people', 'splits', 'groups']) s[k] = [...s[k], ...demo[k]];
      localStorage.setItem('pulse-state-v1', JSON.stringify(s));
      if (opts.testSwitch) localStorage.setItem('pulse-e2e-demo-as-mine', '1');
      else localStorage.removeItem('pulse-e2e-demo-as-mine');
      if (opts.code) localStorage.setItem('pulse-sync-v1', JSON.stringify({ code: opts.code, rev: 0 }));
    },
    { mine, opts },
  );
  await p.reload();
}
const ids = async (p: Page) => ((await state(p)).transactions as { id: string }[]).map((t) => t.id);
const settle = async (p: Page) => {
  await p.evaluate(() => window.dispatchEvent(new Event('focus')));
  await p.waitForTimeout(3500);
};

test('demo items in my own data (under my name): taken out on this phone, and never uploaded', async ({ browser, baseURL }) => {
  const CODE = fresh('TEST');
  const a = await (await browser.newContext({ ...devices['iPhone 13'], baseURL, serviceWorkers: 'block' })).newPage();
  await own(a, [{ id: 't-mine1', merchant: 'My chai' }], { mixed: true, code: CODE });
  await expect(a.getByText(/Fixed: demo data removed/)).toBeVisible({ timeout: 8000 });
  await settle(a);
  expect(await ids(a)).toEqual(['t-mine1']);
  expect((await state(a)).user.name).toBe('Krishna');

  // What the account has (seen from a second phone): no demo.
  const b = await (await browser.newContext({ ...devices['iPhone 13'], baseURL, serviceWorkers: 'block' })).newPage();
  await own(b, [{ id: 't-mine2', merchant: 'Phone B lunch' }], { code: CODE });
  await settle(b);
  expect((await ids(b)).sort()).toEqual(['t-mine1', 't-mine2']);
});

test('the account’s copy got the demo and lost an entry: a phone with clean data heals it', async ({ browser, baseURL }) => {
  const CODE = fresh('HEAL');
  // Phone M uploads a mixed copy (the test switch turns the wall off, to play the old bug): demo
  // items in, and my "Old rent" entry dropped.
  const m = await (await browser.newContext({ ...devices['iPhone 13'], baseURL, serviceWorkers: 'block' })).newPage();
  await own(m, [{ id: 't-new', merchant: 'New snack' }], { mixed: true, code: CODE, testSwitch: true });
  await settle(m);
  expect((await ids(m)).some((id) => DEMO_ID.test(id))).toBe(true);

  // Phone C still has my clean data, with Old rent.
  const c = await (await browser.newContext({ ...devices['iPhone 13'], baseURL, serviceWorkers: 'block' })).newPage();
  await own(c, [{ id: 't-old', merchant: 'Old rent' }], { code: CODE });
  await settle(c);
  const healed = await ids(c);
  expect(healed.filter((id) => DEMO_ID.test(id))).toEqual([]);
  expect(healed.sort()).toEqual(['t-new', 't-old']);

  // Phone M, now on the new version: cleans itself and gets Old rent back from the account.
  await m.evaluate(() => localStorage.removeItem('pulse-e2e-demo-as-mine'));
  await m.reload();
  await settle(m);
  await settle(m);
  const back = await ids(m);
  expect(back.filter((id) => DEMO_ID.test(id))).toEqual([]);
  expect(back.sort()).toEqual(['t-new', 't-old']);
});

test('PULSE in two tabs: opening the demo in one never mixes it into the other', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], baseURL, serviceWorkers: 'block' });
  const one = await ctx.newPage();
  await own(one, [{ id: 't-mine', merchant: 'My chai' }]);
  const two = await ctx.newPage();
  await two.goto('/');
  await two.waitForTimeout(1500);

  // Tab one opens the demo. Tab two follows (it shares the same saved copy), instead of keeping an old one.
  await one.keyboard.press('Escape');
  await one.getByRole('button', { name: 'Explore demo' }).click({ timeout: 10_000 });
  await expect(two.getByRole('button', { name: /Back to my money/ }).first()).toBeVisible({ timeout: 8000 });
  // Something done in tab two now happens in the demo, not in my data.
  // Tab one comes back: tab two is back in my data too, with no demo in it.
  await one.getByRole('button', { name: /Back to my money/ }).first().click();
  await expect.poll(async () => (await state(two)).mode, { timeout: 8000 }).toBe('personal');
  expect(await ids(two)).toEqual(['t-mine']);
  expect(await ids(one)).toEqual(['t-mine']);
});

test('Earlier copies: an entry only in an older copy on this phone comes back, and nothing is removed', async ({ page }) => {
  await own(page, [{ id: 't-now', merchant: 'Today lunch' }]);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('pulse-state-v1')!);
    const older = structuredClone(s);
    older.transactions = [{ ...s.transactions[0], id: 't-lost', merchant: 'Lost chai' }];
    localStorage.setItem('pulse-sync-base-v1', JSON.stringify(older));
  });
  await page.reload();
  await page.getByRole('button', { name: 'You', exact: true }).last().click();
  await page.getByRole('button', { name: /Backup code & export/ }).click();
  const card = page.getByTestId('earlier-copies');
  await expect(card.getByText('1 not in your data now')).toBeVisible();
  // Any sheet that popped up meanwhile (install, sign-in) out of the way.
  while (await page.locator('.fixed.inset-0 [aria-hidden="true"].animate-fade').count()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await card.getByRole('button', { name: 'Bring back' }).click();
  await expect(page.getByText('1 entry brought back. Nothing was removed.')).toBeVisible();
  expect((await ids(page)).sort()).toEqual(['t-lost', 't-now']);
});
