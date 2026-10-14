import { describe, expect, it } from 'vitest';
import { handleAuth, type AuthCtx } from '../netlify/lib/auth';
import { memStore } from './memstore';

const EMAIL = 'someone@example.com';

/** A context whose "email" just remembers the last code sent. */
function setup() {
  const sent: { code: string } = { code: '' };
  const ctx: AuthCtx = {
    store: memStore(),
    googleClientId: '',
    verifyGoogle: async () => null,
    sendMail: async () => true,
    codeMail: (code) => {
      sent.code = code;
      return { subject: '', html: '', text: '' };
    },
  };
  return { ctx, sent };
}

const verify = (ctx: AuthCtx, code: string) => handleAuth({ action: 'email-verify', email: EMAIL, code }, ctx);
const wrong = (code: string) => String(((Number(code) - 100000 + 1) % 900000) + 100000);

describe('email sign-in codes', () => {
  it('signs in with the right code after a couple of wrong ones', async () => {
    const { ctx, sent } = setup();
    expect((await handleAuth({ action: 'email-start', email: EMAIL }, ctx)).status).toBe(200);
    expect((await verify(ctx, wrong(sent.code))).status).toBe(400);
    expect((await verify(ctx, wrong(sent.code))).status).toBe(400);
    const ok = await verify(ctx, sent.code);
    expect(ok.status).toBe(200);
    expect(typeof ok.body.token).toBe('string');
  });

  it('allows only 6 guesses in all, even when they are sent at the same moment', async () => {
    const { ctx, sent } = setup();
    await handleAuth({ action: 'email-start', email: EMAIL }, ctx);
    const results = await Promise.all(Array.from({ length: 30 }, () => verify(ctx, wrong(sent.code))));
    // Only a guess that was actually checked hears "isn't right"; the rest are turned away.
    const checked = results.filter((r) => /isn’t right/.test(String(r.body.error)));
    expect(checked.length).toBe(6);
    expect(results.filter((r) => r.status === 429).length).toBeGreaterThan(0);
    // The right code no longer works: the guesses used it up.
    expect((await verify(ctx, sent.code)).status).not.toBe(200);
  });
});
