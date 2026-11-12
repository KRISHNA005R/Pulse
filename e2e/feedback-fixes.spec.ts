import { expect, test } from '@playwright/test';
import { openDemo, setState, state } from './helpers';

// Fixes from real testers' feedback (San, Vivek, Raicalendar, iansatiable).

test('setup: one question fewer, bills ask how they are paid, amounts read 25,000, and the summary stays short', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#ob-name').fill('San');
  await page.getByRole('button', { name: 'Continue' }).click();
  // Straight to pay: "What are you here for?" is no longer asked (priorities at the end covers it).
  await expect(page.getByRole('heading', { name: 'How do you usually get paid?' })).toBeVisible();
  await expect(page.getByText('What are you here for?')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Salary' }).click();
  await page.locator('#ob-income').fill('60000');
  await expect(page.locator('#ob-income')).toHaveValue('60,000');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Bank: picks wrap in rows (no sideways strip), typing filters, and a picked bank can be changed.
  await page.locator('#ob-bank-name-0').click();
  const picks = page.getByRole('group', { name: 'Pick your bank' });
  await expect(picks.getByRole('button')).toHaveCount(8);
  await page.locator('#ob-bank-name-0').fill('hd');
  await picks.getByRole('button', { name: 'HDFC Bank' }).click();
  await expect(page.locator('#ob-bank-name-0')).toHaveValue('HDFC Bank');
  await page.getByRole('button', { name: 'Change bank 1' }).click();
  await expect(page.locator('#ob-bank-name-0')).toHaveValue('');
  await page.locator('#ob-bank-name-0').fill('HDFC Bank');
  await page.locator('#ob-bank-0').fill('25000');
  await expect(page.locator('#ob-bank-0')).toHaveValue('25,000');
  await page.locator('#ob-cash').fill('500');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Bills: rent is "I pay it" unless you say auto-debit.
  await page.getByRole('button', { name: /Rent \/ PG/ }).click();
  await page.getByRole('button', { name: /Electricity/ }).click();
  const amounts = page.locator('input[inputmode="decimal"]');
  await amounts.nth(0).fill('12000');
  await expect(amounts.nth(0)).toHaveValue('12,000');
  await amounts.nth(1).fill('1500');
  await expect(page.getByRole('radiogroup', { name: /How do you pay Rent/ }).getByRole('radio', { name: 'I pay it' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'What should PULSE help with first?' })).toBeVisible();
  await page.getByRole('button', { name: 'Build my dashboard' }).click();
  await expect(page.getByText(/You.re set, San/)).toBeVisible({ timeout: 15000 });
  // The summary says what the ₹1,800 is, names the bills, and doesn't claim rent is kept aside now.
  await expect(page.getByText('Safety buffer (3%)', { exact: true })).toBeVisible();
  await expect(page.getByText(/comes from your next pay/)).toHaveCount(0);
  await expect(page.getByText('Rent / PG, Electricity saved', { exact: true })).toBeVisible();
  await expect(page.getByText(/payments are kept aside before they’re due/)).toHaveCount(0);

  // Open PULSE: straight to Home. No "You're in" screen and no install sheet; the short tour is the one thing.
  await page.getByRole('button', { name: 'Open PULSE' }).click();
  await expect.poll(async () => (await state(page)).onboarding?.done).toBe(true);
  const s = await state(page);
  expect(s.subscriptions.find((x: { name: string }) => x.name === 'Rent / PG').autoDebit).toBe(false);
  expect(s.accounts.find((a: { name: string }) => a.name === 'HDFC Bank').balance).toBe(25000);
  expect(s.incomes[0].expected).toBe(60000);
  expect(s.settings.buffer).toBe(1800);
  await expect(page.getByTestId('tour')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('dialog', { name: /Install|Add PULSE/ })).toHaveCount(0);
});

test('the tour: tapping the lit-up + during "Add a spend" opens it (the tour no longer swallows the tap)', async ({ page }) => {
  await openDemo(page);
  // (Not setState: it presses Escape after reloading, which skips the tour.)
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('pulse-state-v1') ?? '{}');
    s.settings.tourPending = true;
    localStorage.setItem('pulse-state-v1', JSON.stringify(s));
  });
  await page.reload();
  const bubble = page.getByTestId('tour-bubble');
  await expect(bubble).toBeVisible({ timeout: 10000 });
  await bubble.getByRole('button', { name: /Next/ }).click();
  await expect(bubble.getByText('Add a spend')).toBeVisible();
  await page.waitForTimeout(800); // the light slides over to + first
  const spot = await page.getByTestId('tour-spot').boundingBox();
  await page.mouse.click(spot!.x + spot!.width / 2, spot!.y + spot!.height / 2);
  await expect(page.getByTestId('tour')).toHaveCount(0);
  await expect(page.locator('#composer-amount')).toBeVisible();
});

test('safe-to-spend: shown as it is (no counting up through wrong amounts), and the breakdown says what is and isn’t counted', async ({ page }) => {
  await openDemo(page, 'San');
  await setState(
    page,
    `s.accounts = [{ id: 'bank', name: 'HDFC', type: 'bank', kind: 'bank', balance: 25000, spendable: true }, { id: 'cash', name: 'Cash', type: 'cash', kind: 'cash', balance: 500, spendable: true }];
     s.cards = []; s.plans = []; s.investments = []; s.insurance = []; s.debts = []; s.bhisis = []; s.transactions = [];
     s.incomes = [{ id: 'inc', name: 'Salary', kind: 'salary', expected: 60000, cycle: 'monthly', nextDate: (() => { const d = new Date(s.today + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1, 1); return d.toISOString().slice(0, 10); })() }];
     const next = s.incomes[0].nextDate;
     s.subscriptions = [{ id: 'rent', name: 'Rent', amount: 12000, cycle: 'monthly', nextDate: next.slice(0, 8) + '05', category: 'rent', status: 'active', kind: 'bill', account: 'bank', autoDebit: false }];
     s.settings.buffer = 1800;`,
  );
  // Watch every value the per-day figure shows while Home opens (it used to count up from about half).
  await page.addInitScript(() => {
    (window as unknown as { seen: string[] }).seen = [];
    new MutationObserver(() => {
      const el = document.querySelector('.stat-amt');
      if (el) (window as unknown as { seen: string[] }).seen.push(el.textContent ?? '');
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.reload();
  const hero = page.locator('[data-tour="safe"] .hero-amt').first();
  await expect(hero).toHaveText(/₹23,700/);
  await page.waitForTimeout(1500);
  const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen.filter(Boolean));
  expect(new Set(seen).size).toBe(1);
  // The big number's digits don't roll up from 0 either: every wheel is already in place.
  expect(await page.locator('[data-tour="safe"] .roll').getAttribute('data-done')).not.toBeNull();

  await hero.click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet.getByText(/comes from your next pay/)).toHaveCount(0);
  await expect(sheet.getByText(/About 3% of your income, for surprises/)).toBeVisible();
  await expect(sheet.getByText(/A missing bill makes this too high/)).toBeVisible();
});

test('Home: bills already saved but not due soon say when the next one is, instead of asking to add bills', async ({ page }) => {
  await openDemo(page, 'Vivek');
  await setState(
    page,
    `s.subscriptions = [{ id: 'rent', name: 'Rent', amount: 12000, cycle: 'monthly', nextDate: (() => { const d = new Date(s.today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 20); return d.toISOString().slice(0, 10); })(), category: 'rent', status: 'active', kind: 'bill', account: 'bank' }];
     s.investments = []; s.insurance = []; s.debts = []; s.cards = []; s.bhisis = []; s.incomes = s.incomes.map((i) => ({ ...i, nextDate: undefined }));
     s.splits = []; s.settlements = [];`,
  );
  await page.reload();
  await expect(page.getByText('Nothing due in the next 10 days')).toBeVisible();
  await expect(page.getByText(/Next: Rent on/)).toBeVisible();
  await expect(page.getByText('Add rent, phone and subscriptions')).toHaveCount(0);
});

test('Activity: pick your own dates', async ({ page }) => {
  await openDemo(page);
  await setState(
    page,
    `s.transactions = [
      { id: 'a', merchant: 'Old chai', amount: 20, type: 'expense', category: 'food', date: '2026-01-10', account: 'bank', recurring: false, status: 'completed' },
      { id: 'b', merchant: 'March lunch', amount: 300, type: 'expense', category: 'food', date: '2026-03-15', account: 'bank', recurring: false, status: 'completed' },
      { id: 'c', merchant: 'May cab', amount: 250, type: 'expense', category: 'transport', date: '2026-05-02', account: 'bank', recurring: false, status: 'completed' },
    ];`,
  );
  await page.reload();
  await page.getByRole('button', { name: 'Activity', exact: true }).last().click();
  await page.getByRole('button', { name: 'Date and account filters' }).click();
  await page.locator('select').filter({ hasText: 'Pick dates…' }).selectOption('custom');
  await page.getByLabel('From').fill('2026-03-01');
  await page.getByLabel('To').fill('2026-03-31');
  await expect(page.getByText('March lunch')).toBeVisible();
  await expect(page.getByText('Old chai')).toHaveCount(0);
  await expect(page.getByText('May cab')).toHaveCount(0);
});

test('safe-to-spend breakdown: each line is one short list of names, no amounts and dates', async ({ page }) => {
  await openDemo(page);
  await page.locator('[data-tour="safe"] .hero-amt').first().click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet.getByText(/^[^,]+, [^,]+ \+\d+ more$/).first()).toBeVisible();
  await expect(sheet.getByText(/₹[\d,]+ · \d+ \w{3}/)).toHaveCount(0);
});
