/* WhatsLocal service worker — Web Push display + click, plus the minimal
   lifecycle + fetch handler a PWA needs to be installable ("Add to home screen").
   Take control fast so the page is SW-controlled on first load. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// A fetch handler is part of the classic installability criteria. We ONLY touch
// top-level navigations (never assets/media/API — so range requests and hashed
// bundles are left to the browser, avoiding any interception side-effects). This
// is a pure network passthrough; it adds no offline caching (yet), just presence.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'WhatsLocal';
  const options = {
    body: data.body || '',
    icon: data.icon || '/logo.svg',
    badge: data.badge || '/favicon.svg',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { try { c.navigate(url); } catch (e) { /* ignore */ } return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
