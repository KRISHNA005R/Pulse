// Reminders: show a notification when the server sends one, and open PULSE when it's tapped.
// Loaded by the service worker (see workbox.importScripts in vite.config.ts).
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { title: 'PULSE', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'PULSE', {
      body: d.body || '',
      tag: d.tag || 'pulse',
      // Without this, a notification that replaces an older one with the same tag arrives silently.
      renotify: true,
      icon: '/icon-192.png',
      badge: '/favicon-96.png',
      // A short double beat. Phones that set vibration per app (most newer Android versions) ignore it.
      // The sound can't be chosen from here at all: the phone plays its own notification sound.
      vibrate: [90, 70, 90],
      data: { url: d.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if ('navigate' in c) c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
