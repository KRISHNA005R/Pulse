// PULSE feedback.
//
//   POST /api/feedback  { ref, type, rating?, wants?, message?, contact?, meta }  -> { ok: true }
//   GET  /api/feedback  header x-stats-key                                        -> { total, items, wants } newest first
//
// Every message is saved first (so nothing is lost), then emailed through Resend. Whether the
// email went out is saved with the message and shown on the private stats page.
//
// Netlify environment variables:
//   RESEND_API_KEY   required for email. Without it, messages are only saved.
//   FEEDBACK_TO      optional, where the email goes (defaults to the address below).
//   FEEDBACK_FROM    optional, e.g. "PULSE <feedback@pulsemoney.in>" once the domain is verified in Resend.
import { getStore } from '@netlify/blobs';
import { DEFAULT_KEY_HASH, json, sha256 } from './stats';

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
  fetch: typeof fetch;
}

const DEFAULT_TO = 'krsnastudios16@gmail.com';
// Resend's shared sender. It can only deliver to the Resend account's own address, which is all this needs.
const DEFAULT_FROM = 'PULSE Feedback <onboarding@resend.dev>';

export const TYPES: Record<string, [string, string]> = {
  bug: ['🐞', 'Something broke'],
  idea: ['💡', 'Build this pls'],
  confusing: ['😵‍💫', "I'm confused"],
  love: ['❤️', 'Just vibes'],
};
export const WANTS: Record<string, string> = {
  widget: 'Home screen widget',
  upi: 'Auto-read UPI spends',
  reminders: 'Bill reminders',
  challenges: 'Savings challenges',
  friends: 'Compete with friends',
  hindi: 'Hindi and more languages',
};
export const VIBES = ['💀 Nah', '😬 Mid', '😐 Okay', '😎 Solid', '🔥 Obsessed'];

const str = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;

export interface Feedback {
  at: string;
  ref: string;
  type: string;
  rating: number | null;
  wants: string[];
  message: string;
  contact: string;
  meta: { ver: string; platform: string; installed: boolean; screen: string };
  /** Did the email go out? */
  mailed?: boolean;
  mailNote?: string;
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

export function emailFor(fb: Feedback): { subject: string; html: string; text: string; replyTo?: string } {
  const [emoji, label] = TYPES[fb.type];
  const when = new Date(fb.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const device = `${{ ios: 'iPhone', android: 'Android', desktop: 'Computer' }[fb.meta.platform] ?? 'Device'} · ${fb.meta.installed ? 'installed app' : 'browser'}`;
  const vibe = fb.rating ? `${VIBES[fb.rating - 1]} (${fb.rating}/5)` : 'Not given';
  const wants = fb.wants.map((w) => WANTS[w]);
  const row = (k: string, v: string) => `<tr><td style="padding:6px 14px 6px 0;color:#746F67;font-size:13px;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:6px 0;font-size:14px;color:#17140F">${v}</td></tr>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px">
  <p style="font-size:13px;color:#746F67;margin:0 0 6px">PULSE feedback · #${esc(fb.ref)} · ${esc(when)}</p>
  <h2 style="font-size:20px;margin:0 0 14px;color:#17140F">${emoji} ${esc(label)}</h2>
  ${fb.message ? `<div style="background:#F6F5F2;border-radius:14px;padding:14px 16px;font-size:16px;line-height:1.5;color:#17140F;white-space:pre-wrap">${esc(fb.message)}</div>` : '<p style="color:#746F67;font-size:14px">No message, just taps.</p>'}
  <table style="border-collapse:collapse;margin-top:16px">
    ${row('Vibe', esc(vibe))}
    ${wants.length ? row('Wants next', esc(wants.join(', '))) : ''}
    ${row('Reply to', fb.contact ? `<b>${esc(fb.contact)}</b>` : 'Not given')}
    ${row('Device', esc(device))}
    ${row('App version', esc(fb.meta.ver.replace('T', ' ')) || 'Unknown')}
  </table>
  <p style="font-size:12.5px;color:#746F67;margin-top:18px">All feedback: https://pulsemoney.in/stats${EMAIL.test(fb.contact) ? ' · Hit Reply to answer this person directly.' : ''}</p>
</div>`;
  const text = [`${emoji} ${label}  (#${fb.ref}, ${when})`, '', fb.message || '(no message, just taps)', '', `Vibe: ${vibe}`, wants.length ? `Wants next: ${wants.join(', ')}` : '', `Reply to: ${fb.contact || 'Not given'}`, `Device: ${device}`, `App version: ${fb.meta.ver}`].filter((l) => l !== '').join('\n');
  // The reference and time keep every subject different, so Gmail never folds two messages together.
  return { subject: `PULSE feedback #${fb.ref} · ${emoji} ${label}${fb.rating ? ` · ${fb.rating}/5` : ''} · ${when}`, html, text, replyTo: EMAIL.test(fb.contact) ? fb.contact : undefined };
}

async function sendEmail(fb: Feedback, env: Env): Promise<{ ok: boolean; note: string }> {
  if (!env.resendKey) return { ok: false, note: 'RESEND_API_KEY is not set in Netlify' };
  const mail = emailFor(fb);
  try {
    const res = await env.fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.from, to: [env.to], subject: mail.subject, html: mail.html, text: mail.text, ...(mail.replyTo ? { reply_to: mail.replyTo } : {}) }),
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
      const mail = await sendEmail(fb, env);
      await store.setJSON(key, { ...fb, mailed: mail.ok, mailNote: mail.note || undefined });
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
      return json({ total: keys.length, items, wants, wantNames: WANTS, emailOn: !!env.resendKey });
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
    keyHash: process.env.STATS_KEY_HASH || DEFAULT_KEY_HASH,
    fetch,
  });

// Reached at /.netlify/functions/feedback; public/_redirects maps /api/feedback to it.
