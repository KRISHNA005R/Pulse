import { expect, test } from '@playwright/test';
import http from 'node:http';

// Crash reports reach Sentry, and carry nothing personal. Needs a build made with a test key
// pointing at a fake Sentry on this machine, so it's skipped in the normal run:
//   VITE_SENTRY_DSN=http://e2ekey@localhost:8977/1 npm run build
//   SENTRY_E2E=1 npx playwright test e2e/sentry.spec.ts
//   npm run build            (afterwards: back to a normal build)

test.skip(!process.env.SENTRY_E2E, 'needs a build with the test Sentry key');

const SECRET = 'Kx9_aaaaBBBBccccDDDDeeee_1234';

test('a crash and the ?sentry=test check both arrive, with nothing personal in them', async ({ page }) => {
  const got: string[] = [];
  const fake = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (req.method === 'POST') got.push(Buffer.concat(chunks).toString('utf8'));
      res.writeHead(200, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise<void>((r) => fake.listen(8977, r));
  try {
    const blocked: string[] = [];
    page.on('console', (m) => /Content Security Policy/.test(m.text()) && blocked.push(m.text()));
    // The check link, opened with a secret Meet code in the address.
    await page.goto(`/?demo=1&sentry=test#meet=${SECRET}`);
    await expect.poll(() => got.join('\n'), { timeout: 15_000 }).toContain('PULSE Sentry test: crash reports work');
    expect(page.url()).not.toContain('sentry=test');
    // A real crash, with personal things in the message.
    await page.evaluate((s) => setTimeout(() => {
      throw new Error(`Split ₹4,500 with saloni@gmail.com failed, code ${s}`);
    }), SECRET);
    await expect.poll(() => got.join('\n'), { timeout: 15_000 }).toContain('Split ₹[amount] with [email] failed');
    const all = got.join('\n');
    for (const bad of [SECRET, '4,500', 'saloni@gmail.com', 'demo=1']) expect(all).not.toContain(bad);
    expect(blocked).toEqual([]);
  } finally {
    fake.close();
  }
});
