import { expect, test } from '@playwright/test';
import { openDemo, setState, state } from './helpers';

// Tapping the streak checks in for today, so the streak keeps going even without logging anything.

test('tap the streak on a day with nothing logged: it checks in, goes up by one, and stays', async ({ page }) => {
  await openDemo(page);
  // Logged something yesterday and the day before, nothing today.
  await setState(
    page,
    `const iso = (d) => new Date(Date.now() + 5.5 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
     s.checkIns = [];
     s.transactions = s.transactions.filter((t) => t.date < iso(0));
     const acct = s.accounts.find((a) => a.spendable).id;
     for (const d of [-1, -2]) s.transactions.unshift({ id: 'chai' + d, merchant: 'Chai', amount: 20, type: 'expense', category: 'food', date: iso(d), account: acct, recurring: false, status: 'completed' });`,
  );
  const pill = page.getByTestId('streak-pill');
  await expect(pill).toHaveAttribute('aria-label', /Tap to check in for today/);
  const before = Number((await pill.textContent())?.replace(/\D/g, ''));
  await pill.click();
  await expect(pill).toHaveText(new RegExp(String(before + 1)));
  await expect(pill).not.toHaveAttribute('aria-label', /Tap to check in/);
  const s = await state(page);
  expect(s.checkIns).toContain(s.today);

  // A second tap doesn't add another check-in; it just shows the streak.
  await pill.click();
  expect((await state(page)).checkIns.filter((d: string) => d === s.today)).toHaveLength(1);

  // Still there after reopening the app.
  await page.reload();
  await page.waitForTimeout(2000);
  await expect(page.getByTestId('streak-pill')).toHaveText(new RegExp(String(before + 1)));
});
