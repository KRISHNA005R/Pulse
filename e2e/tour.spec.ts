import { expect, test } from '@playwright/test';
import { openDemo, state } from './helpers';

// The short tour for new people: on the real Home screen, one thing at a time, five steps, skip any time.

type Page = import('@playwright/test').Page;
/** Turn the tour on and reopen the app (without pressing Escape, which would skip it). */
async function tourOn(page: Page) {
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('pulse-state-v1') ?? '{}');
    s.settings.tourPending = true;
    localStorage.setItem('pulse-state-v1', JSON.stringify(s));
  });
  await page.reload();
}
async function newPerson(page: Page) {
  await openDemo(page);
  await tourOn(page);
}

test('a new person gets the 5-step tour on Home, and Done ends it for good', async ({ page }) => {
  await newPerson(page);
  const bubble = page.getByTestId('tour-bubble');
  const titles = ['Safe to spend', 'Add a spend', 'PULSE AI', 'Plans', 'You'];
  for (const [n, t] of titles.entries()) {
    await expect(bubble).toContainText(`${n + 1} of 5`);
    await expect(page.locator('#tour-title')).toHaveText(t);
    // The light sits on the real thing on screen.
    const key = ['safe', 'add', 'ai', 'plans', 'you'][n];
    await expect
      .poll(async () => {
        const spot = await page.getByTestId('tour-spot').boundingBox();
        const target = await page.locator(`[data-tour="${key}"]`).filter({ visible: true }).first().boundingBox();
        return Math.abs(spot!.x + spot!.width / 2 - (target!.x + target!.width / 2)) + Math.abs(spot!.y + spot!.height / 2 - (target!.y + target!.height / 2));
      }, { timeout: 3000 })
      .toBeLessThan(4);
    await bubble.getByRole('button', { name: n === 4 ? 'Done' : 'Next' }).click();
  }
  await expect(page.getByTestId('tour')).toHaveCount(0);
  expect((await state(page)).settings.tourPending).toBe(false);
  await page.reload();
  await page.waitForTimeout(2000);
  await expect(page.getByTestId('tour')).toHaveCount(0);
});

test('Skip (or Escape) ends the tour straight away', async ({ page }) => {
  await newPerson(page);
  await page.getByTestId('tour-bubble').getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByTestId('tour')).toHaveCount(0);
  await tourOn(page);
  await expect(page.getByTestId('tour-bubble')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tour')).toHaveCount(0);
});

test('people who already use PULSE do not get the tour; You → "Show the tour again" brings it back', async ({ page }) => {
  await openDemo(page);
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('tour')).toHaveCount(0);
  await page.locator('nav').getByRole('button', { name: 'You' }).first().click();
  await page.getByRole('button', { name: /Show the tour again/ }).click();
  await expect(page.getByTestId('tour-bubble')).toBeVisible();
  await expect(page.locator('#tour-title')).toHaveText('Safe to spend');
});
