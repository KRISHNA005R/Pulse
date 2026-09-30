// Served as /sw.js on the old address (pulsemoney.netlify.app) only; see _redirects.
// People who installed or visited PULSE there have an offline service worker that would keep
// showing the old copy. When their browser checks for an update it gets this file instead:
// it clears the old offline copy and sends every page load to /migrate.html, which moves the
// person's data to pulsemoney.in and then removes this worker.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {
        /* nothing cached */
      }
      await self.clients.claim();
      // Move any open PULSE window right away where the browser allows it.
      const windows = await self.clients.matchAll({ type: 'window' });
      await Promise.all(windows.map((c) => c.navigate(migrateUrl(c.url)).catch(() => null)));
    })(),
  );
});

function migrateUrl(from) {
  try {
    const u = new URL(from);
    if (u.pathname === '/migrate.html') return u.href;
    return `/migrate.html?to=${encodeURIComponent(u.pathname + u.search)}`;
  } catch (e) {
    return '/migrate.html';
  }
}

// Any page load from now on goes through the move. Everything else goes to the network.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;
  const url = new URL(req.url);
  if (url.pathname === '/migrate.html') return;
  event.respondWith(Response.redirect(new URL(migrateUrl(req.url), self.location.origin).href, 302));
});
