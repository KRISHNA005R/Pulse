// Announcement emails to everyone with a PULSE account. How it works: netlify/lib/announce.ts.
// The page that drives it: /stats/announce/ (needs the stats key).
//
// Uses the same Netlify environment variables as sign-in emails:
//   RESEND_API_KEY   the Resend key (never leaves Netlify)
//   AUTH_FROM        the sender, e.g. "PULSE <hello@pulsemoney.in>" (FEEDBACK_FROM when missing)
//   FEEDBACK_TO      where the test copy goes (the owner)
//   STATS_KEY_HASH   the stats key that unlocks the page
import { getStore } from '@netlify/blobs';
import { handleAnnounce, type AnnounceCtx } from '../lib/announce';
import type { AuthStore } from '../lib/auth';
import type { Mail } from '../lib/emails';
import { DEFAULT_TO } from './feedback';
import { DEFAULT_KEY_HASH, json } from './stats';

export function sender(): AnnounceCtx['send'] {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_FROM || process.env.FEEDBACK_FROM;
  if (!key || !from) return null;
  return async (mails: { to: string; mail: Mail }[]) => {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(
        mails.map(({ to, mail }) => ({ from, to: [to], subject: mail.subject, html: mail.html, text: mail.text, ...(mail.replyTo ? { reply_to: mail.replyTo } : {}), ...(mail.headers ? { headers: mail.headers } : {}) })),
      ),
    });
    if (!res.ok) console.error('announce batch failed', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return res.ok;
  };
}

export default async (req: Request) => {
  try {
    const from = process.env.AUTH_FROM || process.env.FEEDBACK_FROM || '';
    return await handleAnnounce(req, {
      store: getStore({ name: 'pulse-accounts', consistency: 'strong' }) as unknown as AuthStore,
      send: sender(),
      owner: process.env.FEEDBACK_TO || DEFAULT_TO,
      keyHash: process.env.STATS_KEY_HASH || DEFAULT_KEY_HASH,
      from,
      canBroadcast: !!from && !/@resend\.dev\b/i.test(from),
      perRun: Number(process.env.ANNOUNCE_PER_RUN) || undefined,
      perDay: Number(process.env.ANNOUNCE_PER_DAY) || undefined,
    });
  } catch (e) {
    console.error('announce error', e);
    return json({ error: 'server error' }, 500);
  }
};
