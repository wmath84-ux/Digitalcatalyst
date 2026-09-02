import { useEffect, useMemo, useRef, useState } from "react";
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
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import Header from "./Header";
import { GlassButton } from "./ui/glass-button";
import { GlassCard } from "./ui/GlassCard";
import { GlassToggleGroup, GlassToggleItem } from "./ui/glass-toggle-group";
import { toast } from "./ui/glass-toast";
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
// Per-notification icon + accent colour. Each notification carries a
// `category` and a `target` (see utils/siteNotifications), so every glass
// card shows a tinted icon tile and accent line that match what the alert is
// about — exactly the AI Canvas glass-notification treatment.
// ---------------------------------------------------------------------------
type IconStyle = { Icon: typeof Bell; color: string };

function notificationIcon(notification: SiteNotification): IconStyle {
  const target = notification.target?.type;
  const category = notification.category;

  // My Day reminders carry the section on the target — show the matching icon.
  if (target === "mayday" || category === "mayday") {
    const section = notification.target && notification.target.type === "mayday" ? notification.target.section : undefined;
    if (section === "schedule") return { Icon: CalendarClock, color: "#22D3EE" };
    if (section === "reminders") return { Icon: BellRing, color: "#FFBE0B" };
    return { Icon: CheckSquare, color: "#2DD4BF" };
  }

  switch (category) {
    case "store":
      return { Icon: ShoppingBag, color: "#6C8CFF" };
    case "unlock":
      return { Icon: Unlock, color: "#06D6A0" };
    case "course":
      return { Icon: BookOpen, color: "#38BDF8" };
    case "reading":
      return { Icon: Newspaper, color: "#3A86FF" };
    case "community":
      return { Icon: Users, color: "#FF6BF5" };
    case "announcement":
      return { Icon: Megaphone, color: "#B388FF" };
    case "subscription":
      return { Icon: CreditCard, color: "#A78BFA" };
    default:
      return { Icon: Sparkles, color: "#818CF8" };
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

// ---------------------------------------------------------------------------
// NotificationCard — the AI Canvas glass-notification card
// (https://aicanvas.me/components/glass-notification): swipe-to-dismiss glass
// card with spring-animated layout transitions, tinted icon tile, close
// button + timestamp column, and a colour-matched bottom accent line.
// ---------------------------------------------------------------------------
function NotificationCard({
  notification,
  index,
  onOpen,
  onDismiss,
}: {
  notification: SiteNotification;
  index: number;
  onOpen: (n: SiteNotification) => void;
  onDismiss: (n: SiteNotification) => void;
}) {
  const { Icon, color } = notificationIcon(notification);
  const draggingRef = useRef(false);

  return (
    <motion.div
      layout
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.3}
      onDragStart={() => {
        draggingRef.current = true;
      }}
      onDragEnd={(_, info) => {
        window.setTimeout(() => {
          draggingRef.current = false;
        }, 0);
        if (Math.abs(info.offset.x) > 80) onDismiss(notification);
      }}
      initial={{ x: 60, scale: 0.9, opacity: 0 }}
      animate={{
        x: 0,
        scale: 1,
        opacity: 1,
        transition: { type: "spring", stiffness: 280, damping: 24, delay: Math.min(index, 8) * 0.05 },
      }}
      exit={{ opacity: 0, x: -60, scale: 0.9, filter: "blur(4px)", transition: { duration: 0.2, ease: "easeIn" } }}
      whileHover={{ backgroundColor: "rgba(255,255,255,0.1)" }}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!draggingRef.current) onOpen(notification);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(notification);
        }
      }}
      data-notification-read={notification.read ? "true" : "false"}
      className={`group relative isolate w-full cursor-grab overflow-hidden rounded-2xl transition-colors duration-200 active:cursor-grabbing ${
        notification.read ? "" : "ring-1 ring-indigo-400/40"
      }`}
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {/* Separate blur layer so the frosted backdrop never re-rasterises
          while the card is dragged or reflows. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[-1] rounded-2xl"
        style={{ backdropFilter: "blur(20px) saturate(1.6)", WebkitBackdropFilter: "blur(20px) saturate(1.6)" }}
      />

      <div className="flex items-start gap-3.5 px-4 py-3.5 pr-12">
        <motion.div
          data-notification-icon
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${color}18`, border: `1px solid ${color}22` }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.1 + Math.min(index, 8) * 0.05 }}
        >
          <Icon size={18} style={{ color }} aria-hidden />
        </motion.div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-white/85">{notification.title}</h4>
          <p className="mt-0.5 text-[13px] leading-5 text-white/40">{notification.body}</p>
        </div>
      </div>

      {/* Top-right column: dismiss × above the timestamp (+ unread dot) */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
        <motion.button
          type="button"
          aria-label="Dismiss notification"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss(notification);
          }}
          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.06)" }}
          whileHover={{ scale: 1.2, backgroundColor: "rgba(255,255,255,0.15)" }}
          whileTap={{ scale: 0.85 }}
        >
          <X size={11} className="text-white/30" aria-hidden />
        </motion.button>
        <span className="flex items-center gap-1 text-[10px] text-white/25">
          {!notification.read && <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" aria-hidden />}
          {timeAgo(notification.createdAt)}
        </span>
      </div>

      {/* Bottom accent line in the notification's colour */}
      <div
        aria-hidden
        className="absolute bottom-0 left-4 right-4 h-[1px]"
        style={{ background: `linear-gradient(90deg, transparent, ${color}22, transparent)` }}
      />
    </motion.div>
  );
}

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
    if (typeof window !== "undefined" && isWebPushSupported()) {
      const permission = window.Notification.permission;
      setPushPermission(permission);
      if (permission === "granted") {
        toast({ title: "Notifications enabled", description: "You'll now receive alerts on this device.", variant: "success" });
      } else if (permission === "denied") {
        toast({ title: "Notifications blocked", description: "Enable them in your browser's site settings.", variant: "warning" });
      }
    }
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
    toast({ title: "All caught up", description: "Every notification is marked as read.", variant: "success" });
  };

  const openNotification = (notification: SiteNotification) => {
    setItems((prev) => prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item)));
    if (user && notification.remoteNotificationId) void updateDoc(doc(db, "users", user.id, "notifications", notification.remoteNotificationId), { read: true, readAt: serverTimestamp() });
    // Navigate to the exact location that caused the alert: a specific
    // product/course page, the My Day tab with the item highlighted, or the
    // subscription page (with renew intent when expired).
    window.location.hash = getNotificationDeepLink(notification);
  };

  // Swipe (or ×) dismiss: drop the card locally — the spring layout reflow
  // closes the gap — and delete the mirrored cloud doc so it never returns
  // on the next snapshot or on another device.
  const dismissNotification = (notification: SiteNotification) => {
    setItems((current) => current.filter((item) => item.id !== notification.id));
    if (user && notification.remoteNotificationId) {
      void deleteDoc(doc(db, "users", user.id, "notifications", notification.remoteNotificationId)).catch(() => undefined);
    }
    toast({ title: "Notification dismissed", duration: 2200 });
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

          {/* AI Canvas glass-notification stack: header row with counter
              badge, then swipe-to-dismiss glass cards with spring-animated
              layout reflow, then the "All caught up" empty state. */}
          <div className="flex flex-col gap-2.5 px-4 pb-6 pt-2">
            <div className="mb-1 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Bell size={20} className="text-white/40" aria-hidden />
                <span className="text-sm font-semibold text-white/60">Notifications</span>
                <motion.span
                  layout
                  className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white"
                  style={{ background: "rgba(255,107,245,0.4)", border: "1px solid rgba(255,107,245,0.3)" }}
                >
                  {visibleItems.length}
                </motion.span>
              </div>
              <span className="px-1 text-[11px] font-medium text-white/30">Swipe to dismiss</span>
            </div>

            <AnimatePresence mode="popLayout">
              {visibleItems.map((notification, index) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  index={index}
                  onOpen={openNotification}
                  onDismiss={dismissNotification}
                />
              ))}
            </AnimatePresence>

            <AnimatePresence>
              {visibleItems.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-3 px-6 py-12 text-center"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-200">
                    <BellIcon className="h-7 w-7" />
                  </div>
                  <h3 className="text-xl font-extrabold text-white">
                    {activeFilter === "all" ? "All caught up" : `No ${FILTER_META[activeFilter as Exclude<NotificationFilterKey, "all">].label} notifications`}
                  </h3>
                  <p className="max-w-xs text-sm text-white/55">
                    {activeFilter === "all"
                      ? "Store updates, course unlocks, and study reminders will show up here."
                      : FILTER_META[activeFilter as Exclude<NotificationFilterKey, "all">].hint}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        <BottomNav active={null} onChange={onNavigateFooter} purchasesBadge={purchasesBadge} />
      </div>
    </div>
  );
}
