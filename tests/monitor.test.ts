import { describe, expect, it } from 'vitest';
import { clean, cleanUrl, scrubCrumb, scrubEvent } from '../src/lib/monitor';

// Crash reports never carry anything personal.
const secret = 'Kx9_aaaaBBBBccccDDDDeeee_1234';
describe('crash reports: nothing personal leaves the phone', () => {
  it('links lose their ?query and #part (Meet codes, group keys, sync ids)', () => {
    expect(cleanUrl(`https://pulsemoney.in/#meet=${secret}`)).toBe('https://pulsemoney.in/');
    expect(cleanUrl('https://pulsemoney.in/api/sync?id=abc123')).toBe('https://pulsemoney.in/api/sync');
  });

  it('error text loses money, emails, usernames, codes and long numbers', () => {
    const t = String(clean(`Split ₹4,500 with saloni@gmail.com (@lowkey.saloni) failed at https://pulsemoney.in/#group=${secret}.k code PULSE-1234-5678 id 9876543210 token ${secret}`));
    for (const bad of ['4,500', 'saloni@gmail.com', 'lowkey.saloni', secret, 'PULSE-1234', '9876543210']) expect(t).not.toContain(bad);
    expect(t).toContain('₹[amount]');
    expect(clean(`Unexpected token 'S', "Saloni paid ₹500" is not valid JSON`)).toBe(`Unexpected token 'S', "…" is not valid JSON`);
    expect(clean("Cannot read properties of undefined (reading 'amount')")).toBe("Cannot read properties of undefined (reading 'amount')");
  });

  it('a whole report: no user, no page address secrets, no typed text, clean stack', () => {
    const e = scrubEvent({
      user: { email: 'k@x.in', ip_address: '1.2.3.4' },
      extra: { state: { amount: 900 } },
      request: { url: `https://pulsemoney.in/?action=add&amount=60#meet=${secret}`, headers: { Referer: `https://pulsemoney.in/#hi=${secret}`, 'User-Agent': 'iPhone' } },
      exception: { values: [{ value: 'Paid ₹349 to Rahul', stacktrace: { frames: [{ filename: `https://pulsemoney.in/#meet=${secret}`, abs_path: 'https://pulsemoney.in/assets/index.js?v=1', vars: { a: 1 } }] } }] },
      breadcrumbs: [
        { category: 'console', message: 'balance 12000' },
        { category: 'ui.input', message: 'input#composer-text' },
        { category: 'navigation', data: { from: `/#meet=${secret}`, to: '/?amount=5' } },
        { category: 'fetch', data: { url: '/api/sync?id=abc', method: 'PUT', status_code: 200 } },
      ],
    });
    const s = JSON.stringify(e);
    for (const bad of ['k@x.in', '1.2.3.4', '900', secret, 'amount=60', 'Referer', '349', 'balance', 'composer-text', 'id=abc']) expect(s).not.toContain(bad);
    expect(e.request.headers).toEqual({ 'User-Agent': 'iPhone' });
    expect(e.breadcrumbs).toHaveLength(2);
    expect(e.exception.values[0].stacktrace.frames[0]).toEqual({ filename: 'https://pulsemoney.in/', abs_path: 'https://pulsemoney.in/assets/index.js' });
  });

  it('console lines and typing are never kept as steps', () => {
    expect(scrubCrumb({ category: 'console', message: 'x' })).toBeNull();
    expect(scrubCrumb({ category: 'ui.input', message: 'x' })).toBeNull();
    expect(scrubCrumb({ category: 'ui.click', message: 'button.btn-accent' })).toMatchObject({ category: 'ui.click' });
  });
});
