// PULSE sync: stores one end-to-end encrypted copy of a person's data per sync code.
// The server never sees the code, only a hash-derived id, so it can't read anyone's money data.
//
//   GET    /api/sync?id=<64 hex>                        -> { rev, data, updatedAt } | 404
//   PUT    /api/sync  { id, write, baseRev, data }      -> { rev, updatedAt } | 409 { rev, data, updatedAt }
//   DELETE /api/sync  { id, write }                     -> { ok: true }
//
// `write` is a second secret derived from the sync code. Its SHA-256 is saved with the first
// write, and every later write or delete must present it.
import { getStore } from '@netlify/blobs';

type Stored = { rev: number; data: string; updatedAt: string; writeHash: string };
type StoreLike = {
  getWithMetadata(key: string, opts: { type: 'json' }): Promise<{ data: unknown; etag?: string } | null>;
  setJSON(key: string, value: unknown, opts?: { onlyIfMatch?: string; onlyIfNew?: boolean }): Promise<{ modified: boolean } | void>;
  delete(key: string): Promise<void>;
};

const HEX64 = /^[0-9a-f]{64}$/;
const MAX_DATA = 3_000_000; // ~3 MB of encrypted text per person

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function sha256(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handle(req: Request, store: StoreLike): Promise<Response> {
  try {
    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id') ?? '';
      if (!HEX64.test(id)) return json({ error: 'bad id' }, 400);
      const hit = await store.getWithMetadata(id, { type: 'json' });
      if (!hit) return json({ error: 'not found' }, 404);
      const rec = hit.data as Stored;
      return json({ rev: rec.rev, data: rec.data, updatedAt: rec.updatedAt });
    }

    if (req.method === 'PUT' || req.method === 'DELETE') {
      if (Number(req.headers.get('content-length') ?? 0) > MAX_DATA + 2000) return json({ error: 'too big' }, 413);
      const body = (await req.json().catch(() => null)) as { id?: string; write?: string; baseRev?: number; data?: string } | null;
      if (!body || !HEX64.test(body.id ?? '') || !HEX64.test(body.write ?? '')) return json({ error: 'bad request' }, 400);
      const writeHash = await sha256(body.write!);
      const hit = await store.getWithMetadata(body.id!, { type: 'json' });
      const rec = hit?.data as Stored | undefined;
      if (rec && rec.writeHash !== writeHash) return json({ error: 'forbidden' }, 403);

      if (req.method === 'DELETE') {
        if (rec) await store.delete(body.id!);
        return json({ ok: true });
      }

      if (typeof body.data !== 'string' || !body.data || body.data.length > MAX_DATA) return json({ error: 'bad data' }, 400);
      const baseRev = Number(body.baseRev ?? 0);
      // Someone else (another device) saved first: send back theirs so this device can merge.
      if ((rec?.rev ?? 0) !== baseRev) return json({ rev: rec?.rev ?? 0, data: rec?.data ?? null, updatedAt: rec?.updatedAt ?? null }, 409);
      const next: Stored = { rev: baseRev + 1, data: body.data, updatedAt: new Date().toISOString(), writeHash };
      // Conditional write, so two devices saving at the same instant can't overwrite each other.
      const res = rec ? await store.setJSON(body.id!, next, hit?.etag ? { onlyIfMatch: hit.etag } : undefined) : await store.setJSON(body.id!, next, { onlyIfNew: true });
      if (res && res.modified === false) {
        const now = (await store.getWithMetadata(body.id!, { type: 'json' }))?.data as Stored | undefined;
        return json({ rev: now?.rev ?? 0, data: now?.data ?? null, updatedAt: now?.updatedAt ?? null }, 409);
      }
      return json({ rev: next.rev, updatedAt: next.updatedAt });
    }

    return json({ error: 'method not allowed' }, 405);
  } catch (e) {
    console.error('sync error', e);
    return json({ error: 'server error' }, 500);
  }
}

export default async (req: Request) => handle(req, getStore({ name: 'pulse-sync', consistency: 'strong' }) as unknown as StoreLike);

// Reached at /.netlify/functions/sync; public/_redirects maps /api/sync to it.
