import { expect, test, type Page } from '@playwright/test';

// The stats page shows the 5 newest accounts; everyone is on its own page.
const people = Array.from({ length: 8 }, (_, i) => ({ n: 8 - i, name: i === 2 ? '' : `Person ${8 - i}`, email: `p${8 - i}••••••@gmail.com`, google: true, at: '2026-11-10T10:00:00Z', seen: '2026-11-11', devices: 1, setup: i % 2 === 0 }));
people[4] = { n: 4, deleted: true } as never;
const members = { total: 7, highest: 8, google: 7, signedIn: 7, setup: 4, activeWeek: 7, today: 1, week: 3, days: Array.from({ length: 14 }, (_, i) => ({ day: `2026-10-${String(29 + i > 31 ? i - 2 : 29 + i).padStart(2, '0')}`.replace('2026-10-0', '2026-11-0'), n: i % 3 })), members: people };

// The test server's stats password; only the account list is made up here.
async function mock(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pulse-stats-key', 'e2e-stats-key'));
  await page.route('**/api/auth?members=1', (r) => r.fulfill({ json: members }));
}

test('stats shows the newest 5 and a link to everyone; that page lists all and searches', async ({ page }) => {
  await mock(page);
  await page.goto('/stats/people/');
  await expect(page.getByRole('heading', { name: /Everyone, newest first · 7/ })).toBeVisible();
  await expect(page.locator('.mem')).toHaveCount(8);
  await expect(page.getByText('Account deleted')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search people' }).fill('person 7');
  await expect(page.locator('.mem')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search people' }).fill('#2');
  await expect(page.locator('.mem')).toHaveCount(1);
  await page.getByRole('link', { name: /Stats/ }).click();
  await expect(page).toHaveURL(/\/stats\/$/);
});

test('the stats page itself: only the newest 5, then "See everyone"', async ({ page }) => {
  await mock(page);
  await page.goto('/stats/');
  await expect(page.getByRole('heading', { name: 'Newest 5' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#members .mem')).toHaveCount(5);
  await page.getByRole('link', { name: /See everyone \(8\)/ }).click();
  await expect(page).toHaveURL(/\/stats\/people\/$/);
});
