import { expect, test, type Page } from '@playwright/test';
import { log, openDemo, setState } from './helpers';

// Illustrations on empty screens: they show only when there's nothing yet, load properly,
// stay out of screen readers' way, and go away once you log something.

const loaded = (p: Page, id: string) => p.getByTestId(id).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);

test('nothing logged yet: Home and Activity show the chai picture, which goes away after the first expense', async ({ page }) => {
  await openDemo(page);
  // Nothing logged, and nothing due that would log itself on opening (bills, SIPs, EMIs, salary).
  await setState(page, 's.transactions = []; s.subscriptions = []; s.investments = []; s.debts = []; s.insurance = []; s.incomes = [];');

  // Home.
  await expect(page.getByText('Nothing logged yet.')).toBeVisible();
  const homeArt = page.getByTestId('empty-art').first();
  await homeArt.scrollIntoViewIfNeeded();
  await expect(homeArt).toBeVisible();
  await expect(homeArt).toHaveAttribute('alt', '');
  await expect(homeArt).toHaveAttribute('src', /empty-activity\.webp$/);
  expect(await loaded(page, 'empty-art')).toBe(true);

  // Activity: the same picture and a way to log the first expense (not "No transactions for this filter").
  await page.locator('nav').getByRole('button', { name: 'Activity' }).click();
  await expect(page.getByText('No transactions for this filter.')).toHaveCount(0);
  await expect(page.getByText('Nothing logged yet.')).toBeVisible();
  await expect(page.getByTestId('empty-art')).toBeVisible();
  expect(await loaded(page, 'empty-art')).toBe(true);

  await (await log(page, 180, 'chai and samosa')).save();
  await expect(page.getByTestId('empty-art')).toHaveCount(0);
  await expect(page.getByText('chai and samosa').first()).toBeVisible();
});

test('a filter with no matches still says so plainly, without the picture', async ({ page }) => {
  await openDemo(page);
  await page.locator('nav').getByRole('button', { name: 'Activity' }).click();
  await page.locator('#activity-search').fill('zzzz-no-such-thing');
  await expect(page.getByText(/Nothing matches/)).toBeVisible();
  await expect(page.getByTestId('empty-art')).toHaveCount(0);
});

test('no gullak yet: the Gullak card on Plans shows the coin picture, opens the form, and goes once one is started', async ({ page }) => {
  await openDemo(page);
  await setState(page, 's.plans = s.plans.filter((p) => !p.gullak);');
  await page.locator('nav').getByRole('button', { name: 'Plans' }).click();
  const art = page.getByTestId('gullak-art');
  await expect(art).toBeVisible();
  await expect(art).toHaveAttribute('alt', '');
  await expect(art).toHaveAttribute('src', /gullak\.webp$/);
  expect(await loaded(page, 'gullak-art')).toBe(true);

  await art.click(); // the whole card is the button
  await page.getByRole('button', { name: /Start the gullak/ }).click();
  await page.goBack();
  await expect(page.getByTestId('gullak-art')).toHaveCount(0);
});
