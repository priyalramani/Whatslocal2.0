/* WhatsLocal service worker — handles Web Push display + click.
   (Sending is built later; this makes subscriptions deliverable when it is.) */
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
