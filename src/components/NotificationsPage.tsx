import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellRing,
  BookOpen,
  CalendarClock,
  CheckSquare,
  CreditCard,
  Megaphone,
  Newspaper,
  ShoppingBag,
  Sparkles,
  Unlock,
  Users,
} from "lucide-react";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import Header from "./Header";
import { GlassButton } from "./ui/glass-button";
import { GlassCard } from "./ui/GlassCard";
import { GlassToggleGroup, GlassToggleItem } from "./ui/glass-toggle-group";
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
import { BellIcon, CheckIcon } from "./icons";
import { ensureSavedWebPushSubscription, isWebPushSupported } from "../../utils/webPush";

type NotificationsPageProps = {
  cartCount: number;
  purchasesBadge: number;
  onNavigateToCart: () => void;
  onNavigateToSubscription: () => void;
  onNavigateFooter: (tab: TabKey) => void;
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
// Per-notification icon. Each notification carries a `category` and a `target`
// (see utils/siteNotifications), so the list shows an icon that matches what
// the alert is about — a product unlock, a My Day task/reminder, a renewal,
// etc. — instead of reusing the app/PWA logo on every row.
// ---------------------------------------------------------------------------
type IconStyle = { Icon: typeof Bell; bg: string; color: string };

function notificationIcon(notification: SiteNotification): IconStyle {
  const target = notification.target?.type;
  const category = notification.category;

  // My Day reminders carry the section on the target — show the matching icon.
  if (target === "mayday" || category === "mayday") {
    const section = notification.target && notification.target.type === "mayday" ? notification.target.section : undefined;
    if (section === "schedule") return { Icon: CalendarClock, bg: "bg-cyan-500/15", color: "text-cyan-300" };
    if (section === "reminders") return { Icon: BellRing, bg: "bg-amber-500/15", color: "text-amber-300" };
    return { Icon: CheckSquare, bg: "bg-teal-500/15", color: "text-teal-300" };
  }

  switch (category) {
    case "store":
      return { Icon: ShoppingBag, bg: "bg-indigo-500/15", color: "text-indigo-300" };
    case "unlock":
      return { Icon: Unlock, bg: "bg-emerald-500/15", color: "text-emerald-300" };
    case "course":
      return { Icon: BookOpen, bg: "bg-sky-500/15", color: "text-sky-300" };
    case "reading":
      return { Icon: Newspaper, bg: "bg-blue-500/15", color: "text-blue-300" };
    case "community":
      return { Icon: Users, bg: "bg-fuchsia-500/15", color: "text-fuchsia-300" };
    case "announcement":
      return { Icon: Megaphone, bg: "bg-violet-500/15", color: "text-violet-300" };
    case "subscription":
      return { Icon: CreditCard, bg: "bg-purple-500/15", color: "text-purple-300" };
    default:
      return { Icon: Sparkles, bg: "bg-indigo-500/15", color: "text-indigo-200" };
  }
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
    <div className="min-h-screen sm:py-6">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-[calc(100vh-3rem)] sm:supports-[height:100dvh]:min-h-[calc(100dvh-3rem)] sm:overflow-hidden sm:rounded-[2rem] md:max-w-none md:rounded-none">
        <Header
          cartCount={cartCount}
          notifCount={unread}
          onNavigateToSubscription={onNavigateToSubscription}
          onNavigateToCart={onNavigateToCart}
          onNavigateToNotifications={() => undefined}
          icon={BellIcon}
          title="Notifications"
          subtitle={unread > 0 ? `${unread} unread update${unread === 1 ? "" : "s"}` : "You're all caught up"}
          action={
            unread > 0 ? (
              <GlassButton
                type="button"
                onClick={markAllRead}
                aria-label="Mark all read"
                className="shrink-0 [&_.size-12]:size-10 [&_svg]:text-indigo-200"
              >
                <CheckIcon className="h-5 w-5" />
              </GlassButton>
            ) : null
          }
        >
          {items.length > 0 && (
            <div className="mt-3 flex overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {/* Wave 12: the filter strip is the pack GlassToggleGroup. */}
              <GlassToggleGroup
                className="dc-segment shrink-0"
                value={activeFilter}
                onValueChange={(next) => setActiveFilter(next as NotificationFilterKey)}
                aria-label="Filter notifications"
              >
              {NOTIFICATION_FILTER_ORDER.map((key) => {
                const isActive = activeFilter === key;
                const label = key === "all" ? "All" : FILTER_META[key].label;
                return (
                  <GlassToggleItem
                    key={key}
                    value={key}
                    className="whitespace-nowrap px-3.5 py-1.5 text-sm font-semibold"
                  >
                    {label}
                    <span
                      className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border px-1.5 text-[11px] font-bold ${
                        isActive ? "border-white/30 text-white" : "border-white/15 text-white/70"
                      }`}
                    >
                      {filterCounts[key]}
                    </span>
                  </GlassToggleItem>
                );
              })}
              </GlassToggleGroup>
            </div>
          )}
        </Header>

        <main data-notifications-content className="flex-1 overflow-y-auto md:px-8">

          {pushPermission === "default" && (
            <GlassCard className="mx-4 mt-1" contentClassName="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">Get alerts on your phone</p>
                <p className="mt-0.5 text-xs text-white/55">Allow notifications to receive purchase unlocks and reminders as system alerts.</p>
              </div>
              <button
                type="button"
                onClick={() => void enableNotifications()}
                className="shrink-0 rounded-full bg-indigo-600 px-3 py-2 text-xs font-black text-white transition hover:bg-indigo-500"
              >
                Enable
              </button>
            </GlassCard>
          )}
          {pushPermission === "denied" && (
            <div className="mx-4 mt-1 rounded-2xl border border-amber-400/30 bg-amber-500/15 p-4">
              <p className="text-sm font-bold text-amber-100">Notifications are blocked</p>
              <p className="mt-0.5 text-xs text-amber-200/80">Enable them in your browser's site settings (usually under App info → Notifications) to receive system alerts.</p>
            </div>
          )}

          {visibleItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 pb-10 pt-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-200">
                <BellIcon className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-extrabold text-white">
                {activeFilter === "all" ? "No notifications yet" : `No ${FILTER_META[activeFilter as Exclude<NotificationFilterKey, "all">].label} notifications`}
              </h3>
              <p className="max-w-xs text-sm text-white/55">
                {activeFilter === "all"
                  ? "Store updates, course unlocks, and study reminders will show up here."
                  : FILTER_META[activeFilter as Exclude<NotificationFilterKey, "all">].hint}
              </p>
            </div>
          ) : (
            <div className="space-y-2 px-4 pb-6">
              {visibleItems.map((notification) => {
                return (
                  <GlassCard
                    key={notification.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openNotification(notification)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openNotification(notification);
                      }
                    }}
                    data-notification-read={notification.read ? "true" : "false"}
                    className={`w-full cursor-pointer text-left transition active:scale-[0.99] ${
                      notification.read ? "" : "ring-1 ring-indigo-400/40"
                    }`}
                    contentClassName="flex items-start gap-3 px-3 py-3"
                  >
                    {(() => {
                      const { Icon, bg, color } = notificationIcon(notification);
                      return (
                        <span
                          data-notification-icon
                          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg} ${color}`}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                      );
                    })()}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-white">{notification.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-white/55">{notification.body}</span>
                      <span className="mt-1 block text-[11px] font-semibold text-white/55">{timeAgo(notification.createdAt)}</span>
                    </span>
                    {!notification.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-400" />}
                  </GlassCard>
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
