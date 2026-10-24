import { expect, test } from '@playwright/test';
import { blockedCalls, openDemo } from './helpers';

// The links in the announcement email open the right place in the app.

test('"Start a gullak" link opens the gullak form', async ({ page }) => {
  await openDemo(page);
  await page.goto('/?action=gullak&source=announce');
  await expect(page.getByRole('dialog').last()).toContainText(/gullak/i, { timeout: 8000 });
  await expect(page).toHaveURL(/\/$/); // the link's extras are cleaned from the address
});

test('"Start a bhisi" link opens Plans on the Bhisi tab', async ({ page }) => {
  await openDemo(page);
  await page.goto('/?tab=bhisi&source=announce');
  await expect(page.getByRole('button', { name: /Start a bhisi/ })).toBeVisible({ timeout: 8000 });
});

// The private announce page, against the local server (no Resend key, so email is off).
test('announce page: password, numbers, email-off warning, buttons locked, preview', async ({ page }) => {
  await page.goto('/stats/announce/');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByText('That password is not right.')).toBeVisible();

  await page.getByLabel('Password').fill('e2e-stats-key');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByText('Two new things in PULSE')).toBeVisible();
  await expect(page.getByText(/Email is off/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Send test to me/ })).toBeDisabled();
  await expect(page.locator('#send')).toBeDisabled();
  await expect(page.frameLocator('#pv').getByText('Hey Krishna')).toBeVisible();
  expect(await blockedCalls(page)).toEqual([]);
});
