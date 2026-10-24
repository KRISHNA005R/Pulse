// The password for PULSE's private pages (stats, feedback, reminders status, members, announcements).
//
// - Only STATS_KEY_HASH in Netlify (SHA-256 of the password) opens them. There is no built-in
//   fallback: the code is public, so a default would be readable by anyone.
// - Guessing is limited: after MAX_TRIES wrong passwords from one internet address in an hour, that
//   address is turned away (even with the right password) until the next hour. Only a hash of the
//   address is stored, never the address.
// - Every try first takes one of MAX_TRIES slots for that address and hour (written once, so a burst
//   of guesses sent all at once still gets at most MAX_TRIES checked). The right password gives its
//   slot back, so the owner using the pages is never locked out.
export interface GuardStore {
  get(key: string, opts: { type: 'json' }): Promise<unknown>;
  setJSON(key: string, value: unknown, opts?: { onlyIfNew?: boolean }): Promise<unknown>;
  delete(key: string): Promise<void>;
}

export const MAX_TRIES = 10;

export const adminKeyHash = (): string => (process.env.STATS_KEY_HASH ?? '').trim().toLowerCase();

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const same = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

/** Null when the request has the right password; otherwise the response to send back. */
export async function checkAdmin(req: Request, keyHash: string, store: GuardStore, now = new Date()): Promise<Response | null> {
  if (!/^[0-9a-f]{64}$/.test(keyHash)) return json({ error: 'The private pages are locked: add STATS_KEY_HASH (the SHA-256 of your password) in Netlify → Environment variables, then redeploy.' }, 503);
  const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const base = `guard/${(await sha256(`pulse-guard:${ip}`)).slice(0, 32)}/${now.toISOString().slice(0, 13)}`;
  let slot = -1;
  for (let i = 0; i < MAX_TRIES && slot < 0; i++) {
    const res = (await store.setJSON(`${base}/${i}`, { at: now.toISOString() }, { onlyIfNew: true })) as { modified?: boolean } | undefined;
    if (res?.modified !== false) slot = i;
  }
  if (slot < 0) return json({ error: 'Too many wrong passwords. Try again in an hour.' }, 429);
  const key = req.headers.get('x-stats-key') ?? '';
  if (key && same(await sha256(key), keyHash)) {
    await store.delete(`${base}/${slot}`);
    return null;
  }
  return json({ error: 'wrong key' }, 401);
}
