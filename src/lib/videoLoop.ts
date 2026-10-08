// A short video as a profile photo: the phone plays it (hidden), and frames are taken from the part
// the person picked. The frames go through the same packing as a GIF (lib/gif.ts). The video itself
// never leaves the phone and is never read whole, so its size doesn't matter.
import { MID, VIDEO_FPS, type LoopFrame } from './gif';
import { stillsFromSource } from './photo';

export const looksLikeVideo = (f: File) => f.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|3gp|mkv)$/i.test(f.name);

/** Get a picked video ready to play. Null when this phone can't play it. */
export function openVideo(file: File, video: HTMLVideoElement): Promise<{ url: string; ms: number } | null> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('error', fail);
      const ms = video.duration * 1000;
      if (ok && Number.isFinite(ms) && ms > 0 && video.videoWidth > 0) resolve({ url, ms });
      else {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    const ready = () => finish(true);
    const fail = () => finish(false);
    const timer = window.setTimeout(() => finish(video.readyState >= 2), 12_000);
    video.addEventListener('loadeddata', ready);
    video.addEventListener('error', fail);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    video.load();
  });
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      // Let the new frame reach the screen before it is copied.
      requestAnimationFrame(() => resolve());
    };
    video.addEventListener('seeked', finish);
    window.setTimeout(finish, 1500);
    video.currentTime = Math.min(Math.max(0, t), Math.max(0, video.duration - 0.05));
  });
}

/** Frames from `start` for `len` milliseconds, cut to MID x MID, plus the still pictures of the first one. */
export async function videoFrames(video: HTMLVideoElement, start: number, len: number): Promise<{ frames: LoopFrame[]; stills: { photo: string; face: string } | null } | null> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MID;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const w = video.videoWidth;
  const h = video.videoHeight;
  const side = Math.min(w, h);
  const n = Math.max(2, Math.round((len / 1000) * VIDEO_FPS));
  const step = len / n;
  video.pause();
  const frames: LoopFrame[] = [];
  let stills: { photo: string; face: string } | null = null;
  try {
    for (let i = 0; i < n; i++) {
      await seek(video, (start + i * step) / 1000);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, MID, MID);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, (w - side) / 2, (h - side) / 2, side, side, 0, 0, MID, MID);
      if (i === 0) stills = stillsFromSource(video, w, h);
      frames.push({ rgba: ctx.getImageData(0, 0, MID, MID).data, delay: step });
    }
  } catch {
    return null;
  }
  return { frames, stills };
}
