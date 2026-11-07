// Minimal service worker — PWA installability + push notifications.
// Intentionally does NOT cache anything, so the app always loads the latest
// deployed version instead of a stale offline copy.
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', () => { /* always go to network */ });

// ── إشعارات Web Push ──
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) {}
  const title = d.title || 'حوكم';
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'افتح حوكم لعرض التفاصيل',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
