import { devices, expect, type Browser, type Page } from '@playwright/test';

type Saved = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The app's saved state on this phone. */
export const state = (p: Page): Promise<Saved> => p.evaluate(() => JSON.parse(localStorage.getItem('pulse-state-v1') ?? '{}'));

/** Change the saved state, then reload so the app picks it up. */
export async function setState(p: Page, change: string, arg?: unknown) {
  await p.evaluate(
    ([code, a]) => {
      const s = JSON.parse(localStorage.getItem('pulse-state-v1') ?? '{}');
      new Function('s', 'a', code as string)(s, a);
      localStorage.setItem('pulse-state-v1', JSON.stringify(s));
    },
    [change, arg] as const,
  );
  await p.reload();
  await p.waitForTimeout(2500);
  await p.keyboard.press('Escape');
}

/** Open PULSE on a fresh phone with the demo data, switched to personal mode (as a real user). */
export async function openDemo(p: Page, name = 'Krishna') {
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('/');
  await p.getByText('Explore a demo first').click();
  await p.waitForTimeout(1500);
  await setState(p, "s.mode = 'personal'; s.user.name = a; s.bhisis = []; s.settings.newStuffSeen = true; s.settings.soundsAsked = true;", name);
  return errors;
}

/** A second phone (its own storage), already on the demo. */
export async function phone(browser: Browser, baseURL: string, name: string) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], baseURL, serviceWorkers: 'block', timezoneId: 'Asia/Kolkata' });
  const p = await ctx.newPage();
  await openDemo(p, name);
  return p;
}

/** Bring the app to the front, which makes it sync with friends right away. */
export const syncNow = (p: Page) =>
  p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

/** Log something with the + button. type: 'Spent' (default) or 'Got'. */
export async function log(p: Page, amount: number, text: string, type?: 'Got') {
  await p.getByRole('button', { name: 'Add expense' }).click();
  if (type) await p.getByRole('radio', { name: new RegExp(type) }).first().click();
  await p.locator('#composer-amount').fill(String(amount));
  await p.locator('#composer-text').fill(text);
  return {
    save: async () => {
      await p.locator('#composer-text').press('Enter');
      await expect(p.getByRole('dialog')).toHaveCount(0, { timeout: 5000 });
    },
  };
}

/** Outside calls the test server refused (should always be empty: nothing real gets sent). */
export const blockedCalls = async (p: Page): Promise<string[]> => (await (await p.request.get('/__e2e/blocked')).json()).blocked;
