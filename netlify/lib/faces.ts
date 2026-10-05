// GIF profile photos.
//
// A still profile photo is tiny and travels inside a person's own data. A GIF is too big for that,
// so it is kept here, under a long random id, and phones load it by that id like any picture:
//   GET /api/face?id=<id>
// The id is the only way to it. It goes to the person's own devices (inside their data) and to
// friends they are connected with on PULSE (inside the sealed boxes friends already exchange).
// A new GIF gets a new id, so a picture never changes under an id and phones can keep their copy.
//
// Stored in the 'pulse-accounts' blob store:
//   face/<id> -> { uid, gif (base64), at }
// The account remembers its current id (Account.face), so changing or removing the photo, or
// deleting the account, removes the old GIF.
import { accountFor, allow, type Account, type AuthStore } from './auth';

export const FACE_ID = /^[0-9a-f]{32}$/;
/** The app makes GIFs of about 140 KB; anything much bigger did not come from the app. */
export const FACE_MAX_BYTES = 220_000;
const FACE_MAX_SIDE = 160;
const CHANGES_PER_DAY = 40;

type Result = { status: number; body: Record<string, unknown> };
const fail = (status: number, error: string): Result => ({ status, body: { ok: false, error } });
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

function fromB64(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** A small square-ish GIF, the kind the app makes: the header says GIF, and its size is modest. */
export function looksLikeFace(b: Uint8Array): boolean {
  if (b.length < 32 || b.length > FACE_MAX_BYTES) return false;
  const sig = String.fromCharCode(...b.subarray(0, 6));
  if (sig !== 'GIF89a' && sig !== 'GIF87a') return false;
  const w = b[6] | (b[7] << 8);
  const h = b[8] | (b[9] << 8);
  return w > 0 && h > 0 && w <= FACE_MAX_SIDE && h <= FACE_MAX_SIDE && b[b.length - 1] === 0x3b;
}

/**
 * POST /api/face with a signed-in session:
 *   { action: 'put', gif: <base64> } -> { ok, id }   saves the GIF and forgets the one before it
 *   { action: 'delete' }             -> { ok }       the person has no GIF any more
 */
export async function handleFace(body: Record<string, unknown>, store: AuthStore, bearer: string, now = new Date()): Promise<Result> {
  const acct = await accountFor(store, bearer);
  if (!acct) return fail(401, 'signed out');
  const action = String(body.action ?? '');
  const forget = async (a: Account) => {
    if (a.face && FACE_ID.test(a.face)) await store.delete(`face/${a.face}`);
  };

  if (action === 'delete') {
    await forget(acct);
    if (acct.face) {
      delete acct.face;
      await store.setJSON(`acct/${acct.uid}`, acct);
    }
    return { status: 200, body: { ok: true } };
  }

  if (action === 'put') {
    const text = typeof body.gif === 'string' ? body.gif : '';
    const bytes = text && text.length <= FACE_MAX_BYTES * 1.4 ? fromB64(text) : null;
    if (!bytes || !looksLikeFace(bytes)) return fail(400, 'That GIF can’t be used. Pick another one.');
    if (!(await allow(store, 'face', acct.uid, now.toISOString().slice(0, 10), CHANGES_PER_DAY))) return fail(429, 'You have changed your photo many times today. Try again tomorrow.');
    const id = hex(crypto.getRandomValues(new Uint8Array(16)));
    await store.setJSON(`face/${id}`, { uid: acct.uid, gif: text, at: now.toISOString() });
    await forget(acct);
    acct.face = id;
    await store.setJSON(`acct/${acct.uid}`, acct);
    return { status: 200, body: { ok: true, id } };
  }

  return fail(400, 'unknown action');
}

/** The GIF behind an id, or null. */
export async function readFace(store: AuthStore, id: string): Promise<Uint8Array | null> {
  if (!FACE_ID.test(id)) return null;
  const hit = (await store.get(`face/${id}`, { type: 'json' })) as { gif?: string } | null;
  const bytes = hit && typeof hit.gif === 'string' ? fromB64(hit.gif) : null;
  return bytes && looksLikeFace(bytes) ? bytes : null;
}
