// A shared bhisi: the members open one invite link and each follows the same bhisi from their own
// PULSE. Every member publishes one sealed box (name, photo, which rounds they've paid). The
// organiser's box also carries the bhisi's name and amount, the people they added by name, and
// the rounds they've marked paid for others. The server can't read any of that.
//
// The draw is not done on a phone: PULSE's server picks the chit with crypto randomness, keeps the
// result, and won't open a round before its date (netlify/lib/bhisi.ts). Any member can draw once
// the date comes; whoever is first, everyone gets the same chit.
import type { Bhisi, BhisiShare, ISODate, Person, State, Transaction } from '../types';
import { addMonths, uid as newId } from './format';
import { api, hex, ownName, rand, seal, unseal } from './friends';
import { fromB64Url, toB64Url } from './codec';
import { pot } from './bhisi';
import { applyMoney, defaultAccount } from './finance';
import { okFace } from './photo';
import { cleanVpa, okVpa } from './upi';
import { sha256 } from './sha256';

export interface MemberBox {
  v: 1;
  name: string;
  /** Full name, so the organiser's PULSE can tell it's the person they added by name. */
  full?: string;
  uid?: string;
  face?: string;
  /** My UPI ID, so the others can pay me from their UPI app ('' = I have none). */
  upi?: string;
  paid: number[];
  // Organiser only:
  n?: string;
  e?: string;
  a?: number;
  ghosts?: { id: string; name: string; uid?: string }[];
  marks?: Record<string, number[]>;
}

export interface BhisiView {
  today: ISODate;
  start: ISODate;
  owner: string;
  ghosts: string[];
  seats: string[];
  locked: boolean;
  members: { mid: string; box: MemberBox | null; rev: number; owner: boolean; gone: boolean; was?: string }[];
  draws: { r: number; w: string; at: string; by?: string; odds?: Record<string, number> }[];
  /** When each seat paid each round (server time). */
  paid: Record<string, Record<string, string>>;
  /** The round whose paid marks this phone has just put in step with the server: for it, the server's list is the truth. */
  settled?: number;
}

/**
 * A new bhisi: a 16-byte key, and an id the server knows that comes from the key one way only
 * (SHA-256). So the invite link carries just the key: short, and still never sent to a server.
 */
export const bidOf = (key: string) => sha256(new TextEncoder().encode(`pulse-bhisi:${key}`)).slice(0, 32);
export const newBhisiShare = (owner: boolean): BhisiShare => {
  const key = toB64Url(rand(16));
  return { bid: bidOf(key), key, mid: hex(rand(8)), token: toB64Url(rand(24)), owner, seats: {} };
};
export const newGhostId = () => `g${hex(rand(6))}`;

const unhex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));
/**
 * The invite link. The key sits after the #, which browsers never send to a server. New bhisis:
 * #b=<key> (22 characters). Older ones carry their id too: #b=<id><key> (65).
 */
export function bhisiLink(origin: string, b: Pick<Bhisi, 'name' | 'share'>): string {
  const sh = b.share;
  if (!sh) return '';
  return `${origin}/#b=${bidOf(sh.key) === sh.bid ? sh.key : toB64Url(unhex(sh.bid)) + sh.key}`;
}
export const bhisiUrl = (b: Bhisi) => bhisiLink(location.origin, b);

export interface BhisiInvite {
  bid: string;
  key: string;
  name: string;
}
export function parseBhisiLink(text: string): BhisiInvite | null {
  const short = text.match(/(?:^|[#?&\s/]|^)b=([A-Za-z0-9_-]{65}|[A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/);
  if (short) {
    const x = short[1];
    if (x.length === 22) return { bid: bidOf(x), key: x, name: '' };
    return { bid: hex(fromB64Url(x.slice(0, 22))), key: x.slice(22), name: '' };
  }
  // Links sent before: #bhisi=<id>.<key>.<name>
  const m = text.match(/bhisi=([0-9a-f]{32})\.([A-Za-z0-9_-]{43})(?:\.([A-Za-z0-9_-]{0,160}))?/);
  if (!m) return null;
  let name = '';
  try {
    name = new TextDecoder().decode(fromB64Url(m[3] ?? '')).replace(/\s+/g, ' ').trim().slice(0, 40);
  } catch {
    /* the name is only a courtesy */
  }
  return { bid: m[1], key: m[2], name };
}
const KEEP = 'pulse-bhisi-join-v1';
/** A bhisi link in the address bar. Kept aside until the person has finished setting up. */
export function takeBhisiLink(ready: boolean): BhisiInvite | null {
  try {
    const m = location.hash.match(/^#((?:bhisi|b)=.+)$/);
    if (m && parseBhisiLink(m[0])) {
      localStorage.setItem(KEEP, m[0]);
      history.replaceState(history.state, '', location.pathname + location.search);
    }
    if (!ready) return null;
    const kept = localStorage.getItem(KEEP);
    if (!kept) return null;
    localStorage.removeItem(KEEP);
    return parseBhisiLink(kept);
  } catch {
    return null;
  }
}
export function clearBhisiLink() {
  try {
    localStorage.removeItem(KEEP);
    localStorage.removeItem(AUTO);
  } catch {
    /* nothing kept */
  }
}
// Opened the invite before signing in: the invite screen was the "yes", so once set up it joins by itself.
const AUTO = 'pulse-bhisi-autojoin-v1';
export function markBhisiAutoJoin() {
  try {
    localStorage.setItem(AUTO, '1');
  } catch {
    /* it asks instead */
  }
}
export function takeBhisiAutoJoin(): boolean {
  try {
    const on = localStorage.getItem(AUTO) === '1';
    localStorage.removeItem(AUTO);
    return on;
  } catch {
    return false;
  }
}
/** The invite waiting for setup to finish, if any (left where it is). */
export function pendingBhisiLink(): BhisiInvite | null {
  try {
    const m = location.hash.match(/^#((?:bhisi|b)=.+)$/);
    return parseBhisiLink(m ? m[0] : localStorage.getItem(KEEP) ?? '');
  } catch {
    return null;
  }
}

const cred = (sh: BhisiShare) => ({ bid: sh.bid, mid: sh.mid, token: sh.token });
const OFFLINE = 'No connection. Check your internet and try again.';

export interface BhisiPeek {
  name?: string;
  emoji?: string;
  amount?: number;
  /** The organiser's first name. */
  org?: string;
  count: number;
  locked: boolean;
}
/** Before joining: what the invite is for (the organiser's sealed box, opened with the link's key). */
export async function peekBhisi(inv: BhisiInvite): Promise<{ ok: true; peek: BhisiPeek } | { ok: false; error: string }> {
  const r = await api({ action: 'b-peek', ...cred({ ...newBhisiShare(false), bid: inv.bid }) });
  if (!r) return { ok: false, error: OFFLINE };
  if (r.status !== 200) return { ok: false, error: String(r.data.error ?? 'This link did not work. Ask for a new one.') };
  const box = typeof r.data.box === 'string' && r.data.box ? await unseal<MemberBox>(inv.key, r.data.box) : null;
  return {
    ok: true,
    peek: {
      ...(box?.n ? { name: box.n.slice(0, 40) } : {}),
      ...(box?.e ? { emoji: box.e.slice(0, 8) } : {}),
      ...(typeof box?.a === 'number' && box.a > 0 ? { amount: box.a } : {}),
      ...(box?.name ? { org: box.name.split(' ')[0].slice(0, 24) } : {}),
      count: Number(r.data.count) || 0,
      locked: !!r.data.locked,
    },
  };
}

export async function createBhisiChannel(b: Bhisi, dev?: string): Promise<boolean> {
  if (!b.share) return false;
  const r = await api({ action: 'b-create', ...cred(b.share), start: b.start ?? b.rounds[0]?.date, ghosts: (b.share.ghosts ?? []).map((g) => g.id), dev });
  return !!r && r.status === 200;
}

export async function joinBhisiChannel(inv: BhisiInvite, dev?: string): Promise<{ ok: true; share: BhisiShare } | { ok: false; error: string }> {
  const share: BhisiShare = { ...newBhisiShare(false), bid: inv.bid, key: inv.key };
  const r = await api({ action: 'b-join', ...cred(share), dev });
  if (!r) return { ok: false, error: OFFLINE };
  if (r.status !== 200) return { ok: false, error: String(r.data.error ?? 'This link did not work. Ask for a new one.') };
  share.seats = { [share.mid]: 'me' };
  return { ok: true, share };
}

async function readView(sh: BhisiShare, data: Record<string, unknown>): Promise<BhisiView> {
  const members = await Promise.all(
    ((data.members as BhisiView['members'] & { box: string }[]) ?? []).map(async (m) => ({
      mid: m.mid,
      rev: m.rev,
      owner: !!m.owner,
      gone: !!m.gone,
      ...(typeof m.was === 'string' ? { was: m.was } : {}),
      box: m.box ? await unseal<MemberBox>(sh.key, m.box as unknown as string) : null,
    })),
  );
  return {
    today: String(data.today ?? ''),
    start: String(data.start ?? ''),
    owner: String(data.owner ?? ''),
    ghosts: (data.ghosts as string[]) ?? [],
    seats: (data.seats as string[]) ?? [],
    locked: !!data.locked,
    members,
    draws: (data.draws as BhisiView['draws']) ?? [],
    paid: (data.paid as BhisiView['paid']) ?? {},
  };
}

/** Ask the server to draw this round. Resolves with the view after the draw and the winning seat. */
export async function drawShared(s: State, b: Bhisi, round: number, dev?: string): Promise<{ ok: true; view: BhisiView; winner: string } | { ok: false; error: string }> {
  const sh = b.share!;
  const names: Record<string, string> = {};
  for (const [seat, pid] of Object.entries(sh.seats)) names[seat] = pid === 'me' ? s.user.name || 'Someone' : s.people.find((p) => p.id === pid)?.short ?? 'Someone';
  const r = await api({ action: 'b-draw', ...cred(sh), round, names, title: b.name, pot: `₹${Math.round(pot(b)).toLocaleString('en-IN')}`, dev });
  if (!r) return { ok: false, error: OFFLINE };
  if (r.status !== 200) return { ok: false, error: String(r.data.error ?? 'The draw didn’t go through. Try again.') };
  return { ok: true, view: await readView(sh, r.data), winner: String(r.data.winner) };
}

/** Tell the server someone paid (or not). Its clock decides "early", so it can't be faked. */
export async function markPaidShared(sh: BhisiShare, round: number, seat: string, paid: boolean) {
  const r = await api({ action: 'b-paid', ...cred(sh), round, paid, ...(seat !== sh.mid ? { target: seat } : {}) });
  return !!r && r.status === 200;
}

// Leaving or deleting must reach the server even if the phone is offline at that moment, or the
// others would keep seeing it. What couldn't be sent waits here and goes with the next sync.
const OUTBOX = 'pulse-bhisi-out-v1';
type Out = { action: string; bid: string; mid: string; token: string; deleted?: boolean };
const readOut = (): Out[] => {
  try {
    const x = JSON.parse(localStorage.getItem(OUTBOX) ?? '[]');
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
};
const writeOut = (xs: Out[]) => {
  try {
    if (xs.length) localStorage.setItem(OUTBOX, JSON.stringify(xs.slice(-50)));
    else localStorage.removeItem(OUTBOX);
  } catch {
    /* private mode: it goes on the next tap instead */
  }
};
/** Sent, or nothing more to do (the server answered, even "no"). Only no answer or a server error waits. */
const done = (r: Awaited<ReturnType<typeof api>>) => !!r && r.status < 500;
async function send(o: Out) {
  if (done(await api({ ...o }))) return true;
  writeOut([...readOut().filter((x) => !(x.bid === o.bid && x.mid === o.mid)), o]);
  return false;
}
export const pendingBhisiOutbox = () => readOut().length > 0;
export async function flushBhisiOutbox() {
  for (const o of readOut()) if (done(await api({ ...o }))) writeOut(readOut().filter((x) => !(x.bid === o.bid && x.mid === o.mid)));
}

/** Leaving for good (account deleted, or all data erased): my chit comes out of the matka. */
export async function leaveBhisiForGood(sh: BhisiShare) {
  await send({ action: 'b-leave', ...cred(sh), deleted: true });
}

/** The organiser deletes it for everyone; anyone else leaves it. */
export async function leaveOrDeleteBhisi(sh: BhisiShare) {
  return send({ action: sh.owner ? 'b-delete' : 'b-leave', ...cred(sh) });
}

/** Take a bhisi off this phone (it was deleted, or I'm out of it). Money already recorded stays in Activity. */
export function dropBhisi(s: State, id: string) {
  s.bhisis = (s.bhisis ?? []).filter((x) => x.id !== id);
}

// ---------------------------------------------------------------------------------------------
// People added by name who then join with the link: they take that seat (one chit, not two)
// ---------------------------------------------------------------------------------------------
const norm = (x?: string) =>
  (x ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
const first = (x?: string) => norm(x).split(' ')[0];

/**
 * Which name-only seat is this person? Their PULSE id decides when the organiser knew it. Otherwise
 * the name: the full name, else the first name, and only when exactly one seat fits. A seat that
 * belongs to a different PULSE id is never theirs.
 */
export function pickGhost<G extends { id: string; name: string; uid?: string }>(ghosts: G[], who: { uid?: string; names: (string | undefined)[] }): G | undefined {
  if (who.uid) {
    const g = ghosts.find((x) => x.uid === who.uid);
    if (g) return g;
  }
  const open = ghosts.filter((x) => !x.uid || x.uid === who.uid);
  const names = who.names.map(norm).filter(Boolean);
  if (!names.length) return;
  const full = open.filter((x) => names.includes(norm(x.name)));
  if (full.length === 1) return full[0];
  if (full.length > 1) return;
  const firsts = new Set(names.map((n) => n.split(' ')[0]));
  const byFirst = open.filter((x) => firsts.has(first(x.name)));
  return byFirst.length === 1 ? byFirst[0] : undefined;
}

/** Link joined members to the name-only seats they were added as. True when something changed. */
async function linkSeats(s: State, b: Bhisi, v: BhisiView): Promise<boolean> {
  const sh = b.share!;
  if (v.locked) return false;
  const open = new Set(v.ghosts.filter((g) => v.seats.includes(g)));
  if (!open.size) return false;
  const ownerBox = v.members.find((m) => m.mid === v.owner)?.box;
  let ghosts = (sh.owner ? (sh.ghosts ?? []).map((g) => ({ id: g.id, name: g.name, uid: s.people.find((p) => p.id === g.pid)?.uid })) : ownerBox?.ghosts ?? []).filter((g) => open.has(g.id));
  let changed = false;
  const link = async (ghost: string, target?: string) => (await api({ action: 'b-link', ...cred(sh), ghost, ...(target ? { target } : {}) }))?.status === 200;
  if (!sh.owner) {
    // Me: did the organiser add me by name?
    const me = v.members.find((m) => m.mid === sh.mid);
    const g = me && !me.was ? pickGhost(ghosts, { uid: s.user.uid, names: [s.user.fullName, s.user.name] }) : undefined;
    if (g && (await link(g.id))) changed = true;
    return changed;
  }
  // Organiser: someone joined on an older PULSE that doesn't do it itself.
  for (const m of v.members) {
    if (m.mid === sh.mid || m.gone || m.was || !m.box || !v.seats.includes(m.mid)) continue;
    const g = pickGhost(ghosts, { uid: m.box.uid, names: [m.box.full, m.box.name] });
    if (g && (await link(g.id, m.mid))) {
      changed = true;
      ghosts = ghosts.filter((x) => x.id !== g.id);
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------------------------
// Putting what the server says into the data
// ---------------------------------------------------------------------------------------------
export interface BhisiNews {
  round: number;
  winner: string; // person id here
}

/**
 * Rebuild one shared bhisi from the server's view. Returns rounds that were newly drawn.
 *
 * Who paid: the server's list, plus (for rounds this phone hasn't just put in step with it) my own
 * tick, members' own boxes and the organiser's marks, which may not have reached the server yet.
 */
export function applyBhisi(s: State, id: string, v: BhisiView): { news: BhisiNews[] } {
  const b = s.bhisis?.find((x) => x.id === id);
  const sh = b?.share;
  if (!b || !sh) return { news: [] };
  const owner = v.members.find((m) => m.mid === v.owner)?.box;
  // The organiser's details reach everyone.
  if (!sh.owner && owner) {
    if (owner.n) b.name = owner.n.slice(0, 40);
    if (owner.e) b.emoji = owner.e.slice(0, 8);
    if (typeof owner.a === 'number' && owner.a > 0) b.amount = owner.a;
  }
  if (v.start) b.start = v.start;
  sh.locked = v.locked;

  // Someone added by name joined and took that seat: the person here who stood for that name is
  // them now, and the marks made for the name are theirs.
  for (const m of v.members) {
    if (!m.was) continue;
    const pid = sh.seats[m.was];
    if (pid && m.mid !== sh.mid && !sh.seats[m.mid]) sh.seats[m.mid] = pid;
    delete sh.seats[m.was];
    if (sh.marks?.[m.was]) {
      sh.marks[m.mid] = [...new Set([...(sh.marks[m.mid] ?? []), ...sh.marks[m.was]])];
      delete sh.marks[m.was];
    }
  }
  if (sh.owner && sh.ghosts?.length && !v.locked) {
    const taken = new Set(v.members.map((m) => m.was).filter(Boolean));
    sh.ghosts = sh.ghosts.filter((g) => !taken.has(g.id));
  }

  // Who each seat is, here.
  const ghostNames = new Map((sh.owner ? sh.ghosts ?? [] : owner?.ghosts ?? []).map((g) => [g.id, g.name] as const));
  const person = (seat: string): string => {
    if (seat === sh.mid) return 'me';
    const box = v.members.find((m) => m.mid === seat)?.box;
    const known = sh.seats[seat];
    let p: Person | undefined = known && known !== 'me' ? s.people.find((x) => x.id === known) : undefined;
    if (known === 'me') return 'me';
    const name = (box?.name || ghostNames.get(seat) || '').slice(0, 40);
    if (!p) {
      const byUid = box?.uid ? s.people.find((x) => x.uid === box.uid) : undefined;
      const byName = !box && name ? s.people.find((x) => x.name.toLowerCase() === name.toLowerCase()) : undefined;
      p = byUid ?? byName;
    }
    if (!p) {
      const nm = name || 'Someone';
      p = { id: newId('p'), name: nm, short: nm.split(' ')[0], hue: Math.floor(Math.random() * 360) };
      s.people.push(p);
    } else if (p.name === 'Someone' && name) {
      // Made before their name had arrived.
      p.name = name;
      p.short = name.split(' ')[0];
    }
    // Their PULSE id, so the next bhisi, group or split finds the same person.
    if (box?.uid && !p.uid && !s.people.some((x) => x.uid === box.uid)) p.uid = box.uid;
    // Shown by the name they use on PULSE (a connected friend's comes from what they share with you).
    if (box && !p.link) ownName(p, box.full || box.name);
    if (box) {
      if (box.face && okFace(box.face) && !p.photo) p.photo = box.face;
      // Their own UPI ID wins over one typed here; taking theirs off removes only the one they shared.
      if (okVpa(box.upi)) {
        p.upi = cleanVpa(box.upi);
        delete p.upiTyped;
      } else if (box.upi === '' && !p.upiTyped) delete p.upi;
    }
    sh.seats[seat] = p.id;
    return p.id;
  };

  if (!sh.owner && v.owner) sh.org = person(v.owner);
  const seats = v.seats.length ? v.seats : [sh.mid];
  const members = seats.map(person);
  const marks = sh.owner ? sh.marks ?? {} : owner?.marks ?? {};
  const prev = b.rounds;
  const news: BhisiNews[] = [];
  const start = v.start || b.start || s.today;
  b.members = members;
  b.rounds = seats.map((_, i) => {
    const old = prev[i] ?? { date: addMonths(start, i), paid: [] };
    const server = v.paid[i] ?? {};
    const settled = v.settled === i;
    const paidBy = seats
      .filter((seat) => {
        if (server[seat]) return true;
        if (settled) return false;
        if (seat === sh.mid) return old.paid.includes('me');
        const box = v.members.find((m) => m.mid === seat)?.box;
        return !!box?.paid?.includes(i) || !!marks[seat]?.includes(i);
      })
      .map((seat) => sh.seats[seat]);
    const draw = v.draws.find((d) => d.r === i);
    const winner = draw ? person(draw.w) : undefined;
    if (winner && !old.winner) news.push({ round: i, winner });
    const pool = draw ? seats.length - v.draws.filter((d) => d.r < i).length : undefined;
    const paidAt = Object.fromEntries(Object.entries(server).filter(([seat]) => seats.includes(seat)).map(([seat, t]) => [person(seat), t]));
    const odds = draw?.odds ? Object.fromEntries(Object.entries(draw.odds).map(([seat, n]) => [person(seat), n])) : undefined;
    const srv = Object.keys(server).filter((seat) => seats.includes(seat)).map(person);
    return { ...old, date: addMonths(start, i), paid: paidBy, winner, drawnAt: draw ? draw.at.slice(0, 10) : undefined, at: draw?.at, drawnBy: draw?.by ? person(draw.by) : undefined, pool, paidAt, srv, ...(odds ? { odds } : {}) };
  });
  // The organiser's marks follow the server for the round just put in step.
  if (sh.owner && v.settled !== undefined) {
    const i = v.settled;
    const server = v.paid[i] ?? {};
    for (const seat of seats) {
      if (seat === sh.mid) continue;
      const cur = sh.marks?.[seat] ?? [];
      const want = !!server[seat];
      if (want === cur.includes(i)) continue;
      sh.marks ??= {};
      sh.marks[seat] = want ? [...cur, i] : cur.filter((x) => x !== i);
    }
  }

  // My win, recorded as money in (once).
  for (const n of news) {
    const r = b.rounds[n.round];
    if (n.winner === 'me' && !r.wonTx) {
      const tx: Transaction = { id: newId('t'), merchant: `Bhisi won · ${b.name}`, amount: pot(b), type: 'transfer', direction: 'in', category: 'transfer', date: s.today, account: defaultAccount(s), recurring: false, status: 'completed', notes: `Round ${n.round + 1} of ${b.rounds.length}` };
      s.transactions.unshift(tx);
      applyMoney(s, tx, 1);
      r.wonTx = tx.id;
    }
  }
  return { news };
}

/** What this phone publishes for one bhisi. */
export function myBhisiBox(s: State, b: Bhisi): MemberBox {
  const sh = b.share!;
  const box: MemberBox = {
    v: 1,
    name: s.user.name || 'Someone',
    ...(s.user.fullName?.trim() ? { full: s.user.fullName.trim().slice(0, 60) } : {}),
    ...(s.user.uid ? { uid: s.user.uid } : {}),
    ...(s.user.face ? { face: s.user.face } : {}),
    upi: okVpa(s.user.upi) ? cleanVpa(s.user.upi) : '',
    paid: b.rounds.map((r, i) => (r.paid.includes('me') ? i : -1)).filter((i) => i >= 0),
  };
  if (sh.owner) {
    box.n = b.name;
    box.e = b.emoji;
    box.a = b.amount;
    box.ghosts = (sh.ghosts ?? []).map((g) => ({ id: g.id, name: g.name, ...(s.people.find((p) => p.id === g.pid)?.uid ? { uid: s.people.find((p) => p.id === g.pid)!.uid } : {}) }));
    box.marks = sh.marks ?? {};
  }
  return box;
}

export interface BhisiHost {
  state(): State | null;
  applyBhisi(id: string, view: BhisiView): { news: BhisiNews[] };
  /** Take it off this phone, saying why ('' says nothing). */
  bhisiGone(id: string, why: string): void;
  bhisiNews(id: string, news: BhisiNews[]): void;
}

/** Read one shared bhisi from the server, then publish my box if it changed. False when offline. */
export async function syncBhisi(host: BhisiHost, id: string, dev?: string): Promise<boolean> {
  const b0 = host.state()?.bhisis?.find((x) => x.id === id);
  const sh = b0?.share;
  if (!b0 || !sh) return true;

  // Two of my devices both opened the link before they synced: one seat is enough. Both devices
  // keep the same one (the organiser's, else the lower seat id).
  const twin = host.state()?.bhisis?.find((x) => x.id !== id && x.share?.bid === sh.bid && x.share.mid !== sh.mid);
  if (twin?.share && !sh.owner && (twin.share.owner || twin.share.mid < sh.mid)) {
    await leaveOrDeleteBhisi(sh);
    host.bhisiGone(id, '');
    return true;
  }

  const get = () => api({ action: 'b-get', ...cred(sh), dev });
  let r = await get();
  if (!r) return false;
  if ((r.status === 404 || (r.status === 403 && r.data.error === 'not a member')) && sh.owner && !b0.rounds.some((x) => x.winner)) {
    // Made offline: put it on the server now.
    if (!(await createBhisiChannel(b0, dev))) return navigator.onLine;
    r = await get();
    if (!r) return false;
  }
  if (r.status === 410 || r.status === 404 || r.status === 403) {
    const deleted = r.status !== 403;
    host.bhisiGone(id, deleted ? (sh.owner ? `${b0.name} was deleted on your other device. Money already recorded stays in Activity.` : `${b0.name} was deleted by the person who made it. Money already recorded stays in Activity.`) : `You’re no longer in ${b0.name}. Money already recorded stays in Activity.`);
    return true;
  }
  if (r.status !== 200) return true;
  let view = await readView(sh, r.data);

  // Added by name, then joined with the link: take that seat (or, organiser, link them).
  const s0 = host.state();
  if (s0 && (await linkSeats(s0, b0, view))) {
    const again = await get();
    if (again?.status === 200) view = await readView(sh, again.data);
  }

  // Who paid this round, put in step with the server. For each mark that differs, the server's list
  // at the last sync tells who changed it: if the server still has what it had, this phone changed
  // it (made offline) and it's sent now; if the server moved, someone else did and theirs is taken.
  {
    const here = host.state()?.bhisis?.find((x) => x.id === id);
    const round = here ? here.rounds.findIndex((x) => !x.winner) : -1;
    if (here && round >= 0 && round < view.seats.length && !view.draws.some((d) => d.r === round)) {
      const rr = here.rounds[round];
      const server = { ...(view.paid[round] ?? {}) };
      const prevSrv = rr.srv;
      let ok = true;
      const settle = async (seat: string, pid: string, want: boolean, unknownSends: boolean) => {
        const has = !!server[seat];
        if (want === has) return;
        const was = prevSrv ? prevSrv.includes(pid) : undefined;
        const mineChanged = was === undefined ? unknownSends : was === has;
        if (!mineChanged) return; // someone else changed it: the server's stands
        if (await markPaidShared(sh, round, seat, want)) {
          if (want) server[seat] = new Date().toISOString();
          else delete server[seat];
        } else ok = false;
      };
      const mine = rr.paid.includes('me');
      // No earlier sync to compare with: a tick here is sent, an untick doesn't wipe a mark the organiser made.
      await settle(sh.mid, 'me', mine, mine);
      if (sh.owner)
        for (const seat of view.seats) {
          if (seat === sh.mid) continue;
          const pid = sh.seats[seat];
          const want = !!sh.marks?.[seat]?.includes(round);
          if (!pid) continue;
          // Marks only cover people the organiser marks; someone who marked themselves isn't unmarked.
          await settle(seat, pid, want, want);
        }
      view.paid[round] = server;
      if (ok) view.settled = round;
    }
  }
  const res = host.applyBhisi(id, view);
  if (res.news.length) host.bhisiNews(id, res.news);

  // My side.
  const s = host.state();
  const b = s?.bhisis?.find((x) => x.id === id);
  if (!s || !b?.share) return true;
  const box = myBhisiBox(s, b);
  const published = view.members.find((m) => m.mid === sh.mid)?.box;
  if (!published || JSON.stringify(published) !== JSON.stringify(box)) await api({ action: 'b-put', ...cred(sh), box: await seal(sh.key, box), dev });
  return true;
}

/** The seat a person here holds (their own seat over an old name-only one). */
export function seatOf(sh: BhisiShare, pid: string): string | undefined {
  if (pid === 'me') return sh.mid;
  const keys = Object.keys(sh.seats).filter((k) => sh.seats[k] === pid);
  return keys.find((k) => !k.startsWith('g')) ?? keys[0];
}
