// @usernames: one per person, unique, made from their name with a little fun ("krishna.kharcha").
// Shared by the server (which enforces them) and the app (which checks as you type).
//
// Rules, like Instagram's: 3–20 characters, a–z, 0–9, "." and "_"; starts and ends with a letter or
// number; no "..". Capitals don't matter (Krishna = krishna). Letters that only look Latin (Cyrillic
// "а", Greek "ο", full-width "ｋ") are folded to the Latin letter first, so nobody can pose as
// someone else with a look-alike name.

/** Look-alike letters → the Latin letter they imitate (the common ones from Cyrillic and Greek). */
const LOOKALIKE: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', ӏ: 'l', ԛ: 'q', ԝ: 'w',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w', ζ: 'z',
};

/** Names that would confuse people or pretend to be PULSE. */
const RESERVED = new Set(['admin', 'administrator', 'pulse', 'pulseapp', 'pulse.app', 'support', 'help', 'helpdesk', 'official', 'team', 'staff', 'root', 'system', 'security', 'billing', 'payments', 'me', 'you', 'null', 'undefined', 'settings', 'api', 'www', 'mod', 'moderator', 'anthropic', 'claude', 'everyone', 'here', 'bot']);

/** The one form a username is stored and compared in. */
export function canon(raw: string): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/^@+/, '')
    .split('')
    .map((ch) => LOOKALIKE[ch] ?? ch)
    .join('');
}

/** Why a username can't be used, or '' when it's fine. Short, for the screen. */
export function problem(raw: string): string {
  const u = canon(raw);
  if (u.length < 3) return 'At least 3 characters.';
  if (u.length > 20) return 'Up to 20 characters.';
  if (/[^a-z0-9._]/.test(u)) return 'Only letters, numbers, . and _';
  if (!/^[a-z0-9]/.test(u) || !/[a-z0-9]$/.test(u)) return 'Start and end with a letter or number.';
  if (u.includes('..')) return 'No two dots in a row.';
  if (/^\d+$/.test(u)) return 'Add a letter or two.';
  if (RESERVED.has(u) || RESERVED.has(u.replace(/[._]/g, ''))) return 'That one’s taken.';
  return '';
}

/** The first name, in plain a–z ("Krishna Rao" → "krishna", "Zoë" → "zoe"). */
export function nameStem(name: string): string {
  const first = String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^a-z0-9]/g, '');
  return (first || 'pulse').slice(0, 11);
}

// A little Gen-Z, a little money, a little desi. Never mean.
const AFTER = ['kharcha', 'vibes', 'era', 'nocap', 'mode', 'szn', 'core', 'paisa', 'moment', 'energy', 'fr', 'bachat', 'arc', 'drip', 'glow', 'mood', 'wave', 'zen', 'bytes', 'spark'];
const BEFORE = ['chai', 'lowkey', 'its', 'just', 'not', 'main', 'big', 'lil', 'team', 'very'];

/** A small, steady number from a string, so the same person gets the same ideas in the same order. */
function seed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Usernames to try for someone, best first: their name with a fun word ("krishna.kharcha",
 * "chai.krishna", "krishna_nocap"), then the same with two digits. All valid; not checked for being free.
 */
export function ideas(name: string, salt = '', count = 12): string[] {
  const n = nameStem(name);
  let r = seed(`${n}|${salt}`) || 1;
  // xorshift: every bit changes, so short lists still get variety.
  const next = () => {
    r ^= r << 13;
    r ^= r >>> 17;
    r ^= r << 5;
    return (r >>>= 0);
  };
  const pick = <T>(xs: T[]) => xs[next() % xs.length];
  const out = new Set<string>();
  for (let i = 0; out.size < count && i < 200; i++) {
    const kind = next() % 4;
    const u =
      kind === 0 ? `${n}.${pick(AFTER)}` : kind === 1 ? `${pick(BEFORE)}.${n}` : kind === 2 ? `${n}_${pick(AFTER)}` : `${n}.${pick(AFTER)}${[11, 12, 21, 22, 24, 27, 33, 44, 55, 77, 88, 99][next() % 12]}`;
    if (!problem(u)) out.add(u);
  }
  // Plain ones first; the ones with a number are for when those are taken.
  return [...out].sort((a, b) => Number(/\d/.test(a)) - Number(/\d/.test(b)));
}
