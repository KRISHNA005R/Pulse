// The profile photo: whatever picture someone chooses is cut to a small square and kept as text
// inside their PULSE data, so it travels with their account like everything else. Friends they are
// connected with on PULSE get a much smaller copy, to show next to their name.

const SIZE = 256;
/** Keep the stored photo small: it is saved and synced with every change. */
const MAX_CHARS = 60_000;

async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void } | null> {
  try {
    if ('createImageBitmap' in window) {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
    }
  } catch {
    /* fall through to an <img> */
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** The copy friends get is much smaller: it is shown as a little circle, and every friend's copy is kept on this phone. */
const FACE = 96;
const FACE_CHARS = 9_000;

function square(pic: { src: CanvasImageSource; w: number; h: number }, size: number, maxChars: number): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const side = Math.min(pic.w, pic.h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(pic.src, (pic.w - side) / 2, (pic.h - side) / 2, side, side, 0, 0, size, size);
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.startsWith('data:image/jpeg') && url.length <= maxChars) return url;
  }
  return null;
}

/**
 * A chosen picture as two square JPEGs (centre crop): `photo` for the person's own profile and
 * `face`, the tiny one their friends see. Null when the file isn't a picture this phone can read.
 */
export async function squarePhoto(file: Blob): Promise<{ photo: string; face: string } | null> {
  const pic = await decode(file);
  if (!pic || !pic.w || !pic.h) return null;
  try {
    const photo = square(pic, SIZE, MAX_CHARS);
    const face = square(pic, FACE, FACE_CHARS);
    return photo && face ? { photo, face } : null;
  } catch {
    return null;
  } finally {
    pic.done();
  }
}

/** The two still pictures from one frame of a GIF (its first frame), given as RGBA pixels. */
export function stillsOf(rgba: Uint8ClampedArray, size: number): { photo: string; face: string } | null {
  try {
    const src = document.createElement('canvas');
    src.width = src.height = size;
    src.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(rgba), size, size), 0, 0);
    const pic = { src, w: size, h: size };
    const photo = square(pic, SIZE, MAX_CHARS);
    const face = square(pic, FACE, FACE_CHARS);
    return photo && face ? { photo, face } : null;
  } catch {
    return null;
  }
}

/** The small copy for friends, made from a profile photo that was added before friends could see photos. */
export async function faceOf(photo: string): Promise<string | null> {
  try {
    return (await squarePhoto(await (await fetch(photo)).blob()))?.face ?? null;
  } catch {
    return null;
  }
}

/** Only our own small pictures are ever shown, never an address that points somewhere else. */
export const okPhoto = (p: unknown): p is string => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,') && p.length <= MAX_CHARS;
/** The same check for a picture that came from a friend's phone. */
export const okFace = (p: unknown): p is string => typeof p === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(p) && p.length <= FACE_CHARS;

// ---------- a GIF as the photo ----------
// A GIF is too big to live inside the person's data, so PULSE's server keeps it and phones load it
// by its id (netlify/lib/faces.ts). The still pictures above stay as what is shown without internet,
// or when the phone is set to reduce motion.
const GIF_ID = /^[0-9a-f]{32}$/;
export const okGif = (id: unknown): id is string => typeof id === 'string' && GIF_ID.test(id);
export const gifUrl = (id: string) => `/api/face?id=${id}`;
/** GIF files bigger than this are turned away before being read. */
export const GIF_MAX_FILE = 12_000_000;

/** The phone is set to reduce motion: moving photos stay still. */
export function calm(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
type FaceReply = { ok: true; id: string } | { ok: false; error: string };
/** Keep a GIF on the server for the signed-in person. It replaces the one they had. */
export async function saveGif(bytes: Uint8Array, token: string): Promise<FaceReply> {
  const offline = { ok: false as const, error: 'No connection. Check your internet and try again.' };
  try {
    const res = await fetch('/api/face', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'put', gif: b64(bytes) }), cache: 'no-store' });
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return offline;
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: unknown; error?: unknown };
    if (res.ok && okGif(d.id)) return { ok: true, id: d.id };
    return { ok: false, error: res.status === 401 ? 'Sign in again to use a GIF as your photo.' : typeof d.error === 'string' && d.error.length > 12 ? d.error : 'That didn’t save. Try again.' };
  } catch {
    return offline;
  }
}
/** The signed-in person no longer uses a GIF. Best effort: an old GIF nobody points to is harmless. */
export async function dropGif(token: string): Promise<void> {
  try {
    await fetch('/api/face', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'delete' }), cache: 'no-store', keepalive: true });
  } catch {
    /* offline: the server forgets it the next time the photo changes */
  }
}
