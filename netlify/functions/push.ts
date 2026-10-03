// PULSE reminders API.
//
//   GET  /api/push                                   -> { publicKey }   what a browser needs to subscribe
//   GET  /api/push?status=1   header x-stats-key     -> { devices, lastRun, sentToday, ... } for the stats page
//   POST /api/push  { action: 'sync', id, sub, reminders: [{ at, title, body, url, tag }] }
//   POST /api/push  { action: 'test', id }           -> sends one notification now
//   POST /api/push  { action: 'off',  id }           -> forgets the device and its reminders
//
// The daily message, for the private stats page (all need the x-stats-key header):
//   GET  /api/push?daily=1                                         -> today's message, the next two weeks, written messages
//   POST /api/push  { action: 'daily-set', date, title, body }     -> write the message for a date
//   POST /api/push  { action: 'daily-del', date }                  -> remove it
//   POST /api/push  { action: 'daily-try', id, title, body }       -> send it to one device now, to see how it looks
//
// See netlify/lib/push.ts for what is stored. The sender runs from netlify/functions/push-cron.ts.
import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { DEFAULT_KEY_HASH, json, sha256 } from './stats';
import { getVapid, removeDevice, sendTest, status, syncDevice, type Sender, type StoreLike, type Vapid } from '../lib/push';
import { dailyOverview, deleteCustom, sendPreview, setCustom } from '../lib/daily';

declare const process: { env: Record<string, string | undefined> };

const CONTACT = 'mailto:krsnastudios16@gmail.com';

export const makeVapid = (): Vapid => webpush.generateVAPIDKeys();

export const send: Sender = async (sub, payload, vapid) => {
  try {
    const res = await webpush.sendNotification(sub, JSON.stringify(payload), {
      vapidDetails: { subject: CONTACT, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: 6 * 3600, // a reminder that can't be delivered within six hours isn't worth showing
      urgency: 'normal',
    });
    return res.statusCode;
  } catch (e) {
    return (e as { statusCode?: number }).statusCode ?? 0;
  }
};

export const pushStore = () => getStore({ name: 'pulse-push', consistency: 'strong' }) as unknown as StoreLike;

export async function handle(req: Request, store: StoreLike, sender: Sender, keyHash: string, make = makeVapid): Promise<Response> {
  try {
    // The stats page proves who it is with the stats password.
    const owner = async () => {
      const key = req.headers.get('x-stats-key') ?? '';
      return !!key && (await sha256(key)) === keyHash;
    };
    if (req.method === 'GET') {
      const url = new URL(req.url);
      if (url.searchParams.has('status') || url.searchParams.has('daily')) {
        if (!(await owner())) return json({ error: 'wrong key' }, 401);
        return json(url.searchParams.has('daily') ? await dailyOverview(store) : await status(store));
      }
      return json({ publicKey: (await getVapid(store, make)).publicKey });
    }
    if (req.method === 'POST') {
      const text = await req.text();
      if (text.length > 60_000) return json({ error: 'too big' }, 413);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: 'bad json' }, 400);
      }
      const id = String(body.id ?? '');
      if (body.action === 'sync') {
        const res = await syncDevice(store, id, body.sub, body.reminders, new Date(), body.daily);
        return json(res, res.ok ? 200 : 400);
      }
      if (body.action === 'test') {
        const res = await sendTest(store, id, sender, await getVapid(store, make));
        return json(res, res.ok ? 200 : 502);
      }
      if (body.action === 'off') {
        await removeDevice(store, id);
        return json({ ok: true });
      }
      if (typeof body.action === 'string' && body.action.startsWith('daily-')) {
        if (!(await owner())) return json({ error: 'wrong key' }, 401);
        if (body.action === 'daily-set') {
          const res = await setCustom(store, body);
          return json(res, res.ok ? 200 : 400);
        }
        if (body.action === 'daily-del') return json(await deleteCustom(store, body.date));
        if (body.action === 'daily-try') {
          const res = await sendPreview(store, id, body, sender, await getVapid(store, make));
          return json(res, res.ok ? 200 : 400);
        }
      }
      return json({ error: 'unknown action' }, 400);
    }
    return json({ error: 'method not allowed' }, 405);
  } catch (e) {
    console.error('push error', e);
    return json({ error: 'server error' }, 500);
  }
}

export default async (req: Request) => handle(req, pushStore(), send, process.env.STATS_KEY_HASH || DEFAULT_KEY_HASH);

// Reached at /.netlify/functions/push; public/_redirects maps /api/push to it.
