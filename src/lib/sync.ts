import type { State, Transaction } from '../types';
import { isAuto } from './auto';
import { applyMoney } from './finance';
import { canCompress, deflate, fromB64Url, inflate, toB64Url, utf8 } from './codec';

// ------------------------------------------------------------------
// PULSE sync: the same data on every device that knows the sync code.
//
// The code (PULSE-XXXX-XXXX-XXXX-XXXX, 80 random bits) never leaves the device. From it we derive:
//   · an AES-GCM key that encrypts the data before upload,
//   · a storage id (what the server files it under),
//   · a write secret (so nobody else can overwrite it).
// The server only ever holds ciphertext, so it can't read anyone's money data.
// ------------------------------------------------------------------

const CFG_KEY = 'pulse-sync-v1';
const BASE_KEY = 'pulse-sync-base-v1';
const ENDPOINT = '/api/sync';
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U

export interface SyncConfig {
  code: string;
  /** Server revision this device last saw. */
  rev: number;
  lastSync?: string;
}

// ---------- the code ----------
export function newSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => ALPHABET[b % 32]).join('');
  return formatCode(chars);
}

const formatCode = (sixteen: string) => `PULSE-${sixteen.match(/.{4}/g)!.join('-')}`;

/** Accepts the code however it was typed or pasted: spaces, lowercase, missing dashes, O for 0. */
export function normalizeCode(input: string): string | null {
  let s = input.toUpperCase().replace(/^.*#SYNC=/, '').replace(/[\s-]+/g, '');
  if (s.startsWith('PULSE')) s = s.slice(5);
  s = s.replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== 16 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return formatCode(s);
}

export const syncLink = (code: string) => `${location.origin}/#sync=${code}`;

/** A sync code arriving in the address bar (#sync=…), taken once and removed from the URL. */
export function takeSyncLink(): string | null {
  const m = location.hash.match(/^#sync=([A-Za-z0-9-]+)$/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return normalizeCode(m[1]);
}

// ---------- keys ----------
interface Keys {
  id: string;
  write: string;
  key: CryptoKey;
}
const keyCache = new Map<string, Promise<Keys>>();
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

function keysFor(code: string): Promise<Keys> {
  let k = keyCache.get(code);
  if (!k) {
    k = (async () => {
      const base = await crypto.subtle.importKey('raw', utf8(code), 'PBKDF2', false, ['deriveBits']);
      const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: utf8('pulse-sync-v1'), iterations: 150_000, hash: 'SHA-256' }, base, 768));
      const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
      return { key, id: hex(bits.slice(32, 64)), write: hex(bits.slice(64, 96)) };
    })();
    keyCache.set(code, k);
  }
  return k;
}

async function seal(code: string, state: State): Promise<string> {
  const { key } = await keysFor(code);
  const json = JSON.stringify(state);
  const zip = canCompress();
  const plain = zip ? await deflate(json) : utf8(json);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return `v1${zip ? 'z' : 'j'}.${toB64Url(iv)}.${toB64Url(ct)}`;
}

async function open(code: string, data: string): Promise<State> {
  const { key } = await keysFor(code);
  const m = data.match(/^v1([zj])\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error('format');
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64Url(m[2]) }, key, fromB64Url(m[3])));
  const json = m[1] === 'z' ? await inflate(plain) : new TextDecoder().decode(plain);
  return JSON.parse(json) as State;
}

// ---------- local bookkeeping ----------
export function loadSync(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}
export function saveSync(cfg: SyncConfig | null) {
  try {
    if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    else {
      localStorage.removeItem(CFG_KEY);
      localStorage.removeItem(BASE_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}
/** The last version both this device and the server agreed on, used to merge changes. */
export function loadBase(): State | null {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    return raw ? (JSON.parse(raw) as State) : null;
  } catch {
    return null;
  }
}
export function saveBase(s: State) {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(s));
  } catch {
    /* storage full: merging falls back to "keep both" */
  }
}

// ---------- talking to the server ----------
export class SyncUnavailable extends Error {}

async function call(method: string, body?: unknown, query = ''): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT + query, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch {
    throw new SyncUnavailable('offline');
  }
  // A static host without the sync function answers with the app page or a 404 page.
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new SyncUnavailable('no-server');
  return res;
}

export async function pull(code: string): Promise<{ rev: number; state: State } | null> {
  const { id } = await keysFor(code);
  const res = await call('GET', undefined, `?id=${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`pull ${res.status}`);
  const body = (await res.json()) as { rev: number; data: string };
  return { rev: body.rev, state: await open(code, body.data) };
}

export type PushResult = { ok: true; rev: number } | { ok: false; rev: number; state: State | null };

export async function push(code: string, state: State, baseRev: number): Promise<PushResult> {
  const { id, write } = await keysFor(code);
  const res = await call('PUT', { id, write, baseRev, data: await seal(code, state) });
  if (res.status === 409) {
    const body = (await res.json()) as { rev: number; data: string | null };
    return { ok: false, rev: body.rev, state: body.data ? await open(code, body.data) : null };
  }
  if (res.status === 403) throw new Error('forbidden');
  if (!res.ok) throw new Error(`push ${res.status}`);
  return { ok: true, rev: ((await res.json()) as { rev: number }).rev };
}

export async function removeRemote(code: string) {
  const { id, write } = await keysFor(code);
  await call('DELETE', { id, write });
}

// ------------------------------------------------------------------
// Three-way merge: what changed on this device since the last sync, what changed on the other
// devices, and a sensible answer when both touched the same thing.
// ------------------------------------------------------------------
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type WithId = { id: string };

/**
 * Running totals that every transaction nudges (account balances, money saved in a plan). When two
 * devices both move one, the moves add up instead of one overwriting the other.
 */
const COUNTERS: Record<string, string[]> = { accounts: ['balance'], cards: ['balance'], plans: ['saved', 'cycleReserve'], debts: ['remaining'] };
/** Lists inside a record that only ever grow, like a plan's contributions: keep additions from both. */
const APPEND: Record<string, string[]> = { plans: ['contributions'] };

function mergeBag<T>(base: T[] = [], local: T[] = [], remote: T[] = []): T[] {
  // Multiset three-way merge for small lists without ids.
  const count = (xs: T[]) => xs.reduce((m, x) => m.set(JSON.stringify(x), (m.get(JSON.stringify(x)) ?? 0) + 1), new Map<string, number>());
  const B = count(base);
  const L = count(local);
  const R = count(remote);
  const out: T[] = [];
  for (const k of new Set([...B.keys(), ...L.keys(), ...R.keys()])) {
    const b = B.get(k) ?? 0;
    const n = Math.max(0, b + ((L.get(k) ?? 0) - b) + ((R.get(k) ?? 0) - b));
    for (let i = 0; i < n; i++) out.push(JSON.parse(k));
  }
  return out;
}

function combine<T extends WithId>(kind: string, b: T | undefined, l: T, r: T, preferLocal: boolean): T {
  const win = { ...(preferLocal ? l : r) } as Record<string, unknown>;
  if (!b) return win as T;
  const B = b as unknown as Record<string, unknown>;
  const Lr = l as unknown as Record<string, unknown>;
  const Rr = r as unknown as Record<string, unknown>;
  // Other fields: each side's change wins over "unchanged".
  for (const k of new Set([...Object.keys(Lr), ...Object.keys(Rr)])) {
    if (same(Lr[k], B[k])) win[k] = Rr[k];
    else if (same(Rr[k], B[k])) win[k] = Lr[k];
  }
  for (const f of COUNTERS[kind] ?? []) {
    const bv = Number(B[f] ?? 0);
    if (typeof Lr[f] === 'number' && typeof Rr[f] === 'number') win[f] = Math.round((bv + (Lr[f] as number) - bv + ((Rr[f] as number) - bv)) * 100) / 100;
  }
  for (const f of APPEND[kind] ?? []) win[f] = mergeBag(B[f] as unknown[], Lr[f] as unknown[], Rr[f] as unknown[]);
  return win as T;
}

/** Records whose running totals were added up from both devices in the merge under way. */
let addedUp = new Set<string>();

/**
 * Both devices recorded the same automatic entry (an EMI, a SIP, a bill, a payday) before they
 * synced. The entry itself merges into one, but where the two devices' changes to a balance were
 * added together it was counted twice. Take one copy back out of exactly those balances.
 */
function undoDouble(out: State, tx: Transaction) {
  const probe = structuredClone({ accounts: out.accounts, cards: out.cards, plans: out.plans, debts: out.debts }) as State;
  applyMoney(probe, tx, 1);
  for (const [kind, fields] of Object.entries(COUNTERS)) {
    const now = (out as unknown as Record<string, WithId[]>)[kind] ?? [];
    const then = (probe as unknown as Record<string, WithId[]>)[kind] ?? [];
    now.forEach((rec, i) => {
      if (!addedUp.has(`${kind}:${rec.id}`)) return;
      const a = rec as unknown as Record<string, number>;
      const b = then[i] as unknown as Record<string, number>;
      for (const f of fields) {
        const moved = (b[f] ?? 0) - (a[f] ?? 0);
        if (moved) a[f] = Math.round(((a[f] ?? 0) - moved) * 100) / 100;
      }
    });
  }
}

function mergeList<T extends WithId>(kind: string, base: T[] | undefined, local: T[] | undefined, remote: T[] | undefined, preferLocal: boolean): T[] {
  const B = new Map((base ?? []).map((x) => [x.id, x]));
  const L = new Map((local ?? []).map((x) => [x.id, x]));
  const R = new Map((remote ?? []).map((x) => [x.id, x]));
  const pick = (id: string): T | null => {
    const b = B.get(id);
    const l = L.get(id);
    const r = R.get(id);
    if (l && r) {
      if (same(l, r)) return l;
      if (b && same(l, b)) return r; // only the other device changed it
      if (b && same(r, b)) return l; // only this device changed it
      if (b) addedUp.add(`${kind}:${id}`);
      return combine(kind, b, l, r, preferLocal); // both changed it: add up totals, newest wins the rest
    }
    if (l) return b && same(l, b) ? null : l; // deleted elsewhere (unless edited here)
    if (r) return b && same(r, b) ? null : r; // deleted here (unless edited elsewhere)
    return null;
  };
  const out: T[] = [];
  const seen = new Set<string>();
  // Things only the other device has go first (usually the newest), then this device's order.
  for (const x of remote ?? []) if (!L.has(x.id) && !seen.has(x.id)) { const v = pick(x.id); seen.add(x.id); if (v) out.push(v); }
  for (const x of local ?? []) if (!seen.has(x.id)) { const v = pick(x.id); seen.add(x.id); if (v) out.push(v); }
  return out;
}

function mergeObject<T extends object>(base: T | undefined, local: T, remote: T, preferLocal: boolean): T {
  const out = { ...remote, ...local } as Record<string, unknown>;
  const keys = new Set([...Object.keys(local ?? {}), ...Object.keys(remote ?? {})]);
  for (const k of keys) {
    const b = (base as unknown as Record<string, unknown> | undefined)?.[k];
    const l = (local as unknown as Record<string, unknown>)[k];
    const r = (remote as unknown as Record<string, unknown>)[k];
    if (same(l, r)) out[k] = l;
    else if (same(l, b)) out[k] = r;
    else if (same(r, b)) out[k] = l;
    else out[k] = preferLocal ? l : r;
  }
  return out as T;
}

function mergeStrings(base: string[] = [], local: string[] = [], remote: string[] = []): string[] {
  const b = new Set(base);
  const keep = (x: string, other: string[]) => !b.has(x) || other.includes(x);
  return [...new Set([...local.filter((x) => keep(x, remote)), ...remote.filter((x) => keep(x, local))])];
}

const LISTS = ['accounts', 'cards', 'debts', 'categories', 'transactions', 'budgets', 'plans', 'subscriptions', 'investments', 'insurance', 'incomes', 'people', 'groups', 'splits', 'settlements'] as const;

/**
 * Merge this device's data with another device's. `base` is the last synced copy (null the first
 * time two devices meet, which keeps everything from both). `preferLocal` decides ties.
 */
export function merge3(base: State | null, local: State, remote: State, preferLocal = false): State {
  const out = { ...remote, ...local } as State;
  addedUp = new Set();
  for (const k of LISTS) {
    (out as unknown as Record<string, unknown>)[k] = mergeList(k, base?.[k] as WithId[] | undefined, local[k] as WithId[], remote[k] as WithId[], preferLocal);
  }
  if (base) {
    const ids = (s: State) => new Set(s.transactions.map((t) => t.id));
    const B = ids(base);
    const L = ids(local);
    const R = ids(remote);
    for (const tx of out.transactions) if (isAuto(tx) && !B.has(tx.id) && L.has(tx.id) && R.has(tx.id)) undoDouble(out, tx);
  }
  out.transactions = [...out.transactions].sort((a, b) => b.date.localeCompare(a.date));
  out.settings = mergeObject(base?.settings, local.settings, remote.settings, preferLocal);
  out.user = mergeObject(base?.user, local.user, remote.user, preferLocal);
  out.onboarding = { ...mergeObject(base?.onboarding, local.onboarding, remote.onboarding, preferLocal), done: true };
  out.dismissedDetections = mergeStrings(base?.dismissedDetections, local.dismissedDetections, remote.dismissedDetections);
  const nw = new Map<string, { month: string; value: number }>();
  for (const p of [...(remote.netWorthHistory ?? []), ...(local.netWorthHistory ?? [])]) nw.set(p.month, p);
  out.netWorthHistory = [...nw.values()].sort((a, b) => a.month.localeCompare(b.month));
  out.today = local.today > remote.today ? local.today : remote.today;
  out.mode = 'personal';
  return out;
}

/** True when two copies hold the same data (ignoring the date each device last opened on). */
export function sameData(a: State | null, b: State | null) {
  if (!a || !b) return false;
  return same({ ...a, today: '' }, { ...b, today: '' });
}
