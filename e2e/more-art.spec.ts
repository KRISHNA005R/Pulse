import { expect, test, type Locator, type Page } from '@playwright/test';
import { openDemo, setState } from './helpers';

// The second batch of illustrations: each shows in its moment, loads, and stays out of screen readers' way.

async function looksRight(art: Locator, file: string) {
  await art.scrollIntoViewIfNeeded();
  await expect(art).toBeVisible();
  await expect(art).toHaveAttribute('alt', '');
  await expect(art).toHaveAttribute('src', new RegExp(`${file}\\.webp$`));
  expect(await art.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
}
const tab = (page: Page, name: string) => page.locator('nav').getByRole('button', { name }).first().click();

test('survived payday: the card on Home has the arms-up picture', async ({ page }) => {
  await openDemo(page);
  await setState(page, "s.paydays = [{ date: s.today, left: 5400 }]; s.settings.paydaySeen = undefined;");
  await expect(page.getByText('You survived payday')).toBeVisible();
  await looksRight(page.getByTestId('payday-art'), 'payday-win');
});

test('no plans yet: Plans shows the dreamer on the boxes', async ({ page }) => {
  await openDemo(page);
  await setState(page, 's.plans = [];');
  await tab(page, 'Plans');
  await expect(page.getByText('No plans yet.')).toBeVisible();
  await looksRight(page.getByTestId('empty-art').first(), 'empty-plans');
});

test('a finished plan: the plan page has the suitcase jump', async ({ page }) => {
  await openDemo(page);
  await setState(page, "const p = s.plans.find((x) => x.id === 'goa'); p.saved = p.target; p.status = 'done';");
  await tab(page, 'Plans');
  await page.getByText('Goa 2026').first().click();
  await looksRight(page.getByTestId('goal-art'), 'goal-reached');
});

test('a plan still going has no celebration picture', async ({ page }) => {
  await openDemo(page);
  await tab(page, 'Plans');
  await page.getByText('Goa 2026').first().click();
  await expect(page.getByRole('heading', { name: /Goa 2026/ }).or(page.getByText(/funded/)).first()).toBeVisible();
  await expect(page.getByTestId('goal-art')).toHaveCount(0);
});

test('loans: a paid-off loan shows the paper plane; no loans shows the beanbag', async ({ page }) => {
  await openDemo(page);
  await setState(page, 's.debts[0].remaining = 0;');
  await tab(page, 'You');
  await page.getByRole('button', { name: /^(Debt|Loans)/ }).first().click();
  await looksRight(page.getByTestId('loan-art'), 'loan-paid-off');

  await setState(page, 's.debts = [];');
  await tab(page, 'You');
  await page.getByRole('button', { name: /^(Debt|Loans)/ }).first().click();
  await expect(page.getByTestId('loan-art')).toHaveCount(0);
  await looksRight(page.getByTestId('empty-art'), 'debt-free');
});

test('a loan still being paid has no paper plane', async ({ page }) => {
  await openDemo(page);
  await tab(page, 'You');
  await page.getByRole('button', { name: /^(Debt|Loans)/ }).first().click();
  await expect(page.getByText('Education loan · SBI')).toBeVisible();
  await expect(page.getByTestId('loan-art')).toHaveCount(0);
});

test('feedback: the page opens with the sticky-note picture', async ({ page }) => {
  await openDemo(page);
  await tab(page, 'You');
  await page.getByRole('button', { name: /Send feedback/ }).click();
  await looksRight(page.getByTestId('feedback-art'), 'feedback');
});

test('Rewind: the first slide has the cassette picture', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-02T12:00:00+05:30') });
  await openDemo(page);
  await page.getByTestId('rewind-offer').getByRole('button', { name: /Watch/ }).click();
  const story = page.getByRole('dialog').last();
  await looksRight(story.getByTestId('rewind-art'), 'rewind-opener');
});

test('the 404 page has the lost-signal picture', async ({ page }) => {
  await page.goto('/404.html');
  await expect(page.getByRole('heading', { name: /404/ })).toBeVisible();
  await looksRight(page.getByTestId('lost-art'), 'offline');
});
