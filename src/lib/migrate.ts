// One-time move from the old address (pulsemoney.netlify.app) to pulsemoney.in.
// Browsers keep saved data per address, so public/migrate.html on the old address sends the
// person's data here inside the #fragment (never sent to any server). We save it once, only if
// this browser has no data of its own here yet, and remove it from the address bar straight away.

const KEY = 'pulse-state-v1';
const STASH = 'pulse-personal-stash-v1';
export const MIGRATED_FLAG = 'pulse-migrated';

function fromB64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function receiveMigration(): Promise<'moved' | 'kept' | null> {
  const m = location.hash.match(/^#migrate=([zj])\.([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const bytes = fromB64Url(m[2]);
    let text: string;
    if (m[1] === 'z') {
      if (typeof DecompressionStream === 'undefined') return null;
      text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    } else {
      text = new TextDecoder().decode(bytes);
    }
    const payload = JSON.parse(text) as { v?: number; state?: unknown; stash?: unknown };
    if (payload?.v !== 1 || typeof payload.state !== 'string') return null;
    const incoming = JSON.parse(payload.state);
    if (!incoming || typeof incoming.today !== 'string' || !Array.isArray(incoming.transactions) || !Array.isArray(incoming.accounts)) return null;

    let hereMode: string | null = null;
    try {
      const existing = localStorage.getItem(KEY);
      hereMode = existing ? JSON.parse(existing).mode : null;
    } catch {
      /* unreadable, treat as empty */
    }
    if (hereMode === 'personal' || localStorage.getItem(STASH)) return 'kept';

    localStorage.setItem(KEY, payload.state);
    if (typeof payload.stash === 'string') localStorage.setItem(STASH, payload.stash);
    return 'moved';
  } catch {
    return null;
  }
}
