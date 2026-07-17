const CACHE_NAME = 'digital-catalyst-app-shell-v1';
const APP_SHELL = ['/','/index.html'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
  }
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const notificationId = event.notification?.data?.notificationId || '';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
      const existingClient = clients.find(client => 'focus' in client);
      if (existingClient) {
        await existingClient.focus();
        existingClient.postMessage({ type: 'site-notification-open', notificationId });
        return;
      }

      const targetUrl = notificationId ? `/?siteNotification=${encodeURIComponent(notificationId)}` : '/';
      const openedClient = await self.clients.openWindow(targetUrl);
      if (openedClient) {
        openedClient.postMessage({ type: 'site-notification-open', notificationId });
      }
    })
  );
});
