import { expect, test } from '@playwright/test';
import { blockedCalls, phone, state, syncNow } from './helpers';

// Journey 6: a shared bhisi between two phones. Create → invite link → join → draw on the server →
// both phones show the same winner.

test('two phones: invite, join, draw, same winner on both', async ({ browser, baseURL }) => {
  test.setTimeout(150_000);
  const A = await phone(browser, baseURL!, 'Krishna');

  await A.getByRole('button', { name: 'Plans', exact: true }).last().click();
  await A.getByRole('radio', { name: 'Bhisi' }).or(A.getByRole('button', { name: 'Bhisi', exact: true })).first().click();
  await A.getByRole('button', { name: /Start a bhisi/ }).click();
  const form = A.getByRole('dialog').last();
  await A.fill('#bh-name', 'Hostel gang BC');
  await form.locator('#bh-amount').fill('2000');
  await form.getByRole('button', { name: /Rahul/ }).first().click();
  await form.getByRole('button', { name: 'Today', exact: true }).click(); // first draw today, so it's open
  await form.getByRole('button', { name: /Start bhisi/ }).click();
  await expect.poll(async () => (await state(A)).bhisis?.[0]?.share?.bid, { timeout: 15_000 }).toBeTruthy();

  const invite = await A.evaluate(() => {
    const bh = JSON.parse(localStorage.getItem('pulse-state-v1')!).bhisis[0];
    const label = btoa(String.fromCharCode(...new TextEncoder().encode(bh.name))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${location.origin}/#bhisi=${bh.share.bid}.${bh.share.key}.${label}`;
  });

  const B = await phone(browser, baseURL!, 'Priya');
  await B.goto(invite);
  await B.getByRole('button', { name: /Join the bhisi/ }).click();
  await expect.poll(async () => (await state(B)).bhisis?.length ?? 0, { timeout: 15_000 }).toBe(1);
  await syncNow(B);
  await A.waitForTimeout(1500);
  await syncNow(A);
  await expect.poll(async () => { await syncNow(A); return (await state(A)).bhisis[0].share.seats ? Object.keys((await state(A)).bhisis[0].share.seats).length : 0; }, { timeout: 20_000 }).toBeGreaterThanOrEqual(3);

  // A draws. The server picks; the animation then shows it.
  await A.getByRole('button', { name: /Draw the chitti/ }).click();
  await A.getByRole('button', { name: /Shake the matka/ }).click();
  await expect.poll(async () => (await state(A)).bhisis[0].rounds[0].winner, { timeout: 20_000 }).toBeTruthy();
  await A.waitForTimeout(5000);
  await A.keyboard.press('Escape');

  const name = async (p: typeof A) => {
    const s = await state(p);
    const w = s.bhisis[0].rounds[0].winner;
    return w === 'me' ? s.user.name : s.people.find((x: { id: string }) => x.id === w)?.name;
  };
  const winnerA = await name(A);
  await expect.poll(async () => { await syncNow(B); return name(B); }, { timeout: 30_000 }).toBe(winnerA);

  expect(await blockedCalls(A)).toEqual([]);
});
