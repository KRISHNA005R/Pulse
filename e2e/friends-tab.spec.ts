import { expect, test, type Page } from '@playwright/test';
import { phone, signInAs, state, syncNow } from './helpers';

// You → Friends: a card to share, add by @username, requests. Then friends are invited to a bhisi
// and a group inside PULSE (no links), and join with one tap.

const OUT = process.env.SHOTS;
const shot = async (p: Page, n: string) => {
  if (!OUT) return;
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${n}.png` });
};
const quiet = (p: Page) => (OUT ? p.waitForTimeout(4200) : Promise.resolve());
const settle = async (...ps: Page[]) => {
  for (let k = 0; k < 2; k++)
    for (const p of ps) {
      await syncNow(p);
      await p.waitForTimeout(1500);
    }
};
const tab = (p: Page, name: 'Home' | 'Plans' | 'You') => p.getByRole('button', { name, exact: true }).last().click();
async function friendsScreen(p: Page) {
  await tab(p, 'You');
  await p.getByRole('button', { name: /^Friends/ }).click();
  return p.locator('main');
}
async function plans(p: Page, seg: 'Splits' | 'Bhisi') {
  await tab(p, 'Plans');
  await p.getByRole('radio', { name: seg }).or(p.getByRole('button', { name: seg, exact: true })).first().click();
}

test('friends tab: request, accept, then invite to a bhisi and a group without links', async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const A = await phone(browser, baseURL!, 'Krishna');
  const a = await signInAs(A, 'Krishna Rao');
  const B = await phone(browser, baseURL!, 'Saloni');
  const b = await signInAs(B, 'Saloni Mehta');
  const ub = (await B.evaluate(async (t) => (await (await fetch('/api/people', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify({ action: 'me' }) })).json()).me.u, b.token)) as string;

  // Splits has no invite or link buttons any more.
  await plans(A, 'Splits');
  await expect(A.getByRole('button', { name: /Add friends|Friend requests/ })).toHaveCount(0);

  // You → Friends.
  await tab(A, 'You');
  await quiet(A);
  await shot(A, '01-you-friends-row');
  const fa = await friendsScreen(A);
  const card = fa.getByLabel('Your friend card');
  await expect(card.getByText(/^@\S*krishna/)).toBeVisible({ timeout: 15_000 });
  await expect(card.getByRole('img', { name: /QR code/ })).toBeVisible();
  await shot(A, '02-friends-screen');

  await fa.locator('#fr-find').fill(`@${ub}`);
  await fa.getByRole('button', { name: 'Find' }).click();
  await fa.getByRole('button', { name: 'Add friend' }).click();
  await expect(fa.getByRole('button', { name: 'Requested' })).toBeVisible();
  await quiet(A);
  await shot(A, '03-requested');

  // Saloni: a badge on You → Friends, and the request.
  await B.reload();
  await tab(B, 'You');
  await expect(B.getByRole('button', { name: /^Friends.*1 new request/ })).toBeVisible({ timeout: 20_000 });
  await shot(B, '04-saloni-you-badge');
  const fb = await friendsScreen(B);
  await fb.getByRole('tab', { name: /Requests 1/ }).click();
  await shot(B, '05-saloni-requests');
  await fb.getByRole('button', { name: 'Accept' }).click();
  await expect(B.getByText('You’re friends now.')).toBeVisible();

  await expect
    .poll(
      async () => {
        await settle(A, B);
        return [(await state(A)).people.find((x: { acct?: string }) => x.acct === b.uid)?.link?.status, (await state(B)).people.find((x: { acct?: string }) => x.acct === a.uid)?.link?.status];
      },
      { timeout: 90_000 },
    )
    .toEqual(['linked', 'linked']);
  await A.reload();
  const fa2 = await friendsScreen(A);
  await expect(fa2.getByText(`@${ub}`)).toBeVisible();
  await quiet(A);
  await shot(A, '06-friends-list');

  // Username lives in Profile.
  await tab(A, 'You');
  await A.getByRole('button', { name: /^Profile/ }).click();
  await expect(A.getByRole('button', { name: /@\S*krishna.*Change/ })).toBeVisible();
  await shot(A, '07-profile-username');

  // Bhisi: pick Saloni; she gets the invite in PULSE and joins with one tap.
  await plans(A, 'Bhisi');
  await A.getByRole('button', { name: /Start a bhisi/ }).click();
  const form = A.getByRole('dialog').last();
  await A.fill('#bh-name', 'Hostel gang BC');
  await form.locator('#bh-amount').fill('2000');
  await form.getByRole('button', { name: /Saloni/ }).click();
  await form.getByText('Invite friends').scrollIntoViewIfNeeded();
  await shot(A, '08-bhisi-pick-friends');
  await form.getByRole('button', { name: /Start bhisi/ }).click();
  await expect.poll(async () => (await state(A)).bhisis?.[0]?.share?.bid, { timeout: 15_000 }).toBeTruthy();
  await expect.poll(async () => (await state(A)).invitesOut?.length ?? 0).toBe(1);
  await quiet(A);
  await shot(A, '09-bhisi-detail');

  await expect
    .poll(
      async () => {
        await settle(A, B);
        return (await state(B)).invites?.length ?? 0;
      },
      { timeout: 60_000 },
    )
    .toBe(1);
  await plans(B, 'Bhisi');
  const inv = B.getByLabel('Invite to Hostel gang BC');
  await expect(inv).toBeVisible();
  await shot(B, '10-saloni-bhisi-invite');
  await inv.getByRole('button', { name: 'Join' }).click();
  await expect.poll(async () => (await state(B)).bhisis?.length ?? 0, { timeout: 20_000 }).toBe(1);
  await expect(B.getByLabel('Invite to Hostel gang BC')).toHaveCount(0);
  await quiet(B);
  await shot(B, '11-saloni-joined-bhisi');

  // Group: made with Saloni picked, so she's invited too.
  await plans(A, 'Splits');
  await A.getByRole('button', { name: 'New group' }).click();
  const gf = A.getByRole('dialog').last();
  await gf.locator('#group-name').fill('Goa trip');
  await gf.getByRole('button', { name: /Saloni/ }).click();
  await shot(A, '12-group-pick');
  await gf.getByRole('button', { name: 'Create group' }).click();
  await expect.poll(async () => (await state(A)).invitesOut?.filter((x: { k: string }) => x.k === 'g').length ?? 0).toBe(1);
  await A.getByRole('button', { name: 'Edit group' }).click();
  await quiet(A);
  await shot(A, '13-group-invite-options');
  await A.getByRole('dialog').last().getByRole('button', { name: /Pick friends/ }).click();
  await expect(A.getByRole('dialog', { name: /Invite to Goa trip/ }).getByText('Invited')).toBeVisible();
  await shot(A, '14-group-pick-sheet');
  await A.keyboard.press('Escape');

  await expect
    .poll(
      async () => {
        await settle(A, B);
        return (await state(B)).invites?.filter((x: { k: string }) => x.k === 'g').length ?? 0;
      },
      { timeout: 60_000 },
    )
    .toBe(1);
  await plans(B, 'Splits');
  const gi = B.getByLabel('Invite to Goa trip');
  await expect(gi).toBeVisible();
  await shot(B, '15-saloni-group-invite');
  await gi.getByRole('button', { name: 'Join' }).click();
  // "Join Goa trip", then (Krishna's group lists her by name) "Is one of these you?" → I'm Saloni.
  const join = B.getByRole('dialog').last();
  await join.getByRole('button', { name: /I.m Saloni|Join Goa trip/ }).first().click();
  const mine = join.getByRole('button', { name: /I.m Saloni/ });
  if (await mine.waitFor({ timeout: 8_000 }).then(() => true, () => false)) await mine.click();
  await expect.poll(async () => (await state(B)).groups.some((g: { name: string; shared?: unknown }) => g.name === 'Goa trip' && g.shared), { timeout: 20_000 }).toBe(true);
});
