// PULSE feedback.
//
//   POST /api/feedback  { type, rating?, message, contact?, meta }   -> { ok: true }
//   GET  /api/feedback  header x-stats-key                           -> { items: [...] } newest first
//
// Every message is saved here so nothing is lost; the email copy goes out through Netlify Forms
// (the app posts the same message to the hidden "feedback" form in public/feedback-form.html).
import { getStore } from '@netlify/blobs';
import { DEFAULT_KEY_HASH, json, sha256 } from './stats';

declare const process: { env: Record<string, string | undefined> };

type StoreLike = {
  setJSON(key: string, value: unknown): Promise<unknown>;
  get(key: string, opts: { type: 'json' }): Promise<unknown>;
  list(opts: { prefix: string }): Promise<{ blobs: { key: string }[] }>;
};

const TYPES = ['bug', 'idea', 'confusing', 'love'];
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

export interface Feedback {
  at: string;
  type: string;
  rating: number | null;
  message: string;
  contact: string;
  meta: { ver: string; platform: string; installed: boolean; screen: string };
}

export function cleanFeedback(b: Record<string, unknown> | null): Feedback | null {
  if (!b) return null;
  const message = str(b.message, 2000);
  if (message.length < 3) return null;
  const m = (b.meta ?? {}) as Record<string, unknown>;
  const rating = typeof b.rating === 'number' && b.rating >= 1 && b.rating <= 5 ? Math.round(b.rating) : null;
  return {
    at: new Date().toISOString(),
    type: TYPES.includes(b.type as string) ? (b.type as string) : 'idea',
    rating,
    message,
    contact: str(b.contact, 120),
    meta: { ver: str(m.ver, 20), platform: str(m.platform, 12), installed: m.installed === true, screen: str(m.screen, 24) },
  };
}

export async function handle(req: Request, store: StoreLike, keyHash = DEFAULT_KEY_HASH): Promise<Response> {
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
      if (!fb) return json({ error: 'Write a few words first.' }, 400);
      // Keys sort by time, so the newest are easy to find.
      await store.setJSON(`fb/${fb.at}-${Math.random().toString(36).slice(2, 8)}`, fb);
      return json({ ok: true });
    }

    if (req.method === 'GET') {
      const key = req.headers.get('x-stats-key') ?? '';
      if (!key || (await sha256(key)) !== keyHash) return json({ error: 'wrong key' }, 401);
      const { blobs } = await store.list({ prefix: 'fb/' });
      const keys = blobs.map((b) => b.key).sort().reverse();
      const items = (await Promise.all(keys.slice(0, 100).map((k) => store.get(k, { type: 'json' })))).filter(Boolean);
      return json({ total: keys.length, items });
    }

    return json({ error: 'method not allowed' }, 405);
  } catch (e) {
    console.error('feedback error', e);
    return json({ error: 'server error' }, 500);
  }
}

export default async (req: Request) =>
  handle(req, getStore({ name: 'pulse-feedback', consistency: 'strong' }) as unknown as StoreLike, process.env.STATS_KEY_HASH || DEFAULT_KEY_HASH);

// Reached at /.netlify/functions/feedback; public/_redirects maps /api/feedback to it.
