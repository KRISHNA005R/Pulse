import type { InviteIn, State } from '../types';

// Invites to a group or a bhisi, sent to a friend instead of a link. They travel in the sealed box
// of the two-person channel, so only that friend can read them. The friend taps Join, which opens
// the same #link anyone with the invite link would open.

/** What a box carries. */
export interface BoxInvite {
  id: string;
  k: 'g' | 'b';
  h: string;
  name: string;
  at: string;
}

const H = /^#(group|b|bhisi)=[A-Za-z0-9_.-]{10,400}$/;
const ID = /^[a-z0-9]{6,24}$/;
const KEEP_DAYS = 30;
const old = (at: string, days: number, now: number) => !(Date.parse(at) > now - days * 864e5);

/** The #part of an invite link, or '' if it isn't one. */
export function inviteHash(url: string): string {
  const i = url.indexOf('#');
  const h = i < 0 ? '' : url.slice(i);
  return H.test(h) ? h : '';
}

/** Send an invite to these friends. One per friend and link: sending again just refreshes it. */
export function addInvites(s: State, k: 'g' | 'b', url: string, name: string, to: string[], now = Date.now()): number {
  const h = inviteHash(url);
  if (!h) return 0;
  const at = new Date(now).toISOString();
  const out = (s.invitesOut ?? []).filter((x) => !old(x.at, KEEP_DAYS, now));
  let n = 0;
  for (const pid of to) {
    if (!s.people.some((p) => p.id === pid && p.link)) continue;
    const had = out.find((x) => x.to === pid && x.h === h);
    if (had) had.at = at;
    else out.push({ id: Math.random().toString(36).slice(2, 12).padEnd(8, '0'), to: pid, k, h, name: name.slice(0, 40), at });
    n++;
  }
  s.invitesOut = out.slice(-200);
  return n;
}

/** Who I've already invited with this link. */
export const invitedTo = (s: State, url: string) => {
  const h = inviteHash(url);
  return new Set((s.invitesOut ?? []).filter((x) => x.h === h).map((x) => x.to));
};

/** The invites for one friend's box. */
export function invitesFor(s: State, personId: string, now = Date.now()): BoxInvite[] {
  return (s.invitesOut ?? [])
    .filter((x) => x.to === personId && !old(x.at, KEEP_DAYS, now))
    .slice(-20)
    .map(({ id, k, h, name, at }) => ({ id, k, h, name, at }));
}

/** Take a friend's invites into my list. Returns the new ones. */
export function takeInvites(s: State, personId: string, raw: unknown, now = Date.now()): InviteIn[] {
  const list = (s.invites ?? []).filter((x) => !old(x.at, 60, now) && s.people.some((p) => p.id === x.from));
  const fresh: InviteIn[] = [];
  for (const x of Array.isArray(raw) ? raw.slice(0, 20) : []) {
    const k = x?.k === 'g' || x?.k === 'b' ? x.k : null;
    const id = typeof x?.id === 'string' && ID.test(x.id) ? x.id : '';
    const h = typeof x?.h === 'string' && H.test(x.h) ? x.h : '';
    const at = typeof x?.at === 'string' && Date.parse(x.at) ? new Date(Date.parse(x.at)).toISOString() : '';
    if (!k || !id || !h || !at || old(at, KEEP_DAYS, now)) continue;
    const name = typeof x.name === 'string' ? x.name.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    // Already here (the same invite, or the same link from the same friend): a fresh send asks again.
    const had = list.find((y) => y.from === personId && (y.id === id || y.h === h));
    if (had) {
      if (at > had.at && had.done === 'no') delete had.done;
      had.at = at > had.at ? at : had.at;
      continue;
    }
    const inv: InviteIn = { id, from: personId, k, h, name: name || (k === 'b' ? 'A bhisi' : 'A group'), at };
    list.push(inv);
    fresh.push(inv);
  }
  s.invites = list.slice(-100);
  return fresh;
}

/** Invites still waiting for an answer, newest first. A group or bhisi I'm already in is left out. */
export function openInvites(s: State, k?: 'g' | 'b'): InviteIn[] {
  return (s.invites ?? []).filter((x) => !x.done && (!k || x.k === k) && !alreadyIn(s, x)).sort((a, b) => (a.at < b.at ? 1 : -1));
}

function alreadyIn(s: State, x: InviteIn): boolean {
  if (x.k === 'g') {
    const gid = x.h.match(/^#group=([^.]+)/)?.[1];
    return !!gid && s.groups.some((g) => g.shared?.gid === gid);
  }
  const key = x.h.match(/^#(?:b|bhisi)=(?:[0-9a-f]{32}\.)?([A-Za-z0-9_-]+)/)?.[1] ?? '';
  return !!key && (s.bhisis ?? []).some((b) => !!b.share && (key.endsWith(b.share.key) || key === b.share.key));
}
