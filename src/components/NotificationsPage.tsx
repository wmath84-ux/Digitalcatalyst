import { useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, Send } from "lucide-react";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import Header from "./Header";
import BottomNav, { type TabKey } from "./BottomNav";
import {
  loadSiteNotifications,
  mergeSiteNotifications,
  saveSiteNotifications,
  type SiteNotification,
  type SiteNotificationCategory,
} from "../../utils/siteNotifications";
import { useAuth } from "../context/AuthContext";
import { BellIcon, BookOpenIcon, StoreIcon } from "./icons";
import { getRenewalReminder } from "../../utils/subscriptionRenewal";
import { ensureSavedWebPushSubscription, sendWebPushSelfTest, type WebPushTestResult } from "../../utils/webPush";

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
  const [pushTesting, setPushTesting] = useState(false);
  const [pushTestResult, setPushTestResult] = useState<WebPushTestResult | null>(null);

  useEffect(() => {
    setItems(loadSiteNotifications(viewerKey));
  }, [viewerKey]);

  useEffect(() => {
    if (!user) return;
    void ensureSavedWebPushSubscription(user.id);
  }, [user]);

  // App-open fallback: users still receive the correct one-time reminder
  // even when a scheduled cron or push delivery was delayed.
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(doc(db, "users", user.id, "subscription", "current"), (snapshot) => {
      const reminder = getRenewalReminder(snapshot.data() || null);
      if (!reminder) return;
      const incoming: SiteNotification = { ...reminder, category: "subscription", read: false, source: "system" };
      setItems((current) => mergeSiteNotifications(current, [incoming]));
    });
  }, [user]);

  // Cloud notifications are written by the push scheduler (renewals, My Day
  // activity reminders, course content announcements) and sync across every
  // signed-in device. Category/target are stored on each doc — map them
  // through so a My Day reminder doesn't masquerade as a subscription alert.
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
        return { id: item.id, title: String(data.title || "Notification"), body: String(data.body || ""), category, createdAt, read: Boolean(data.read), source: "system", target: rawTarget as SiteNotification["target"], remoteNotificationId: item.id };
      });
      setItems((current) => mergeSiteNotifications(current, cloud));
    });
  }, [user]);

  useEffect(() => {
    saveSiteNotifications(viewerKey, items);
  }, [items, viewerKey]);

  const runPushTest = async () => {
    if (!user) {
      setPushTestResult({ ok: false, code: "login_required", message: "Please sign in before testing notifications." });
      return;
    }
    setPushTesting(true);
    setPushTestResult(null);
    try {
      setPushTestResult(await sendWebPushSelfTest(user.id));
    } finally {
      setPushTesting(false);
    }
  };

  const unread = useMemo(() => items.filter((item) => !item.read).length, [items]);
  const markAllRead = () => {
    const remoteIds = items.filter((item) => !item.read && item.remoteNotificationId).map((item) => item.remoteNotificationId!);
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    if (user) remoteIds.forEach((id) => void updateDoc(doc(db, "users", user.id, "notifications", id), { read: true, readAt: serverTimestamp() }));
  };

  const openNotification = (notification: SiteNotification) => {
    setItems((prev) => prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item)));
    if (user && notification.remoteNotificationId) void updateDoc(doc(db, "users", user.id, "notifications", notification.remoteNotificationId), { read: true, readAt: serverTimestamp() });
    const target = notification.target;
    if (target.type === "product") window.location.hash = `#/product/${encodeURIComponent(String(target.productId))}`;
    else if (target.type === "course") window.location.hash = `#/course/${encodeURIComponent(String(target.productId))}`;
    else if (target.type === "purchases") window.location.hash = "#/store/purchases";
    else if (target.type === "mayday") window.location.hash = "#/my-day";
    else if (target.type === "subscription") window.location.hash = "#/subscription";
    else window.location.hash = "#/store";
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

          <section className="mx-4 mb-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-4" data-web-push-self-test>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white"><Send size={17} /></span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-900">Test browser notification</h3>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">This checks permission, service worker, saved browser subscription, server keys and actual push delivery.</p>
              </div>
            </div>
            <button type="button" onClick={() => void runPushTest()} disabled={pushTesting} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-black text-white disabled:opacity-60">
              {pushTesting ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={14} />}
              {pushTesting ? "Sending live test…" : "Send test notification"}
            </button>
            {pushTestResult && (
              <div role={pushTestResult.ok ? "status" : "alert"} className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs font-semibold leading-5 ${pushTestResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                {pushTestResult.ok ? <CircleCheck size={16} className="mt-0.5 shrink-0" /> : <CircleAlert size={16} className="mt-0.5 shrink-0" />}
                <span><span className="block font-black">{pushTestResult.ok ? "Test sent" : `Test failed · ${pushTestResult.code}`}</span>{pushTestResult.message}</span>
              </div>
            )}
          </section>

          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 pb-10 pt-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                <BellIcon className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900">No notifications yet</h3>
              <p className="max-w-xs text-sm text-slate-500">
                Store updates, course unlocks, and study reminders will show up here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 px-2 pb-6">
              {items.map((notification) => {
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
