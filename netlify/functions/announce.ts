// Announcement emails to everyone with a PULSE account. How it works: netlify/lib/announce.ts.
// The page that drives it: /stats/announce/ (needs the stats key).
//
// Uses the same Netlify environment variables as sign-in emails:
//   RESEND_API_KEY   the Resend key (never leaves Netlify)
//   ANNOUNCE_FROM    optional sender just for announcements, e.g. "Krishna from PULSE <krishna@pulsemoney.in>"
//   AUTH_FROM        the sign-in sender, used when ANNOUNCE_FROM is missing (then FEEDBACK_FROM)
//   FEEDBACK_TO      where the test copy goes (the owner)
//   STATS_KEY_HASH   the stats key that unlocks the page
import { getStore } from '@netlify/blobs';
import { handleAnnounce, type AnnounceCtx } from '../lib/announce';
import type { AuthStore } from '../lib/auth';
import type { Mail } from '../lib/emails';
import { DEFAULT_TO } from './feedback';
import { json } from './stats';
import { adminKeyHash } from '../lib/admin';

/** ANNOUNCE_FROM (e.g. "Krishna from PULSE <krishna@pulsemoney.in>") when set, else the sign-in sender. */
const fromAddress = () => process.env.ANNOUNCE_FROM || process.env.AUTH_FROM || process.env.FEEDBACK_FROM || '';

export function sender(): AnnounceCtx['send'] {
  const key = process.env.RESEND_API_KEY;
  const from = fromAddress();
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
    const from = fromAddress();
    return await handleAnnounce(req, {
      store: getStore({ name: 'pulse-accounts', consistency: 'strong' }) as unknown as AuthStore,
      send: sender(),
      owner: process.env.FEEDBACK_TO || DEFAULT_TO,
      keyHash: adminKeyHash(),
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
