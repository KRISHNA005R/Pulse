// PULSE accounts: sign in with Google or an emailed code. What an account is: netlify/lib/auth.ts.
//
//   GET  /api/auth                                         -> { google: <client id or ''>, email: true|false }
//   GET  /api/auth?members=1   header x-stats-key          -> how many accounts, and the latest, for the stats page
//   POST /api/auth  { action: 'google', credential }       -> { token, account, fresh }
//   POST /api/auth  { action: 'email-start', email }       a 6-digit code is emailed
//   POST /api/auth  { action: 'email-verify', email, code }-> { token, account, fresh }
//   POST /api/auth  { action: 'exchange', once }           -> the same, after a Google redirect
//   POST /api/auth  { action: 'me' | 'code' | 'name' | 'signout' | 'delete' }   with  Authorization: Bearer <token>
//   POST /api/auth  (a form, sent by Google itself)        -> back to the app at /#auth=<one-time code>
//
// Set in Netlify → Site configuration → Environment variables. Sign-in stays switched off, and the
// app works as it did before accounts, until at least one of these is in place:
//   GOOGLE_CLIENT_ID   the "Web client ID" from Google Cloud. Turns Google sign-in on.
//   RESEND_API_KEY     already used for feedback emails.
//   AUTH_FROM          e.g. "PULSE <login@pulsemoney.in>". Turns email codes on. The address must be
//                      on a domain verified in Resend (FEEDBACK_FROM is used when this is missing).
import { getStore } from '@netlify/blobs';
import { authConfig, googleKeys, googleReturn, handleAuth, membersOverview, verifyGoogleJwt, type AuthCtx, type AuthStore } from '../lib/auth';
import { codeEmail, type Mail } from '../lib/emails';
import { DEFAULT_KEY_HASH, json, sha256 } from './stats';

function context(req: Request): AuthCtx {
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? '').trim();
  const key = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_FROM || process.env.FEEDBACK_FROM;
  const sendMail =
    key && from
      ? async (to: string, mail: Mail) => {
          try {
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
              body: JSON.stringify({ from, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
            });
            if (!res.ok) console.error('auth email failed', res.status, (await res.text().catch(() => '')).slice(0, 200));
            return res.ok;
          } catch (e) {
            console.error('auth email error', e);
            return false;
          }
        }
      : null;
  return {
    store: getStore({ name: 'pulse-accounts', consistency: 'strong' }) as unknown as AuthStore,
    googleClientId: clientId,
    verifyGoogle: (credential) => verifyGoogleJwt(credential, clientId, googleKeys),
    sendMail,
    codeMail: codeEmail,
    ip: req.headers.get('x-nf-client-connection-ip') ?? undefined,
  };
}

const back = (hash: string) => new Response(null, { status: 303, headers: { location: `/#${hash}`, 'cache-control': 'no-store' } });

export default async (req: Request) => {
  try {
    const ctx = context(req);
    if (req.method === 'GET') {
      if (new URL(req.url).searchParams.has('members')) {
        const key = req.headers.get('x-stats-key') ?? '';
        if (!key || (await sha256(key)) !== (process.env.STATS_KEY_HASH || DEFAULT_KEY_HASH)) return json({ error: 'wrong key' }, 401);
        return json(await membersOverview(ctx.store));
      }
      return json(authConfig(ctx));
    }
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    const type = req.headers.get('content-type') ?? '';
    const text = await req.text();
    if (text.length > 20_000) return json({ error: 'too big' }, 413);

    // Google sending the person back after a full-page sign-in. Google sets a cookie and repeats it
    // in the form; a page that is not Google can't make the two match.
    if (type.includes('application/x-www-form-urlencoded')) {
      const form = new URLSearchParams(text);
      const csrf = form.get('g_csrf_token') ?? '';
      const cookie = (req.headers.get('cookie') ?? '').match(/(?:^|;\s*)g_csrf_token=([^;]+)/)?.[1] ?? '';
      if (!csrf || csrf !== cookie) return back('auth-error=1');
      const once = await googleReturn(form.get('credential') ?? '', ctx);
      return back(once ? `auth=${once}` : 'auth-error=1');
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: 'bad json' }, 400);
    }
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const res = await handleAuth(body, ctx, bearer);
    return json(res.body, res.status);
  } catch (e) {
    console.error('auth error', e);
    return json({ error: 'server error' }, 500);
  }
};

// Reached at /.netlify/functions/auth; public/_redirects maps /api/auth to it.
