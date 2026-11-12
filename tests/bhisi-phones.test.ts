import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeed } from '../src/data/seed';
import { handleBhisi } from '../netlify/lib/bhisi';
import { applyBhisi, dropBhisi, flushBhisiOutbox, joinBhisiChannel, leaveOrDeleteBhisi, myBhisiBox, newBhisiShare, newGhostId, pendingBhisiOutbox, syncBhisi, createBhisiChannel, type BhisiHost } from '../src/lib/bhisiShare';
import { merge3 } from '../src/lib/sync';
import type { Bhisi, Person, State } from '../src/types';
import { memStore } from './memstore';

// Several phones, one real Bhisi server (in memory). Each phone is its own PULSE data.

let store = memStore();
let now = new Date('2026-11-01T06:00:00Z');
let offline = false;
const mem = new Map<string, string>();

beforeEach(() => {
  store = memStore();
  now = new Date('2026-11-01T06:00:00Z');
  offline = false;
  mem.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    if (offline) throw new TypeError('Failed to fetch');
    const body = JSON.parse(String(init.body));
    const ctx = { store, pushStore: { async get() { return null; } }, send: async () => 201, vapid: async () => ({}), now };
    const res = await handleBhisi(body, ctx as never);
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { 'content-type': 'application/json' } });
  });
});

interface Phone extends BhisiHost {
  s: State;
  toasts: string[];
}
function phone(name: string, fullName: string, uid: string, upi?: string): Phone {
  const s = createSeed();
  s.mode = 'personal';
  s.today = '2026-11-01';
  s.user = { ...s.user, name, fullName, uid, ...(upi ? { upi } : {}) };
  s.people = [];
  s.bhisis = [];
  const p: Phone = {
    s,
    toasts: [],
    state: () => p.s,
    applyBhisi: (id, v) => applyBhisi(p.s, id, v),
    bhisiGone: (id, why) => {
      dropBhisi(p.s, id);
      if (why) p.toasts.push(why);
    },
    bhisiNews: () => {},
  };
  return p;
}
const person = (name: string, extra: Partial<Person> = {}): Person => ({ id: `p-${name.toLowerCase().replace(/\s+/g, '-')}`, name, short: name.split(' ')[0], hue: 10, ...extra });

/** Organiser makes a bhisi on their phone, the way the store does. */
async function make(o: Phone, byName: Person[]): Promise<Bhisi> {
  for (const p of byName) if (!o.s.people.some((x) => x.id === p.id)) o.s.people.push(p);
  const share = newBhisiShare(true);
  share.ghosts = byName.map((p) => ({ id: newGhostId(), name: p.name, pid: p.id }));
  share.seats = { [share.mid]: 'me', ...Object.fromEntries(share.ghosts.map((g) => [g.id, g.pid])) };
  const members = ['me', ...byName.map((p) => p.id)];
  const b: Bhisi = { id: 'bh1', name: 'Hostel BC', emoji: '🏺', amount: 2000, members, createdAt: '2026-11-01', start: '2026-11-10', rounds: members.map((_, i) => ({ date: `2026-${String(11 + i).padStart(2, '0')}-10`.replace('2026-13', '2027-01'), paid: [] })), share };
  o.s.bhisis!.unshift(b);
  expect(await createBhisiChannel(b)).toBe(true);
  return b;
}
/** Someone opens the invite link, the way the store does. */
async function join(p: Phone, b: Bhisi) {
  const res = await joinBhisiChannel({ bid: b.share!.bid, key: b.share!.key, name: b.name });
  if (!res.ok) throw new Error(res.error);
  p.s.bhisis!.unshift({ id: 'bh-' + p.s.user.name + '-' + res.share.mid.slice(0, 4), name: b.name, emoji: '🏺', amount: 0, members: ['me'], createdAt: '2026-11-01', rounds: [], share: res.share });
}
const sync = async (...ps: Phone[]) => {
  for (const p of ps) for (const b of [...(p.s.bhisis ?? [])]) if (b.share) await syncBhisi(p, b.id);
};
const bh = (p: Phone) => p.s.bhisis![0];
const names = (p: Phone) => bh(p).members.map((m) => (m === 'me' ? `me(${p.s.user.name})` : p.s.people.find((x) => x.id === m)?.name)).sort();

describe('deleting a bhisi reaches everyone', () => {
  it('the organiser deletes it: it disappears from every member’s PULSE, money they recorded stays', async () => {
    const krishna = phone('Krishna', 'Krishna Rao', 'u-krishna');
    const priya = phone('Priya', 'Priya Shah', 'u-priya');
    const b = await make(krishna, []);
    await join(priya, b);
    await sync(krishna, priya, krishna, priya);
    // Priya paid round 1 (recorded as money out on her phone).
    bh(priya).rounds[0].paid.push('me');
    priya.s.transactions.unshift({ id: 't-bhisi', merchant: 'Bhisi · Hostel BC', amount: 2000, type: 'transfer', direction: 'out', category: 'transfer', date: '2026-11-01', account: 'bank', recurring: false, status: 'completed' });

    await leaveOrDeleteBhisi(bh(krishna).share!);
    dropBhisi(krishna.s, 'bh1');
    await sync(priya);

    expect(priya.s.bhisis).toEqual([]);
    expect(priya.s.transactions.some((t) => t.id === 't-bhisi')).toBe(true);
    expect(priya.toasts.join()).toMatch(/Hostel BC was deleted/);
  });

  it('deleted while offline: the deletion is kept and sent when back online', async () => {
    const krishna = phone('Krishna', 'Krishna Rao', 'u-krishna');
    const priya = phone('Priya', 'Priya Shah', 'u-priya');
    const b = await make(krishna, []);
    await join(priya, b);
    await sync(krishna, priya);
    offline = true;
    await leaveOrDeleteBhisi(bh(krishna).share!);
    dropBhisi(krishna.s, 'bh1');
    expect(pendingBhisiOutbox()).toBe(true);
    await sync(priya); // offline: nothing changes
    expect(priya.s.bhisis).toHaveLength(1);
    offline = false;
    await flushBhisiOutbox();
    expect(pendingBhisiOutbox()).toBe(false);
    await sync(priya);
    expect(priya.s.bhisis).toEqual([]);
  });

  it('the organiser’s other phone, synced through the cloud, drops it too and cannot bring it back', async () => {
    const krishna = phone('Krishna', 'Krishna Rao', 'u-krishna');
    const priya = phone('Priya', 'Priya Shah', 'u-priya');
    await make(krishna, []);
    await join(priya, bh(krishna));
    await sync(krishna, priya);
    const laptop = phone('Krishna', 'Krishna Rao', 'u-krishna');
    laptop.s = structuredClone(krishna.s);
    const base = structuredClone(krishna.s);
    // Phone deletes; the laptop hasn't synced yet and syncs the bhisi first.
    await leaveOrDeleteBhisi(bh(krishna).share!);
    dropBhisi(krishna.s, 'bh1');
    await sync(laptop);
    expect(laptop.s.bhisis).toEqual([]);
    expect((await handleBhisi({ action: 'b-get', bid: base.bhisis![0].share!.bid, mid: base.bhisis![0].share!.mid, token: base.bhisis![0].share!.token }, { store, now } as never)).status).toBe(410);
    // And the cloud merge carries the deletion to a device that still has it, rather than each
    // device keeping its own list whole.
    expect(merge3(base, base, krishna.s).bhisis).toEqual([]);
    // A bhisi made on one device reaches the other.
    const other = structuredClone(base);
    other.bhisis = [];
    expect(merge3(null, other, base).bhisis).toHaveLength(1);
  });

  it('a member who leaves is gone from everyone else’s list (before the draws)', async () => {
    const krishna = phone('Krishna', 'Krishna Rao', 'u-krishna');
    const priya = phone('Priya', 'Priya Shah', 'u-priya');
    const amit = phone('Amit', 'Amit Jain', 'u-amit');
    await make(krishna, []);
    await join(priya, bh(krishna));
    await join(amit, bh(krishna));
    await sync(krishna, priya, amit, krishna, priya, amit);
    expect(bh(krishna).members).toHaveLength(3);
    await leaveOrDeleteBhisi(bh(amit).share!);
    dropBhisi(amit.s, bh(amit).id);
    await sync(krishna, priya);
    expect(names(krishna)).toEqual(['Priya Shah', 'me(Krishna)']);
    expect(names(priya)).toEqual(['Krishna Rao', 'me(Priya)']);
  });
});

describe('added by name, then joined with the link', () => {
  async function scene(typed = 'Rahul Verma') {
    const krishna = phone('Krishna', 'Krishna Rao', 'u-krishna', 'krishna@okaxis');
    const rahul = phone('Rahul', 'Rahul Verma', 'u-rahul', 'rahul@ybl');
    const priya = phone('Priya', 'Priya Shah', 'u-priya');
    await make(krishna, [person(typed)]);
    await sync(krishna);
    await join(priya, bh(krishna));
    return { krishna, rahul, priya };
  }

  it('one seat for Rahul on every phone: no duplicate seat, no duplicate person', async () => {
    const { krishna, rahul, priya } = await scene();
    await sync(priya); // Priya sees "Rahul Verma" added by name
    await join(rahul, bh(krishna));
    await sync(rahul, krishna, priya, rahul);

    expect(names(krishna)).toEqual(['Priya Shah', 'Rahul Verma', 'me(Krishna)']);
    expect(names(rahul)).toEqual(['Krishna Rao', 'Priya Shah', 'me(Rahul)']);
    expect(bh(priya).members).toHaveLength(3);
    expect(krishna.s.people.filter((p) => /rahul/i.test(p.name))).toHaveLength(1);
    expect(priya.s.people.filter((p) => /rahul/i.test(p.name))).toHaveLength(1);
    expect(rahul.s.people.filter((p) => /rahul/i.test(p.name))).toHaveLength(0); // never himself
    // Krishna's Rahul is now known by his PULSE id, so the next bhisi or group finds him.
    expect(krishna.s.people.find((p) => p.id === 'p-rahul-verma')?.uid).toBe('u-rahul');
  });

  it('typed just a first name ("Rahul"): still recognised', async () => {
    const { krishna, rahul } = await scene('rahul');
    await join(rahul, bh(krishna));
    await sync(rahul, krishna, rahul);
    expect(bh(krishna).members).toHaveLength(3);
    expect(bh(rahul).members).toHaveLength(3);
  });

  it('paid marks Krishna made for Rahul before he joined stay his, and Rahul sees them', async () => {
    const { krishna, rahul } = await scene();
    const g = bh(krishna).share!.ghosts![0].id;
    // Krishna marks Rahul (by name) paid: the store keeps it as a mark and tells the server.
    bh(krishna).share!.marks = { [g]: [0] };
    bh(krishna).rounds[0].paid.push('p-rahul-verma');
    await sync(krishna);
    await join(rahul, bh(krishna));
    await sync(rahul, krishna, rahul);
    expect(bh(krishna).rounds[0].paid).toContain('p-rahul-verma');
    expect(bh(rahul).rounds[0].paid).toContain('me');
    // Marking him again goes to his real seat, not the old name-only one.
    const seat = Object.keys(bh(krishna).share!.seats).find((k) => bh(krishna).share!.seats[k] === 'p-rahul-verma');
    expect(seat?.startsWith('g')).toBe(false);
  });

  it('Rahul’s phone does not undo a paid mark Krishna made for him', async () => {
    const { krishna, rahul } = await scene();
    await join(rahul, bh(krishna));
    await sync(rahul, krishna, rahul);
    const seat = bh(rahul).share!.mid;
    bh(krishna).share!.marks = { [seat]: [0] };
    bh(krishna).rounds[0].paid.push('p-rahul-verma');
    await sync(krishna, rahul, krishna);
    expect(bh(rahul).rounds[0].paid).toContain('me');
    expect(bh(krishna).rounds[0].paid).toContain('p-rahul-verma');
  });

  it('a different person who happens to join is not merged into a name-only seat', async () => {
    const { krishna, priya } = await scene();
    await sync(priya, krishna, priya);
    expect(bh(krishna).members).toHaveLength(3); // me, Rahul (by name), Priya
    expect(bh(krishna).share!.ghosts).toHaveLength(1);
  });

  it('an older PULSE on Rahul’s phone (never links itself): Krishna’s PULSE links him', async () => {
    const { krishna, rahul } = await scene();
    await join(rahul, bh(krishna));
    // Rahul's old app only publishes his box.
    const sh = bh(rahul).share!;
    const { seal } = await import('../src/lib/friends');
    await handleBhisi({ action: 'b-put', bid: sh.bid, mid: sh.mid, token: sh.token, box: await seal(sh.key, myBhisiBox(rahul.s, bh(rahul))) }, { store, now } as never);
    await sync(krishna);
    expect(bh(krishna).members).toHaveLength(3);
    expect(bh(krishna).share!.ghosts).toEqual([]);
  });
});

describe('two phones of the same person', () => {
  it('both opened the link before syncing: one seat is kept, the other leaves', async () => {
    const krishna = phone('Krishna', 'Krishna Rao', 'u-krishna');
    const priya = phone('Priya', 'Priya Shah', 'u-priya');
    await make(krishna, []);
    await join(priya, bh(krishna));
    const tablet = phone('Priya', 'Priya Shah', 'u-priya');
    await join(tablet, bh(krishna));
    // The cloud sync brings both copies onto both devices.
    const both = merge3(null, priya.s, tablet.s);
    priya.s = structuredClone(both);
    tablet.s = structuredClone(both);
    await sync(priya, tablet, krishna);
    expect(priya.s.bhisis).toHaveLength(1);
    expect(tablet.s.bhisis).toHaveLength(1);
    expect(priya.s.bhisis![0].share!.mid).toBe(tablet.s.bhisis![0].share!.mid);
    expect(bh(krishna).members).toHaveLength(2);
  });
});

describe('UPI: paying the organiser, and the organiser paying the winner', () => {
  it('members get the organiser’s UPI ID, and the organiser gets each member’s', async () => {
    const krishna = phone('Krishna', 'Krishna Rao', 'u-krishna', 'krishna@okaxis');
    const rahul = phone('Rahul', 'Rahul Verma', 'u-rahul', 'rahul@ybl');
    await make(krishna, []);
    await join(rahul, bh(krishna));
    await sync(krishna, rahul, krishna, rahul);
    const org = rahul.s.people.find((p) => p.id === bh(rahul).share!.org);
    expect(org?.name).toBe('Krishna Rao'); // the name they use on PULSE
    expect(org?.upi).toBe('krishna@okaxis');
    expect(krishna.s.people.find((p) => p.name === 'Rahul Verma')?.upi).toBe('rahul@ybl');
  });

  it('a UPI ID typed by hand is kept when the member never shared one', async () => {
    const krishna = phone('Krishna', 'Krishna Rao', 'u-krishna');
    const rahul = phone('Rahul', 'Rahul Verma', 'u-rahul');
    await make(krishna, []);
    await join(rahul, bh(krishna));
    await sync(krishna, rahul, krishna, rahul);
    const org = rahul.s.people.find((p) => p.id === bh(rahul).share!.org)!;
    org.upi = 'typed@okhdfc';
    org.upiTyped = true;
    await sync(krishna, rahul);
    expect(org.upi).toBe('typed@okhdfc');
  });
});
