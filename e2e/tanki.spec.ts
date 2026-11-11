import { expect, test, type Page } from '@playwright/test';
import { log, openDemo, setState, state } from './helpers';

// Tanki on the real screens: fuel planned like a bill, rides with a fair price.

/** A scooter filled about ₹200 every 5 days (₹40 a day), the last fill 3 days ago; dates from the phone's own today. */
const SCOOTER = `
  const T = new Date(); const d = (n) => { const x = new Date(T); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  s.settings.tourPending = false;
  s.vehicles = [{ id: 'v1', name: 'Activa', kind: 'scooter', fuel: 'petrol', createdAt: d(-40), price: 102.12, priceDate: d(-1) }];
  s.transactions = s.transactions.filter((t) => t.category !== 'fuel');
  [-33, -28, -23, -18, -13, -8, -3].forEach((n, i) => s.transactions.unshift({ id: 'fx' + i, merchant: 'Petrol', amount: 200, type: 'expense', category: 'fuel', date: d(n), account: s.accounts[0].id, recurring: false, status: 'completed', vehicle: 'v1' }));
  s.transactions.sort((a, b) => b.date.localeCompare(a.date));
`;

async function daily(p: Page): Promise<number> {
  await p.locator('nav:visible').getByRole('button', { name: 'Home' }).click();
  await p.getByRole('button', { name: 'How it works' }).first().click();
  const text = (await p.getByText(/^That's .* a day for/).textContent()) ?? '';
  await p.keyboard.press('Escape');
  await expect(p.getByRole('dialog')).toHaveCount(0);
  return Number(text.match(/₹([\d,]+)/)![1].replace(/,/g, ''));
}

test('add a vehicle from You → Tanki; safe-to-spend gets a "Fuel till payday" line', async ({ page }) => {
  await openDemo(page);
  await setState(page, SCOOTER.replace("s.vehicles = [", "s.vehicles = []; void [").replace("vehicle: 'v1'", "vehicle: undefined"));
  await page.locator('nav:visible').getByRole('button', { name: 'You' }).click();
  await page.getByRole('button', { name: /Tanki: fuel and rides/ }).click();
  await expect(page.getByText('No vehicle yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Add a vehicle' }).click();
  await page.getByRole('radio', { name: /Scooter/ }).click();
  await page.locator('#veh-name').fill('Activa');
  // Just type and name: no price or mileage questions when adding.
  await expect(page.locator('#veh-price')).toHaveCount(0);
  await expect(page.locator('#veh-kmpl')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add vehicle' }).click();
  await expect(page.getByText(/Activa added\./)).toBeVisible();
  // Untagged past fuel counts for the only vehicle: it knows the rhythm straight away.
  await expect(page.getByTestId('tanki-next')).toHaveText(/Next fill/);
  const s = await state(page);
  expect(s.vehicles).toHaveLength(1);
  await page.locator('nav:visible').getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'How it works' }).first().click();
  await expect(page.getByTestId('safe-fuel')).toContainText('Fuel till payday');
});

test('logging a fill that fits what was kept aside leaves the daily number where it was, and the preview says so', async ({ page }) => {
  await openDemo(page);
  await setState(page, SCOOTER.replace("price: 102.12,", "price: 102.12, trackMileage: true,"));
  const before = await daily(page);
  const entry = await log(page, 200, 'petrol');
  // The vehicle chip is there and picked; the preview shows the real number, not "safe − ₹200".
  await expect(page.getByTestId('composer-vehicle').getByRole('radio', { name: /Activa/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Meter reading in km').fill('13120');
  await entry.save();
  const s = await state(page);
  const tx = s.transactions.find((t: { amount: number; category: string; date: string }) => t.category === 'fuel' && t.amount === 200 && t.date === s.today);
  expect(tx.vehicle).toBe('v1');
  expect(tx.meterKm).toBe(13120);
  expect(Math.abs((await daily(page)) - before)).toBeLessThanOrEqual(1);
});

test('the add-screen preview for a fuel fill says it comes out of fuel kept aside, and safe-to-spend does not drop', async ({ page }) => {
  await openDemo(page);
  await setState(page, SCOOTER);
  const before = await daily(page);
  await log(page, 200, 'petrol');
  await expect(page.getByText('Comes out of fuel kept aside')).toBeVisible();
  await page.locator('#composer-text').press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5000 });
  expect(await daily(page)).toBeGreaterThanOrEqual(before - 1);
});

test('a ride split: friends owe their share, no new spend is made, and it can be removed', async ({ page }) => {
  await openDemo(page);
  await setState(page, SCOOTER);
  const before = await state(page);
  const friend = before.people[0];
  await page.locator('nav:visible').getByRole('button', { name: 'You' }).click();
  await page.getByRole('button', { name: /Tanki: fuel and rides/ }).click();
  await page.getByRole('button', { name: 'Split a ride' }).click();
  await page.locator('#ride-km').fill('14');
  await page.getByRole('switch', { name: 'Round trip' }).click();
  await page.getByRole('dialog').getByRole('button', { name: friend.short ?? friend.name, exact: true }).click();
  // 28 km × ₹2.27 = ₹63.56 → ₹64, two people → ₹32 each
  await expect(page.getByTestId('ride-result')).toContainText('₹64');
  await page.getByRole('button', { name: new RegExp(`^Split ₹32 with`) }).click();
  const after = await state(page);
  expect(after.transactions.length).toBe(before.transactions.length); // no new spend
  const sp = after.splits.find((x: { ride?: unknown }) => x.ride);
  expect(sp.shares).toEqual([{ person: 'me', amount: 32 }, { person: friend.id, amount: 32 }]);
  expect(sp.transactionId).toBeUndefined();
  // Remove it from Tanki.
  await page.getByRole('button', { name: /^Remove Ride/ }).click();
  expect((await state(page)).splits.some((x: { ride?: unknown }) => x.ride)).toBe(false);
});

test('a fuel entry can be moved to another vehicle, or marked "not mine", from its detail', async ({ page }) => {
  await openDemo(page);
  await setState(page, SCOOTER + ` s.vehicles.push({ id: 'v2', name: 'Swift', kind: 'car', fuel: 'petrol', createdAt: s.vehicles[0].createdAt });`);
  await page.locator('nav:visible').getByRole('button', { name: 'Activity' }).first().click();
  await page.getByText('Petrol').first().click();
  const pick = page.getByRole('dialog').getByLabel('Vehicle');
  await pick.selectOption('v2');
  expect((await state(page)).transactions.find((t: { id: string }) => t.id === 'fx6').vehicle).toBe('v2');
  await pick.selectOption('none');
  expect((await state(page)).transactions.find((t: { id: string }) => t.id === 'fx6').vehicle).toBe('none');
});

test('Home shows the next-fill card only when a fill is near, and it can be hidden', async ({ page }) => {
  await openDemo(page);
  await setState(page, SCOOTER);
  // First, once: why the daily number is a bit lower.
  await expect(page.getByTestId('tanki-explain')).toContainText('kept aside for Activa’s petrol');
  await page.getByTestId('tanki-explain').getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByTestId('tanki-explain')).toHaveCount(0);
  const card = page.getByTestId('tanki-home');
  await expect(card).toContainText('Next fill in 2 days');
  await card.getByRole('button', { name: 'Hide for now' }).click();
  await expect(card).toHaveCount(0);
  // Fill just now: next fill is 5 days away, so no card.
  await setState(page, SCOOTER.replace('[-33, -28, -23, -18, -13, -8, -3]', '[-35, -30, -25, -20, -15, -10, -5, 0]') + " s.dismissedDetections.push('tanki-explained:v1');");
  await expect(page.getByTestId('tanki-home')).toHaveCount(0);
});

test('Tanki screen opens in dark mode with no sideways scroll', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openDemo(page);
  await setState(page, SCOOTER);
  await page.locator('nav:visible').getByRole('button', { name: 'You' }).click();
  await page.getByRole('button', { name: /Tanki: fuel and rides/ }).click();
  await expect(page.getByTestId('tanki-next')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
});

test('the meter reading only shows for people who turned on "Track my real mileage"', async ({ page }) => {
  await openDemo(page);
  await setState(page, SCOOTER);
  await log(page, 200, 'petrol');
  await expect(page.getByTestId('composer-vehicle')).toBeVisible();
  await expect(page.getByLabel('Meter reading in km')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('nav:visible').getByRole('button', { name: 'You' }).click();
  await page.getByRole('button', { name: /Tanki: fuel and rides/ }).click();
  await page.getByRole('switch', { name: 'Track my real mileage' }).click();
  expect((await state(page)).vehicles[0].trackMileage).toBe(true);
  await log(page, 200, 'petrol');
  await expect(page.getByLabel('Meter reading in km')).toBeVisible();
});

test('no price yet: the ride sheet asks for today\'s price once, and saves it on the vehicle', async ({ page }) => {
  await openDemo(page);
  await setState(page, SCOOTER.replace("price: 102.12, priceDate: d(-1)", "createdAt2: 0"));
  const friend = (await state(page)).people[0];
  await page.locator('nav:visible').getByRole('button', { name: 'You' }).click();
  await page.getByRole('button', { name: /Tanki: fuel and rides/ }).click();
  await page.getByRole('button', { name: 'Split a ride' }).click();
  await page.locator('#ride-price').fill('102.12');
  await page.locator('#ride-km').fill('28');
  await page.getByRole('dialog').getByRole('button', { name: friend.short ?? friend.name, exact: true }).click();
  // 28 km × (₹102.12 ÷ about 45 km/L = ₹2.27) = ₹63.56 → ₹64
  await expect(page.getByTestId('ride-result')).toContainText('₹64');
  await page.getByRole('button', { name: /^Split ₹32 with/ }).click();
  const v = (await state(page)).vehicles[0];
  expect(v.price).toBe(102.12);
  // Next time it doesn't ask.
  await page.getByRole('button', { name: 'Split a ride' }).click();
  await expect(page.locator('#ride-price')).toHaveCount(0);
});

test('"Going together" is the default; a lift is one small link away', async ({ page }) => {
  await openDemo(page);
  await setState(page, SCOOTER);
  await page.locator('nav:visible').getByRole('button', { name: 'You' }).click();
  await page.getByRole('button', { name: /Tanki: fuel and rides/ }).click();
  await page.getByRole('button', { name: 'Split a ride' }).click();
  await expect(page.getByRole('dialog')).toContainText('split between everyone, you included');
  await page.getByRole('button', { name: 'Just gave a lift?' }).click();
  await expect(page.getByLabel('Extra km')).toBeVisible();
});

test('only one thing to check shows at a time', async ({ page }) => {
  await openDemo(page);
  // A typo-sized fill AND the same fill logged twice: only the typo is asked about first.
  await setState(page, SCOOTER + " s.transactions.unshift({ ...s.transactions.find((t) => t.id === 'fx6'), id: 'dup1' }); s.transactions.unshift({ ...s.transactions.find((t) => t.id === 'fx4'), id: 'typo1', amount: 20000, date: s.transactions.find((t) => t.id === 'fx4').date });");
  await page.locator('nav:visible').getByRole('button', { name: 'You' }).click();
  await page.getByRole('button', { name: /Tanki: fuel and rides/ }).click();
  await expect(page.getByTestId('tanki-check')).toHaveCount(1);
  await expect(page.getByTestId('tanki-check')).toContainText('much bigger than your usual fill');
});
