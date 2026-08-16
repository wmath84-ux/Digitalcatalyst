// utils/siteNotifications.ts
//
// Client-side VIEW layer for notifications. Every notification is GENERATED
// on the server by the real-time push system (the GitHub Actions minute
// pinger drives api/cron/subscription-renewals; instant event paths live in
// api/razorpay/verify-payment and api/push/send). The server writes one
// idempotent doc to users/{uid}/notifications AND sends the Web Push, so
// alerts arrive at the exact time whether the app is open or closed.
//
// This module only: types those docs, mirrors them into localStorage so the
// bell renders instantly offline, and maps each notification to its filter
// chip and exact in-app deep link. It must never CREATE notifications — the
// old client-side baseline-diff generator that lived here re-announced the
// same event (the recurring "Product unlocked" bug) every time its
// localStorage baseline was clobbered.

export type SiteNotificationCategory = 'store' | 'reading' | 'course' | 'unlock' | 'community' | 'announcement' | 'mayday' | 'subscription';

export type SiteNotificationTarget =
  | { type: 'product'; productId: number | string }
  | { type: 'reading'; listType: 'news' | 'blog'; articleId: string }
  | { type: 'announcement'; announcementId: string }
  | { type: 'course'; productId: number | string }
  | { type: 'purchases' }
  | { type: 'community'; targetPage?: string; targetId?: string }
  // My Day deep link: section is the tab the item lives in (tasks /
  // schedule / reminders) and itemId is the exact item that fired.
  | { type: 'mayday'; section?: 'tasks' | 'schedule' | 'reminders'; itemId?: string }
  | { type: 'subscription' };

export interface SiteNotification {
  id: string;
  title: string;
  body: string;
  category: SiteNotificationCategory;
  createdAt: number;
  read: boolean;
  source: 'content' | 'community' | 'system';
  target: SiteNotificationTarget;
  actorAvatar?: string;
  groupCount?: number;
  remoteNotificationId?: string;
  /** Present on subscription renewal reminders: true post-expiry. */
  expired?: boolean;
}

// ---------------------------------------------------------------------------
// Storage. v2 on purpose: v1 held notifications generated on the client by
// localStorage baseline diffs. Bumping the version discards every stale
// client-generated duplicate for good, and the legacy prefixes below are
// actively purged so the old generator's state can never resurface.
// ---------------------------------------------------------------------------
const NOTIFICATION_STORAGE_PREFIX = 'eduvora.siteNotifications.v2';
const LEGACY_STORAGE_PREFIXES = [
  'eduvora.siteNotifications.v1',
  'eduvora.siteNotificationContentBaseline.v1',
  'eduvora.siteNotificationCommunityBaseline.v1',
];
const MAX_NOTIFICATIONS = 150;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

let legacyStoragePurged = false;

/** Remove every key written by the retired client-side notification generator. */
export const purgeLegacyNotificationStorage = () => {
  if (typeof window === 'undefined' || legacyStoragePurged) return;
  legacyStoragePurged = true;
  try {
    const doomed: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index) || '';
      if (LEGACY_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix))) doomed.push(key);
    }
    doomed.forEach(key => window.localStorage.removeItem(key));
  } catch {
    // Restricted storage — nothing to purge.
  }
};

const safeParse = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) as T : fallback;
  } catch {
    return fallback;
  }
};

const safeWrite = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // In-app state remains active when browser storage is restricted.
  }
};

const storageKey = (prefix: string, viewerKey: string) => `${prefix}:${viewerKey || 'guest'}`;

const trimNotifications = (notifications: SiteNotification[]) => {
  const cutoff = Date.now() - RETENTION_MS;
  return notifications
    .filter(notification => Number(notification.createdAt) >= cutoff)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_NOTIFICATIONS);
};

export const isNewsOrBlogNotification = (notification: SiteNotification) => {
  if (notification.category === 'reading') return true;
  if (notification.target?.type === 'reading') return true;
  const title = String(notification.title || '').toLowerCase();
  return title.includes('new news update') || title.includes('new blog published');
};

export const loadSiteNotifications = (viewerKey: string): SiteNotification[] => {
  purgeLegacyNotificationStorage();
  const stored = safeParse<SiteNotification[]>(storageKey(NOTIFICATION_STORAGE_PREFIX, viewerKey), []);
  return trimNotifications(Array.isArray(stored) ? stored : []).filter((notification) => !isNewsOrBlogNotification(notification));
};

export const saveSiteNotifications = (viewerKey: string, notifications: SiteNotification[]) => {
  const next = trimNotifications(notifications).filter((notification) => !isNewsOrBlogNotification(notification));
  safeWrite(storageKey(NOTIFICATION_STORAGE_PREFIX, viewerKey), next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('eduvora:notifications-updated', { detail: { viewerKey, notifications: next } }));
  }
};

export const mergeSiteNotifications = (
  existing: SiteNotification[],
  incoming: SiteNotification[],
): SiteNotification[] => {
  const merged = new Map<string, SiteNotification>();
  existing.forEach(notification => merged.set(notification.id, notification));

  incoming.forEach(notification => {
    const previous = merged.get(notification.id);
    merged.set(notification.id, {
      ...previous,
      ...notification,
      // Read state is monotonic: once EITHER side (this device's mirror or
      // the cloud doc marked on another device) says read, it stays read.
      // The old rule ignored the incoming flag, so a notification marked
      // read elsewhere kept reappearing as unread here.
      read: Boolean(previous?.read) || Boolean(notification.read),
      groupCount: Math.max(Number(previous?.groupCount || 0), Number(notification.groupCount || 0)) || undefined,
    });
  });

  return trimNotifications(Array.from(merged.values()).filter((notification) => !isNewsOrBlogNotification(notification)));
};

// ---------------------------------------------------------------------------
// Notification filters + exact deep links
// ---------------------------------------------------------------------------

/**
 * The four notification filters shown on the bell page. Every category is
 * mapped to exactly one filter so a notification can never appear twice:
 *
 *   product      → store (new/free product), unlock (product unlocked),
 *                  course (new modules/lessons in an owned course)
 *   mayday       → tasks, schedule events and reminders fired from My Day
 *   subscription → renewal reminders (7d/3d/1d/due/expired)
 *   updates      → admin announcements, community activity, and any
 *                  future/unknown category that fits nowhere else
 */
export type NotificationFilterKey = 'all' | 'product' | 'mayday' | 'subscription' | 'updates';

export const NOTIFICATION_FILTER_ORDER: NotificationFilterKey[] = ['all', 'product', 'mayday', 'subscription', 'updates'];

const PRODUCT_CATEGORIES = new Set<SiteNotificationCategory>(['store', 'unlock', 'course']);

export const getNotificationFilterKey = (notification: SiteNotification): Exclude<NotificationFilterKey, 'all'> => {
  if (PRODUCT_CATEGORIES.has(notification.category)) return 'product';
  if (notification.category === 'mayday') return 'mayday';
  if (notification.category === 'subscription') return 'subscription';
  return 'updates';
};

export const filterNotifications = (notifications: SiteNotification[], filter: NotificationFilterKey): SiteNotification[] => {
  if (filter === 'all') return notifications;
  return notifications.filter((notification) => getNotificationFilterKey(notification) === filter);
};

/**
 * Exact in-app location for a notification. Every target type resolves to a
 * real route (with query params for My Day sections and renewal intents) so a
 * tap lands on the item that caused the alert, not a generic page.
 */
export const getNotificationDeepLink = (notification: SiteNotification): string => {
  const target = notification.target;
  if (target.type === 'product') {
    const productId = encodeURIComponent(String(target.productId));
    // Course-content updates open the course player directly (the exact
    // place the new lessons live); store/unlock alerts open the product page.
    return notification.category === 'course' ? `#/course/${productId}` : `#/product/${productId}`;
  }
  if (target.type === 'course') return `#/course/${encodeURIComponent(String(target.productId))}`;
  if (target.type === 'purchases') return '#/store/purchases';
  if (target.type === 'mayday') {
    if (target.section && target.itemId) {
      return `#/my-day?section=${target.section}&item=${encodeURIComponent(String(target.itemId))}`;
    }
    return '#/my-day';
  }
  if (target.type === 'subscription') {
    return notification.expired ? '#/subscription?renew=1' : '#/subscription';
  }
  if (target.type === 'announcement') return '#/home';
  if (target.type === 'community') return '#/home';
  return '#/notifications';
};

/** My Day deep link for a due item (used by the scheduler + foreground clock). */
export const getMyDayItemDeepLink = (section: 'tasks' | 'schedule' | 'reminders', itemId: string): string =>
  `#/my-day?section=${section}&item=${encodeURIComponent(String(itemId))}`;
