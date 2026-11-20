import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './helpers';

// The Content Security Policy (a <meta> tag on every page, from scripts/csp.mjs) is on, and nothing PULSE
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
  // Google's tag is answered here (this machine can't reach Google); only the public pages may ask.
  const asked: string[] = [];
  await page.route('https://www.googletagmanager.com/**', (r) => {
    asked.push(new URL(page.url()).pathname);
    return r.fulfill({ contentType: 'text/javascript', body: 'window.__gtag = 1;' });
  });
  await page.route(/google-analytics\.com|doubleclick\.net|google\.com\/(ccm|pagead)/, (r) => r.fulfill({ status: 204 }));
  const policy = () => page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  await page.goto('/');
  expect(await policy()).toMatch(/script-src 'self' 'sha256-/);
  expect(await policy()).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  // The app itself: no Google Analytics allowed, none loaded.
  expect(await policy()).not.toContain('googletagmanager');
  for (const path of ['/welcome/', '/privacy/', '/terms/', '/about/', '/founder/', '/stats/', '/migrate.html', '/404.html']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    if (path === '/migrate.html') continue; // it moves straight on to the app
    const open = ['/welcome/', '/privacy/', '/terms/', '/about/', '/founder/'].includes(path);
    expect(await policy(), path).toContain(open ? 'https://www.googletagmanager.com' : "default-src 'self'");
    if (!open) expect(await policy(), path).not.toContain('googletagmanager');
  }
  expect([...new Set(asked)].sort()).toEqual(['/about/', '/founder/', '/privacy/', '/terms/', '/welcome/']);
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

test('public pages: the cookie note, remembered; ad cookies only after OK; Open PULSE is counted', async ({ page }) => {
  const seen = watch(page);
  await page.route('https://www.googletagmanager.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('/welcome/');
  const note = page.getByTestId('cookie-note');
  await expect(note).toContainText('We use cookies to count visits and measure our ads.');
  // Before a choice: visits counted, ads off.
  const consent = () => page.evaluate(() => (window as unknown as { dataLayer: IArguments[] }).dataLayer.filter((x) => x[0] === 'consent').map((x) => [x[1], JSON.stringify(x[2])]));
  expect((await consent()).at(-1)).toEqual(['default', JSON.stringify({ ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' })]);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/cookie-note.png` });
  await note.getByRole('button', { name: 'OK' }).click();
  await expect(note).toHaveCount(0);
  expect((await consent()).at(-1)?.[0]).toBe('update');
  expect((await consent()).at(-1)?.[1]).toContain('"ad_storage":"granted"');
  // Remembered: not asked again, ads stay on.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('cookie-note')).toHaveCount(0);
  expect((await consent()).at(-1)?.[1]).toContain('"ad_storage":"granted"');
  // Tapping into the app is counted.
  const open = page.locator('a[href="/"]:visible, a[href^="/?"]:visible').first();
  await open.evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()));
  await open.click();
  expect(await page.evaluate(() => (window as unknown as { dataLayer: IArguments[] }).dataLayer.some((x) => x[0] === 'event' && x[1] === 'open_app'))).toBe(true);
  // No thanks: ad cookies never used.
  await page.evaluate(() => localStorage.removeItem('pulse-cookies'));
  await page.reload();
  await page.getByTestId('cookie-note').getByRole('button', { name: 'No thanks' }).click();
  expect((await consent()).at(-1)?.[1]).toContain('"ad_storage":"denied"');
  expect(await page.evaluate(() => localStorage.getItem('pulse-cookies'))).toBe('no');
  expect(seen).toEqual([]);
});
