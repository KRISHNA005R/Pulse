import { chromium, expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { phone, signInAs, state, syncNow } from './helpers';

// Usernames said once, Meet (phones together) with a real camera scan.

const OUT = process.env.SHOTS;
const shot = async (p: Page, n: string, wait = 400) => {
  if (!OUT) return;
  await p.waitForTimeout(wait);
  await p.screenshot({ path: `${OUT}/${n}.png` });
};
const tab = (p: Page, name: 'Plans' | 'You') => p.getByRole('button', { name, exact: true }).last().click();
const settle = async (...ps: Page[]) => {
  for (let k = 0; k < 2; k++)
    for (const p of ps) {
      await syncNow(p);
      await p.waitForTimeout(1500);
    }
};
async function openMeet(p: Page) {
  await tab(p, 'You');
  await p.getByRole('button', { name: /^Friends/ }).click();
  await p.getByRole('button', { name: 'Meet', exact: true }).click();
  return p.getByRole('dialog', { name: 'Meet' });
}

test('an existing account gets its username said once, and can change it from there', async ({ browser, baseURL }) => {
  const A = await phone(browser, baseURL!, 'Krishna');
  const a = await signInAs(A, 'Krishna Rao', { hello: true });
  const hello = A.getByRole('dialog', { name: 'Your username' });
  await expect(hello.getByText(/^@\S*krishna/)).toBeVisible({ timeout: 20_000 });
  await expect(hello.getByText('Friends can find and add you with it.', { exact: false })).toBeVisible();
  await shot(A, 'm01-hello-username', 700);
  await hello.getByRole('button', { name: 'Love it' }).click();
  await expect(hello).toHaveCount(0);
  // Not again: not after a reload, not on another phone.
  await A.reload();
  await A.waitForTimeout(4000);
  await expect(A.getByRole('dialog', { name: 'Your username' })).toHaveCount(0);
  const B = await phone(browser, baseURL!, 'Krishna');
  await B.evaluate((t) => localStorage.setItem('pulse-auth-v1', JSON.stringify({ token: t.token, account: { uid: t.uid, n: 1, email: 'x@e2e.test', name: 'Krishna Rao', created: '', code: '' } })), a);
  await B.reload();
  await B.waitForTimeout(4000);
  await expect(B.getByRole('dialog', { name: 'Your username' })).toHaveCount(0);
});

test('Meet: Saloni scans Krishna’s code with her camera; both phones light up, friends on both', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const A = await phone(browser, baseURL!, 'Krishna');
  const a = await signInAs(A, 'Krishna Rao');
  const meetA = await openMeet(A);
  const code = meetA.getByTestId('meet-code');
  await expect(code).toHaveAttribute('data-token', /^[A-Za-z0-9_-]{16}$/, { timeout: 15_000 });
  await shot(A, 'm02-meet-show', 2600);
  const token = (await code.getAttribute('data-token')) ?? '';

  // Her camera sees his screen: a fake camera that films his code.
  const dir = mkdtempSync(join(tmpdir(), 'meet-'));
  await code.screenshot({ path: join(dir, 'code.png') });
  execFileSync('ffmpeg', ['-loglevel', 'error', '-loop', '1', '-i', join(dir, 'code.png'), '-vf', 'scale=-2:420,pad=640:480:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p', '-t', '2', '-r', '10', join(dir, 'cam.y4m')]);
  const camBrowser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${join(dir, 'cam.y4m')}`] });
  try {
    const B = await phone(camBrowser, baseURL!, 'Saloni');
    await B.context().grantPermissions(['camera']);
    const b = await signInAs(B, 'Saloni Mehta');
    const meetB = await openMeet(B);
    await meetB.getByRole('button', { name: /Scan their code/ }).click();
    // Saloni's phone: the moment.
    await expect(meetB.getByText('You and Krishna are friends')).toBeVisible({ timeout: 30_000 });
    await shot(B, 'm03-meet-done-saloni', 1400);
    // Krishna's phone sees who scanned, by itself.
    await expect(meetA.getByText('You and Saloni are friends')).toBeVisible({ timeout: 15_000 });
    await shot(A, 'm04-meet-done-krishna', 1400);
    await meetA.getByRole('button', { name: 'Done' }).click();
    await meetB.getByRole('button', { name: 'Done' }).click();

    // Friends on both phones, connected over their own channel, once each.
    await expect
      .poll(
        async () => {
          await settle(A, B);
          return [(await state(A)).people.filter((x: { acct?: string }) => x.acct === b.uid).map((x: { link?: { status: string } }) => x.link?.status), (await state(B)).people.filter((x: { acct?: string }) => x.acct === a.uid).map((x: { link?: { status: string } }) => x.link?.status)];
        },
        { timeout: 90_000 },
      )
      .toEqual([['linked'], ['linked']]);

    // The same code again: already friends, nothing doubles.
    const again = await B.evaluate(
      async ({ t, token }) => (await (await fetch('/api/people', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify({ action: 'meet', token }) })).json()),
      { t: b.token, token },
    );
    expect(again).toMatchObject({ ok: true, already: true });
  } finally {
    await camBrowser.close();
  }
});

test('a Meet link opened from the phone’s own camera connects too; an old one says so', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const A = await phone(browser, baseURL!, 'Krishna');
  const a = await signInAs(A, 'Krishna Rao');
  const token = (await A.evaluate(async (t) => (await (await fetch('/api/people', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify({ action: 'meet-open' }) })).json()).token, a.token)) as string;
  const B = await phone(browser, baseURL!, 'Riya');
  await signInAs(B, 'Riya Shah');
  await B.goto(`/#meet=${token}`);
  await expect(B.getByRole('dialog', { name: 'Meet' }).getByText('You and Krishna are friends')).toBeVisible({ timeout: 20_000 });
  expect(B.url()).not.toContain('meet=');
  await B.getByRole('dialog', { name: 'Meet' }).getByRole('button', { name: /Undo/ }).click();
  await expect(B.getByText('Undone.')).toBeVisible();
  const C = await phone(browser, baseURL!, 'Kabir');
  await signInAs(C, 'Kabir');
  await C.goto('/#meet=AAAAAAAAAAAAAAAA');
  await expect(C.getByRole('dialog', { name: 'Meet' }).getByRole('alert')).toHaveText(/ran out/);
});

test('no Shortcuts screen; an add link still fills in the add screen (never saves by itself)', async ({ browser, baseURL }) => {
  const A = await phone(browser, baseURL!, 'Krishna');
  await tab(A, 'You');
  await expect(A.getByRole('button', { name: 'Friends', exact: false }).first()).toBeVisible();
  await expect(A.getByRole('button', { name: /^Shortcuts/ })).toHaveCount(0);
  const before = (await state(A)).transactions.length;
  await A.goto('/?action=add&amount=60&note=Cutting%20chai');
  const sheet = A.getByRole('dialog').last();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/Cutting chai/).or(sheet.locator('input[value="Cutting chai"], textarea')).first()).toBeVisible();
  await expect(sheet.getByText(/60/).first()).toBeVisible();
  await shot(A, 'm06-shortcut-opened');
  expect((await state(A)).transactions.length).toBe(before);
  expect(A.url()).not.toContain('amount=');
});
