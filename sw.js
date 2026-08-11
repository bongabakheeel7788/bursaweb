// Minimal service worker — enables "Add to Home Screen" installability.
// Not doing offline caching for now (menu/prices should always be fresh).

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Pass-through: always fetch from network, no caching.
  event.respondWith(fetch(event.request));
});
