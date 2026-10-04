// Friends on PULSE: two people who share their splits with each other.
//
// How it works, in one paragraph: an invite link carries a channel id and an encryption key. When
// the friend opens it, both phones know the key. From then on each phone publishes one sealed
// "box" to the channel: every split and settle-up it has recorded with the other person. Each phone
// reads the other's box and shows those entries as its own, marked as added by the friend. Nobody
// else has the key, so PULSE's server stores the boxes without being able to read them
// (netlify/lib/friends.ts). Only the text of the notification passes through the server in clear.
import type { FriendLink, ISODate, State } from '../types';
import { fromB64Url, toB64Url, utf8 } from './codec';
import { roundMoney } from './currency';
import { daysBetween, rupees } from './format';

// ---------------------------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------------------------
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/** A fresh channel for one friend. Nothing is shared until they open the invite. */
export function newLink(today: ISODate): FriendLink {
  return { chan: hex(rand(16)), key: toB64Url(rand(32)), token: toB64Url(rand(24)), status: 'invited', since: today };
}

export interface Invite {
  chan: string;
  key: string;
  /** Who sent it, to show on the accept screen. */
  name: string;
}

export const inviteCode = (l: Pick<FriendLink, 'chan' | 'key'>, myName: string) => `${l.chan}.${l.key}.${toB64Url(utf8(myName.trim().slice(0, 40)))}`;
/** The key sits after the #, which browsers never send to a server. */
export const inviteUrl = (l: Pick<FriendLink, 'chan' | 'key'>, myName: string) => `${location.origin}/#join=${inviteCode(l, myName)}`;

/** Accepts the whole link, the whole message it came in, or just the code. */
export function parseInvite(text: string): Invite | null {
  const m = text.match(/([0-9a-f]{32})\.([A-Za-z0-9_-]{43})(?:\.([A-Za-z0-9_-]{0,80}))?/);
  if (!m) return null;
  let name = '';
  try {
    name = new TextDecoder().decode(fromB64Url(m[3] ?? '')).replace(/\s+/g, ' ').trim().slice(0, 40);
  } catch {
    /* the name is only a courtesy */
  }
  return { chan: m[1], key: m[2], name };
}

const JOIN = 'pulse-join-v1';
/** An invite arriving in the address bar (#join=…). Kept aside until the person has finished setting up. */
export function takeJoinLink(): string | null {
  try {
    const m = location.hash.match(/^#join=(.+)$/);
    if (m) {
      history.replaceState(null, '', location.pathname + location.search);
      if (parseInvite(m[1])) localStorage.setItem(JOIN, m[1]);
    }
    return localStorage.getItem(JOIN);
  } catch {
    return null;
  }
}
export function clearJoinLink() {
  try {
    localStorage.removeItem(JOIN);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------------------------
// What each side shares
// ---------------------------------------------------------------------------------------------
export interface BoxItem {
  id: string;
  /** s = a split, p = a payment between the two (a settle-up). */
  k: 's' | 'p';
  /**
   * From the writer's side. Split: 'you' = you owe me, 'me' = I owe you.
   * Payment: 'me' = I paid you, 'you' = you paid me.
   */
  dir: 'you' | 'me';
  amt: number;
  date: ISODate;
  /** Splits: what it was for, the full bill, the category. */
  d?: string;
  t?: number;
  cat?: string;
}
export interface Box {
  v: 1;
  name: string;
  items: BoxItem[];
}

/** Everything this person has recorded with one friend. Entries that came from the friend are left out. */
export function buildBox(s: State, personId: string): Box {
  const items: BoxItem[] = [];
  for (const sp of s.splits) {
    if (sp.remote) continue;
    const theirs = sp.shares.find((x) => x.person === personId)?.amount ?? 0;
    const mine = sp.shares.find((x) => x.person === 'me')?.amount ?? 0;
    const base = { id: sp.id, k: 's' as const, date: sp.date, d: sp.description.slice(0, 80), t: roundMoney(sp.amount), cat: sp.category };
    if (sp.paidBy === 'me' && theirs > 0) items.push({ ...base, dir: 'you', amt: roundMoney(theirs) });
    else if (sp.paidBy === personId && mine > 0) items.push({ ...base, dir: 'me', amt: roundMoney(mine) });
  }
  for (const st of s.settlements) {
    if (st.remote) continue;
    if (st.from === 'me' && st.to === personId) items.push({ id: st.id, k: 'p', dir: 'me', amt: roundMoney(st.amount), date: st.date });
    else if (st.from === personId && st.to === 'me') items.push({ id: st.id, k: 'p', dir: 'you', amt: roundMoney(st.amount), date: st.date });
  }
  items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { v: 1, name: (s.user.fullName || s.user.name || 'Your friend').trim().slice(0, 40), items };
}

const remoteId = (chan: string, id: string) => `fr-${chan.slice(0, 10)}-${id}`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (x: unknown, max: number) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * Make this person's data match what a friend has published: their splits and settle-ups with me
 * become entries here, marked as theirs. Returns the entries that are new.
 *
 * When both of us wrote down the same thing (same direction, same amount, within three days), my own
 * entry stands and theirs is skipped, so the debt isn't counted twice.
 */
export function applyBox(s: State, personId: string, box: Box): BoxItem[] {
  const p = s.people.find((x) => x.id === personId);
  if (!p?.link) return [];
  const chan = p.link.chan;
  const hadSplits = new Set(s.splits.filter((x) => x.remote === chan).map((x) => x.id));
  const oldPays = new Map(s.settlements.filter((x) => x.remote === chan).map((x) => [x.id, x]));
  s.splits = s.splits.filter((x) => x.remote !== chan);
  s.settlements = s.settlements.filter((x) => x.remote !== chan);

  // What I recorded myself with this friend, to spot the same thing written down twice.
  const mine: { k: 's' | 'p'; toMe: boolean; amt: number; date: ISODate; used: boolean }[] = [];
  for (const sp of s.splits) {
    if (sp.remote) continue;
    const theirs = sp.shares.find((x) => x.person === personId)?.amount ?? 0;
    const my = sp.shares.find((x) => x.person === 'me')?.amount ?? 0;
    if (sp.paidBy === 'me' && theirs > 0) mine.push({ k: 's', toMe: true, amt: theirs, date: sp.date, used: false });
    else if (sp.paidBy === personId && my > 0) mine.push({ k: 's', toMe: false, amt: my, date: sp.date, used: false });
  }
  for (const st of s.settlements) {
    if (st.remote) continue;
    if (st.from === personId && st.to === 'me') mine.push({ k: 'p', toMe: true, amt: st.amount, date: st.date, used: false });
    else if (st.from === 'me' && st.to === personId) mine.push({ k: 'p', toMe: false, amt: st.amount, date: st.date, used: false });
  }
  const twin = (k: 's' | 'p', toMe: boolean, amt: number, date: ISODate) => {
    const m = mine.find((x) => !x.used && x.k === k && x.toMe === toMe && Math.abs(x.amt - amt) < 0.01 && Math.abs(daysBetween(x.date, date)) <= 3);
    if (m) m.used = true;
    return !!m;
  };

  const fresh: BoxItem[] = [];
  for (const it of (Array.isArray(box.items) ? box.items : []).slice(0, 3000)) {
    const amt = roundMoney(Number(it?.amt));
    const id = clip(it?.id, 60);
    if (!id || !(amt > 0) || !DATE.test(String(it.date))) continue;
    const rid = remoteId(chan, id);
    if (it.k === 's') {
      // Their "you owe me" is my "I owe them".
      const owedToMe = it.dir === 'me';
      if (twin('s', owedToMe, amt, it.date)) continue;
      const total = Math.max(amt, roundMoney(Number(it.t) || 0));
      const rest = roundMoney(total - amt);
      s.splits.push({
        id: rid,
        description: clip(it.d, 80) || 'Shared expense',
        amount: total,
        paidBy: owedToMe ? 'me' : personId,
        date: it.date,
        mode: 'exact',
        shares: owedToMe ? [{ person: personId, amount: amt }, { person: 'me', amount: rest }] : [{ person: 'me', amount: amt }, { person: personId, amount: rest }],
        category: s.categories.some((c) => c.id === it.cat && c.kind === 'expense') ? String(it.cat) : 'other',
        remote: chan,
      });
      if (!hadSplits.has(rid)) fresh.push({ ...it, amt });
    } else if (it.k === 'p') {
      // Their "I paid you" is money coming to me.
      const toMe = it.dir === 'me';
      if (twin('p', toMe, amt, it.date)) continue;
      const old = oldPays.get(rid);
      s.settlements.push({ id: rid, from: toMe ? personId : 'me', to: toMe ? 'me' : personId, amount: amt, date: it.date, remote: chan, ...(old?.banked ? { banked: true } : {}) });
      if (!old) fresh.push({ ...it, amt });
    }
  }
  p.link.status = 'linked';
  const name = clip(box.name, 40);
  if (name) p.link.theirName = name;
  return fresh;
}

/** One entry in words, from the point of view of the person reading it. `who` is the other person. */
export function describe(it: BoxItem, who: string): { title: string; body: string } {
  if (it.k === 's') return { title: `${who} added ${it.d || 'a split'}`, body: it.dir === 'you' ? `You owe ${who} ${rupees(it.amt)}.` : `${who} owes you ${rupees(it.amt)}.` };
  return it.dir === 'me' ? { title: `${who} settled up`, body: `${who} marked ${rupees(it.amt)} as paid to you.` } : { title: `${who} settled up`, body: `${who} marked your ${rupees(it.amt)} as received.` };
}
function summary(items: BoxItem[], who: string) {
  if (items.length === 1) return describe(items[0], who);
  return { title: `${who} shared ${items.length} splits and payments`, body: 'Open PULSE to see what you owe each other.' };
}

// ---------------------------------------------------------------------------------------------
// Sealing
// ---------------------------------------------------------------------------------------------
const keys = new Map<string, Promise<CryptoKey>>();
function aes(key: string) {
  let k = keys.get(key);
  if (!k) {
    k = crypto.subtle.importKey('raw', fromB64Url(key), 'AES-GCM', false, ['encrypt', 'decrypt']);
    keys.set(key, k);
  }
  return k;
}
export async function sealBox(key: string, box: Box): Promise<string> {
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(key), utf8(JSON.stringify(box))));
  return `f1.${toB64Url(iv)}.${toB64Url(ct)}`;
}
export async function openBox(key: string, data: string): Promise<Box | null> {
  try {
    const m = data.match(/^f1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64Url(m[1]) }, await aes(key), fromB64Url(m[2]));
    const box = JSON.parse(new TextDecoder().decode(plain)) as Box;
    return box && Array.isArray(box.items) ? box : null;
  } catch {
    return null; // not ours, or damaged: treated as nothing to read
  }
}

// ---------------------------------------------------------------------------------------------
// Talking to the server
// ---------------------------------------------------------------------------------------------
const ENDPOINT = '/api/friends';
type Reply = { status: number; data: Record<string, unknown> };

/** null = no connection, or this address has no friends server (a preview). */
async function api(body: Record<string, unknown>): Promise<Reply | null> {
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return null;
    return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return null;
  }
}

const cred = (l: FriendLink) => ({ chan: l.chan, token: l.token });

/** Open the channel for a new invite. False when offline. */
export async function createChannel(l: FriendLink, dev?: string): Promise<boolean> {
  const r = await api({ action: 'create', ...cred(l), dev });
  return !!r && r.status === 200;
}

export type JoinResult = { ok: true; link: FriendLink } | { ok: false; error: string };
/** Accept an invite: this phone takes the second seat on the channel. */
export async function joinChannel(inv: Invite, today: ISODate, dev?: string): Promise<JoinResult> {
  const link: FriendLink = { chan: inv.chan, key: inv.key, token: toB64Url(rand(24)), status: 'linked', since: today, theirName: inv.name || undefined };
  const r = await api({ action: 'join', ...cred(link), dev });
  if (!r) return { ok: false, error: 'No connection. Check your internet and try again.' };
  if (r.status !== 200) return { ok: false, error: String(r.data.error ?? 'This invite did not work. Ask for a new one.') };
  return { ok: true, link };
}

export async function leaveChannel(l: FriendLink) {
  await api({ action: 'leave', ...cred(l) });
}

// ---------------------------------------------------------------------------------------------
// This device's notes: which version of each friend's box it has applied, and what is new to show
// ---------------------------------------------------------------------------------------------
const BOOK = 'pulse-friends-v1';
export interface FriendNews {
  person: string;
  title: string;
  body: string;
  at: string;
}
interface Book {
  seen: Record<string, number>;
  news: FriendNews[];
}
function book(): Book {
  try {
    const b = JSON.parse(localStorage.getItem(BOOK) ?? 'null') as Book | null;
    if (b && b.seen && Array.isArray(b.news)) return b;
  } catch {
    /* ignore */
  }
  return { seen: {}, news: [] };
}
function saveBook(b: Book) {
  try {
    localStorage.setItem(BOOK, JSON.stringify(b));
    window.dispatchEvent(new Event('pulse-friends'));
  } catch {
    /* ignore */
  }
}
export const friendNews = (): FriendNews[] => book().news;
export function clearFriendNews() {
  saveBook({ ...book(), news: [] });
}

// ---------------------------------------------------------------------------------------------
// Keeping both phones in step
// ---------------------------------------------------------------------------------------------
export interface FriendHost {
  /** The person's own data right now (null in the demo). */
  state(): State | null;
  /** Put a friend's box into the data. Returns what was new. */
  apply(personId: string, box: Box): BoxItem[];
  /** The friend opened the invite but hasn't shared anything yet. */
  joined(personId: string): void;
  /** The friend disconnected. */
  left(personId: string): void;
  toast(text: string): void;
  /** This device's id for notifications, when reminders are on. */
  dev(): string | undefined;
}

let running: Promise<void> | null = null;

/** Read every connected friend's box, then publish mine if it changed. Safe to call often. */
export function syncFriends(host: FriendHost): Promise<void> {
  if (running) return running;
  running = run(host).finally(() => {
    running = null;
  });
  return running;
}

async function run(host: FriendHost) {
  const first = host.state();
  if (!first || !navigator.onLine) return;
  const dev = host.dev();
  for (const person of first.people.filter((p) => p.link)) {
    const link = person.link!;
    let r = await api({ action: 'get', ...cred(link), dev });
    if (!r) return; // offline: try again later
    if (r.status === 403 && link.status === 'invited') {
      // The invite was made offline, so its channel was never opened. Open it now.
      if (!(await createChannel(link, dev))) continue;
      r = await api({ action: 'get', ...cred(link), dev });
      if (!r) return;
    }
    if (r.status === 403) {
      host.left(person.id); // the channel is gone: both sides disconnected
      continue;
    }
    if (r.status !== 200) continue;
    const mine = r.data.mine as { box: string; rev: number };
    const theirs = r.data.theirs as { box: string; rev: number; gone: boolean } | null;
    if (theirs?.gone) {
      host.left(person.id);
      await leaveChannel(link);
      host.toast(`${person.short} disconnected on PULSE. What you shared stays in your history.`);
      continue;
    }

    // 1. Their side.
    const b = book();
    if (theirs && theirs.box && b.seen[link.chan] !== theirs.rev) {
      const box = await openBox(link.key, theirs.box);
      if (box) {
        const firstTime = b.seen[link.chan] === undefined;
        if (link.status === 'invited') host.toast(`${person.short} is now connected on PULSE.`);
        const fresh = host.apply(person.id, box);
        const now = book();
        now.seen[link.chan] = theirs.rev;
        if (fresh.length) {
          const s = firstTime && fresh.length > 1 ? summary(fresh, person.short) : null;
          const lines = s ? [s] : fresh.slice(0, 5).map((it) => describe(it, person.short));
          now.news = [...lines.map((l) => ({ person: person.id, ...l, at: new Date().toISOString() })), ...now.news].slice(0, 12);
          host.toast(`${lines[0].title}. ${lines[0].body}`);
        }
        saveBook(now);
      }
    } else if (theirs && link.status === 'invited') {
      host.joined(person.id);
      host.toast(`${person.short} is now connected on PULSE.`);
    }

    // 2. My side: publish when what I've recorded with them has changed.
    const state = host.state();
    if (!state || !state.people.some((p) => p.id === person.id && p.link)) continue;
    const box = buildBox(state, person.id);
    const prev = mine.box ? await openBox(link.key, mine.box) : null;
    if (prev && JSON.stringify(prev) === JSON.stringify(box)) continue;
    const had = new Set((prev?.items ?? []).map((i) => i.id));
    const added = box.items.filter((i) => !had.has(i.id));
    const me = state.user.name || box.name;
    // Only a new entry is worth a notification, and only once the friend is there to get it.
    const notify = theirs && added.length ? summary(added, me) : undefined;
    await api({ action: 'put', ...cred(link), box: await sealBox(link.key, box), dev, notify });
  }
}
