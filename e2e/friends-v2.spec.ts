import { expect, test, type Page } from '@playwright/test';
import { phone, signInAs, state, syncNow } from './helpers';

// Friends by @username, on two real phones: everyone has a fun username from the start, a request
// by @username is accepted on the other phone, and both are connected (their channel works).

async function openFriends(p: Page) {
  await p.getByRole('button', { name: 'Plans', exact: true }).last().click();
  await p.getByRole('radio', { name: 'Splits' }).click();
  await p.getByRole('button', { name: /Add friends|Friend requests/ }).click();
  return p.getByRole('dialog', { name: 'Friends' });
}
const me = (p: Page, token: string) =>
  p.evaluate(async (t) => (await (await fetch('/api/people', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify({ action: 'me' }) })).json()).me, token);
const settle = async (...ps: Page[]) => {
  for (let k = 0; k < 2; k++)
    for (const p of ps) {
      await syncNow(p);
      await p.waitForTimeout(1500);
    }
};

test('request by @username, accepted on the other phone: friends on both, connected', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const A = await phone(browser, baseURL!, 'Krishna');
  const a = await signInAs(A, 'Krishna Rao');
  const B = await phone(browser, baseURL!, 'Saloni');
  const b = await signInAs(B, 'Saloni Mehta');

  // Everyone already has a username, made from their name.
  const sheetA = await openFriends(A);
  await expect(sheetA.getByText(/You’re @/)).toBeVisible({ timeout: 15_000 });
  const ua = (await me(A, a.token)).u as string;
  const ub = (await me(B, b.token)).u as string;
  expect(ua).toMatch(/krishna/);
  expect(ub).toMatch(/saloni/);

  // Krishna finds Saloni by her username (capitals and @ don't matter) and asks.
  await sheetA.locator('#fr-find').fill(`@${ub.toUpperCase()}`);
  await sheetA.getByRole('button', { name: 'Find' }).click();
  await expect(sheetA.getByText(`@${ub}`)).toBeVisible();
  await sheetA.getByRole('button', { name: 'Add friend' }).click();
  await expect(sheetA.getByRole('button', { name: 'Requested' })).toBeVisible();
  // A second tap can't send a second request.
  await expect(sheetA.getByText(/Sent · 1/)).toBeVisible();

  // Saloni sees it on her phone and accepts.
  await B.reload();
  const sheetB = await openFriends(B);
  await expect(sheetB.getByText('Requests · 1')).toBeVisible({ timeout: 15_000 });
  await sheetB.getByRole('button', { name: 'Accept' }).click();
  await expect(B.getByText('You’re friends now.')).toBeVisible();

  // Both phones: one person for the other, with their username, connected over their own channel.
  if (process.env.DBG) {
    await settle(A, B);
    const list = await A.evaluate(async (t) => (await (await fetch('/api/people', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify({ action: 'list' }) })).json()), a.token);
    const sa = await state(A);
    console.log('DBG list', JSON.stringify(list).slice(0, 400));
    console.log('DBG A user', sa.user.acct, sa.user.username, !!sa.user.keys, sa.mode, sa.people.map((p: { id: string; acct?: string }) => `${p.id}:${p.acct ?? ''}`).join(','));
  }
  await A.keyboard.press('Escape');
  await B.keyboard.press('Escape');
  await expect
    .poll(
      async () => {
        await settle(A, B);
        const pa = (await state(A)).people.find((x: { acct?: string }) => x.acct === b.uid);
        const pb = (await state(B)).people.find((x: { acct?: string }) => x.acct === a.uid);
        return [pa?.username, pa?.link?.status, pb?.username, pb?.link?.status];
      },
      { timeout: 90_000 },
    )
    .toEqual([ub, 'linked', ua, 'linked']);
  expect((await state(A)).people.filter((x: { acct?: string }) => x.acct === b.uid)).toHaveLength(1);
});

test('change your username: a taken one is refused, an idea is one tap', async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const A = await phone(browser, baseURL!, 'Krishna');
  const a = await signInAs(A, 'Krishna Rao');
  const B = await phone(browser, baseURL!, 'Riya');
  await signInAs(B, 'Riya');
  const taken = (await me(A, a.token)).u as string;

  const sheet = await openFriends(B);
  await sheet.getByRole('button', { name: 'Change' }).click();
  const un = B.getByRole('dialog', { name: 'Your username' });
  await un.locator('#un-input').fill(taken);
  await expect(un.getByTestId('un-status')).toHaveText('That one’s taken.', { timeout: 10_000 });
  await un.locator('#un-input').fill('k');
  await expect(un.getByTestId('un-status')).toHaveText('At least 3 characters.');
  const idea = un.getByRole('group', { name: 'Ideas' }).getByRole('button').first();
  const pick = ((await idea.textContent()) ?? '').replace('@', '');
  await idea.click();
  await expect(un.getByTestId('un-status')).toHaveText('It’s free.', { timeout: 10_000 });
  await un.getByRole('button', { name: 'Save' }).click();
  await expect(B.getByText(`You’re @${pick} now.`)).toBeVisible();
});
