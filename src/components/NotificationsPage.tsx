import { useEffect, useMemo, useState } from "react";
import Header from "./Header";
import BottomNav, { type TabKey } from "./BottomNav";
import {
  loadSiteNotifications,
  saveSiteNotifications,
  type SiteNotification,
} from "../../utils/siteNotifications";
import { useAuth } from "../context/AuthContext";
import { BellIcon, BookOpenIcon, StoreIcon } from "./icons";

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

  useEffect(() => {
    setItems(loadSiteNotifications(viewerKey));
  }, [viewerKey]);

  useEffect(() => {
    saveSiteNotifications(viewerKey, items);
  }, [items, viewerKey]);

  const unread = useMemo(() => items.filter((item) => !item.read).length, [items]);

  const openNotification = (notification: SiteNotification) => {
    setItems((prev) => prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item)));
    const target = notification.target;
    if (target.type === "product") window.location.hash = `#/product/${encodeURIComponent(String(target.productId))}`;
    else if (target.type === "course") window.location.hash = `#/course/${encodeURIComponent(String(target.productId))}`;
    else if (target.type === "purchases") window.location.hash = "#/store/purchases";
    else if (target.type === "mayday") window.location.hash = "#/my-day";
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
                onClick={() => setItems((prev) => prev.map((item) => ({ ...item, read: true })))}
                className="text-xs font-bold text-indigo-600"
              >
                Mark all read
              </button>
            )}
          </div>

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
