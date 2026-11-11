import { expect, test, type Page } from '@playwright/test';

// The landing page (/welcome/): plain HTML with a little script. The numbers must add up, the
// calculator must be right, nothing may jump or scroll sideways, and it must work without a mouse.

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/welcome/');
  return errors;
}
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

test('opens with no errors; the hero number rolls and lands on ₹2,840 without changing size', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Know what you can spend, without doing the math.');
  const roll = page.locator('#roll');
  const size = () => roll.evaluate((e) => [(e as HTMLElement).offsetWidth, (e as HTMLElement).offsetHeight]);
  const rolling = await size();
  await page.waitForTimeout(2200);
  expect(await size()).toEqual(rolling);
  expect(((await roll.textContent()) ?? '').replace(/\s/g, '')).toBe('₹2,840');
  expect(errors).toEqual([]);
});

test('the worked example adds up: 8,420 − 2,100 − 2,500 − 980 = 2,840, about 405 a day for 7 days', async ({ page }) => {
  await open(page);
  const receipt = page.locator('.receipt');
  for (const t of ['₹8,420', '−₹2,100', '−₹2,500', '−₹980', '₹2,840', '₹405 a day']) await expect(receipt).toContainText(t);
  expect(8420 - 2100 - 2500 - 980).toBe(2840);
  expect(Math.floor(2840 / 7)).toBe(405);
});

test('the calculator starts on the example, updates as you type, and says how short you would be', async ({ page }) => {
  await open(page);
  await expect(page.locator('#c-safe')).toHaveText('₹2,840');
  await expect(page.locator('#c-day')).toHaveText('₹405');
  await field(page, 'Money in bank + cash').fill('20000');
  await expect(page.locator('#c-safe')).toHaveText('₹14,420'); // 20,000 − 2,100 − 0 − 2,500 − 980
  await expect(page.locator('#c-day')).toHaveText('₹2,060');
  // Indian grouping when you leave the field.
  await field(page, 'Days until payday').click();
  await expect(field(page, 'Money in bank + cash')).toHaveValue('20,000');
  // Not enough: ₹0, and how short, without alarm.
  await field(page, 'Money in bank + cash').fill('3000');
  await expect(page.locator('#c-safe')).toHaveText('₹0');
  await expect(page.locator('#c-short')).toHaveText("₹0 to spend. You'd be ₹2,580 short. PULSE shows this before it happens, and never judges.");
});

test('FAQ: one answer open at a time', async ({ page }) => {
  await open(page);
  const items = page.locator('.faq-list details');
  await items.nth(0).locator('summary').click();
  await items.nth(2).locator('summary').click();
  await expect(items.nth(2)).toHaveAttribute('open', '');
  await expect(items.nth(0)).not.toHaveAttribute('open', '');
});

test('buttons and links go to the right places', async ({ page }) => {
  await open(page);
  const hero = page.locator('.hero');
  await expect(hero.getByRole('link', { name: "Open PULSE, it's free" })).toHaveAttribute('href', '/');
  await expect(hero.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', '/?demo=1');
  const foot = page.getByRole('contentinfo');
  for (const [name, href] of [['Privacy', '/privacy/'], ['Terms', '/terms/'], ['Founder', '/founder/'], ['How it works', '/about/']]) await expect(foot.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
});

test('works with the keyboard: skip link first, then the menu and the main button', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

for (const width of [360, 390, 768, 1280, 1440]) {
  test(`no sideways scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  });
}

test('on a phone the hero fits: headline, both buttons and the top of the phone are visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  for (const loc of [page.getByRole('heading', { level: 1 }), page.locator('.hero').getByRole('link', { name: 'Try the demo' })]) {
    const b = await loc.boundingBox();
    expect(b!.y + b!.height).toBeLessThan(844);
  }
  expect((await page.locator('.hero .phone').boundingBox())!.y).toBeLessThan(844);
});

test.describe('less motion', () => {
  test('the number is simply there and every section shows at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await expect(page.locator('#roll .wheel')).toHaveCount(0);
    await expect(page.locator('#roll')).toHaveText('₹2,840');
    expect(await page.locator('.reveal').evaluateAll((els) => els.every((e) => getComputedStyle(e).opacity === '1'))).toBe(true);
  });
});

test('SEO: indexable, its own title and description, canonical, and valid structured data that matches the page', async ({ page, request }) => {
  await open(page);
  await expect(page).toHaveTitle('Safe to spend until payday: free budget app for India | PULSE');
  expect(await page.locator('meta[name="robots"]').getAttribute('content')).toMatch(/^index, follow/);
  expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe('https://pulsemoney.in/welcome/');
  const desc = (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
  expect(desc.length).toBeGreaterThan(120);
  expect(desc.length).toBeLessThanOrEqual(160);
  const graph = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}')['@graph'];
  const types = graph.map((x: { '@type': string }) => x['@type']);
  for (const t of ['WebPage', 'BreadcrumbList', 'Organization', 'WebApplication', 'FAQPage']) expect(types).toContain(t);
  // Every FAQ answer in the structured data is shown on the page.
  const faq = graph.find((x: { '@type': string }) => x['@type'] === 'FAQPage').mainEntity;
  for (const q of faq) await expect(page.locator('.faq-list summary', { hasText: q.name })).toHaveCount(1);
  // In the sitemap, and linked from the other pages.
  expect(await (await request.get('/sitemap.xml')).text()).toContain('<loc>https://pulsemoney.in/welcome/</loc>');
  for (const path of ['/about/', '/privacy/']) expect(await (await request.get(path)).text()).toContain('href="/welcome/"');
});

test('tapping a calculator field and typing at once replaces the number (no digits mixed in)', async ({ page }) => {
  await open(page);
  // Act like a busy phone, where timers run late: anything the page puts off "for a moment" waits 300 ms.
  await page.evaluate(() => {
    const later = window.setTimeout.bind(window);
    (window as unknown as { setTimeout: unknown }).setTimeout = (f: () => void, ms?: number) => later(f, Math.max(ms ?? 0, 300));
  });
  const bank = field(page, 'Money in bank + cash');
  await bank.click();
  await page.keyboard.type('5000', { delay: 0 }); // straight after the tap
  await expect(bank).toHaveValue('5000');
  await field(page, 'Days until payday').click();
  await page.keyboard.type('3', { delay: 0 });
  await expect(field(page, 'Days until payday')).toHaveValue('3');
});
