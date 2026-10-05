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
