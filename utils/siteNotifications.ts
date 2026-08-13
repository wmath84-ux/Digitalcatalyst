export type SiteNotificationCategory = 'store' | 'reading' | 'course' | 'unlock' | 'community' | 'announcement' | 'mayday' | 'subscription';

export type SiteNotificationTarget =
  | { type: 'product'; productId: number | string }
  | { type: 'reading'; listType: 'news' | 'blog'; articleId: string }
  | { type: 'announcement'; announcementId: string }
  | { type: 'course'; productId: number | string }
  | { type: 'purchases' }
  | { type: 'community'; targetPage?: string; targetId?: string }
  | { type: 'mayday' }
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
}

export interface SiteNotificationPreferences {
  store: boolean;
  reading: boolean;
  course: boolean;
  unlock: boolean;
  community: boolean;
  announcement: boolean;
  mayday: boolean;
  subscription: boolean;
  browserAlerts: boolean;
}

export interface ContentInventoryProduct {
  title: string;
  isFree: boolean;
  moduleIds: string[];
  lessonIds: string[];
}

export interface ContentNotificationInventory {
  products: Record<string, ContentInventoryProduct>;
  articles: Record<string, { title: string; type: 'news' | 'blog' }>;
  announcements: Record<string, { title: string }>;
  purchasedProductIds: string[];
}

export interface CommunityActivityItem {
  id: string;
  kind: 'post' | 'story';
  ownerId: string;
  title: string;
  body: string;
  createdAt: number;
  likeCount: number;
  reactionActorIds: string[];
  source?: string;
}

export interface CommunityActivityBaseline {
  initializedAt: number;
  items: Record<string, { createdAt: number; likeCount: number; reactionActorIds: string[] }>;
}

const NOTIFICATION_STORAGE_PREFIX = 'eduvora.siteNotifications.v1';
const PREFERENCES_STORAGE_PREFIX = 'eduvora.siteNotificationPreferences.v1';
const CONTENT_BASELINE_PREFIX = 'eduvora.siteNotificationContentBaseline.v1';
const COMMUNITY_BASELINE_PREFIX = 'eduvora.siteNotificationCommunityBaseline.v1';
const MAX_NOTIFICATIONS = 150;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export const DEFAULT_SITE_NOTIFICATION_PREFERENCES: SiteNotificationPreferences = {
  store: true,
  reading: true,
  course: true,
  unlock: true,
  community: true,
  announcement: true,
  mayday: true,
  subscription: true,
  browserAlerts: false,
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

export const loadSiteNotifications = (viewerKey: string): SiteNotification[] => {
  const stored = safeParse<SiteNotification[]>(storageKey(NOTIFICATION_STORAGE_PREFIX, viewerKey), []);
  return trimNotifications(Array.isArray(stored) ? stored : []);
};

export const saveSiteNotifications = (viewerKey: string, notifications: SiteNotification[]) => {
  const next = trimNotifications(notifications);
  safeWrite(storageKey(NOTIFICATION_STORAGE_PREFIX, viewerKey), next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('eduvora:notifications-updated', { detail: { viewerKey, notifications: next } }));
  }
};

export const loadSiteNotificationPreferences = (viewerKey: string): SiteNotificationPreferences => ({
  ...DEFAULT_SITE_NOTIFICATION_PREFERENCES,
  ...safeParse<Partial<SiteNotificationPreferences>>(storageKey(PREFERENCES_STORAGE_PREFIX, viewerKey), {}),
});

export const saveSiteNotificationPreferences = (viewerKey: string, preferences: SiteNotificationPreferences) => {
  safeWrite(storageKey(PREFERENCES_STORAGE_PREFIX, viewerKey), preferences);
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
      read: previous && notification.createdAt <= previous.createdAt ? previous.read : false,
      groupCount: Math.max(Number(previous?.groupCount || 0), Number(notification.groupCount || 0)) || undefined,
    });
  });

  return trimNotifications(Array.from(merged.values()));
};

const flattenCourseContent = (modules: any[] = []) => {
  const moduleIds: string[] = [];
  const lessonIds: string[] = [];

  const visit = (items: any[], parent = 'root') => {
    (Array.isArray(items) ? items : []).forEach((module, moduleIndex) => {
      const moduleId = String(module?.id ?? `${parent}-${moduleIndex}`);
      moduleIds.push(moduleId);
      (Array.isArray(module?.files) ? module.files : []).forEach((file: any, fileIndex: number) => {
        lessonIds.push(`${moduleId}:${String(file?.id ?? file?.name ?? fileIndex)}`);
      });
      visit(module?.modules, moduleId);
    });
  };

  visit(modules);
  return {
    moduleIds: Array.from(new Set(moduleIds)).sort(),
    lessonIds: Array.from(new Set(lessonIds)).sort(),
  };
};

export const buildContentNotificationInventory = ({
  products,
  articles,
  announcements,
  purchasedProductIds,
}: {
  products: any[];
  articles: any[];
  announcements: any[];
  purchasedProductIds: Array<number | string>;
}): ContentNotificationInventory => {
  const productInventory: ContentNotificationInventory['products'] = {};
  (Array.isArray(products) ? products : []).forEach(product => {
    const id = String(product?.id ?? '');
    if (!id) return;
    const course = flattenCourseContent(product?.courseContent);
    productInventory[id] = {
      title: String(product?.title || 'New learning product'),
      isFree: product?.isFree === true,
      moduleIds: course.moduleIds,
      lessonIds: course.lessonIds,
    };
  });

  const articleInventory: ContentNotificationInventory['articles'] = {};
  (Array.isArray(articles) ? articles : []).forEach(article => {
    const id = String(article?.id ?? '');
    if (!id) return;
    articleInventory[id] = {
      title: String(article?.title || 'New reading update'),
      type: article?.type === 'news' ? 'news' : 'blog',
    };
  });

  const announcementInventory: ContentNotificationInventory['announcements'] = {};
  (Array.isArray(announcements) ? announcements : []).forEach(announcement => {
    const id = String(announcement?.id ?? '');
    if (!id) return;
    announcementInventory[id] = { title: String(announcement?.title || 'Important announcement') };
  });

  return {
    products: productInventory,
    articles: articleInventory,
    announcements: announcementInventory,
    purchasedProductIds: Array.from(new Set((purchasedProductIds || []).map(String))).sort(),
  };
};

export const loadContentNotificationBaseline = (viewerKey: string): ContentNotificationInventory | null =>
  safeParse<ContentNotificationInventory | null>(storageKey(CONTENT_BASELINE_PREFIX, viewerKey), null);

export const saveContentNotificationBaseline = (viewerKey: string, inventory: ContentNotificationInventory) => {
  safeWrite(storageKey(CONTENT_BASELINE_PREFIX, viewerKey), inventory);
};

const difference = (next: string[], previous: string[]) => {
  const prior = new Set(previous);
  return next.filter(value => !prior.has(value));
};

export const createContentNotifications = (
  previous: ContentNotificationInventory,
  current: ContentNotificationInventory,
): SiteNotification[] => {
  const now = Date.now();
  const notifications: SiteNotification[] = [];

  Object.entries(current.products).forEach(([id, product]) => {
    const priorProduct = previous.products[id];
    const productId = id;

    if (!priorProduct) {
      notifications.push({
        id: `content:product:${id}`,
        title: product.isFree ? 'New free product available' : 'New product added',
        body: product.title,
        category: 'store',
        createdAt: now,
        read: false,
        source: 'content',
        target: { type: 'product', productId },
      });
      return;
    }

    if (!current.purchasedProductIds.includes(id)) return;

    const newModules = difference(product.moduleIds, priorProduct.moduleIds || []);
    const newLessons = difference(product.lessonIds, priorProduct.lessonIds || []);
    if (newModules.length === 0 && newLessons.length === 0) return;

    const detailParts = [];
    if (newModules.length) detailParts.push(`${newModules.length} new module${newModules.length === 1 ? '' : 's'}`);
    if (newLessons.length) detailParts.push(`${newLessons.length} new lesson${newLessons.length === 1 ? '' : 's'}`);

    notifications.push({
      id: `content:course:${id}:${[...newModules, ...newLessons].join('|')}`,
      title: 'Your course has new content',
      body: `${product.title}: ${detailParts.join(' and ')}`,
      category: 'course',
      createdAt: now,
      read: false,
      source: 'content',
      target: { type: 'product', productId },
    });
  });

  Object.entries(current.articles).forEach(([id, article]) => {
    if (previous.articles[id]) return;
    notifications.push({
      id: `content:reading:${article.type}:${id}`,
      title: article.type === 'news' ? 'New News update' : 'New Blog published',
      body: article.title,
      category: 'reading',
      createdAt: now,
      read: false,
      source: 'content',
      target: { type: 'reading', listType: article.type, articleId: id },
    });
  });

  Object.entries(current.announcements).forEach(([id, announcement]) => {
    if (previous.announcements[id]) return;
    notifications.push({
      id: `content:announcement:${id}`,
      title: 'Important admin announcement',
      body: announcement.title,
      category: 'announcement',
      createdAt: now,
      read: false,
      source: 'content',
      target: { type: 'announcement', announcementId: id },
    });
  });

  difference(current.purchasedProductIds, previous.purchasedProductIds).forEach(id => {
    const product = current.products[id];
    notifications.push({
      id: `content:unlock:${id}`,
      title: 'Product unlocked',
      body: product?.title || 'Your purchased content is ready.',
      category: 'unlock',
      createdAt: now,
      read: false,
      source: 'content',
      target: { type: 'purchases' },
    });
  });

  return notifications;
};

export const loadCommunityActivityBaseline = (
  viewerKey: string,
  kind: 'feed' | 'status',
): CommunityActivityBaseline | null =>
  safeParse<CommunityActivityBaseline | null>(storageKey(`${COMMUNITY_BASELINE_PREFIX}.${kind}`, viewerKey), null);

export const saveCommunityActivityBaseline = (
  viewerKey: string,
  kind: 'feed' | 'status',
  baseline: CommunityActivityBaseline,
) => {
  safeWrite(storageKey(`${COMMUNITY_BASELINE_PREFIX}.${kind}`, viewerKey), baseline);
};

export const createCommunityActivityNotifications = ({
  previous,
  items,
  currentUserId,
  followedUserIds,
}: {
  previous: CommunityActivityBaseline | null;
  items: CommunityActivityItem[];
  currentUserId: string;
  followedUserIds: string[];
}): { baseline: CommunityActivityBaseline; notifications: SiteNotification[] } => {
  const nextItems: CommunityActivityBaseline['items'] = {};
  const followed = new Set(followedUserIds.map(String));
  const notifications: SiteNotification[] = [];
  const now = Date.now();

  items.forEach(item => {
    const reactionActorIds = Array.from(new Set((item.reactionActorIds || []).map(String).filter(Boolean))).sort();
    nextItems[item.id] = { createdAt: item.createdAt, likeCount: item.likeCount, reactionActorIds };
    if (!previous) return;

    const prior = previous.items[item.id];
    const isOwn = item.ownerId === currentUserId;
    const isAdmin = item.source === 'admin';

    if (!prior && !isOwn && (isAdmin || followed.has(item.ownerId))) {
      notifications.push({
        id: `community:${item.kind}:${item.id}`,
        title: isAdmin
          ? 'New admin Community post'
          : item.kind === 'story'
            ? 'New story from someone you follow'
            : 'New post from someone you follow',
        body: item.title || item.body || 'Open Community to view the update.',
        category: 'community',
        createdAt: item.createdAt || now,
        read: false,
        source: 'community',
        target: { type: 'community', targetPage: item.kind === 'story' ? 'status' : 'feed', targetId: item.id },
      });
    }

    if (prior && isOwn) {
      const previousActors = Array.isArray(prior.reactionActorIds) ? prior.reactionActorIds.map(String) : [];
      const newOtherActors = difference(reactionActorIds, previousActors).filter(actorId => actorId !== currentUserId);
      if (newOtherActors.length > 0) {
        notifications.push({
          id: `community:likes:${item.kind}:${item.id}`,
          title: item.kind === 'story' ? 'New story reaction' : 'New post reaction',
          body: `${newOtherActors.length} new reaction${newOtherActors.length === 1 ? '' : 's'} on your ${item.kind}.`,
          category: 'community',
          createdAt: now,
          read: false,
          source: 'community',
          groupCount: Math.max(item.likeCount, reactionActorIds.filter(actorId => actorId !== currentUserId).length),
          target: { type: 'community', targetPage: item.kind === 'story' ? 'status' : 'feed', targetId: item.id },
        });
      }
    }
  });

  return {
    baseline: { initializedAt: previous?.initializedAt || now, items: nextItems },
    notifications,
  };
};

export const isNotificationCategoryEnabled = (
  notification: SiteNotification,
  preferences: SiteNotificationPreferences,
) => preferences[notification.category] !== false;
