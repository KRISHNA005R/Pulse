import { expect, test, type Page } from '@playwright/test';
import { log, phone, state } from './helpers';

// Bug: signed in, you tap "Explore demo" while a sync is still on its way back from the server.
// When it lands, it must not mix the demo (Aarav) into your own data, and must never upload it.

const CODE = 'PULSE-TEST-RACE-2345-6789';

async function turnOnSync(p: Page, code: string) {
  await p.evaluate((c) => {
    localStorage.setItem('pulse-sync-v1', JSON.stringify({ code: c, rev: 0 }));
    localStorage.removeItem('pulse-sync-base-v1');
  }, code);
  await p.reload();
  await p.waitForTimeout(3000); // first upload
  await p.keyboard.press('Escape');
}

test('a sync that finishes after you open the demo leaves your data alone', async ({ browser, baseURL }) => {
  // Phone A and phone B: the same person, the same synced data.
  const a = await phone(browser, baseURL!, 'Krishna');
  await turnOnSync(a, CODE);
  const b = await phone(browser, baseURL!, 'Krishna');
  await turnOnSync(b, CODE);
  // Phone B adds something, so phone A has news to pull.
  await (await log(b, 432, 'Phone B lunch')).save();
  await b.waitForTimeout(3500);

  // Phone A: its next download is slow. While it's on the way, Krishna taps "Explore demo".
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await a.route('**/api/sync**', async (route) => {
    if (route.request().method() === 'GET') await held;
    await route.continue();
  });
  await a.evaluate(() => window.dispatchEvent(new Event('focus'))); // starts a sync
  await a.waitForTimeout(500);
  await a.getByRole('button', { name: 'Explore demo' }).click();
  await expect(a.getByText(/exploring/).first()).toBeVisible();
  release();
  await a.waitForTimeout(3000);
  await a.unroute('**/api/sync**');

  // Still in the demo, with Krishna's own data parked safely.
  let s = await state(a);
  expect(s.mode).toBe('demo');
  const parked = await a.evaluate(() => JSON.parse(localStorage.getItem('pulse-personal-stash-v1') ?? 'null'));
  expect(parked?.user.name).toBe('Krishna');

  // Back to my money: Krishna's data, plus phone B's lunch once it syncs. No Aarav.
  await a.getByRole('button', { name: 'Back to my money' }).first().click();
  await a.waitForTimeout(4000);
  s = await state(a);
  expect(s.mode).toBe('personal');
  expect(s.user.name).toBe('Krishna');
  expect(s.transactions.some((t: { merchant: string }) => t.merchant === 'Phone B lunch')).toBe(true);

  // And the saved copy on the server (seen from phone B) was never replaced by the demo.
  await b.evaluate(() => window.dispatchEvent(new Event('focus')));
  await b.waitForTimeout(3500);
  expect((await state(b)).user.name).toBe('Krishna');
});

test('a phone already mixed up by the bug repairs itself: demo out, your entries and name back', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const demo = JSON.parse(localStorage.getItem('pulse-state-v1')!);
    // My own data, as parked when I opened the demo.
    const mine = structuredClone(demo);
    mine.mode = 'personal';
    mine.user = { ...mine.user, name: 'Krishna', fullName: 'Krishna Rao', handle: '@krishna' };
    mine.transactions = [{ id: 'tx-mine', merchant: 'My own chai', amount: 35, type: 'expense', category: 'food', date: demo.today, account: 'cash', status: 'completed' }];
    mine.plans = [];
    mine.people = [];
    mine.splits = [];
    mine.groups = [];
    mine.settlements = [];
    // What the bug left: the demo, called mine, with my entry gone.
    const mixed = structuredClone(demo);
    mixed.mode = 'personal';
    localStorage.setItem('pulse-personal-stash-v1', JSON.stringify(mine));
    localStorage.setItem('pulse-state-v1', JSON.stringify(mixed));
  });
  await page.reload();
  await expect(page.getByText(/Fixed: demo data had got mixed/)).toBeVisible({ timeout: 8000 });
  const s = await state(page);
  expect(s.user.name).toBe('Krishna');
  const ids: string[] = s.transactions.map((t: { id: string }) => t.id);
  expect(ids).toContain('tx-mine');
  expect(ids.filter((id) => /^t\d+$/.test(id))).toEqual([]); // the demo's entries are t1…t96
  expect(await page.evaluate(() => localStorage.getItem('pulse-personal-stash-v1'))).toBeNull();
  await expect(page.getByText(/Aarav/)).toHaveCount(0);
});
