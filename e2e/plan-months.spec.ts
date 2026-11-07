import { expect, test } from '@playwright/test';
import { openDemo, setState } from './helpers';

// Bali trip: ₹90,000 by 18 Jan. Today 7 Nov. ₹30,180 went in on 4 Nov, so November is done:
// the card says ₹29,910 a month × 2 and names the months left.

const setup = (txDate: string) => `
  s.today = '2026-11-07';
  s.settings.tourPending = false;
  const p = s.plans.find((x) => x.status === 'active' && !x.gullak);
  Object.assign(p, { name: 'Bali trip', target: 90000, saved: 30180, startDate: '2026-10-20', targetDate: '2027-01-18', contributions: [{ date: '${txDate}', amount: 30180 }], kind: 'plan' });
  s.transactions.unshift({ id: 'tbali', merchant: 'Moved to Bali trip', amount: 30180, type: 'transfer', direction: 'out', toAccount: 'pot:' + p.id, category: 'transfer', date: '${txDate}', account: s.accounts[0].id, plan: p.id, recurring: false, status: 'completed' });
`;

async function openPlan(page: import('@playwright/test').Page) {
  await page.locator('nav:visible').getByRole('button', { name: 'Plans' }).click();
  await page.getByText('Bali trip').first().click();
}

test("this month's share is in: ₹29,910 a month × 2, and it says which months", async ({ page }) => {
  await openDemo(page);
  await setState(page, setup('2026-11-04'));
  await openPlan(page);
  await expect(page.getByText('a month × 2')).toBeVisible();
  await expect(page.getByText('₹29,910', { exact: true })).toBeVisible();
  await expect(page.getByTestId('plan-months-note')).toHaveText("November's share is in. Next: Dec, Jan");
});

test('saved last month: November still counts, ₹19,940 a month × 3', async ({ page }) => {
  await openDemo(page);
  await setState(page, setup('2026-10-25'));
  await openPlan(page);
  await expect(page.getByText('a month × 3')).toBeVisible();
  await expect(page.getByText('₹19,940', { exact: true })).toBeVisible();
  await expect(page.getByTestId('plan-months-note')).toHaveText('Months left: Nov, Dec, Jan');
});
