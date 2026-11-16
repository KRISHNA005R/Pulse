// Friends on PULSE: usernames and friend requests. What's stored and why: netlify/lib/people.ts.
//
// All with  Authorization: Bearer <session token>:
//   POST /api/people  { action: 'me', pub? }                   -> { me }  (made, with a username, the first time)
//   POST /api/people  { action: 'check' | 'rename', u }        -> is it free / take it
//   POST /api/people  { action: 'ideas' }                      -> a few free usernames from your name
//   POST /api/people  { action: 'find', u }                    -> someone, by exact @username
//   POST /api/people  { action: 'list' }                       -> friends, requests received and sent, blocked
//   POST /api/people  { action: 'request' | 'cancel' | 'accept' | 'decline' | 'remove' | 'block' | 'unblock', uid }
//   POST /api/people  { action: 'report', uid, reason }
//   POST /api/people  { action: 'told' }                       -> the app has shown "You're @…" (once)
//   POST /api/people  { action: 'meet-open', fresh? }          -> a Meet code to show as a QR (3 minutes)
//   POST /api/people  { action: 'meet', token }                -> scanned someone's code: friends now
//   POST /api/people  { action: 'meet-poll', token }           -> who has scanned my code
import { getStore } from '@netlify/blobs';
import { handlePeople, type PeopleStore } from '../lib/people';
import { json } from './stats';

export default async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    const text = await req.text();
    if (text.length > 4000) return json({ ok: false, error: 'bad request' }, 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return json({ ok: false, error: 'bad request' }, 400);
    }
    const store = getStore({ name: 'pulse-accounts', consistency: 'strong' }) as unknown as PeopleStore;
    const r = await handlePeople(body, store, (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
    return json(r.body, r.status);
  } catch (e) {
    console.error('people failed', e);
    return json({ ok: false, error: 'Something went wrong. Try again.' }, 500);
  }
};
