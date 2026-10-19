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
import { api, hex, label, rand, seal, unseal } from './friends';
import { fromB64Url, toB64Url } from './codec';
import { pot } from './bhisi';
import { applyMoney, defaultAccount } from './finance';
import { okFace } from './photo';

export interface MemberBox {
  v: 1;
  name: string;
  uid?: string;
  face?: string;
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
  members: { mid: string; box: MemberBox | null; rev: number; owner: boolean; gone: boolean }[];
  draws: { r: number; w: string; at: string; by?: string; odds?: Record<string, number> }[];
  /** When each seat paid each round (server time). */
  paid: Record<string, Record<string, string>>;
}

export const newBhisiShare = (owner: boolean): BhisiShare => ({ bid: hex(rand(16)), key: toB64Url(rand(32)), mid: hex(rand(8)), token: toB64Url(rand(24)), owner, seats: {} });
export const newGhostId = () => `g${hex(rand(6))}`;

/** The key sits after the #, which browsers never send to a server. */
export const bhisiUrl = (b: Bhisi) => (b.share ? `${location.origin}/#bhisi=${b.share.bid}.${b.share.key}.${label(b.name)}` : '');

export interface BhisiInvite {
  bid: string;
  key: string;
  name: string;
}
export function parseBhisiLink(text: string): BhisiInvite | null {
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
    const m = location.hash.match(/^#(bhisi=.+)$/);
    if (m) {
      localStorage.setItem(KEEP, m[1]);
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

const cred = (sh: BhisiShare) => ({ bid: sh.bid, mid: sh.mid, token: sh.token });
const OFFLINE = 'No connection. Check your internet and try again.';

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

/** Leaving for good (account deleted, or all data erased): my chit comes out of the matka. */
export async function leaveBhisiForGood(sh: BhisiShare) {
  await api({ action: 'b-leave', ...cred(sh), deleted: true });
}

export async function deleteBhisiChannel(sh: BhisiShare) {
  await api({ action: sh.owner ? 'b-delete' : 'b-leave', ...cred(sh) });
}

// ---------------------------------------------------------------------------------------------
// Putting what the server says into the data
// ---------------------------------------------------------------------------------------------
export interface BhisiNews {
  round: number;
  winner: string; // person id here
}

/**
 * Rebuild one shared bhisi from the server's view. My own ticks stay as they are here; everyone
 * else's come from their boxes (and the organiser's marks). Returns rounds that were newly drawn,
 * and, for the organiser, a new list of name-only seats when someone they'd added has now joined.
 */
export function applyBhisi(s: State, id: string, v: BhisiView): { news: BhisiNews[]; ghosts?: string[] } {
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

  // Organiser: someone they added by name has joined with the link → that name-only seat goes.
  let ghosts: string[] | undefined;
  if (sh.owner && !v.locked && sh.ghosts?.length) {
    const keep = sh.ghosts.filter((g) => {
      const p = s.people.find((x) => x.id === g.pid);
      const hit = v.members.find((m) => m.mid !== sh.mid && !m.gone && m.box && ((p?.uid && m.box.uid === p.uid) || m.box.name.trim().toLowerCase() === g.name.trim().toLowerCase()));
      if (hit) sh.seats[hit.mid] = g.pid;
      return !hit;
    });
    if (keep.length !== sh.ghosts.length) {
      sh.ghosts = keep;
      ghosts = keep.map((g) => g.id);
    }
  }

  // Who each seat is, here.
  const ghostNames = new Map((sh.owner ? sh.ghosts ?? [] : owner?.ghosts ?? []).map((g) => [g.id, g.name] as const));
  const person = (seat: string): string => {
    if (seat === sh.mid) return 'me';
    const known = sh.seats[seat];
    if (known && (known === 'me' || s.people.some((p) => p.id === known))) return known;
    const box = v.members.find((m) => m.mid === seat)?.box;
    const name = (box?.name || ghostNames.get(seat) || 'Someone').slice(0, 40);
    const byUid = box?.uid ? s.people.find((p) => p.uid === box.uid) : undefined;
    const byName = !box ? s.people.find((p) => p.name.toLowerCase() === name.toLowerCase()) : undefined;
    let p: Person | undefined = byUid ?? byName;
    if (!p) {
      p = { id: newId('p'), name, short: name.split(' ')[0], hue: Math.floor(Math.random() * 360), ...(box?.uid ? { uid: box.uid } : {}) };
      s.people.push(p);
    }
    if (box?.face && okFace(box.face) && !p.photo) p.photo = box.face;
    sh.seats[seat] = p.id;
    return p.id;
  };

  const seats = v.seats.length ? v.seats : [sh.mid];
  const members = seats.map(person);
  const marks = sh.owner ? sh.marks ?? {} : owner?.marks ?? {};
  const prev = b.rounds;
  const news: BhisiNews[] = [];
  const start = v.start || b.start || s.today;
  b.members = members;
  b.rounds = seats.map((_, i) => {
    const old = prev[i] ?? { date: addMonths(start, i), paid: [] };
    const paidBy = seats
      .filter((seat) => {
        if (seat === sh.mid) return old.paid.includes('me');
        if (v.paid[i]?.[seat]) return true;
        const box = v.members.find((m) => m.mid === seat)?.box;
        return !!box?.paid?.includes(i) || !!marks[seat]?.includes(i);
      })
      .map((seat) => sh.seats[seat]);
    const draw = v.draws.find((d) => d.r === i);
    const winner = draw ? person(draw.w) : undefined;
    if (winner && !old.winner) news.push({ round: i, winner });
    const pool = draw ? seats.length - v.draws.filter((d) => d.r < i).length : undefined;
    const paidAt = Object.fromEntries(Object.entries(v.paid[i] ?? {}).map(([seat, t]) => [person(seat), t]));
    const odds = draw?.odds ? Object.fromEntries(Object.entries(draw.odds).map(([seat, n]) => [person(seat), n])) : undefined;
    return { ...old, date: addMonths(start, i), paid: paidBy, winner, drawnAt: draw ? draw.at.slice(0, 10) : undefined, at: draw?.at, drawnBy: draw?.by ? person(draw.by) : undefined, pool, paidAt, ...(odds ? { odds } : {}) };
  });

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
  return { news, ghosts };
}

/** What this phone publishes for one bhisi. */
export function myBhisiBox(s: State, b: Bhisi): MemberBox {
  const sh = b.share!;
  const box: MemberBox = {
    v: 1,
    name: s.user.name || 'Someone',
    ...(s.user.uid ? { uid: s.user.uid } : {}),
    ...(s.user.face ? { face: s.user.face } : {}),
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
  applyBhisi(id: string, view: BhisiView): { news: BhisiNews[]; ghosts?: string[] };
  bhisiGone(id: string, why: string): void;
  bhisiNews(id: string, news: BhisiNews[]): void;
}

/** Read one shared bhisi from the server, then publish my box if it changed. */
export async function syncBhisi(host: BhisiHost, id: string, dev?: string): Promise<boolean> {
  const b0 = host.state()?.bhisis?.find((x) => x.id === id);
  const sh = b0?.share;
  if (!b0 || !sh) return true;
  let r = await api({ action: 'b-get', ...cred(sh), dev });
  if (!r) return false;
  if ((r.status === 404 || (r.status === 403 && r.data.error === 'not a member')) && sh.owner && !b0.rounds.some((x) => x.winner)) {
    // Made offline: put it on the server now.
    if (!(await createBhisiChannel(b0, dev))) return navigator.onLine;
    r = await api({ action: 'b-get', ...cred(sh), dev });
    if (!r) return false;
  }
  if (r.status === 404 || r.status === 403) {
    host.bhisiGone(id, r.status === 404 ? `${b0.name} was deleted by the person who made it. Your history stays.` : `You’re no longer in ${b0.name}. Your history stays.`);
    return true;
  }
  if (r.status !== 200) return true;
  const view = await readView(sh, r.data);
  // Ticks made here that the server hasn't heard about yet (made offline): send them now.
  {
    const here = host.state()?.bhisis?.find((x) => x.id === id);
    const round = here ? here.rounds.findIndex((x) => !x.winner) : -1;
    if (here && round >= 0 && !view.draws.some((d) => d.r === round)) {
      const server = view.paid[round] ?? {};
      const mine = here.rounds[round].paid.includes('me');
      if (mine !== !!server[sh.mid] && (await markPaidShared(sh, round, sh.mid, mine))) {
        if (mine) server[sh.mid] = new Date().toISOString();
        else delete server[sh.mid];
        view.paid[round] = server;
      }
      if (sh.owner)
        for (const [seat, rounds] of Object.entries(sh.marks ?? {})) {
          const want = rounds.includes(round);
          if (want !== !!server[seat] && (await markPaidShared(sh, round, seat, want))) {
            if (want) server[seat] = new Date().toISOString();
            else delete server[seat];
            view.paid[round] = server;
          }
        }
    }
  }
  const res = host.applyBhisi(id, view);
  if (res.news.length) host.bhisiNews(id, res.news);
  if (res.ghosts) await api({ action: 'b-setup', ...cred(sh), ghosts: res.ghosts });

  // My side.
  const s = host.state();
  const b = s?.bhisis?.find((x) => x.id === id);
  if (!s || !b?.share) return true;
  const box = myBhisiBox(s, b);
  const published = view.members.find((m) => m.mid === sh.mid)?.box;
  if (!published || JSON.stringify(published) !== JSON.stringify(box)) await api({ action: 'b-put', ...cred(sh), box: await seal(sh.key, box), dev });
  return true;
}
