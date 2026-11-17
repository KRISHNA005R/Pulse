import { devices, expect, test } from '@playwright/test';

// Popups that open by themselves ("Keep PULSE on your home screen") never cover a screen someone is
// using. They wait until the person is back on Home with nothing open.

test.use({ ...devices['iPhone 13'], serviceWorkers: 'block' });

test('the home-screen popup waits until you are back on Home', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('pulse-state-v1')!);
    s.mode = 'personal';
    s.settings.newStuffSeen = true;
    s.settings.soundsAsked = true;
    localStorage.setItem('pulse-state-v1', JSON.stringify(s));
    localStorage.removeItem('pulse-e2e-demo-as-mine');
    localStorage.removeItem('pulse-install-nudge-v1');
  });
  await page.goto('/?tab=you');
  // Straight into a screen: the popup must not open on top of it.
  await page.getByRole('button', { name: 'You', exact: true }).last().click();
  await page.getByRole('button', { name: /Backup code & export/ }).click();
  await page.waitForTimeout(3500);
  await expect(page.getByRole('dialog', { name: 'Keep PULSE on your home screen' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Home', exact: true }).last().click();
  // Back on Home with nothing open: now it shows, once.
  await expect(page.getByRole('dialog', { name: 'Keep PULSE on your home screen' })).toBeVisible({ timeout: 6000 });
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForTimeout(3000);
  await expect(page.getByRole('dialog', { name: 'Keep PULSE on your home screen' })).toHaveCount(0);
});
