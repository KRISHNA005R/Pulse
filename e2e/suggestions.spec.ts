import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

// Home shows a different money suggestion each day (from the person's own data).
async function suggestionOn(page: import('@playwright/test').Page, day: string) {
  await page.clock.install({ time: new Date(`${day}T12:00:00+05:30`) });
  await openDemo(page);
  const card = page.getByTestId('home-suggestion');
  await expect(card).toBeVisible();
  return (await card.innerText()).trim();
}

test('the Home suggestion changes from one day to the next', async ({ browser, baseURL }) => {
  const texts: string[] = [];
  for (const day of ['2026-10-20', '2026-10-21', '2026-10-22']) {
    const ctx = await browser.newContext({ baseURL, serviceWorkers: 'block', timezoneId: 'Asia/Kolkata', viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    texts.push(await suggestionOn(page, day));
    await ctx.close();
  }
  console.log(texts);
  expect(new Set(texts).size).toBeGreaterThan(1);
});
