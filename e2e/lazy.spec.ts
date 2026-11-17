import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

// Screens load when first opened (components/Lazy.tsx). The installed app still opens every one of
// them with no internet, and a piece that can't download shows "Couldn't open this", never a blank.

test.describe('offline, with the app installed (service worker on)', () => {
  test.use({ serviceWorkers: 'allow' });

  test('every tab, a few screens and sheets open with no internet', async ({ page, context }) => {
    test.setTimeout(120_000);
    await openDemo(page, 'Krishna');
    // The app keeps every piece on the phone once its service worker is ready.
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
      return reg.active?.state;
    });
    await page.reload();
    await page.waitForTimeout(1500);
    await context.setOffline(true);
    const tab = (name: string) => page.getByRole('button', { name, exact: true }).last().click();
    await tab('Activity');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await tab('Plans');
    await page.getByRole('radio', { name: 'Bhisi' }).or(page.getByRole('button', { name: 'Bhisi', exact: true })).first().click();
    await tab('You');
    await page.getByRole('button', { name: /^Friends/ }).click();
    await expect(page.getByLabel('Your friend card')).toBeVisible();
    await tab('You');
    await page.getByRole('button', { name: /Backup code & export/ }).click();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await tab('Home');
    await page.getByRole('button', { name: 'Add expense' }).click();
    await expect(page.locator('#composer-amount')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Couldn’t open this.')).toHaveCount(0);
    await context.setOffline(false);
  });
});

test('a screen that can’t download shows Try again, not a blank page', async ({ page }) => {
  await openDemo(page, 'Krishna');
  // Every piece except the start is now unreachable (like no internet in the browser).
  const first = new Set<string>();
  let collecting = true;
  page.on('request', (r) => collecting && r.url().includes('/assets/') && first.add(r.url()));
  await page.reload();
  await page.waitForTimeout(1500);
  collecting = false;
  await page.route('**/assets/*.js', (route) => (first.has(route.request().url()) ? route.continue() : route.abort()));
  const openYou = () => page.getByRole('button', { name: 'You', exact: true }).last().click();
  // First time: PULSE thinks it was just updated and reloads into the new version, once.
  await Promise.all([page.waitForEvent('load', { timeout: 15_000 }), openYou()]);
  await page.waitForTimeout(1500);
  // Still can't download it: the message, not a blank screen and not another reload.
  await openYou();
  await expect(page.getByText('Couldn’t open this.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  // With the connection back, Try again opens it.
  await page.unroute('**/assets/*.js');
  await page.getByRole('button', { name: 'Try again' }).click();
  await openYou();
  await expect(page.getByText('Couldn’t open this.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Friends/ })).toBeVisible({ timeout: 10_000 });
});

test('on a wide screen the side panel (PULSE AI) still loads; on a phone it is never made', async ({ browser, baseURL }) => {
  const wide = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL, serviceWorkers: 'block' });
  const p = await wide.newPage();
  await openDemo(p, 'Krishna');
  await expect(p.getByRole('complementary', { name: 'Context' }).getByRole('heading', { name: 'PULSE AI' })).toBeVisible({ timeout: 10_000 });
  await wide.close();
});
