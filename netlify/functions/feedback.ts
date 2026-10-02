// PULSE feedback.
//
//   POST /api/feedback  { ref, type, rating?, wants?, message?, contact?, meta }  -> { ok: true }
//   GET  /api/feedback  header x-stats-key                                        -> { total, items, wants } newest first
//
// Every message is saved first (so nothing is lost), then emailed through Resend. Whether the
// emails went out is saved with the message and shown on the private feedback page.
//
// Two emails (templates in netlify/lib/emails.ts):
//   1. to the person who builds PULSE, always
//   2. a thank-you to the user, if they left an email address AND the domain is verified in Resend
//
// Netlify environment variables:
//   RESEND_API_KEY   required for email. Without it, messages are only saved.
//   FEEDBACK_TO      optional, where the first email goes (defaults to the address below).
//   FEEDBACK_FROM    e.g. "PULSE <hello@pulsemoney.in>". Set this once pulsemoney.in is verified in
//                    Resend. It also switches the thank-you emails on: Resend's shared test sender
//                    can only deliver to the account's own address, never to users.
import { getStore } from '@netlify/blobs';
import { DEFAULT_KEY_HASH, json, sha256 } from './stats';
import { EMAIL, ownerEmail, thanksEmail, TYPES, WANTS, type Mail } from '../lib/emails';

declare const process: { env: Record<string, string | undefined> };

type StoreLike = {
  setJSON(key: string, value: unknown): Promise<unknown>;
  get(key: string, opts: { type: 'json' }): Promise<unknown>;
  list(opts: { prefix: string }): Promise<{ blobs: { key: string }[] }>;
};

export interface Env {
  resendKey?: string;
  to: string;
  from: string;
  keyHash: string;
  /** Thank-you emails to users need a verified sending domain. */
  canThank: boolean;
  fetch: typeof fetch;
}

const DEFAULT_TO = 'krsnastudios16@gmail.com';
// Resend's shared sender. It can only deliver to the Resend account's own address, which is all this needs.
const DEFAULT_FROM = 'PULSE Feedback <onboarding@resend.dev>';

const str = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
export interface Feedback {
  at: string;
  ref: string;
  type: string;
  rating: number | null;
  wants: string[];
  message: string;
  contact: string;
  meta: { ver: string; platform: string; installed: boolean; screen: string };
  /** Did the email to the PULSE team go out? */
  mailed?: boolean;
  mailNote?: string;
  /** Did the thank-you to the user go out? Absent when they left no email address. */
  thanked?: boolean;
  thankNote?: string;
}

export function cleanFeedback(b: Record<string, unknown> | null): Feedback | null {
  if (!b) return null;
  const message = str(b.message, 2000);
  const rating = typeof b.rating === 'number' && b.rating >= 1 && b.rating <= 5 ? Math.round(b.rating) : null;
  const wants = Array.isArray(b.wants) ? [...new Set(b.wants.filter((w): w is string => typeof w === 'string' && w in WANTS))].slice(0, 6) : [];
  // One tap is enough: a vibe, a wish or a few words.
  if (message.length < 3 && !rating && !wants.length) return null;
  const m = (b.meta ?? {}) as Record<string, unknown>;
  return {
    at: new Date().toISOString(),
    ref: str(b.ref, 8).replace(/[^A-Za-z0-9]/g, '') || Math.random().toString(36).slice(2, 6).toUpperCase(),
    type: (b.type as string) in TYPES ? (b.type as string) : 'idea',
    rating,
    wants,
    message,
    contact: str(b.contact, 120),
    meta: { ver: str(m.ver, 20), platform: str(m.platform, 12), installed: m.installed === true, screen: str(m.screen, 24) },
  };
}

async function send(mail: Mail, to: string, env: Env, replyTo?: string): Promise<{ ok: boolean; note: string }> {
  if (!env.resendKey) return { ok: false, note: 'RESEND_API_KEY is not set in Netlify' };
  try {
    const res = await env.fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.from, to: [to], subject: mail.subject, html: mail.html, text: mail.text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (res.ok) return { ok: true, note: '' };
    const detail = await res.text().catch(() => '');
    let msg = detail;
    try {
      msg = JSON.parse(detail).message ?? detail;
    } catch {
      /* not JSON */
    }
    return { ok: false, note: `Resend said ${res.status}: ${String(msg).slice(0, 160)}` };
  } catch (e) {
    return { ok: false, note: `Could not reach Resend: ${String((e as Error)?.message ?? e).slice(0, 120)}` };
  }
}

const THANKS_PER_DAY = 200;

/**
 * Thank the user, carefully. Anyone can type any address into the form, so: the email never
 * repeats what was typed, one address gets at most one thank-you a day, and there's a daily cap.
 */
async function thank(fb: Feedback, store: StoreLike, env: Env): Promise<{ ok: boolean; note: string } | null> {
  if (!EMAIL.test(fb.contact)) return null; // no email given (or an Instagram handle): nothing to send
  if (!env.resendKey) return { ok: false, note: 'RESEND_API_KEY is not set in Netlify' };
  if (!env.canThank) return { ok: false, note: 'Off until pulsemoney.in is verified in Resend and FEEDBACK_FROM is set' };
  const day = fb.at.slice(0, 10);
  const who = `thanks/${await sha256(fb.contact.toLowerCase())}`;
  const last = (await store.get(who, { type: 'json' })) as { at?: string } | null;
  if (last?.at && Date.parse(fb.at) - Date.parse(last.at) < 24 * 3600e3) return { ok: false, note: 'Already thanked this address today' };
  const tally = ((await store.get(`thanks-day/${day}`, { type: 'json' })) as { n?: number } | null)?.n ?? 0;
  if (tally >= THANKS_PER_DAY) return { ok: false, note: 'Daily thank-you limit reached' };
  const res = await send(thanksEmail(fb), fb.contact, env, env.to);
  if (res.ok) {
    await store.setJSON(who, { at: fb.at });
    await store.setJSON(`thanks-day/${day}`, { n: tally + 1 });
  }
  return res;
}

export async function handle(req: Request, store: StoreLike, env: Env): Promise<Response> {
  try {
    if (req.method === 'POST') {
      const text = await req.text();
      if (text.length > 6000) return json({ error: 'too long' }, 413);
      let body: Record<string, unknown> | null = null;
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: 'bad json' }, 400);
      }
      // A filled "website" field means a bot: say thanks, save nothing.
      if (body && typeof body.website === 'string' && body.website) return json({ ok: true });
      const fb = cleanFeedback(body);
      if (!fb) return json({ error: 'Pick a vibe or write a few words first.' }, 400);
      // Keys sort by time, so the newest are easy to find. Save before emailing: the message is never lost.
      const key = `fb/${fb.at}-${fb.ref}`;
      await store.setJSON(key, fb);
      const owner = ownerEmail(fb);
      const [mail, thanks] = await Promise.all([send(owner, env.to, env, owner.replyTo), thank(fb, store, env)]);
      await store.setJSON(key, { ...fb, mailed: mail.ok, mailNote: mail.note || undefined, ...(thanks ? { thanked: thanks.ok, thankNote: thanks.note || undefined } : {}) });
      if (!mail.ok) console.warn('feedback email not sent:', mail.note);
      return json({ ok: true });
    }

    if (req.method === 'GET') {
      const key = req.headers.get('x-stats-key') ?? '';
      if (!key || (await sha256(key)) !== env.keyHash) return json({ error: 'wrong key' }, 401);
      const { blobs } = await store.list({ prefix: 'fb/' });
      const keys = blobs.map((b) => b.key).sort().reverse();
      const items = (await Promise.all(keys.slice(0, 200).map((k) => store.get(k, { type: 'json' })))).filter(Boolean) as Feedback[];
      const tally: Record<string, number> = {};
      for (const f of items) for (const w of f.wants ?? []) tally[w] = (tally[w] ?? 0) + 1;
      const wants = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ label: WANTS[id] ?? id, n }));
      return json({ total: keys.length, items, wants, wantNames: WANTS, typeNames: TYPES, emailOn: !!env.resendKey, thanksOn: !!env.resendKey && env.canThank });
    }

    return json({ error: 'method not allowed' }, 405);
  } catch (e) {
    console.error('feedback error', e);
    return json({ error: 'server error' }, 500);
  }
}

export default async (req: Request) =>
  handle(req, getStore({ name: 'pulse-feedback', consistency: 'strong' }) as unknown as StoreLike, {
    resendKey: process.env.RESEND_API_KEY,
    to: process.env.FEEDBACK_TO || DEFAULT_TO,
    from: process.env.FEEDBACK_FROM || DEFAULT_FROM,
    canThank: !!process.env.FEEDBACK_FROM,
    keyHash: process.env.STATS_KEY_HASH || DEFAULT_KEY_HASH,
    fetch,
  });

// Reached at /.netlify/functions/feedback; public/_redirects maps /api/feedback to it.
