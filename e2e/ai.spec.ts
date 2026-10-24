import { expect, test } from '@playwright/test';
import { log, openDemo } from './helpers';

// Journey 10: PULSE AI answers from the app's own data.

async function ask(page: import('@playwright/test').Page, q: string) {
  await page.locator('#ai-input').fill(q);
  await page.locator('#ai-input').press('Enter');
}

test('PULSE AI knows what is new and adds up money got back', async ({ page }) => {
  await openDemo(page);
  await (await log(page, 500, 'Rahul paid back dinner', 'Got')).save();

  await page.getByRole('button', { name: 'Ask PULSE AI' }).click();
  await ask(page, "What's new in PULSE?");
  await expect(page.getByText(/what.s new in PULSE/).first()).toBeAttached();
  await expect(page.getByText(/^🏺 Bhisi/).first()).toBeAttached();
  await expect(page.getByText(/^🪙 Gullak/).first()).toBeAttached();

  await ask(page, 'How much did I get back this month?');
  await expect(page.getByText(/You got ₹500 back this month/).filter({ visible: true }).first()).toBeVisible();
});
