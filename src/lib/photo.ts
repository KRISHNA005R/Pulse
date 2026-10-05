// The profile photo: whatever picture someone chooses is cut to a small square and kept as text
// inside their PULSE data, so it travels with their account like everything else. It is never sent
// to friends.

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

/** A chosen picture as a small square JPEG (centre crop). Null when the file isn't a picture this phone can read. */
export async function squarePhoto(file: Blob): Promise<string | null> {
  const pic = await decode(file);
  if (!pic || !pic.w || !pic.h) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const side = Math.min(pic.w, pic.h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pic.src, (pic.w - side) / 2, (pic.h - side) / 2, side, side, 0, 0, SIZE, SIZE);
    for (const q of [0.82, 0.7, 0.55, 0.4]) {
      const url = canvas.toDataURL('image/jpeg', q);
      if (url.startsWith('data:image/jpeg') && url.length <= MAX_CHARS) return url;
    }
    return null;
  } catch {
    return null;
  } finally {
    pic.done();
  }
}

/** Only our own small pictures are ever shown, never an address that points somewhere else. */
export const okPhoto = (p: unknown): p is string => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,') && p.length <= MAX_CHARS;
