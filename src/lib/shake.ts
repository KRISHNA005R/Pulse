// Shake the phone to add an expense.
//
// The phone tells a page how it is being moved (the "devicemotion" event). Android gives that to any
// page. An iPhone asks the person first, and only when the page asks from a tap, so there PULSE asks
// on the first tap after it opens. Either way it only works while PULSE is open on the screen: a
// web app is not running when it is closed. There is no switch for it: it is simply on.
//
// A shake here means a few hard back-and-forth moves within a second. Walking, a bumpy auto ride or
// putting the phone down are single jolts or soft ones, and are ignored.

const KEY = 'pulse-shake-no-v1';
const SEEN = 'pulse-shake-seen-v1';

type MotionCtor = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
const motion = (): MotionCtor | null => (typeof window !== 'undefined' && 'DeviceMotionEvent' in window ? (window.DeviceMotionEvent as MotionCtor) : null);

/** A phone or tablet that reports movement. Laptops and desktops don't get the option. */
export function canShake(): boolean {
  if (!motion()) return false;
  try {
    return navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}
/** iPhone and iPad: the person has to say yes to motion first. */
export const needsAsk = () => typeof motion()?.requestPermission === 'function';

/**
 * Shake is on for everyone. The one exception: an iPhone whose owner said no when the phone asked
 * about motion. That answer is remembered on the device, so PULSE doesn't keep asking.
 */
export function shakeOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return true;
  }
}
export function shakeRefused() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* storage unavailable: it will ask again next time */
  }
}
/** True the first time only, to say once what just opened the sheet. */
export function firstShake(): boolean {
  try {
    if (localStorage.getItem(SEEN)) return false;
    localStorage.setItem(SEEN, '1');
    return true;
  } catch {
    return false;
  }
}

let allowed = false;
/** Motion was allowed since the app was opened, so there is nothing more to ask. */
export const motionAllowed = () => allowed || !needsAsk();
/** Ask the phone for motion. Must be called from a tap. True when it is allowed (or no asking is needed). */
export async function askMotion(): Promise<boolean> {
  const m = motion();
  if (!m) return false;
  if (typeof m.requestPermission !== 'function') return true;
  try {
    allowed = (await m.requestPermission()) === 'granted';
  } catch {
    allowed = false;
  }
  return allowed;
}

const HARD = 15; // m/s², with gravity taken out: a deliberate flick, well above walking
const REVERSALS = 3; // back, forth, back
const WINDOW_MS = 1000;
const GAP_MS = 450; // longer than this between moves and it is not one shake
const REST_MS = 2500; // after a shake, ignore the tail of it

/** Call `onShake` for each shake until the returned function is called. */
export function watchShake(onShake: () => void): () => void {
  let gx = 0;
  let gy = 0;
  let gz = 0;
  let primed = false;
  let last: [number, number, number] | null = null;
  let lastAt = 0;
  let firstAt = 0;
  let turns = 0;
  let restUntil = 0;
  const onMotion = (e: DeviceMotionEvent) => {
    let x: number;
    let y: number;
    let z: number;
    const a = e.acceleration;
    if (a && a.x !== null && a.y !== null && a.z !== null) {
      x = a.x;
      y = a.y;
      z = a.z;
    } else {
      // No gravity-free reading on this phone: take a slow average as gravity and remove it.
      const g = e.accelerationIncludingGravity;
      if (!g || g.x === null || g.y === null || g.z === null) return;
      if (!primed) {
        gx = g.x;
        gy = g.y;
        gz = g.z;
        primed = true;
      }
      gx = 0.8 * gx + 0.2 * g.x;
      gy = 0.8 * gy + 0.2 * g.y;
      gz = 0.8 * gz + 0.2 * g.z;
      x = g.x - gx;
      y = g.y - gy;
      z = g.z - gz;
    }
    const now = Date.now();
    if (now < restUntil || Math.hypot(x, y, z) < HARD) return;
    if (last && now - lastAt > GAP_MS) {
      last = null;
      turns = 0;
    }
    if (!last) {
      last = [x, y, z];
      lastAt = firstAt = now;
      return;
    }
    // A hard move the other way from the last one.
    if (x * last[0] + y * last[1] + z * last[2] >= 0) return void (lastAt = now);
    last = [x, y, z];
    lastAt = now;
    turns++;
    if (turns >= REVERSALS && now - firstAt <= WINDOW_MS) {
      last = null;
      turns = 0;
      restUntil = now + REST_MS;
      onShake();
    } else if (now - firstAt > WINDOW_MS) {
      firstAt = now;
      turns = 0;
    }
  };
  window.addEventListener('devicemotion', onMotion);
  return () => window.removeEventListener('devicemotion', onMotion);
}
