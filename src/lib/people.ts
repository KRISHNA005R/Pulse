// Friends made with a request (by @username, QR or link): the app side of netlify/lib/people.ts.
//
// The server knows who is friends with whom. It never sees money: each pair's splits travel in the
// ordinary friend channel (lib/friends.ts), whose id and lock both phones work out from their own
// key and the other's public key (ECDH). PULSE's server only ever sees the public halves.
import type { FriendLink, ISODate, Person, State } from '../types';
import { loadSession } from './auth';
import { ownName } from './friends';

const ENDPOINT = '/api/people';
export type PeopleReply = { status: number; data: Record<string, any> } | null;

/** null = offline, or not signed in. */
export async function peopleCall(body: Record<string, unknown>): Promise<PeopleReply> {
  const token = loadSession()?.token;
  if (!token) return null;
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body), cache: 'no-store' });
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return null;
    return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, any> };
  } catch {
    return null;
  }
}

export type Keys = NonNullable<State['user']['keys']>;
const EC = { name: 'ECDH', namedCurve: 'P-256' } as const;

/** A new key pair for this account. */
export async function newKeys(): Promise<Keys> {
  const k = (await crypto.subtle.generateKey(EC, true, ['deriveBits'])) as CryptoKeyPair;
  const pub = await crypto.subtle.exportKey('jwk', k.publicKey);
  const priv = await crypto.subtle.exportKey('jwk', k.privateKey);
  return { pub: JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }), priv };
}

const hexOf = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64url = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha = (x: string | BufferSource) => crypto.subtle.digest('SHA-256', typeof x === 'string' ? new TextEncoder().encode(x) : x);

/** Their key's fingerprint: when it changes, the channel is made again. */
export const fingerprint = async (pub: string) => hexOf(await sha(`pulse-pub:${pub}`)).slice(0, 16);

/**
 * The channel with a friend, worked out on this phone from my key and their public key. Both phones
 * get the same id and lock; the account with the smaller id opens it, the other joins.
 */
export async function pairLink(mine: Keys, myAcct: string, theirAcct: string, theirPub: string, today: ISODate): Promise<FriendLink | null> {
  try {
    const priv = await crypto.subtle.importKey('jwk', mine.priv, EC, false, ['deriveBits']);
    const pub = await crypto.subtle.importKey('jwk', JSON.parse(theirPub) as JsonWebKey, EC, false, []);
    const secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
    const pair = [myAcct, theirAcct].sort().join('|');
    const chan = hexOf(await sha(new Uint8Array([...new TextEncoder().encode(`pulse-chan|${pair}|`), ...new Uint8Array(secret)]))).slice(0, 32);
    const key = b64url(await sha(new Uint8Array([...new TextEncoder().encode(`pulse-key|${pair}|`), ...new Uint8Array(secret)])));
    // My side's write token, the same on all my phones (so two of them never lock each other out).
    // Only the two of us can work it out; the friend could too, but they only ever read my side.
    const role = myAcct < theirAcct ? 'a' : 'b';
    const token = b64url(await sha(new Uint8Array([...new TextEncoder().encode(`pulse-tok|${role}|${pair}|`), ...new Uint8Array(secret)])));
    return { chan, key, token, status: 'invited', since: today, via: 'acct', role, peer: await fingerprint(theirPub) };
  } catch {
    return null;
  }
}

export interface FriendRow {
  uid: string;
  u: string;
  name: string;
  face?: string;
  pub?: string;
  since?: string;
  at?: string;
}

/**
 * Make the friends list here match the server's: a person for each friend (one per account, never
 * two), with the channel to them. Friends who are no longer friends keep their history but lose the
 * channel. Returns the channels to leave.
 */
export function applyFriends(s: State, rows: FriendRow[], links: Record<string, FriendLink | undefined>): FriendLink[] {
  const leave: FriendLink[] = [];
  const now = new Set(rows.map((r) => r.uid));
  for (const r of rows) {
    let p: Person | undefined = s.people.find((x) => x.acct === r.uid);
    if (!p) {
      const name = r.name.trim() || r.u;
      p = { id: `pa-${r.uid.slice(0, 16)}`, name, short: name.split(' ')[0], hue: parseInt(r.uid.slice(0, 2), 16) % 360, acct: r.uid };
      if (!s.people.some((x) => x.id === p!.id)) s.people.push(p);
      else p = s.people.find((x) => x.id === p!.id)!;
    }
    p.username = r.u;
    ownName(p, r.name);
    const fresh = links[r.uid];
    if (!fresh) continue;
    // A link made by request whose friend has a new key: make it again (what we split is rebuilt from the data).
    if (!p.link) p.link = fresh;
    else if (p.link.via === 'acct' && p.link.peer !== fresh.peer) {
      // What came over the old channel comes again over the new one.
      const old = p.link.chan;
      s.splits = s.splits.filter((x) => x.remote !== old);
      s.settlements = s.settlements.filter((x) => x.remote !== old);
      leave.push(p.link);
      p.link = fresh;
    }
  }
  // No longer friends (removed or blocked): the channel goes, what we split stays.
  for (const p of s.people)
    if (p.acct && p.link?.via === 'acct' && !now.has(p.acct)) {
      leave.push(p.link);
      delete p.link;
    }
  return leave;
}

// ---------------------------------------------------------------------------------------------
// Keeping the friends list in step with the server (runs with each friends sync)
// ---------------------------------------------------------------------------------------------
export interface PeopleHost {
  state(): State | null;
  update(fn: (s: State) => void): void;
}
export interface PeopleView {
  me: { uid: string; u: string; name: string; renamesLeft: number } | null;
  friends: FriendRow[];
  received: FriendRow[];
  sent: FriendRow[];
  blocked: FriendRow[];
}
let view: PeopleView = { me: null, friends: [], received: [], sent: [], blocked: [] };
export const peopleView = () => view;
function setView(v: PeopleView) {
  view = v;
  window.dispatchEvent(new Event('pulse-people'));
}

/** Who I am (my @username), my friends and requests; and a channel to each friend. False when offline. */
export async function syncPeople(host: PeopleHost, leave: (l: FriendLink) => Promise<void>): Promise<boolean> {
  const s0 = host.state();
  if (!s0 || !loadSession()) return true;
  let keys = s0.user.keys;
  if (!keys) {
    const k = await newKeys();
    host.update((s) => {
      if (!s.user.keys) s.user.keys = k;
    });
    keys = host.state()?.user.keys ?? k;
  }
  const me = await peopleCall({ action: 'me', pub: keys.pub });
  if (!me) return false;
  if (me.status !== 200) return true;
  const m = me.data.me as PeopleView['me'] & {};
  if (s0.user.acct !== m.uid || s0.user.username !== m.u)
    host.update((s) => {
      s.user.acct = m.uid;
      s.user.username = m.u;
    });
  const list = await peopleCall({ action: 'list' });
  if (!list) return false;
  if (list.status !== 200) return true;
  const d = list.data as Omit<PeopleView, 'me'>;
  setView({ me: m, friends: d.friends ?? [], received: d.received ?? [], sent: d.sent ?? [], blocked: d.blocked ?? [] });
  const st = host.state();
  if (!st) return true;
  const links: Record<string, FriendLink | undefined> = {};
  for (const r of view.friends) {
    if (!r.pub) continue;
    const p = st.people.find((x) => x.acct === r.uid);
    if (p?.link && (p.link.via !== 'acct' || p.link.peer === (await fingerprint(r.pub)))) continue;
    links[r.uid] = (await pairLink(keys, m.uid, r.uid, r.pub, st.today)) ?? undefined;
  }
  let gone: FriendLink[] = [];
  host.update((s) => {
    gone = applyFriends(s, view.friends, links);
  });
  for (const l of gone) await leave(l);
  return true;
}

/** Do something with another person, then refresh. Returns the error to show, or ''. */
export async function act(action: string, uid: string, extra: Record<string, unknown> = {}): Promise<{ error: string; standing?: string }> {
  const r = await peopleCall({ action, uid, ...extra });
  if (!r) return { error: 'No connection. Try again.' };
  if (r.status !== 200) return { error: String(r.data.error ?? 'Something went wrong. Try again.') };
  return { error: '', standing: r.data.standing };
}
