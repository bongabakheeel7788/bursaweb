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

// Show the review-reminder push notification.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e){}

  const title = data.title || 'Bursa';
  const options = {
    body: data.body || '',
    icon: data.icon || 'assets/icon-192.png',
    badge: data.badge || 'assets/icon-192.png',
    data: data.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Open the review link when the notification is tapped.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || 'https://bursa.pk/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) { client.focus(); }
      }
      return clients.openWindow(url);
    })
  );
});
