import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

// PULSE Rewind: offered on Home in the first week of the month, 5 story slides, a share card with no
// rupee amounts, in You, and suggested first by PULSE AI. Budget out loud is gone.
async function demoOn(page: import('@playwright/test').Page, day: string) {
  await page.clock.install({ time: new Date(`${day}T12:00:00+05:30`) });
  await openDemo(page);
}

test('Home offers last month’s Rewind; 5 slides; the share card has no rupee amounts', async ({ page }) => {
  await demoOn(page, '2026-10-02');
  const offer = page.getByTestId('rewind-offer');
  await expect(offer).toContainText('September Rewind is ready');
  await offer.getByRole('button', { name: /Watch/ }).click();
  const story = page.getByRole('dialog').last();
  await expect(story.getByText(/September,/)).toBeVisible();
  for (let i = 0; i < 4; i++) await story.getByRole('button', { name: 'Next slide' }).click();
  await expect(story.getByTestId('rewind-card')).toBeVisible();
  await expect(story.getByRole('button', { name: /Share to story|Save image/ }).first()).toBeVisible();
  const text = await story.innerText();
  expect(text).not.toMatch(/₹/);
  // The card image is story-sized.
  const size = await story.getByTestId('rewind-card').evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  expect(size).toEqual([1080, 1920]);
  // And it's actually drawn: the glow and text, not a blank image.
  await expect
    .poll(async () => story.getByTestId('rewind-card').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const seen = new Set<number>();
      for (let i = 0; i < d.length; i += 4 * 997) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
      return seen.size;
    }), { timeout: 10000 })
    .toBeGreaterThan(20);
});

test('the offer can be dismissed and stays gone', async ({ page }) => {
  await demoOn(page, '2026-10-02');
  await page.getByTestId('rewind-offer').getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByTestId('rewind-offer')).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('rewind-offer')).toHaveCount(0);
});

test('You has PULSE Rewind instead of Budget out loud', async ({ page }) => {
  await demoOn(page, '2026-10-12');
  await page.getByRole('button', { name: 'You', exact: true }).first().click();
  await expect(page.getByText('Budget out loud')).toHaveCount(0);
  await page.getByRole('button', { name: /PULSE Rewind/ }).click();
  await expect(page.getByRole('dialog').last()).toBeVisible();
});

test('PULSE AI suggests the Rewind first in the first week', async ({ page }) => {
  await demoOn(page, '2026-10-02');
  await page.getByRole('button', { name: 'Ask PULSE AI' }).click();
  await expect(page.getByRole('button', { name: /Share my September Rewind/ }).first()).toBeVisible();
});
