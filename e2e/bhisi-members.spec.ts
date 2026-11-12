import { devices, expect, test, type Page } from '@playwright/test';
import { blockedCalls, phone, setState, state, syncNow } from './helpers';

// Shared bhisi between phones: someone the organiser added by name joins with the link (one seat,
// not two), then the organiser deletes it and it goes from everyone's PULSE.

async function start(A: Page) {
  await A.getByRole('button', { name: 'Plans', exact: true }).last().click();
  await A.getByRole('radio', { name: 'Bhisi' }).or(A.getByRole('button', { name: 'Bhisi', exact: true })).first().click();
  await A.getByRole('button', { name: /Start a bhisi/ }).click();
  const form = A.getByRole('dialog').last();
  await A.fill('#bh-name', 'Hostel gang BC');
  await form.locator('#bh-amount').fill('2000');
  await form.getByRole('button', { name: /Start bhisi/ }).click();
  await expect.poll(async () => (await state(A)).bhisis?.[0]?.share?.bid, { timeout: 15_000 }).toBeTruthy();
  // The short link: just the key (the id comes from it).
  const link = await A.evaluate(() => `${location.origin}/#b=${JSON.parse(localStorage.getItem('pulse-state-v1')!).bhisis[0].share.key}`);
  expect(link.length).toBeLessThan(60);
  return link;
}
async function join(B: Page, invite: string) {
  await B.goto(invite);
  await B.getByRole('button', { name: /Join the bhisi/ }).click();
  await expect.poll(async () => (await state(B)).bhisis?.length ?? 0, { timeout: 15_000 }).toBe(1);
}
const members = async (p: Page) => ((await state(p)).bhisis?.[0]?.members ?? []).length;
const settle = async (...ps: Page[]) => {
  for (let k = 0; k < 2; k++)
    for (const p of ps) {
      await syncNow(p);
      await p.waitForTimeout(1200);
    }
};

test('people join with the link (opened, or pasted in PULSE): everyone sees the same three, and pays by UPI', async ({ browser, baseURL }) => {
  test.setTimeout(150_000);
  const A = await phone(browser, baseURL!, 'Krishna');
  await setState(A, 's.user.upi = a;', 'krishna@okaxis');
  const invite = await start(A);
  await expect.poll(() => members(A)).toBe(1); // just me, until people join with the link

  const B = await phone(browser, baseURL!, 'Rahul');
  const P = await phone(browser, baseURL!, 'Priya');
  await join(B, invite);
  // Priya pastes the link inside PULSE instead (her home-screen app on iPhone).
  await P.getByRole('button', { name: 'Plans', exact: true }).last().click();
  await P.getByRole('radio', { name: 'Bhisi' }).or(P.getByRole('button', { name: 'Bhisi', exact: true })).first().click();
  await P.getByRole('button', { name: /I have an invite link/ }).click();
  await P.getByRole('textbox', { name: /Bhisi invite link/ }).fill(`Join my bhisi "Hostel gang BC" on PULSE: ${invite}`);
  await expect(P.getByText(/Join Hostel gang BC\?/)).toBeVisible();
  await expect(P.getByText(/By Krishna · ₹2,000 a month/)).toBeVisible();
  await P.getByRole('button', { name: /Join the bhisi/ }).click();
  await expect.poll(async () => (await state(P)).bhisis?.length ?? 0, { timeout: 15_000 }).toBe(1);
  await expect.poll(async () => { await settle(B, A, P); return [await members(A), await members(B), await members(P)]; }, { timeout: 60_000 }).toEqual([3, 3, 3]);
  // Everyone is a real PULSE person: no names typed in.
  expect((await state(A)).bhisis[0].share.ghosts ?? []).toEqual([]);

  // Rahul pays Krishna by UPI: the button opens his UPI app with Krishna's UPI ID and the amount filled in.
  await B.reload();
  await B.getByRole('button', { name: /Hostel gang BC/ }).first().click();
  await B.getByRole('button', { name: /Pay Krishna ₹2,000/ }).click();
  const pay = B.getByRole('dialog').last();
  const href = await pay.getByRole('link', { name: /Pay Krishna/ }).getAttribute('href');
  expect(href).toContain('pa=krishna@okaxis');
  expect(href).toContain('am=2000.00');
  await pay.getByRole('button', { name: /I’ve paid/ }).click();
  await expect.poll(async () => { await settle(B, A); return (await state(A)).bhisis[0].rounds[0].paid.length; }, { timeout: 30_000 }).toBe(1);

  expect(await blockedCalls(A)).toEqual([]);
});

test('opening the invite when not signed in: the bhisi invite is the first screen', async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const A = await phone(browser, baseURL!, 'Krishna');
  const invite = await start(A);
  await expect.poll(async () => { await syncNow(A); await A.waitForTimeout(800); return (await state(A)).bhisis[0].rounds.length; }).toBeGreaterThan(0);
  const ctx = await browser.newContext({ ...devices['iPhone 13'], baseURL, serviceWorkers: 'block' });
  const N = await ctx.newPage();
  await N.goto(invite);
  // The bhisi invite is the first screen (not PULSE's intro), with what it is and who made it.
  await expect(N.getByRole('heading', { name: /Join Hostel gang BC/ })).toBeVisible({ timeout: 15_000 });
  await expect(N.getByText(/By Krishna · ₹2,000 a month · 1 in so far/)).toBeVisible();
  await expect(N.getByRole('button', { name: 'Get started' })).toHaveCount(0);
  await expect(N.getByRole('button', { name: /Copy invite/ })).toBeVisible();
});

test('a new person opens the invite: set up, then they land in the bhisi, already joined', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const A = await phone(browser, baseURL!, 'Krishna');
  const invite = await start(A);
  await expect.poll(async () => { await syncNow(A); await A.waitForTimeout(800); return (await state(A)).bhisis[0].rounds.length; }).toBeGreaterThan(0);
  const ctx = await browser.newContext({ ...devices['iPhone 13'], baseURL, serviceWorkers: 'block' });
  const N = await ctx.newPage();
  await N.goto(invite);
  await N.getByRole('button', { name: /Join the bhisi/ }).click();
  for (let i = 0; i < 5; i++) await N.getByRole('button', { name: 'Skip for now' }).click();
  await N.getByRole('button', { name: 'Build my dashboard' }).click();
  await N.getByRole('button', { name: /Open PULSE|Let’s go|Go to/ }).first().click({ timeout: 15_000 }).catch(() => {});
  // No second "Join?" question: it's joined and open.
  await expect.poll(async () => (await state(N)).bhisis?.length ?? 0, { timeout: 20_000 }).toBe(1);
  await expect(N.getByText(/Hostel gang BC/).first()).toBeVisible({ timeout: 15_000 });
  await expect(N.getByRole('button', { name: /Join the bhisi/ })).toHaveCount(0);
});

test('the organiser deletes it: it goes from every member’s PULSE', async ({ browser, baseURL }) => {
  test.setTimeout(150_000);
  const A = await phone(browser, baseURL!, 'Krishna');
  const invite = await start(A);
  const B = await phone(browser, baseURL!, 'Priya');
  await join(B, invite);
  await expect.poll(async () => { await settle(B, A); return [await members(A), await members(B)]; }, { timeout: 60_000 }).toEqual([2, 2]);

  // Krishna deletes it.
  await A.getByRole('button', { name: /Delete bhisi/ }).click();
  await A.getByRole('dialog').last().getByRole('button', { name: /Delete bhisi/ }).click();
  await expect.poll(async () => (await state(A)).bhisis.length).toBe(0);

  // Priya's PULSE: gone after the next sync, with a line saying why.
  await B.reload();
  await B.getByRole('button', { name: 'Plans', exact: true }).last().click();
  await B.getByRole('radio', { name: 'Bhisi' }).or(B.getByRole('button', { name: 'Bhisi', exact: true })).first().click();
  await expect.poll(async () => { await syncNow(B); return (await state(B)).bhisis.length; }, { timeout: 30_000 }).toBe(0);
  await expect(B.getByText(/was deleted by the person who made it/)).toBeVisible();
  await expect(B.getByRole('button', { name: /Start a bhisi/ })).toBeVisible();

  // The old invite link now says so too.
  const C = await phone(browser, baseURL!, 'Amit');
  await C.goto(invite);
  await C.getByRole('button', { name: /Join the bhisi/ }).click();
  await expect(C.getByText(/deleted by the person who made it/)).toBeVisible();
});
