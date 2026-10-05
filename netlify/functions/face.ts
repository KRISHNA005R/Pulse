// GIF profile photos. What they are and how they are kept: netlify/lib/faces.ts.
//
//   GET  /api/face?id=<id>                              -> the GIF
//   POST /api/face  { action: 'put', gif: <base64> }    -> { ok, id }    with  Authorization: Bearer <token>
//   POST /api/face  { action: 'delete' }                -> { ok }        with  Authorization: Bearer <token>
import { getStore } from '@netlify/blobs';
import type { AuthStore } from '../lib/auth';
import { FACE_MAX_BYTES, handleFace, readFace } from '../lib/faces';
import { json } from './stats';

export default async (req: Request) => {
  try {
    const store = getStore({ name: 'pulse-accounts', consistency: 'strong' }) as unknown as AuthStore;
    if (req.method === 'GET') {
      const gif = await readFace(store, new URL(req.url).searchParams.get('id') ?? '');
      if (!gif) return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
      // An id never gets a different picture, so a phone can keep its copy for good.
      return new Response(new Blob([gif.slice().buffer as ArrayBuffer], { type: 'image/gif' }), { status: 200, headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
    }
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    const text = await req.text();
    if (text.length > FACE_MAX_BYTES * 1.4 + 2000) return json({ ok: false, error: 'That GIF is too big.' }, 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return json({ ok: false, error: 'bad request' }, 400);
    }
    const r = await handleFace(body, store, (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
    return json(r.body, r.status);
  } catch (e) {
    console.error('face failed', e);
    return json({ ok: false, error: 'Something went wrong. Try again.' }, 500);
  }
};
