// Friends on PULSE: the shared, encrypted channel two people use to see each other's splits.
//
//   POST /api/friends  { action: 'create', chan, token, dev? }                      the inviter opens a channel
//   POST /api/friends  { action: 'join',   chan, token, dev? }                      the friend accepts the invite
//   POST /api/friends  { action: 'get',    chan, token, dev? }                      -> both sealed boxes
//   POST /api/friends  { action: 'put',    chan, token, box, dev?, notify? }        publish my box, notify the friend
//   POST /api/friends  { action: 'leave',  chan, token }                            disconnect
//
// What is stored and why it can't be read here: netlify/lib/friends.ts.
import { getStore } from '@netlify/blobs';
import { handleFriends } from '../lib/friends';
import { getVapid, type StoreLike } from '../lib/push';
import { json } from './stats';
import { makeVapid, pushStore, send } from './push';

export default async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    const text = await req.text();
    if (text.length > 320_000) return json({ error: 'too big' }, 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: 'bad json' }, 400);
    }
    const push = pushStore();
    const res = await handleFriends(body, {
      store: getStore({ name: 'pulse-friends', consistency: 'strong' }) as unknown as StoreLike,
      pushStore: push,
      send,
      vapid: () => getVapid(push, makeVapid),
    });
    return json(res.body, res.status);
  } catch (e) {
    console.error('friends error', e);
    return json({ error: 'server error' }, 500);
  }
};

// Reached at /.netlify/functions/friends; public/_redirects maps /api/friends to it.
