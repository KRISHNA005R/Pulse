import { expect, test, type Locator, type Page } from '@playwright/test';
import { openDemo, setState, state } from './helpers';

// Third batch of illustrations: small objects (matka, chit, gullak, coins, chai, padlock, bell,
// calendar, card, plant) and the "You're set" girl. Each shows in its moment and loads.

async function looksRight(art: Locator, file: string) {
  await art.first().scrollIntoViewIfNeeded();
  await expect(art.first()).toBeVisible();
  await expect(art.first()).toHaveAttribute('alt', '');
  await expect(art.first()).toHaveAttribute('src', new RegExp(`${file}\\.webp$`));
  expect(await art.first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
}
const tab = (page: Page, name: string) => page.locator('nav').getByRole('button', { name }).first().click();
async function youRow(page: Page, label: RegExp) {
  await tab(page, 'You');
  await page.getByRole('button', { name: label }).first().click();
}

test('setup finished: "You\'re set" stays without a picture', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Build my dashboard' }).click();
  await expect(page.getByText(/You.re set/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('done-art')).toHaveCount(0);
});

test('empty lists in You: calendar (bills), card (credit cards), plant (SIPs), coins (income)', async ({ page }) => {
  await openDemo(page);
  await setState(page, 's.subscriptions = []; s.cards = []; s.investments = []; s.incomes = [];');
  await youRow(page, /Subscriptions & bills/);
  await looksRight(page.getByTestId('empty-art'), 'calendar');
  await youRow(page, /Credit cards/);
  await looksRight(page.getByTestId('empty-art'), 'card');
  await youRow(page, /Investments & SIPs/);
  await looksRight(page.getByTestId('empty-art'), 'plant');
  await youRow(page, /^Income/);
  await looksRight(page.getByTestId('empty-art'), 'coins');
});

test('nothing logged: Home and Activity both show the chai person', async ({ page }) => {
  await openDemo(page);
  await setState(page, 's.transactions = []; s.subscriptions = []; s.investments = []; s.debts = []; s.insurance = []; s.incomes = [];');
  await looksRight(page.getByTestId('empty-art'), 'empty-activity');
  await tab(page, 'Activity');
  await looksRight(page.getByTestId('empty-art'), 'empty-activity');
});

test('Reminders: no bell picture, the page stays as it was', async ({ page }) => {
  await openDemo(page);
  await youRow(page, /^Reminders/);
  await expect(page.getByText('Reminders are off')).toBeVisible();
  await expect(page.getByTestId('bell-art')).toHaveCount(0);
  await expect(page.locator('img[src*="bell"]')).toHaveCount(0);
});

test('Your account: the padlock sits with "how your data is kept"', async ({ page }) => {
  const account = { uid: 'u1', n: 7, email: 'krishna@example.com', name: 'Krishna', created: '2026-10-01', code: 'PULSE-TEST-ACCT-2345-6789' };
  await page.route('**/api/auth', (r) =>
    r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ google: '', email: true }) }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  );
  await openDemo(page);
  await page.evaluate((a) => localStorage.setItem('pulse-auth-v1', JSON.stringify({ token: 't', account: a })), account);
  await page.reload();
  await page.waitForTimeout(2500);
  await youRow(page, /Your account/);
  await looksRight(page.getByTestId('lock-art'), 'padlock');
});

test('gullak broken: the card and the gullak page show the broken gullak with coins', async ({ page }) => {
  await openDemo(page);
  await setState(page, 's.plans = s.plans.filter((p) => !p.gullak);');
  await tab(page, 'Plans');
  await page.getByTestId('gullak-art').click();
  await page.getByRole('button', { name: /Start the gullak/ }).click();
  await setState(page, "const g = s.plans.find((p) => p.gullak); g.gullak.broken = true; g.status = 'done'; g.saved = 550;");
  await tab(page, 'Plans');
  await looksRight(page.getByTestId('gullak-broken-art'), 'gullak-broken');
  await page.getByTestId('gullak-broken-art').first().click();
  await looksRight(page.getByTestId('gullak-broken-art'), 'gullak-broken');
});

test('bhisi: the matka on the round card, the matka full of chits in the draw, the chit flies out', async ({ page }) => {
  await openDemo(page);
  await tab(page, 'Plans');
  await page.getByRole('radio', { name: 'Bhisi' }).first().click();
  await page.getByRole('button', { name: /Start a bhisi/ }).click();
  const form = page.getByRole('dialog').last();
  await page.fill('#bh-name', 'Hostel gang');
  await form.locator('#bh-amount').fill('2000');
  await form.getByRole('button', { name: /Rahul/ }).first().click();
  await form.getByRole('button', { name: 'Today', exact: true }).click();
  await form.getByRole('button', { name: /Start bhisi/ }).click();
  await expect.poll(async () => (await state(page)).bhisis?.length ?? 0, { timeout: 15_000 }).toBe(1);
  await looksRight(page.getByTestId('matka-art'), 'matka');
  await page.getByRole('button', { name: /Draw the chitti/ }).click();
  const draw = page.getByRole('dialog').last();
  await looksRight(draw.getByTestId('matka-draw-art'), 'matka');
  await draw.getByRole('button', { name: /Shake the matka/ }).click();
  await expect(draw.getByTestId('chit-art')).toBeVisible({ timeout: 8000 });
  await expect(draw.getByTestId('chit-art')).toHaveAttribute('src', /chit\.webp$/);
});
