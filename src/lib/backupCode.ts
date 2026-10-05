import type { State } from '../types';
import { canCompress, deflate, fromB64Url, inflate, sha256Hex, toB64Url, utf8 } from './codec';

// Backup codes: the person's data packed into one line of text they can copy, share or save.
//   PULSE1-z<base64url deflate of the JSON>-<8 hex check>
// The check catches a code that was cut off or changed while copying, before anything is restored.
// Older plain-JSON backups are still accepted.

const PREFIX = 'PULSE1-';

export async function encodeBackup(state: State): Promise<string> {
  // The profile photo stays out: it would make the code many times longer, and it is easy to add again.
  const json = JSON.stringify({ app: 'pulse', version: 2, savedAt: new Date().toISOString(), state: { ...state, user: { ...state.user, photo: undefined } } });
  const zip = canCompress();
  const body = zip ? await deflate(json) : utf8(json);
  const check = (await sha256Hex(body)).slice(0, 8);
  return `${PREFIX}${zip ? 'z' : 'j'}${toB64Url(body)}-${check}`;
}

export type DecodeResult = { ok: true; state: State; savedAt?: string } | { ok: false; error: string };

const looksLikeState = (s: unknown): s is State => {
  const x = s as State;
  return !!x && typeof x.today === 'string' && Array.isArray(x.transactions) && Array.isArray(x.accounts) && Array.isArray(x.plans);
};

export async function decodeBackup(input: string): Promise<DecodeResult> {
  const text = input.trim();
  const bad = { ok: false as const, error: "That doesn't look like a PULSE backup code. Copy the whole code, starting with PULSE1-." };
  if (!text) return bad;
  // Older backups: plain JSON
  if (text.startsWith('{')) {
    try {
      const data = JSON.parse(text);
      const st = data?.state ?? data;
      return looksLikeState(st) ? { ok: true, state: st, savedAt: data?.savedAt } : bad;
    } catch {
      return { ok: false, error: 'This backup looks cut off. Copy it again, all the way to the end.' };
    }
  }
  // Codes can pick up spaces or line breaks when pasted through chat apps.
  const code = text.replace(/\s+/g, '');
  const m = code.match(/^PULSE1-([zj])([A-Za-z0-9_-]+)-([0-9a-f]{8})$/);
  if (!m) {
    if (code.startsWith(PREFIX)) return { ok: false, error: 'This code looks cut off. Copy it again, all the way to the end.' };
    return bad;
  }
  try {
    const body = fromB64Url(m[2]);
    if ((await sha256Hex(body)).slice(0, 8) !== m[3]) return { ok: false, error: 'This code has a typo or a missing piece. Copy it again from the original.' };
    if (m[1] === 'z' && !canCompress()) return { ok: false, error: 'This browser is too old to open this code. Update it, or try Chrome.' };
    const json = m[1] === 'z' ? await inflate(body) : new TextDecoder().decode(body);
    const data = JSON.parse(json);
    return looksLikeState(data?.state) ? { ok: true, state: data.state, savedAt: data.savedAt } : bad;
  } catch {
    return { ok: false, error: 'This code has a typo or a missing piece. Copy it again from the original.' };
  }
}
