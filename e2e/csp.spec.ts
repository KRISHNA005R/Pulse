import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './helpers';

// The Content Security Policy (from public/_headers + scripts/csp.mjs) is on, and nothing PULSE
// itself does is blocked by it: every page, the app's main screens, Meet's QR, the add screen.

function watch(p: Page) {
  const seen: string[] = [];
  p.on('console', (m) => {
    if (/Content Security Policy|Refused to (load|execute|apply|connect|frame)/i.test(m.text())) seen.push(m.text().slice(0, 200));
  });
  p.on('pageerror', (e) => seen.push(`error: ${e.message.slice(0, 200)}`));
  return seen;
}

test('every page loads with the security policy on, and nothing of ours is blocked', async ({ page }) => {
  const seen = watch(page);
  const res = await page.goto('/');
  expect(res!.headers()['content-security-policy']).toMatch(/script-src 'self' 'sha256-/);
  expect(res!.headers()['content-security-policy']).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  for (const path of ['/welcome/', '/privacy/', '/terms/', '/about/', '/founder/', '/stats/', '/migrate.html', '/404.html']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  // The welcome page's calculator still works (its form handler moved into the page's script).
  await page.goto('/welcome/');
  await expect(page.locator('html')).toHaveClass(/\bjs\b/);
  expect(seen).toEqual([]);
});

test('the app itself: screens, Friends, Meet and the add screen run with the policy on', async ({ page }) => {
  const seen = watch(page);
  await page.goto('/?demo=1');
  await page.waitForTimeout(1500);
  for (const tab of ['Activity', 'Plans', 'You', 'Home']) await page.getByRole('button', { name: tab, exact: true }).last().click();
  await page.goto('/?action=add&amount=20&note=Chai');
  await expect(page.getByRole('dialog').last()).toBeVisible();
  await page.keyboard.press('Escape');
  // Leave the demo for a signed-in account, then Friends and Meet (the QR is drawn in the page).
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('pulse-state-v1')!);
    s.mode = 'personal';
    s.settings.newStuffSeen = true;
    localStorage.setItem('pulse-state-v1', JSON.stringify(s));
    localStorage.setItem('pulse-install-nudge-v1', JSON.stringify({ first: s.today, reminded: true }));
  });
  await signInAs(page, 'Krishna Rao');
  await page.getByRole('button', { name: 'You', exact: true }).last().click();
  await page.getByRole('button', { name: /^Friends/ }).click();
  await page.getByRole('button', { name: 'Meet', exact: true }).click();
  await expect(page.getByTestId('meet-code')).toHaveAttribute('data-token', /^[A-Za-z0-9_-]{16}$/, { timeout: 15_000 });
  expect(seen).toEqual([]);
});
