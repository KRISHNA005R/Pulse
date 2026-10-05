// Friends on PULSE: people who share their splits with each other.
//
// How it works, in one paragraph: an invite link carries a channel id and an encryption key. When
// the friend opens it, both phones know the key. From then on each phone publishes one sealed
// "box" to the channel: every split and settle-up it has recorded with the other person. Each phone
// reads the other's box and shows those entries as its own, marked as added by the friend. Nobody
// else has the key, so PULSE's server stores the boxes without being able to read them
// (netlify/lib/friends.ts). Only the text of the notification passes through the server in clear.
//
// Three kinds of link, all built on that:
//   #join=…   an invite for one friend (the two-person channel above)
//   #hi=…     a personal link, the same for everybody: whoever opens it starts a two-person channel
//             and leaves a sealed note saying which; the owner's phone picks it up and joins
//   #group=…  a shared group: everyone who opens it becomes a member, publishes their own box of
//             group expenses, and reads everyone else's
import type { Door, FriendLink, Group, GroupShare, ISODate, Person, Settlement, SplitExpense, State } from '../types';
import { fromB64Url, toB64Url, utf8 } from './codec';
import { roundMoney } from './currency';
import { daysBetween, rupees } from './format';
import { okFace, okGif } from './photo';

// ---------------------------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------------------------
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/** The id other people's apps know this person by. */
export const newUid = () => hex(rand(16));

/** A fresh channel for one friend. Nothing is shared until they open the invite. */
export function newLink(today: ISODate): FriendLink {
  return { chan: hex(rand(16)), key: toB64Url(rand(32)), token: toB64Url(rand(24)), status: 'invited', since: today };
}

export interface Invite {
  /** pair = one friend's invite, door = someone's personal link, group = a shared group. */
  kind: 'pair' | 'door' | 'group';
  /** The channel, the personal link's id, or the group's id. */
  chan: string;
  key: string;
  /** Who sent it (or the group's name), to show on the accept screen. */
  name: string;
}

const label = (name: string) => toB64Url(utf8(name.replace(/\s+/g, ' ').trim().slice(0, 40)));
export const inviteCode = (l: Pick<FriendLink, 'chan' | 'key'>, myName: string) => `${l.chan}.${l.key}.${label(myName)}`;
/** The key sits after the #, which browsers never send to a server. */
export const inviteUrl = (l: Pick<FriendLink, 'chan' | 'key'>, myName: string) => `${location.origin}/#join=${inviteCode(l, myName)}`;
/** A personal link: the same one for everybody. */
export const doorUrl = (d: Door, myName: string) => `${location.origin}/#hi=${d.id}.${d.key}.${label(myName)}`;
/** A shared group's link: everyone who opens it joins the group. */
export const groupUrl = (g: Group) => (g.shared ? `${location.origin}/#group=${g.shared.gid}.${g.shared.key}.${label(g.name)}` : '');

/** Accepts the whole link, the whole message it came in, or just the code. */
export function parseInvite(text: string): Invite | null {
  const m = text.match(/(?:(join|hi|group)=)?([0-9a-f]{32})\.([A-Za-z0-9_-]{43})(?:\.([A-Za-z0-9_-]{0,160}))?/);
  if (!m) return null;
  let name = '';
  try {
    name = new TextDecoder().decode(fromB64Url(m[4] ?? '')).replace(/\s+/g, ' ').trim().slice(0, 40);
  } catch {
    /* the name is only a courtesy */
  }
  return { kind: m[1] === 'hi' ? 'door' : m[1] === 'group' ? 'group' : 'pair', chan: m[2], key: m[3], name };
}

const JOIN = 'pulse-join-v1';
/** A link arriving in the address bar (#join=…, #hi=…, #group=…). Kept aside until the person has finished setting up. */
export function takeJoinLink(): string | null {
  try {
    const m = location.hash.match(/^#((?:join|hi|group)=.+)$/);
    if (m) {
      history.replaceState(history.state, '', location.pathname + location.search);
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
  /** The writer's PULSE id, so the same friend met in a group isn't listed twice. */
  uid?: string;
  /** The writer's profile photo (the small copy), if they have one. */
  face?: string;
  /** The id of the writer's GIF, when their photo is one. */
  gif?: string;
  items: BoxItem[];
}

const MID = /^[0-9a-f]{16}$/;
const UID = /^[0-9a-f]{32}$/;
/** The member id this person joined a shared group with, if they did. */
function memberRef(sh: GroupShare, personId: string, activeOnly = false): string {
  const mids = Object.keys(sh.refs).filter((r) => sh.refs[r] === personId && MID.test(r) && (!activeOnly || sh.on.includes(r)));
  return mids.sort((a, b) => Number(sh.on.includes(b)) - Number(sh.on.includes(a)) || (a < b ? -1 : 1))[0] ?? '';
}

/** A split in a shared group that this friend has joined reaches them through the group, not through the two-person channel. */
function viaGroup(s: State, sp: { group?: string }, personId: string) {
  const g = sp.group ? s.groups.find((x) => x.id === sp.group) : undefined;
  return !!g?.shared && !!memberRef(g.shared, personId);
}

/**
 * Where a settle-up I recorded is shared: 'pair' (the two-person channel with that friend), a group's
 * id (everyone in that shared group sees it), or '' (it stays on this phone).
 */
export function shareRoute(s: State, st: Settlement): string {
  if (st.remote) return '';
  const g = st.group ? s.groups.find((x) => x.id === st.group) : undefined;
  if (g?.shared) return g.id;
  const other = st.from === 'me' ? st.to : st.to === 'me' ? st.from : '';
  if (!other) return '';
  if (s.people.find((p) => p.id === other)?.link) return 'pair';
  // Not connected one-to-one: it goes through the first shared group the two of us are in.
  const via = s.groups.filter((x) => x.shared && memberRef(x.shared, other, true)).sort((a, b) => (a.shared!.gid < b.shared!.gid ? -1 : 1))[0];
  return via ? via.id : '';
}

/** Everything this person has recorded with one friend. Entries that came from the friend are left out. */
export function buildBox(s: State, personId: string): Box {
  const items: BoxItem[] = [];
  for (const sp of s.splits) {
    if (sp.remote || viaGroup(s, sp, personId)) continue;
    const theirs = sp.shares.find((x) => x.person === personId)?.amount ?? 0;
    const mine = sp.shares.find((x) => x.person === 'me')?.amount ?? 0;
    const base = { id: sp.id, k: 's' as const, date: sp.date, d: sp.description.slice(0, 80), t: roundMoney(sp.amount), cat: sp.category };
    if (sp.paidBy === 'me' && theirs > 0) items.push({ ...base, dir: 'you', amt: roundMoney(theirs) });
    else if (sp.paidBy === personId && mine > 0) items.push({ ...base, dir: 'me', amt: roundMoney(mine) });
  }
  for (const st of s.settlements) {
    if (shareRoute(s, st) !== 'pair') continue;
    if (st.from === 'me' && st.to === personId) items.push({ id: st.id, k: 'p', dir: 'me', amt: roundMoney(st.amount), date: st.date });
    else if (st.from === personId && st.to === 'me') items.push({ id: st.id, k: 'p', dir: 'you', amt: roundMoney(st.amount), date: st.date });
  }
  items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { v: 1, name: myName(s), ...(s.user.uid ? { uid: s.user.uid } : {}), ...myFace(s), items };
}

const myName = (s: State) => (s.user.fullName || s.user.name || 'Your friend').trim().slice(0, 40);
/** My photo for friends (and its GIF, if it is one). An empty one says "I have none", so it comes off their phones too. */
const myFace = (s: State) => ({ face: okFace(s.user.face) ? s.user.face : '', gif: okFace(s.user.face) && okGif(s.user.gif) ? s.user.gif : '' });
/**
 * A friend's photo follows what their own PULSE says: shown when they have one, gone when they take
 * it off. A box that says nothing about a photo was written by an older PULSE (say, their other
 * phone that hasn't updated yet): it changes nothing.
 */
function setFace(p: Person, box: { face?: unknown; gif?: unknown }) {
  if (okFace(box.face)) p.photo = box.face;
  else if (box.face === '') delete p.photo;
  if (okGif(box.gif)) p.gif = box.gif;
  else if (box.gif === '' || box.face === '') delete p.gif;
}
const myShort = (s: State) => (s.user.name || myName(s).split(' ')[0]).trim().slice(0, 24);

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
    if (sp.remote || viaGroup(s, sp, personId)) continue;
    const theirs = sp.shares.find((x) => x.person === personId)?.amount ?? 0;
    const my = sp.shares.find((x) => x.person === 'me')?.amount ?? 0;
    if (sp.paidBy === 'me' && theirs > 0) mine.push({ k: 's', toMe: true, amt: theirs, date: sp.date, used: false });
    else if (sp.paidBy === personId && my > 0) mine.push({ k: 's', toMe: false, amt: my, date: sp.date, used: false });
  }
  for (const st of s.settlements) {
    if (shareRoute(s, st) !== 'pair') continue;
    if (st.from === personId && st.to === 'me') mine.push({ k: 'p', toMe: true, amt: st.amount, date: st.date, used: false });
    else if (st.from === 'me' && st.to === personId) mine.push({ k: 'p', toMe: false, amt: st.amount, date: st.date, used: false });
  }
  const twin = (k: 's' | 'p', toMe: boolean, amt: number, date: ISODate) => {
    const m = mine.find((x) => !x.used && x.k === k && x.toMe === toMe && Math.abs(x.amt - amt) < 0.01 && Math.abs(daysBetween(x.date, date)) <= 3);
    if (m) m.used = true;
    return !!m;
  };

  // An entry that already arrived through a shared group isn't taken a second time from here.
  const grouped = new Set<string>();
  for (const x of [...s.splits, ...s.settlements]) if (x.remote && x.id.startsWith('gr-')) grouped.add(x.id.split('-').slice(3).join('-'));

  const fresh: BoxItem[] = [];
  for (const it of (Array.isArray(box.items) ? box.items : []).slice(0, 3000)) {
    const amt = roundMoney(Number(it?.amt));
    const id = clip(it?.id, 60);
    if (!id || !(amt > 0) || !DATE.test(String(it.date)) || grouped.has(id)) continue;
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
  setFace(p, box);
  // The same friend may already be here from a shared group: keep one of them.
  if (typeof box.uid === 'string' && UID.test(box.uid)) {
    for (const twinP of s.people.filter((x) => x.uid === box.uid && x.id !== personId && !x.link)) mergePeople(s, twinP.id, personId);
    p.uid = box.uid;
  }
  return fresh;
}

/** Two names in the list are the same person: everything recorded with `fromId` moves to `intoId`. */
export function mergePeople(s: State, fromId: string, intoId: string) {
  const from = s.people.find((p) => p.id === fromId);
  const into = s.people.find((p) => p.id === intoId);
  if (!from || !into || fromId === intoId) return;
  const sw = (id: string) => (id === fromId ? intoId : id);
  for (const sp of s.splits) {
    sp.paidBy = sw(sp.paidBy);
    if (!sp.shares.some((x) => x.person === fromId)) continue;
    const shares: SplitExpense['shares'] = [];
    for (const x of sp.shares) {
      const person = sw(x.person);
      const had = shares.find((y) => y.person === person);
      if (had) had.amount = roundMoney(had.amount + x.amount);
      else shares.push({ person, amount: x.amount });
    }
    sp.shares = shares;
  }
  for (const st of s.settlements) {
    st.from = sw(st.from);
    st.to = sw(st.to);
  }
  s.settlements = s.settlements.filter((st) => st.from !== st.to);
  for (const g of s.groups) {
    // In a shared group, other phones may still use my hand-typed name for this person: keep it pointing at them.
    if (g.shared && g.members.includes(fromId) && !Object.values(g.shared.refs).includes(fromId)) g.shared.refs[`${g.shared.mid}.${fromId}`] = fromId;
    g.members = [...new Set(g.members.map(sw))];
    if (g.shared) for (const r of Object.keys(g.shared.refs)) g.shared.refs[r] = sw(g.shared.refs[r]);
  }
  for (const tx of s.transactions) if (tx.people?.includes(fromId)) tx.people = [...new Set(tx.people.map(sw))];
  if (!into.link && from.link) into.link = from.link;
  if (!into.uid && from.uid) into.uid = from.uid;
  if (!into.photo && from.photo) {
    into.photo = from.photo;
    if (from.gif) into.gif = from.gif;
  }
  s.people = s.people.filter((p) => p.id !== fromId);
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
async function seal(key: string, what: unknown): Promise<string> {
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(key), utf8(JSON.stringify(what))));
  return `f1.${toB64Url(iv)}.${toB64Url(ct)}`;
}
async function unseal<T>(key: string, data: string): Promise<T | null> {
  try {
    const m = data.match(/^f1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64Url(m[1]) }, await aes(key), fromB64Url(m[2]));
    const x = JSON.parse(new TextDecoder().decode(plain)) as T;
    return x && typeof x === 'object' ? x : null;
  } catch {
    return null; // not ours, or damaged: treated as nothing to read
  }
}
export const sealBox = (key: string, box: Box) => seal(key, box);
export async function openBox(key: string, data: string): Promise<Box | null> {
  const box = await unseal<Box>(key, data);
  return box && Array.isArray(box.items) ? box : null;
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

export type JoinResult = { ok: true; link: FriendLink } | { ok: false; error: string; offline?: boolean };
const OFFLINE = 'No connection. Check your internet and try again.';
/** Accept an invite: this phone takes the second seat on the channel. */
export async function joinChannel(inv: Invite, today: ISODate, dev?: string): Promise<JoinResult> {
  const link: FriendLink = { chan: inv.chan, key: inv.key, token: toB64Url(rand(24)), status: 'linked', since: today, theirName: inv.name || undefined };
  const r = await api({ action: 'join', ...cred(link), dev });
  if (!r) return { ok: false, error: OFFLINE, offline: true };
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
  /** Set when it happened in a shared group: tapping it opens the group. */
  group?: string;
  title: string;
  body: string;
  at: string;
}
interface Book {
  /** The version of each friend's box (a number), or of each group as a whole (a string), this phone has applied. */
  seen: Record<string, number | string>;
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
  /** Someone opened my personal link and is now connected. Returns the person they became here. */
  knocked(name: string, link: FriendLink, uid?: string): string;
  /** Put what the other members of a shared group have published into the data. Returns what was new. */
  applyGroup(groupId: string, view: GroupView): GroupNews[];
  /** I'm no longer in this shared group (taken out, or it's gone): it becomes an ordinary group here. */
  groupLeft(groupId: string): void;
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
  if (first.user.door && !(await readDoor(host, first.user.door, dev))) return;
  for (const g of (host.state()?.groups ?? []).filter((x) => x.shared)) if (!(await syncGroup(host, g.id, dev))) return;
  for (const person of (host.state()?.people ?? []).filter((p) => p.link)) {
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

// ---------------------------------------------------------------------------------------------
// Personal links: one link for everybody
// ---------------------------------------------------------------------------------------------
export const newDoor = (): Door => ({ id: hex(rand(16)), key: toB64Url(rand(32)), token: toB64Url(rand(24)) });

/** Switch the link on. False when offline (it is switched on at the next sync instead). */
export async function openDoor(d: Door, dev?: string): Promise<boolean> {
  const r = await api({ action: 'door-open', door: d.id, token: d.token, dev });
  return !!r && r.status === 200;
}
/** The link stops working. People already connected stay connected. */
export async function closeDoor(d: Door) {
  await api({ action: 'door-close', door: d.id, token: d.token });
}

/** What someone who opens a personal link leaves for its owner, sealed with the link's key. */
interface Knock {
  v: 1;
  chan: string;
  key: string;
  name: string;
  uid?: string;
}

/**
 * Open someone's personal link: make a channel for the two of us and leave them a note saying which.
 * The connection is complete as soon as their phone picks the note up.
 */
export async function knock(inv: Invite, s: State, dev?: string): Promise<JoinResult> {
  const link: FriendLink = { ...newLink(s.today), door: inv.chan, theirName: inv.name || undefined };
  if (!(await createChannel(link, dev))) return { ok: false, error: OFFLINE, offline: true };
  const note: Knock = { v: 1, chan: link.chan, key: link.key, name: myName(s), uid: s.user.uid };
  const r = await api({ action: 'door-knock', door: inv.chan, box: await seal(inv.key, note), notify: { title: `${myShort(s)} connected with you on PULSE`, body: 'What you split with each other now shows up in both apps.' } });
  if (!r || r.status !== 200) {
    void leaveChannel(link);
    return r ? { ok: false, error: String(r.data.error ?? 'This link did not work. Ask for a new one.') } : { ok: false, error: OFFLINE, offline: true };
  }
  return { ok: true, link };
}

/**
 * Someone opened my link: they become a person here, connected. Someone who was here before (same
 * PULSE id) takes their old place, and what the old connection brought stays as ordinary history.
 */
export function acceptKnock(s: State, name: string, link: FriendLink, uid: string | undefined, newId: string): string {
  let p = uid ? s.people.find((x) => x.uid === uid) : undefined;
  if (p?.link) {
    const chan = p.link.chan;
    for (const x of s.splits) if (x.remote === chan) delete x.remote;
    for (const x of s.settlements) if (x.remote === chan) delete x.remote;
  }
  if (!p) {
    const clean = name.trim() || 'Friend';
    s.people.push({ id: newId, name: clean, short: clean.split(' ')[0], hue: hueOf(link.chan) });
    p = s.people[s.people.length - 1];
  }
  p.link = link;
  if (uid) p.uid = uid;
  return p.id;
}

/** The owner's side: connect with everyone who has opened my link since last time. False when offline. */
async function readDoor(host: FriendHost, door: Door, dev?: string): Promise<boolean> {
  const r = await api({ action: 'door-read', door: door.id, token: door.token, dev });
  if (!r) return false;
  if (r.status === 404) return !!(await api({ action: 'door-open', door: door.id, token: door.token, dev })); // made while offline
  if (r.status !== 200) return true;
  const notes = (Array.isArray(r.data.notes) ? r.data.notes : []) as { n: string; box: string }[];
  const done: string[] = [];
  for (const note of notes.slice(0, 20)) {
    const k = await unseal<Knock>(door.key, String(note.box));
    const s = host.state();
    if (!s) break;
    done.push(note.n);
    if (!k || !/^[0-9a-f]{32}$/.test(String(k.chan)) || !/^[A-Za-z0-9_-]{43}$/.test(String(k.key))) continue;
    if (s.people.some((p) => p.link?.chan === k.chan)) continue;
    const name = clip(k.name, 40) || 'Friend';
    const uid = typeof k.uid === 'string' && UID.test(k.uid) ? k.uid : undefined;
    const res = await joinChannel({ kind: 'pair', chan: k.chan, key: k.key, name }, s.today, dev);
    if (!res.ok) {
      if (res.offline) {
        done.pop();
        break;
      }
      continue;
    }
    // Someone who connected before and comes back takes their old place; the old channel is dropped.
    const old = uid ? s.people.find((p) => p.uid === uid)?.link : undefined;
    if (old) void leaveChannel(old);
    const id = host.knocked(name, res.link, uid);
    const short = host.state()?.people.find((p) => p.id === id)?.short ?? name.split(' ')[0];
    const b = book();
    b.news = [{ person: id, title: `${short} connected with you`, body: 'They opened your PULSE link. Split something with them.', at: new Date().toISOString() }, ...b.news].slice(0, 12);
    saveBook(b);
    host.toast(`${short} connected with you on PULSE.`);
  }
  if (done.length) await api({ action: 'door-clear', door: door.id, token: door.token, ns: done });
  return true;
}

// ---------------------------------------------------------------------------------------------
// Shared groups
//
// Every member publishes one box: the group expenses and settle-ups they recorded. Inside a box,
// people are named by "refs", because each phone has its own list of people:
//   <member id>                    someone who joined with the link
//   <member id>.<their person id>  a name that member typed by hand (someone not on PULSE yet)
// When a person joins and says "that name is me" (a claim), every phone folds the two together.
// ---------------------------------------------------------------------------------------------
export interface GroupBox {
  v: 1;
  uid: string;
  name: string;
  /** The writer's profile photo (the small copy), if they have one. */
  face?: string;
  /** The id of the writer's GIF, when their photo is one. */
  gif?: string;
  /** The group's title. The one from the person who made the group is used. */
  g: { name: string; emoji: string };
  /** A hand-typed name (a ref) that is really me. */
  claim?: string;
  /** Hand-typed names: the ones this member typed, and any others this box mentions. */
  ghosts: { id: string; name: string }[];
  /** "That name I typed is this member": [hand-typed name, member id]. Only its writer may say so. */
  also?: [string, string][];
  items: { id: string; d: string; t: number; date: ISODate; cat: string; by: string; sh: [string, number][] }[];
  /** `out` = a settle-up recorded outside the group, between the writer and one member. */
  pays: { id: string; from: string; to: string; a: number; date: ISODate; out?: 1 }[];
}
export interface MemberView {
  mid: string;
  box: GroupBox | null;
  gone: boolean;
  owner: boolean;
}
export interface GroupView {
  closed: boolean;
  members: MemberView[];
}
export interface GroupNews {
  person: string;
  group: string;
  title: string;
  body: string;
}

const GHOST = /^[0-9a-f]{16}\.[A-Za-z0-9_-]{1,40}$/;
const hueOf = (hexId: string) => parseInt(hexId.slice(0, 6), 16) % 360;

/** A new shared group's keys. Nothing is shared until the first sync. */
export function newShare(today: ISODate): GroupShare {
  return { gid: hex(rand(16)), key: toB64Url(rand(32)), mid: hex(rand(8)), token: toB64Url(rand(24)), owner: true, refs: {}, on: [], since: today };
}

/** How this phone names a person inside the group's boxes. */
function refOf(sh: GroupShare, personId: string): string {
  if (personId === 'me') return sh.mid;
  const mid = memberRef(sh, personId);
  if (mid) return mid;
  const ghosts = Object.keys(sh.refs).filter((r) => sh.refs[r] === personId && GHOST.test(r)).sort();
  return ghosts[0] ?? `${sh.mid}.${personId}`;
}

/** Everything I've recorded in a shared group, plus the settle-ups that travel through it. */
export function buildGroupBox(s: State, group: Group): GroupBox {
  const sh = group.shared!;
  const ghosts = new Map<string, string>();
  const ref = (pid: string) => {
    const r = refOf(sh, pid);
    if (!MID.test(r)) ghosts.set(r, s.people.find((p) => p.id === pid)?.name ?? 'Friend');
    return r;
  };
  const items: GroupBox['items'] = [];
  for (const sp of s.splits) {
    if (sp.remote || sp.group !== group.id) continue;
    items.push({ id: sp.id, d: sp.description.slice(0, 80), t: roundMoney(sp.amount), date: sp.date, cat: sp.category, by: ref(sp.paidBy), sh: sp.shares.map((x) => [ref(x.person), roundMoney(x.amount)]) });
  }
  const pays: GroupBox['pays'] = [];
  for (const st of s.settlements) {
    if (shareRoute(s, st) !== group.id) continue;
    pays.push({ id: st.id, from: ref(st.from), to: ref(st.to), a: roundMoney(st.amount), date: st.date, ...(st.group === group.id ? {} : { out: 1 as const }) });
  }
  // People I added by hand are listed even before they're in an expense, so they can be claimed.
  for (const pid of group.members) if (pid !== 'me' && s.people.some((p) => p.id === pid) && refOf(sh, pid).startsWith(`${sh.mid}.`)) ref(pid);
  const also: [string, string][] = [];
  for (const r of Object.keys(sh.refs).sort()) {
    const mid = GHOST.test(r) && r.startsWith(`${sh.mid}.`) ? memberRef(sh, sh.refs[r]) : '';
    if (mid) also.push([r, mid]);
  }
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    v: 1,
    uid: s.user.uid ?? '',
    name: myName(s),
    ...myFace(s),
    g: { name: group.name.slice(0, 40), emoji: group.emoji },
    ...(sh.claim ? { claim: sh.claim } : {}),
    ...(also.length ? { also } : {}),
    ghosts: [...ghosts].map(([id, name]) => ({ id, name: name.slice(0, 40) })).sort(byId),
    items: items.sort(byId),
    pays: pays.sort(byId),
  };
}

/** Whose phone a mirrored group entry came from. */
export function authorOf(s: State, group: Group, entryId: string): Person | undefined {
  const sh = group.shared;
  const m = entryId.match(/^gr-[0-9a-f]{8}-([0-9a-f]{6})-/);
  if (!sh || !m) return undefined;
  const mid = Object.keys(sh.refs).find((r) => MID.test(r) && r.startsWith(m[1]));
  return mid ? s.people.find((p) => p.id === sh.refs[mid]) : undefined;
}

/**
 * Make this person's copy of a shared group match what the other members have published: who is in
 * it, and every expense and settle-up they recorded (marked as theirs). Returns what is new.
 */
export function applyGroup(s: State, groupId: string, view: GroupView): GroupNews[] {
  const group = s.groups.find((g) => g.id === groupId);
  const sh = group?.shared;
  if (!group || !sh) return [];
  const gid = sh.gid;
  if (view.closed) sh.closed = true;
  else delete sh.closed;
  const others = view.members.filter((m): m is MemberView & { box: GroupBox } => m.mid !== sh.mid && MID.test(m.mid) && !!m.box && typeof m.box === 'object');
  const person = (id: string | undefined) => (id ? s.people.find((p) => p.id === id) : undefined);
  const news: GroupNews[] = [];

  // 1. Who is who. A hand-typed name that someone has claimed is that member from now on.
  const claimedBy = new Map<string, string>();
  for (const m of others) if (typeof m.box.claim === 'string' && GHOST.test(m.box.claim)) claimedBy.set(m.box.claim, m.mid);
  if (sh.claim) claimedBy.set(sh.claim, sh.mid);
  for (const m of others) {
    const uid = UID.test(String(m.box.uid)) ? m.box.uid : '';
    let p = person(sh.refs[m.mid]);
    const known = !!p;
    if (!p) {
      const byUid = uid ? s.people.find((x) => x.uid === uid) : undefined;
      const claim = claimedBy.get(String(m.box.claim)) === m.mid ? String(m.box.claim) : '';
      const ghost = claim ? (claim.startsWith(`${sh.mid}.`) ? person(claim.slice(17)) : person(sh.refs[claim])) : undefined;
      if (ghost && byUid && ghost.id !== byUid.id && !(ghost.link && byUid.link)) {
        mergePeople(s, ghost.id, byUid.id);
        p = byUid;
      } else p = ghost ?? byUid;
    }
    if (!p) {
      const name = clip(m.box.name, 40) || 'Friend';
      const id = `pu-${(uid || m.mid).slice(0, 16)}`;
      p = person(id);
      if (!p) {
        s.people.push({ id, name, short: name.split(' ')[0], hue: hueOf(uid || m.mid) });
        p = s.people[s.people.length - 1];
      }
    }
    if (uid && !p.uid) p.uid = uid;
    // Someone who left stopped updating this group, so what it says about their photo may be old.
    if (!m.gone) setFace(p, m.box);
    sh.refs[m.mid] = p.id;
    if (!known && !m.gone) news.push({ person: p.id, group: group.id, title: `${p.short} joined ${group.name}`, body: 'They see the group’s expenses and can add their own.' });
  }
  // The writer of a hand-typed name can also say who it is (they merged the two names on their phone).
  for (const m of others) {
    for (const pair of Array.isArray(m.box.also) ? m.box.also.slice(0, 60) : []) {
      const ghost = String(pair?.[0]);
      const mid = String(pair?.[1]);
      if (GHOST.test(ghost) && ghost.startsWith(`${m.mid}.`) && MID.test(mid) && !claimedBy.has(ghost)) claimedBy.set(ghost, mid);
    }
  }
  // Wherever a hand-typed name is a separate person here, fold it into the member it turned out to be.
  for (const [ghost, mid] of claimedBy) {
    const target = mid === sh.mid ? undefined : person(sh.refs[mid]);
    const typed = ghost.startsWith(`${sh.mid}.`) ? person(ghost.slice(17)) : person(sh.refs[ghost]);
    if (target && typed && typed.id !== target.id && !(typed.link && target.link)) mergePeople(s, typed.id, target.id);
  }

  // 2. Names other members typed by hand.
  for (const m of others) {
    for (const gh of Array.isArray(m.box.ghosts) ? m.box.ghosts.slice(0, 60) : []) {
      const id = String(gh?.id ?? '');
      if (!GHOST.test(id) || claimedBy.has(id) || id.startsWith(`${sh.mid}.`) || person(sh.refs[id])) continue;
      const pid = `pg-${id.slice(0, 8)}-${id.slice(17)}`;
      const name = clip(gh.name, 40) || 'Friend';
      if (!person(pid)) s.people.push({ id: pid, name, short: name.split(' ')[0], hue: hueOf(id) });
      sh.refs[id] = pid;
    }
  }

  const resolve = (ref: string): string | null => {
    if (ref === sh.mid) return 'me';
    const c = claimedBy.get(ref);
    if (c) return c === sh.mid ? 'me' : (person(sh.refs[c])?.id ?? null);
    if (person(sh.refs[ref])) return sh.refs[ref];
    if (ref.startsWith(`${sh.mid}.`)) return person(ref.slice(17))?.id ?? null;
    return null;
  };
  const short = (id: string) => (id === 'me' ? 'you' : (person(id)?.short ?? 'someone'));

  // 3. Their entries become entries here.
  const had = new Set(s.splits.filter((x) => x.remote === gid).map((x) => x.id));
  const oldPays = new Map(s.settlements.filter((x) => x.remote === gid).map((x) => [x.id, x]));
  s.splits = s.splits.filter((x) => x.remote !== gid);
  s.settlements = s.settlements.filter((x) => x.remote !== gid);
  // The same payment written down by both people involved counts once.
  const paid: { from: string; to: string; amt: number; date: ISODate; by: string; used: boolean }[] = s.settlements
    .filter((st) => !st.remote && (st.from === 'me' || st.to === 'me'))
    .map((st) => ({ from: st.from, to: st.to, amt: st.amount, date: st.date, by: sh.mid, used: false }));
  const rid = (mid: string, id: string) => `gr-${gid.slice(0, 8)}-${mid.slice(0, 6)}-${id}`;
  // The same entry may have come earlier through the two-person channel with its writer: the group's copy replaces it.
  const twice = new Set<string>();

  for (const m of others) {
    const who = person(sh.refs[m.mid])?.short ?? 'Someone';
    const chan = person(sh.refs[m.mid])?.link?.chan;
    for (const it of Array.isArray(m.box.items) ? m.box.items.slice(0, 2000) : []) {
      const id = clip(it?.id, 60);
      const total = roundMoney(Number(it?.t));
      const by = resolve(String(it?.by));
      if (!id || !(total > 0) || !DATE.test(String(it.date)) || !by) continue;
      if (chan) twice.add(remoteId(chan, id));
      const shares: SplitExpense['shares'] = [];
      let ok = Array.isArray(it.sh) && it.sh.length > 0 && it.sh.length <= 40;
      for (const pair of ok ? it.sh : []) {
        const pid = resolve(String(pair?.[0]));
        const amt = roundMoney(Number(pair?.[1]));
        if (!pid || !(amt >= 0)) {
          ok = false;
          break;
        }
        const same = shares.find((x) => x.person === pid);
        if (same) same.amount = roundMoney(same.amount + amt);
        else shares.push({ person: pid, amount: amt });
      }
      if (!ok) continue;
      const key = rid(m.mid, id);
      const d = clip(it.d, 80) || 'Shared expense';
      s.splits.push({ id: key, group: group.id, description: d, amount: total, paidBy: by, date: it.date, mode: 'exact', shares, category: s.categories.some((c) => c.id === it.cat && c.kind === 'expense') ? String(it.cat) : 'other', remote: gid });
      if (had.has(key)) continue;
      const mine = shares.find((x) => x.person === 'me')?.amount ?? 0;
      const body = by === 'me' ? `${who} noted that you paid ${rupees(total)}.` : mine > 0 ? `You owe ${short(by)} ${rupees(mine)}.` : `${rupees(total)}, paid by ${short(by)}. You’re not part of this one.`;
      news.push({ person: sh.refs[m.mid], group: group.id, title: `${who} added ${d} in ${group.name}`, body });
    }
    for (const pay of Array.isArray(m.box.pays) ? m.box.pays.slice(0, 2000) : []) {
      const id = clip(pay?.id, 60);
      const amt = roundMoney(Number(pay?.a));
      const from = resolve(String(pay?.from));
      const to = resolve(String(pay?.to));
      if (!id || !(amt > 0) || !DATE.test(String(pay.date)) || !from || !to || from === to) continue;
      const mineToo = from === 'me' || to === 'me';
      if (pay.out && !mineToo) continue; // between two other people, outside the group: not mine to see
      if (chan) twice.add(remoteId(chan, id));
      const twin = paid.find((x) => !x.used && x.by !== m.mid && x.from === from && x.to === to && Math.abs(x.amt - amt) < 0.01 && Math.abs(daysBetween(x.date, pay.date)) <= 3);
      if (twin) {
        twin.used = true;
        continue;
      }
      paid.push({ from, to, amt, date: pay.date, by: m.mid, used: false });
      const key = rid(m.mid, id);
      const old = oldPays.get(key);
      s.settlements.push({ id: key, ...(pay.out ? {} : { group: group.id }), from, to, amount: amt, date: pay.date, remote: gid, ...(old?.banked ? { banked: true } : {}) });
      if (old || !mineToo) continue;
      news.push({ person: sh.refs[m.mid], group: group.id, title: `${who} settled up`, body: to === 'me' ? `${short(from)[0].toUpperCase()}${short(from).slice(1)} marked ${rupees(amt)} as paid to you.` : `${short(to)[0].toUpperCase()}${short(to).slice(1)} marked your ${rupees(amt)} as received.` });
    }
  }

  if (twice.size) {
    s.splits = s.splits.filter((x) => !twice.has(x.id));
    s.settlements = s.settlements.filter((x) => !twice.has(x.id));
  }

  // 4. The group itself: its name comes from whoever made it; its people are everyone mentioned.
  const owner = others.find((m) => m.owner);
  if (owner && !sh.owner) {
    group.name = clip(owner.box.g?.name, 40) || group.name;
    group.emoji = clip(owner.box.g?.emoji, 8) || group.emoji;
  }
  const inUse = new Set<string>();
  for (const sp of s.splits) {
    if (sp.group !== group.id) continue;
    inUse.add(sp.paidBy);
    for (const x of sp.shares) inUse.add(x.person);
  }
  for (const st of s.settlements) {
    if (st.group !== group.id) continue;
    inUse.add(st.from);
    inUse.add(st.to);
  }
  const here = new Set(view.members.map((m) => m.mid));
  const out = new Set<string>(); // left or taken out, and nothing of theirs remains
  for (const mid of Object.keys(sh.refs).filter((r) => MID.test(r))) {
    const m = view.members.find((x) => x.mid === mid);
    if ((!here.has(mid) || m?.gone) && !inUse.has(sh.refs[mid])) out.add(sh.refs[mid]);
    if (!here.has(mid)) delete sh.refs[mid];
  }
  // A hand-typed name nobody lists any more (it was merged, claimed or taken out on its writer's phone) goes too.
  const listed = new Set<string>();
  for (const m of others) for (const gh of Array.isArray(m.box.ghosts) ? m.box.ghosts : []) listed.add(String(gh?.id));
  for (const r of Object.keys(sh.refs)) {
    if (!GHOST.test(r) || r.startsWith(`${sh.mid}.`) || (listed.has(r) && !claimedBy.has(r))) continue;
    const pid = sh.refs[r];
    delete sh.refs[r];
    if (!inUse.has(pid) && !Object.values(sh.refs).includes(pid)) out.add(pid);
  }
  const next = new Set<string>(['me']);
  for (const pid of group.members) if (person(pid) && !out.has(pid)) next.add(pid);
  for (const m of others) if (!m.gone || inUse.has(sh.refs[m.mid])) next.add(sh.refs[m.mid]);
  for (const r of Object.keys(sh.refs)) if (GHOST.test(r) && !claimedBy.has(r) && person(sh.refs[r])) next.add(sh.refs[r]);
  for (const pid of inUse) if (pid !== 'me' && person(pid)) next.add(pid);
  group.members = [...next];
  sh.on = others.filter((m) => !m.gone).map((m) => m.mid);
  // Names that only ever existed for this group and are now used nowhere leave the list of people.
  for (const pid of out) {
    if (!pid.startsWith('pg-') || next.has(pid)) continue;
    const used = s.splits.some((sp) => sp.paidBy === pid || sp.shares.some((x) => x.person === pid)) || s.settlements.some((st) => st.from === pid || st.to === pid) || s.groups.some((g) => g.members.includes(pid));
    if (!used) s.people = s.people.filter((p) => p.id !== pid);
  }
  return news;
}

/** Stop sharing a group on this phone: it stays as an ordinary group with all its history. */
export function unshareGroup(s: State, groupId: string) {
  const g = s.groups.find((x) => x.id === groupId);
  const gid = g?.shared?.gid;
  if (!g || !gid) return;
  delete g.shared;
  for (const x of s.splits) if (x.remote === gid) delete x.remote;
  for (const x of s.settlements) if (x.remote === gid) delete x.remote;
}

const gcred = (sh: GroupShare) => ({ gid: sh.gid, mid: sh.mid, token: sh.token });

/** Put a new shared group on the server. False when offline (the next sync does it instead). */
export async function createGroupChannel(sh: GroupShare, dev?: string): Promise<boolean> {
  const r = await api({ action: 'g-create', ...gcred(sh), dev });
  return !!r && r.status === 200;
}
export async function leaveGroupChannel(sh: GroupShare) {
  await api({ action: 'g-leave', ...gcred(sh) });
}
/**
 * The group is being deleted on this phone. The person who made it takes it off the server for
 * everyone (their phones keep their own copy, no longer shared); anyone else just leaves.
 */
export async function deleteGroupChannel(sh: GroupShare) {
  await api({ action: sh.owner ? 'g-delete' : 'g-leave', ...gcred(sh) });
}

/**
 * Delete a group here: the group, its expenses and its settle-ups, so nobody owes anything in it any
 * more. Money already recorded in accounts is left alone: those entries stay in Activity as ordinary
 * expenses and transfers.
 */
export function removeGroup(s: State, groupId: string) {
  const g = s.groups.find((x) => x.id === groupId);
  if (!g) return;
  const gid = g.shared?.gid;
  const gone = new Set(s.splits.filter((sp) => sp.group === groupId).map((sp) => sp.id));
  s.splits = s.splits.filter((sp) => sp.group !== groupId);
  for (const tx of s.transactions) if (tx.splitId && gone.has(tx.splitId)) delete tx.splitId;
  s.settlements = s.settlements.filter((st) => st.group !== groupId);
  // A payment made outside the group that only travelled through it stays, as ordinary history.
  if (gid) for (const st of s.settlements) if (st.remote === gid) delete st.remote;
  s.groups = s.groups.filter((x) => x.id !== groupId);
  // People who were only ever here because of this group, and are now part of nothing, go with it.
  const used = new Set<string>();
  for (const sp of s.splits) {
    used.add(sp.paidBy);
    for (const x of sp.shares) used.add(x.person);
  }
  for (const st of s.settlements) {
    used.add(st.from);
    used.add(st.to);
  }
  for (const x of s.groups) for (const m of x.members) used.add(m);
  for (const tx of s.transactions) for (const p of tx.people ?? []) used.add(p);
  s.people = s.people.filter((p) => p.link || used.has(p.id) || !(g.members.includes(p.id) && /^p[ug]-/.test(p.id)));
}
/** Owner: stop (or allow again) new people joining with the link. */
export async function lockGroup(sh: GroupShare, closed: boolean): Promise<boolean> {
  const r = await api({ action: 'g-close', ...gcred(sh), closed });
  return !!r && r.status === 200;
}
/** Owner: take a member out. What they added goes with them. */
export async function removeFromGroup(sh: GroupShare, personId: string): Promise<boolean> {
  const target = memberRef(sh, personId);
  if (!target) return false;
  const r = await api({ action: 'g-remove', ...gcred(sh), target });
  return !!r && r.status === 200;
}
/** Has this person joined the group from their own PULSE? */
export const inGroupOnPulse = (g: Group, personId: string) => !!g.shared && !!memberRef(g.shared, personId, true);
/** A person's place in a shared group: joined from their own PULSE, joined and left, or just a name typed by hand. */
export const groupSeat = (g: Group, personId: string): 'on' | 'left' | 'name' => (!g.shared || !memberRef(g.shared, personId) ? 'name' : memberRef(g.shared, personId, true) ? 'on' : 'left');

export type GroupJoin =
  | { ok: true; share: GroupShare; name: string; emoji: string; people: string[]; /** Hand-typed names that might be the person joining. */ ghosts: { id: string; name: string }[] }
  | { ok: false; error: string };

/** Open a group's link: take a seat in the group and look at who is already there. */
export async function joinGroupChannel(inv: Invite, today: ISODate, dev?: string): Promise<GroupJoin> {
  const share: GroupShare = { gid: inv.chan, key: inv.key, mid: hex(rand(8)), token: toB64Url(rand(24)), refs: {}, on: [], since: today };
  const j = await api({ action: 'g-join', ...gcred(share), dev });
  if (!j) return { ok: false, error: OFFLINE };
  if (j.status !== 200) return { ok: false, error: String(j.data.error ?? 'This link did not work. Ask for a new one.') };
  const r = await api({ action: 'g-get', ...gcred(share), dev });
  if (!r || r.status !== 200) return { ok: false, error: OFFLINE };
  let name = inv.name || 'Group';
  let emoji = '👥';
  const people: string[] = [];
  const ghosts = new Map<string, string>();
  const claimed = new Set<string>();
  for (const m of (r.data.members ?? []) as { mid: string; box: string; owner: boolean; gone: boolean }[]) {
    const box = m.box ? await unseal<GroupBox>(inv.key, m.box) : null;
    if (!box) continue;
    if (!m.gone) people.push(clip(box.name, 40).split(' ')[0] || 'Friend');
    if (m.owner) {
      name = clip(box.g?.name, 40) || name;
      emoji = clip(box.g?.emoji, 8) || emoji;
    }
    if (typeof box.claim === 'string') claimed.add(box.claim);
    for (const pair of Array.isArray(box.also) ? box.also : []) claimed.add(String(pair?.[0]));
    for (const gh of Array.isArray(box.ghosts) ? box.ghosts : []) if (GHOST.test(String(gh?.id))) ghosts.set(gh.id, clip(gh.name, 40) || 'Friend');
  }
  return { ok: true, share, name, emoji, people, ghosts: [...ghosts].filter(([id]) => !claimed.has(id)).map(([id, n]) => ({ id, name: n })) };
}

/** What to tell the other members about a change to my box. Only new entries are worth a notification. */
function groupNotify(s: State, group: Group, prev: GroupBox | null, box: GroupBox): { title: string; body: string; per?: Record<string, string>; only?: true } | undefined {
  const sh = group.shared!;
  const me = myShort(s);
  const nameOf = (ref: string) => (ref === sh.mid ? me : (s.people.find((p) => p.id === sh.refs[ref])?.short ?? box.ghosts.find((g) => g.id === ref)?.name.split(' ')[0] ?? 'someone'));
  if (!prev) return sh.owner ? undefined : { title: `${me} joined ${group.name}`, body: 'Open PULSE to see the group.' };
  const hadItems = new Set(prev.items.map((i) => i.id));
  const hadPays = new Set(prev.pays.map((i) => i.id));
  const items = box.items.filter((i) => !hadItems.has(i.id));
  const fresh = box.pays.filter((i) => !hadPays.has(i.id));
  // Settle-ups recorded outside the group are only the other person's business; they never go to everyone.
  const inside = fresh.filter((i) => !i.out);
  const pays = items.length || inside.length ? inside : fresh;
  if (items.length + inside.length > 1) return { title: `${me} added ${items.length + inside.length} entries in ${group.name}`, body: 'Open PULSE to see what you owe each other.' };
  const per: Record<string, string> = {};
  if (items.length) {
    const it = items[0];
    for (const [ref, amt] of it.sh) {
      if (!MID.test(ref) || ref === sh.mid) continue;
      if (ref === it.by) per[ref] = `${me} noted that you paid ${rupees(it.t)}.`;
      else if (amt > 0) per[ref] = `You owe ${nameOf(it.by)} ${rupees(amt)}.`;
    }
    if (MID.test(it.by) && it.by !== sh.mid && !per[it.by]) per[it.by] = `${me} noted that you paid ${rupees(it.t)}.`;
    return { title: `${me} added ${it.d} in ${group.name}`, body: `${rupees(it.t)}, paid by ${nameOf(it.by)}.`, per };
  }
  if (pays.length) {
    const pay = pays[0];
    if (pay.from === sh.mid && MID.test(pay.to)) per[pay.to] = `${me} marked ${rupees(pay.a)} as paid to you.`;
    if (pay.to === sh.mid && MID.test(pay.from)) per[pay.from] = `${me} marked your ${rupees(pay.a)} as received.`;
    // Outside the group: only the person on the other end hears about it.
    if (pay.out) return Object.keys(per).length ? { title: `${me} settled up`, body: '', per, only: true } : undefined;
    return { title: `${me} settled up in ${group.name}`, body: `${nameOf(pay.from)} paid ${nameOf(pay.to)} ${rupees(pay.a)}.`, per };
  }
  return undefined;
}

/** One shared group: read everyone's boxes, then publish mine if it changed. False when offline. */
async function syncGroup(host: FriendHost, groupId: string, dev?: string): Promise<boolean> {
  const g0 = host.state()?.groups.find((g) => g.id === groupId);
  const sh = g0?.shared;
  if (!g0 || !sh) return true;
  let r = await api({ action: 'g-get', ...gcred(sh), dev });
  if (!r) return false;
  if (r.status === 403 && sh.owner && r.data.error === 'not a member') {
    // Shared while offline: put the group on the server now.
    if (!(await createGroupChannel(sh, dev))) return navigator.onLine;
    r = await api({ action: 'g-get', ...gcred(sh), dev });
    if (!r) return false;
  }
  if (r.status === 403) {
    host.groupLeft(groupId);
    host.toast(r.data.error === 'removed' ? `You were taken out of ${g0.name}. What you had stays in your history.` : `${g0.name} is no longer shared. Your history stays.`);
    return true;
  }
  if (r.status !== 200) return true;
  const list = (Array.isArray(r.data.members) ? r.data.members : []) as { mid: string; box: string; rev: number; owner: boolean; gone: boolean }[];
  const closed = r.data.closed === true;

  // 1. Everyone else's side.
  const sig = `${closed ? 'c' : 'o'}|${list.filter((m) => m.mid !== sh.mid).map((m) => `${m.mid}:${m.rev}:${m.gone ? 1 : 0}`).join(',')}`;
  const seenKey = `g:${sh.gid}`;
  if (book().seen[seenKey] !== sig) {
    const members: MemberView[] = [];
    for (const m of list) if (m.mid !== sh.mid) members.push({ mid: m.mid, box: m.box ? await unseal<GroupBox>(sh.key, m.box) : null, gone: !!m.gone, owner: !!m.owner });
    const news = host.applyGroup(groupId, { closed, members });
    const now = book();
    const firstTime = now.seen[seenKey] === undefined;
    now.seen[seenKey] = sig;
    if (news.length) {
      const name = host.state()?.groups.find((g) => g.id === groupId)?.name ?? g0.name;
      // Someone who has just joined gets one line, not the whole history.
      const joining = firstTime && !sh.owner;
      const lines = joining ? [{ person: '', group: groupId, title: `You’re in ${name}`, body: 'Open the group to see who owes what.' }] : news.slice(0, 5);
      now.news = [...lines.map((l) => ({ ...l, at: new Date().toISOString() })), ...now.news].slice(0, 12);
      if (!joining) host.toast(`${lines[0].title}. ${lines[0].body}`); // joining already said so
    }
    saveBook(now);
  }

  // 2. My side.
  const state = host.state();
  const group = state?.groups.find((g) => g.id === groupId);
  if (!state || !group?.shared) return true;
  const box = buildGroupBox(state, group);
  const mine = list.find((m) => m.mid === sh.mid);
  const prev = mine?.box ? await unseal<GroupBox>(sh.key, mine.box) : null;
  if (prev && JSON.stringify(prev) === JSON.stringify(box)) return true;
  const safe = prev && Array.isArray(prev.items) && Array.isArray(prev.pays) ? prev : null;
  const notify = list.some((m) => m.mid !== sh.mid && !m.gone) ? groupNotify(state, group, safe, box) : undefined;
  return !!(await api({ action: 'g-put', ...gcred(group.shared), box: await seal(sh.key, box), dev, notify }));
}
