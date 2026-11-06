import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

// Beta: Home in glass. Warm shapes drift behind, cards are frosted, the tab bar is one liquid-glass capsule.

test('Home turns glass on; other tabs go back to plain paper', async ({ page }) => {
  await openDemo(page);
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-glass', '1');
  await expect(page.locator('.glass-backdrop')).toBeVisible();
  // The big card is see-through frosted glass, not solid white.
  const card = page.locator('.hero-card');
  expect(await card.evaluate((e) => getComputedStyle(e).backdropFilter)).toContain('blur');
  expect(await card.evaluate((e) => getComputedStyle(e).backgroundColor)).toMatch(/rgba\(.*, 0\.\d+\)/);

  await page.locator('nav').getByRole('button', { name: 'Activity' }).first().click();
  await expect(root).not.toHaveAttribute('data-glass', '1');
  await expect(page.locator('.glass-backdrop')).toHaveCount(0);
});

test('the tab bar is one glass capsule with the + as its own glass button, and all tabs still work', async ({ page }) => {
  await openDemo(page);
  const nav = page.locator('nav[aria-label="Main"]:visible');
  const capsule = nav.locator('.liquid').first();
  for (const name of ['Home', 'Activity', 'Plans', 'You']) await expect(capsule.getByRole('button', { name })).toBeVisible();
  expect(await capsule.evaluate((e) => getComputedStyle(e).backdropFilter)).toContain('blur');
  await expect(nav.getByRole('button', { name: 'Add expense' })).toHaveClass(/liquid-tint/);
  await capsule.getByRole('button', { name: 'Plans' }).click();
  await expect(capsule.getByRole('button', { name: 'Plans' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('less motion: the shapes behind Home stay still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDemo(page);
  expect(await page.locator('.gb-1').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
});
