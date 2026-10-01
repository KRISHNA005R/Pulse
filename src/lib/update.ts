// Keeps the installed app (home-screen PWA) on the latest version.
//
// Why this exists: an installed app on iPhone/Android is rarely closed for real. It resumes from
// memory, so it never navigates and the browser never checks for a new service worker. Even when
// a new one does install, the open page keeps running the old code until it reloads.
//
// So we: check for a new version whenever the app comes back to the screen (and every 30 min),
// and when the new version takes over, reload — straight away if nothing is being typed, otherwise
// the moment the app goes to the background, with an "Update" button in the meantime.
// User data lives in localStorage, which a reload or update never touches.

declare const __BUILD_TIME__: string;
export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

type Listener = () => void;
let ready = false;
let reg: ServiceWorkerRegistration | null = null;
let lastCheck = 0;
const listeners = new Set<Listener>();

export const updateReady = () => ready;
export function onUpdateReady(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function applyUpdate() {
  window.location.reload();
}

/** Is the person in the middle of something a reload would throw away? */
function busy() {
  const a = document.activeElement as HTMLElement | null;
  const typing = !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
  return typing || !!document.querySelector('[role="dialog"]');
}

/** Ask the server for a newer version. Resolves true if one was found and is installing. */
export async function checkForUpdate(force = false): Promise<boolean> {
  if (!reg) return false;
  const now = Date.now();
  if (!force && now - lastCheck < 60_000) return false;
  lastCheck = now;
  try {
    await reg.update();
  } catch {
    return false;
  }
  return !!(reg.installing || reg.waiting);
}

export function setupUpdates() {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker
    .register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .then((r) => {
      reg = r;
      void checkForUpdate(true);
    })
    .catch(() => {
      /* no service worker here (preview, private mode) */
    });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
    else if (ready) applyUpdate(); // going to the background: swap in the new version unseen
  });
  window.addEventListener('focus', () => void checkForUpdate());
  window.addEventListener('online', () => void checkForUpdate(true));
  window.setInterval(() => void checkForUpdate(), 30 * 60_000);

  // The new service worker skips waiting and claims this page, which fires controllerchange.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || ready) return; // first install: this page is already the newest
    ready = true;
    if (document.visibilityState === 'hidden' || !busy()) return applyUpdate();
    listeners.forEach((fn) => fn());
  });
}
