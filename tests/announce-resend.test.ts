import { afterEach, describe, expect, it, vi } from 'vitest';
import { sender } from '../netlify/functions/announce';

// The request PULSE sends to Resend's batch API, checked against a fake Resend (nothing real is sent).
describe('Resend batch request', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is off without a key or a sender', () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('AUTH_FROM', 'PULSE <hello@pulsemoney.in>');
    expect(sender()).toBeNull();
    vi.stubEnv('RESEND_API_KEY', 'test-key');
    vi.stubEnv('AUTH_FROM', '');
    vi.stubEnv('FEEDBACK_FROM', '');
    expect(sender()).toBeNull();
  });

  it('sends one batch with each person as their own email, with reply-to and unsubscribe headers', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key');
    vi.stubEnv('AUTH_FROM', 'PULSE <hello@pulsemoney.in>');
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ data: [{ id: '1' }, { id: '2' }] }), { status: 200 });
    });
    const ok = await sender()!([
      { to: 'a@example.com', mail: { subject: 'S', html: '<p>A</p>', text: 'A', replyTo: 'owner@example.com', headers: { 'List-Unsubscribe': '<https://x/a>' } } },
      { to: 'b@example.com', mail: { subject: 'S', html: '<p>B</p>', text: 'B' } },
    ]);
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails/batch');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toEqual([
      { from: 'PULSE <hello@pulsemoney.in>', to: ['a@example.com'], subject: 'S', html: '<p>A</p>', text: 'A', reply_to: 'owner@example.com', headers: { 'List-Unsubscribe': '<https://x/a>' } },
      { from: 'PULSE <hello@pulsemoney.in>', to: ['b@example.com'], subject: 'S', html: '<p>B</p>', text: 'B' },
    ]);
  });

  it('reports a refused batch as failed', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key');
    vi.stubEnv('AUTH_FROM', 'PULSE <hello@pulsemoney.in>');
    vi.stubGlobal('fetch', async () => new Response('{"message":"daily quota"}', { status: 429 }));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sender()!([{ to: 'a@example.com', mail: { subject: 'S', html: 'h', text: 't' } }])).toBe(false);
    err.mockRestore();
  });
});
