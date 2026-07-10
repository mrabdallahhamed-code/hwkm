// Minimal service worker — required for PWA "Add to Home Screen" installability.
// Intentionally does NOT cache anything, so the app always loads the latest
// deployed version instead of a stale offline copy.
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', () => { /* always go to network */ });
