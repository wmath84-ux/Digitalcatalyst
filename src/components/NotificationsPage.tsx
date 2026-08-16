import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import Header from "./Header";
import BottomNav, { type TabKey } from "./BottomNav";
import {
  filterNotifications,
  getNotificationDeepLink,
  getNotificationFilterKey,
  isNewsOrBlogNotification,
  loadSiteNotifications,
  mergeSiteNotifications,
  NOTIFICATION_FILTER_ORDER,
  saveSiteNotifications,
  type NotificationFilterKey,
  type SiteNotification,
  type SiteNotificationCategory,
} from "../../utils/siteNotifications";
import { useAuth } from "../context/AuthContext";
import { BellIcon, BookOpenIcon, StoreIcon } from "./icons";
import { ensureSavedWebPushSubscription, isWebPushSupported } from "../../utils/webPush";

type NotificationsPageProps = {
  cartCount: number;
  purchasesBadge: number;
  onNavigateToCart: () => void;
  onNavigateToSubscription: () => void;
  onNavigateFooter: (tab: TabKey) => void;
};

const CATEGORY_ICON: Record<string, typeof BellIcon> = {
  store: StoreIcon,
  course: BookOpenIcon,
  unlock: BookOpenIcon,
  announcement: BellIcon,
  mayday: BellIcon,
  subscription: BellIcon,
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Notification filters. Each chip shows how many notifications it contains;
// tapping a chip shows only that group. Every category maps to exactly one
// filter (see getNotificationFilterKey in utils/siteNotifications):
//   product      → store, unlock, course (new/free product, product unlocked,
//                  course content updates)
//   my day       → mayday (tasks, schedule events, reminders)
//   subscription → subscription (renewal reminders)
//   updates      → announcement, community + any future/unknown category
// ---------------------------------------------------------------------------
const FILTER_META: Record<Exclude<NotificationFilterKey, "all">, { label: string; hint: string }> = {
  product: {
    label: "Product",
    hint: "New products, unlocks and course content updates.",
  },
  mayday: {
    label: "My Day",
    hint: "Tasks, schedule events and reminders from My Day.",
  },
  subscription: {
    label: "Subscription",
    hint: "Subscription renewal and expiry alerts.",
  },
  updates: {
    label: "Updates",
    hint: "Announcements and community activity.",
  },
};

export default function NotificationsPage({
  cartCount,
  purchasesBadge,
  onNavigateToCart,
  onNavigateToSubscription,
  onNavigateFooter,
}: NotificationsPageProps) {
  const { user } = useAuth();
  const viewerKey = user?.id || "guest";
  const [items, setItems] = useState<SiteNotification[]>(() => loadSiteNotifications(viewerKey));
  const [activeFilter, setActiveFilter] = useState<NotificationFilterKey>("all");
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof window !== "undefined" && isWebPushSupported() ? window.Notification.permission : "unsupported"
  );

  const filterCounts = useMemo(() => {
    const counts: Record<NotificationFilterKey, number> = { all: items.length, product: 0, mayday: 0, subscription: 0, updates: 0 };
    items.forEach((item) => {
      counts[getNotificationFilterKey(item)] += 1;
    });
    return counts;
  }, [items]);

  const visibleItems = useMemo(() => filterNotifications(items, activeFilter), [activeFilter, items]);

  useEffect(() => {
    setItems(loadSiteNotifications(viewerKey));
  }, [viewerKey]);

  useEffect(() => {
    if (!user) return;
    void ensureSavedWebPushSubscription(user.id).then(() => {
      if (typeof window !== "undefined" && isWebPushSupported()) setPushPermission(window.Notification.permission);
    });
  }, [user]);

  const enableNotifications = async () => {
    if (!user) return;
    await ensureSavedWebPushSubscription(user.id);
    if (typeof window !== "undefined" && isWebPushSupported()) setPushPermission(window.Notification.permission);
  };

  // Every notification is generated on the SERVER by the real-time push
  // system (renewals, My Day activity reminders, product unlocks, new-product
  // and course-content announcements) and written once to
  // users/{uid}/notifications with an idempotent doc id — the GitHub Actions
  // minute pinger keeps it exact-time even when the app is closed. This page
  // only mirrors those cloud docs; it must never generate notifications
  // itself (the old app-open fallback re-created the same alert on every
  // visit). Category/target are stored on each doc — map them through so a
  // My Day reminder doesn't masquerade as a subscription alert.
  useEffect(() => {
    if (!user) return undefined;
    const validCategories = new Set<SiteNotificationCategory>(["store", "reading", "course", "unlock", "community", "announcement", "mayday", "subscription"]);
    return onSnapshot(collection(db, "users", user.id, "notifications"), (snapshot) => {
      const cloud: SiteNotification[] = snapshot.docs.map((item) => {
        const data = item.data() || {};
        const createdAt = data.createdAt && typeof data.createdAt.toMillis === "function" ? data.createdAt.toMillis() : Number(data.createdAt || Date.now());
        const rawCategory = String(data.category || "");
        const category = (validCategories.has(rawCategory as SiteNotificationCategory) ? rawCategory : "subscription") as SiteNotificationCategory;
        const rawTarget = data.target && typeof data.target === "object" && typeof (data.target as { type?: unknown }).type === "string"
          ? data.target
          : { type: "subscription" };
        // `expired` drives the renewal deep link (#/subscription?renew=1),
        // so it must survive the cloud → local mapping.
        return { id: item.id, title: String(data.title || "Notification"), body: String(data.body || ""), category, createdAt, read: Boolean(data.read), source: "system" as const, target: rawTarget as SiteNotification["target"], remoteNotificationId: item.id, expired: data.expired === true };
      }).filter((item) => !isNewsOrBlogNotification(item));
      setItems((current) => mergeSiteNotifications(current, cloud));
    });
  }, [user]);

  useEffect(() => {
    saveSiteNotifications(viewerKey, items);
  }, [items, viewerKey]);

  const unread = useMemo(() => items.filter((item) => !item.read).length, [items]);
  const markAllRead = () => {
    const remoteIds = items.filter((item) => !item.read && item.remoteNotificationId).map((item) => item.remoteNotificationId!);
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    if (user) remoteIds.forEach((id) => void updateDoc(doc(db, "users", user.id, "notifications", id), { read: true, readAt: serverTimestamp() }));
  };

  const openNotification = (notification: SiteNotification) => {
    setItems((prev) => prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item)));
    if (user && notification.remoteNotificationId) void updateDoc(doc(db, "users", user.id, "notifications", notification.remoteNotificationId), { read: true, readAt: serverTimestamp() });
    // Navigate to the exact location that caused the alert: a specific
    // product/course page, the My Day tab with the item highlighted, or the
    // subscription page (with renew intent when expired).
    window.location.hash = getNotificationDeepLink(notification);
  };

  return (
    <div className="min-h-screen bg-slate-100 sm:py-6">
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-xl shadow-slate-200 sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-slate-200">
        <Header
          cartCount={cartCount}
          notifCount={unread}
          onNavigateToSubscription={onNavigateToSubscription}
          onNavigateToCart={onNavigateToCart}
          onNavigateToNotifications={() => undefined}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-4 pt-5 pb-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Notifications</h2>
              <p className="text-xs font-medium text-slate-400">
                {unread > 0 ? `${unread} unread update${unread === 1 ? "" : "s"}` : "You're all caught up"}
              </p>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-bold text-indigo-600"
              >
                Mark all read
              </button>
            )}
          </div>

          {pushPermission === "default" && (
            <div className="mx-4 mt-1 flex items-center justify-between gap-3 rounded-2xl bg-indigo-50 p-4 ring-1 ring-indigo-100">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Get alerts on your phone</p>
                <p className="mt-0.5 text-xs text-slate-500">Allow notifications to receive purchase unlocks and reminders as system alerts.</p>
              </div>
              <button
                type="button"
                onClick={() => void enableNotifications()}
                className="shrink-0 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white"
              >
                Enable
              </button>
            </div>
          )}
          {pushPermission === "denied" && (
            <div className="mx-4 mt-1 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
              <p className="text-sm font-bold text-slate-900">Notifications are blocked</p>
              <p className="mt-0.5 text-xs text-slate-500">Enable them in your browser's site settings (usually under App info → Notifications) to receive system alerts.</p>
            </div>
          )}

          {items.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {NOTIFICATION_FILTER_ORDER.map((key) => {
                const isActive = activeFilter === key;
                const label = key === "all" ? "All" : FILTER_META[key].label;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveFilter(key)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                      isActive
                        ? "border-indigo-500 bg-indigo-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                    <span
                      className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                        isActive ? "bg-white/20 text-white" : "bg-indigo-50 text-indigo-600"
                      }`}
                    >
                      {filterCounts[key]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {visibleItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 pb-10 pt-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                <BellIcon className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900">
                {activeFilter === "all" ? "No notifications yet" : `No ${FILTER_META[activeFilter as Exclude<NotificationFilterKey, "all">].label} notifications`}
              </h3>
              <p className="max-w-xs text-sm text-slate-500">
                {activeFilter === "all"
                  ? "Store updates, course unlocks, and study reminders will show up here."
                  : FILTER_META[activeFilter as Exclude<NotificationFilterKey, "all">].hint}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 px-2 pb-6">
              {visibleItems.map((notification) => {
                const Icon = CATEGORY_ICON[notification.category] || BellIcon;
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition ${
                      notification.read ? "bg-white" : "bg-indigo-50/70"
                    }`}
                  >
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-900">{notification.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">{notification.body}</span>
                      <span className="mt-1 block text-[11px] font-semibold text-slate-400">{timeAgo(notification.createdAt)}</span>
                    </span>
                    {!notification.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-600" />}
                  </button>
                );
              })}
            </div>
          )}
        </main>

        <BottomNav active={null} onChange={onNavigateFooter} purchasesBadge={purchasesBadge} />
      </div>
    </div>
  );
}
