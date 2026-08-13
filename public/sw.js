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

const normalizePushData = (payload) => {
  if (!payload) return {};
  if (typeof payload === 'object') return payload;
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' ? parsed : { body: String(parsed) };
  } catch {
    return { body: String(payload) };
  }
};

self.addEventListener('push', event => {
  let data;
  try {
    data = event.data ? normalizePushData(event.data.json()) : {};
  } catch {
    data = event.data ? normalizePushData(event.data.text()) : {};
  }

  const title = data.title || 'Eduvora update';
  const body = data.body || '';
  const tag = data.tag || data.notificationId || 'eduvora-push';
  const icon = data.icon || '/icons/icon-192x192.png';
  const badge = data.badge || '/icons/badge-96x96.png';
  const targetUrl = data.url || (data.notificationId ? `/?siteNotification=${encodeURIComponent(data.notificationId)}` : '/');
  const target = data.target || null;

  const options = {
    body,
    icon,
    badge,
    tag,
    data: { notificationId: data.notificationId || '', target, url: targetUrl, timestamp: Date.now() },
    vibrate: [120, 60, 120],
    renotify: Boolean(data.tag || data.notificationId),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

const routeNotificationClick = async (notification) => {
  notification.close();
  const data = notification.data || {};
  const notificationId = data.notificationId || '';
  const targetUrl = data.url || (notificationId ? `/?siteNotification=${encodeURIComponent(notificationId)}` : '/');

  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existingClient = clients.find(client => 'focus' in client);
  if (existingClient) {
    await existingClient.focus();
    if (notificationId) existingClient.postMessage({ type: 'site-notification-open', notificationId });
    else existingClient.postMessage({ type: 'push-open', url: targetUrl, target: data.target });
    return;
  }

  const openedClient = await self.clients.openWindow(targetUrl);
  if (openedClient && notificationId) {
    openedClient.postMessage({ type: 'site-notification-open', notificationId });
  }
};

self.addEventListener('notificationclick', event => {
  event.waitUntil(routeNotificationClick(event.notification));
});

self.addEventListener('notificationclose', event => {
  event.waitUntil(new Promise(resolve => setTimeout(resolve, 50)));
});
