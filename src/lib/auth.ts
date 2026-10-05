// PULSE accounts, on the phone's side: is sign-in switched on, who is signed in, and the calls to
// the server (netlify/functions/auth.ts). The screens are in components/Auth.tsx.
//
// Sign-in is switched on from the server: the app asks /api/auth which ways are available. Until
// one is, the app behaves exactly as it did before accounts existed.
import type { ISODate } from '../types';
import { daysBetween } from './format';

const CFG = 'pulse-auth-cfg-v1';
const SESSION = 'pulse-auth-v1';
const NUDGE = 'pulse-auth-nudge-v1';
const FRESH = 'pulse-auth-new-v1';
const ENDPOINT = '/api/auth';

export interface AuthConfig {
  /** Google's client id for PULSE; empty when Google sign-in is off. */
  google: string;
  email: boolean;
}
export interface Account {
  uid: string;
  /** Member number: #1, #2, … in the order people joined. */
  n: number;
  email: string;
  name: string;
  created: string;
  /** The sync code this person's data is saved under. */
  code: string;
}
export interface Session {
  token: string;
  account: Account;
}

const read = <T>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
};

// ---------- is sign-in on? ----------
/** What this device learnt last time, so the app opens the right way even when offline. */
export const cachedConfig = (): AuthConfig | null => read<AuthConfig>(CFG);
/** Ask the server. Null when it can't be reached (offline, or an address with no server). */
export async function fetchConfig(): Promise<AuthConfig | null> {
  try {
    const res = await fetch(ENDPOINT, { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return null;
    const d = (await res.json()) as Partial<AuthConfig>;
    const cfg: AuthConfig = { google: typeof d.google === 'string' ? d.google : '', email: d.email === true };
    write(CFG, cfg);
    return cfg;
  } catch {
    return null;
  }
}
export const authOn = (c: AuthConfig | null) => !!c && (!!c.google || c.email);

// ---------- who is signed in ----------
export const loadSession = (): Session | null => {
  const s = read<Session>(SESSION);
  return s && typeof s.token === 'string' && s.account?.uid ? s : null;
};
export const saveSession = (s: Session | null) => write(SESSION, s);

// ---------- the server ----------
export type Reply = { ok: true; data: Record<string, unknown> } | { ok: false; error: string; offline?: boolean; status?: number };
const OFFLINE = 'No connection. Check your internet and try again.';

export async function authCall(body: Record<string, unknown>, token?: string): Promise<Reply> {
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), cache: 'no-store' });
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { ok: false, error: OFFLINE, offline: true };
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && data.ok !== false) return { ok: true, data };
    return { ok: false, error: typeof data.error === 'string' && data.error.length > 12 ? data.error : 'Something went wrong. Try again.', status: res.status };
  } catch {
    return { ok: false, error: OFFLINE, offline: true };
  }
}

/** Coming back from Google's full-page sign-in: the one-time code in the address bar (#auth=…), taken once. */
export function takeAuthReturn(): { once?: string; failed?: boolean } {
  try {
    const m = location.hash.match(/^#auth(-error)?=([A-Za-z0-9_-]+)$/);
    if (!m) return {};
    history.replaceState(null, '', location.pathname + location.search);
    return m[1] ? { failed: true } : { once: m[2] };
  } catch {
    return {};
  }
}

// ---------- people who were using PULSE before accounts ----------
/** They can put sign-in off for this many days. After that it's needed to open the app. */
export const GRACE_DAYS = 7;
interface Nudge {
  /** The day the "save your PULSE" sheet was first shown. */
  first: ISODate;
  /** The last day it was shown (at most once a day). */
  last: ISODate;
}
export function nudgeInfo(today: ISODate): { daysLeft: number; due: boolean; required: boolean } {
  const n = read<Nudge>(NUDGE);
  if (!n) return { daysLeft: GRACE_DAYS, due: true, required: false };
  const daysLeft = Math.max(0, GRACE_DAYS - daysBetween(n.first, today));
  return { daysLeft, due: n.last !== today && daysLeft > 0, required: daysLeft <= 0 };
}
export function markNudged(today: ISODate) {
  const n = read<Nudge>(NUDGE);
  write(NUDGE, { first: n?.first ?? today, last: today } satisfies Nudge);
}

/** Set when this sign-in made a brand-new account, until the "you're in" screen has been seen. */
export const isFresh = () => read<boolean>(FRESH) === true;
export const setFresh = (on: boolean) => write(FRESH, on ? true : null);

/** Everything about the account leaves this device (signing out, or deleting the account). */
export function forgetAccount() {
  write(SESSION, null);
  write(FRESH, null);
  write(NUDGE, null);
}

// ---------- the member card ----------
export const memberTitle = (n: number) => (n <= 1000 ? 'Day-one member' : 'Member');
export function memberSince(created: string): string {
  const d = new Date(created);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

// ---------- Google ----------
/** Browsers inside other apps (Instagram, Facebook, …). Google refuses to sign people in there. */
export const inAppBrowser = () => /Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat|LinkedInApp|Twitter/i.test(navigator.userAgent);

export interface GoogleId {
  initialize(opts: Record<string, unknown>): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}
let loading: Promise<GoogleId | null> | null = null;
/** Google's own sign-in script: it draws the button and hands back who signed in. Null if it can't load. */
export function loadGoogle(): Promise<GoogleId | null> {
  const ready = () => (window as unknown as { google?: { accounts?: { id?: GoogleId } } }).google?.accounts?.id ?? null;
  if (ready()) return Promise.resolve(ready());
  loading ??= new Promise<GoogleId | null>((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    const done = (v: GoogleId | null) => {
      window.clearTimeout(timer);
      if (!v) loading = null; // let a later try load it again
      resolve(v);
    };
    const timer = window.setTimeout(() => done(ready()), 9000);
    s.onload = () => done(ready());
    s.onerror = () => done(null);
    document.head.appendChild(s);
  });
  return loading;
}
