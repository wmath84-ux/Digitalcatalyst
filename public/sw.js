const CACHE_NAME = 'digital-catalyst-app-shell-v2';
const APP_SHELL = ['/','/index.html'];

// Live branding pushed from the page (BrandingContext). Falls back to the
// built-in defaults until the first message arrives. Lets notification titles
// and icons follow whatever name/logo the admin configured.
const branding = {
  appName: 'Eduvora',
  logoUrl: '/api/brand-icon?size=192',
};

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'branding-update') return;
  if (typeof data.appName === 'string' && data.appName.trim()) {
    branding.appName = data.appName.trim().slice(0, 40);
  }
  if (typeof data.logoUrl === 'string' && data.logoUrl.trim()) {
    branding.logoUrl = data.logoUrl.trim();
  }
});

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

  const title = data.title || `${branding.appName} update`;
  const body = data.body || '';
  const tag = data.tag || data.notificationId || 'eduvora-push';
  // Default to the live brand logo (proxied through /api/brand-icon) so push
  // notifications match the logo chosen in the admin branding page. The badge
  // stays the shipped monochrome PNG — Android renders it from the alpha
  // channel only. For uploaded logos, /api/brand-icon serves the real image;
  // for the default it 308-redirects to the shipped PNG.
  const icon = data.icon || (branding.logoUrl.startsWith('/api/brand-icon')
    ? branding.logoUrl
    : '/api/brand-icon?size=192');
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
  // The url is the exact deep link (e.g. /#/my-day?section=reminders&item=r1,
  // /#/product/p1 or /#/subscription?renew=1), so every click path lands on
  // the precise location that produced the alert.
  const targetUrl = data.url || (notificationId ? `/?siteNotification=${encodeURIComponent(notificationId)}` : '/');

  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existingClient = clients.find(client => 'focus' in client);
  if (existingClient) {
    // Focus alone left users on whatever screen they had open. WindowClient
    // navigation works even when the page's message listener is still booting.
    if ('navigate' in existingClient) {
      try { await existingClient.navigate(targetUrl); } catch { /* message fallback below */ }
    }
    await existingClient.focus();
    // Always include the url in the message: the page handler then applies
    // the same deep link even when navigate() failed or the SW navigation
    // was a no-op (e.g. same-hash taps on an already-open window).
    existingClient.postMessage({ type: 'site-notification-open', notificationId, url: targetUrl, target: data.target });
    return;
  }

  const openedClient = await self.clients.openWindow(targetUrl);
  if (openedClient) {
    openedClient.postMessage({ type: 'site-notification-open', notificationId, url: targetUrl, target: data.target });
  }
};

self.addEventListener('notificationclick', event => {
  event.waitUntil(routeNotificationClick(event.notification));
});

self.addEventListener('notificationclose', event => {
  event.waitUntil(new Promise(resolve => setTimeout(resolve, 50)));
});
