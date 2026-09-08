const CACHE_NAME = 'digital-catalyst-app-shell-v4';
const APP_SHELL = ['/','/index.html'];

// ── Hashed build output (perf pass 2026-09-08) ──────────────────────────────
// The app used to ship as ONE inlined index.html, so caching the shell cached
// the whole program. It is now code-split into content-hashed chunks under
// /assets/, which changes two things:
//
//   1. offline boot needs those chunks in a cache, not just index.html;
//   2. a repeat visit should never re-download a chunk it already has.
//
// Both are handled by a cache-first rule for /assets/ only. Every file there
// is emitted by Vite with a content hash in its name, so a cached response can
// never be stale — a new build produces new filenames. Nothing else is cached
// here: API calls, Firebase/Firestore traffic, auth and Razorpay responses all
// go straight to the network, exactly as before, so no private or payment
// data is ever stored by the worker.
const ASSET_CACHE_NAME = 'digital-catalyst-assets-v1';
const KEEP_CACHES = [CACHE_NAME, ASSET_CACHE_NAME];
// Build output only: `name-<contenthash>.ext`. Those filenames change whenever
// the bytes change, so cache-first is always safe for them. Deliberately does
// NOT match /assets/animations/*.mp4 — the opening clip is ~5 MB, is served
// with Range requests, and must not sit in the app's cache quota.
const HASHED_ASSET = /-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|ttf|png|jpe?g|svg|webp|avif|gif)$/;
const isHashedAsset = (url) =>
  url.origin === self.location.origin
  && url.pathname.startsWith('/assets/')
  && HASHED_ASSET.test(url.pathname);

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
  // Never abort SW install if `/` or `/index.html` fail to cache (GitHub
  // Pages, a redirect, or a preview host). A failed install event means
  // Chrome/Android will not treat the site as an installable PWA.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => !KEEP_CACHES.includes(key)).map(key => caches.delete(key))))
      // Keep the hashed-asset cache bounded: a long-lived install that has
      // seen many deploys would otherwise hold every old chunk forever. Well
      // past a single build's chunk count, so a normal user never hits it.
      .then(() => caches.open(ASSET_CACHE_NAME).then((cache) => cache.keys().then((entries) => {
        if (entries.length <= 200) return undefined;
        return Promise.all(entries.slice(0, entries.length - 100).map((entry) => cache.delete(entry)));
      })).catch(() => undefined))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    // Network-first, and refresh the cached shell on every success so the
    // offline copy always matches the LAST build this device actually loaded
    // (its chunk filenames are the ones sitting in the asset cache below).
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)).catch(() => undefined);
        }
        return response;
      }).catch(() => caches.match('/index.html')),
    );
    return;
  }
  // Content-hashed build assets: serve from cache when we have them (instant,
  // zero network on a warm start and on every route chunk after the first
  // visit), otherwise fetch once and keep the copy for offline.
  if (event.request.method !== 'GET') return;
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  if (!isHashedAsset(url)) return;
  event.respondWith(
    caches.open(ASSET_CACHE_NAME).then((cache) => cache.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request).then((response) => {
        // Only store complete, same-origin successes; an opaque or partial
        // response would poison the cache for the life of the build.
        if (response && response.status === 200 && response.type === 'basic') {
          cache.put(event.request, response.clone()).catch(() => undefined);
        }
        return response;
      });
    })).catch(() => fetch(event.request)),
  );
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

const SHIPPED_DEFAULT_ICONS = [
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

const isShippedDefaultIcon = (url) => {
  if (!url) return true;
  return SHIPPED_DEFAULT_ICONS.some((item) => url === item || url.endsWith(item));
};

const resolveNotificationIcon = (payloadIcon) => {
  const candidates = [payloadIcon, branding.logoUrl, '/api/brand-icon?size=192'];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() && !isShippedDefaultIcon(candidate.trim())) {
      return candidate.trim();
    }
  }
  return branding.logoUrl || '/api/brand-icon?size=192';
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
  // Every notification kind (renewal, My Day, product, unlock, test) uses the
  // logo from the admin Branding page. Prefer an explicit payload icon, then
  // the last branding-update from the app, then the live /api/brand-icon
  // proxy. Shipped default PNGs are treated as "no logo yet" so a stale
  // hardcoded icon cannot override a newly uploaded brand mark.
  const icon = resolveNotificationIcon(data.icon);
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
