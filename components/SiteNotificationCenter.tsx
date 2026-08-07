import React, { useMemo, useState } from 'react';
import type {
  SiteNotification,
  SiteNotificationCategory,
  SiteNotificationPreferences,
} from '../utils/siteNotifications';
import type { WebPushState } from '../utils/webPush';

interface SiteNotificationCenterProps {
  isOpen: boolean;
  notifications: SiteNotification[];
  preferences: SiteNotificationPreferences;
  browserPermission: NotificationPermission | 'unsupported';
  webPushState: WebPushState;
  onClose: () => void;
  onOpenNotification: (notification: SiteNotification) => void;
  onMarkAllRead: () => void;
  onUpdatePreferences: (preferences: SiteNotificationPreferences) => void;
  onRequestBrowserAlerts: () => void;
  onUnsubscribeWebPush?: () => void;
}

type NotificationFilter = 'all' | SiteNotificationCategory;

const filters: Array<{ id: NotificationFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'store', label: 'Store' },
  { id: 'reading', label: 'Reading' },
  { id: 'course', label: 'Courses' },
  { id: 'unlock', label: 'Unlocks' },
  { id: 'community', label: 'Community' },
  { id: 'announcement', label: 'Admin' },
  { id: 'mayday', label: 'May Day' },
];

const categoryMeta: Record<SiteNotificationCategory, { icon: string; label: string }> = {
  store: { icon: '🛍️', label: 'Store' },
  reading: { icon: '📰', label: 'Reading' },
  course: { icon: '🎓', label: 'Course' },
  unlock: { icon: '🔓', label: 'Unlocked' },
  community: { icon: '💬', label: 'Community' },
  announcement: { icon: '📢', label: 'Admin' },
  mayday: { icon: '⏰', label: 'May Day' },
};

const formatRelativeTime = (createdAt: number) => {
  const elapsed = Math.max(0, Date.now() - Number(createdAt || 0));
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const preferenceRows: Array<{ key: Exclude<keyof SiteNotificationPreferences, 'browserAlerts'>; label: string; description: string }> = [
  { key: 'store', label: 'Store updates', description: 'New and free products.' },
  { key: 'reading', label: 'News & Blog', description: 'Fresh reviewed reading content.' },
  { key: 'course', label: 'Course updates', description: 'New modules and lessons in owned courses.' },
  { key: 'unlock', label: 'Unlocks', description: 'Purchased or reward-unlocked content.' },
  { key: 'community', label: 'Community', description: 'Replies, follows, posts, stories and reactions.' },
  { key: 'announcement', label: 'Admin alerts', description: 'Important platform announcements.' },
  { key: 'mayday', label: 'May Day', description: 'Task, goal, reminder and focus session milestones.' },
];

const SiteNotificationCenter: React.FC<SiteNotificationCenterProps> = ({
  isOpen,
  notifications,
  preferences,
  browserPermission,
  webPushState,
  onClose,
  onOpenNotification,
  onMarkAllRead,
  onUpdatePreferences,
  onRequestBrowserAlerts,
  onUnsubscribeWebPush,
}) => {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [showPreferences, setShowPreferences] = useState(false);

  const filteredNotifications = useMemo(
    () => notifications.filter(notification => filter === 'all' || notification.category === filter),
    [filter, notifications],
  );
  const unreadCount = notifications.filter(notification => !notification.read).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2600] flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="site-notification-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.6rem] border border-slate-200 bg-[#F8FAFD] shadow-[0_30px_90px_rgba(15,23,42,0.28)] sm:max-w-2xl sm:rounded-[1.6rem]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-700">Activity center</p>
            <h2 id="site-notification-title" className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">Notifications</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{unreadCount > 0 ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'You are all caught up.'}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setShowPreferences(value => !value)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg transition hover:bg-white" aria-label="Notification preferences">⚙️</button>
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg transition hover:bg-white" aria-label="Close notification center">✕</button>
          </div>
        </header>

        {showPreferences ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="rounded-[1.25rem] border border-blue-100 bg-blue-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-slate-950">Web push alerts</h3>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">Permission is requested only from this button. Enabling delivers real background push notifications on Android, Chrome and installed PWA apps, even when Eduvora is closed. In-app history always works.</p>
                </div>
                <button
                  type="button"
                  disabled={webPushState === 'unsupported' || webPushState === 'denied' || webPushState === 'loading'}
                  onClick={webPushState === 'subscribed' ? onUnsubscribeWebPush : onRequestBrowserAlerts}
                  className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {webPushState === 'subscribed'
                    ? 'Enabled · Tap to turn off'
                    : webPushState === 'denied'
                      ? 'Blocked in browser'
                      : webPushState === 'unsupported'
                        ? 'Not supported'
                        : webPushState === 'loading'
                          ? 'Loading…'
                          : 'Enable alerts'}
                </button>
              </div>
              {browserPermission === 'denied' && webPushState !== 'denied' && (
                <p className="mt-2 text-[11px] font-bold text-amber-700">Notification permission is blocked in this browser. Enable it in the site settings to receive alerts.</p>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {preferenceRows.map(row => (
                <label key={row.key} className="flex cursor-pointer items-center justify-between gap-4 rounded-[1rem] border border-slate-200 bg-white px-4 py-3">
                  <span className="min-w-0">
                    <strong className="block text-sm text-slate-950">{row.label}</strong>
                    <span className="mt-0.5 block text-xs font-semibold text-slate-500">{row.description}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={preferences[row.key]}
                    onChange={(event) => onUpdatePreferences({ ...preferences, [row.key]: event.target.checked })}
                    className="h-5 w-5 shrink-0 accent-blue-700"
                  />
                </label>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-3 sm:px-5">
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {filters.map(item => (
                  <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black transition ${filter === item.id ? 'bg-blue-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{item.label}</button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
              {filteredNotifications.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-slate-300 bg-white p-8 text-center">
                  <span className="text-4xl">🔔</span>
                  <h3 className="mt-3 text-lg font-black text-slate-950">No updates here</h3>
                  <p className="mt-1 max-w-sm text-sm font-semibold leading-6 text-slate-500">New content and important account or Community activity will appear without flooding you with old history.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredNotifications.map(notification => {
                    const meta = categoryMeta[notification.category];
                    return (
                      <button key={notification.id} type="button" onClick={() => onOpenNotification(notification)} className={`group flex w-full gap-3 rounded-[1.1rem] border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md sm:p-4 ${notification.read ? 'border-slate-200 bg-white' : 'border-blue-200 bg-blue-50/75 shadow-sm'}`}>
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm">{meta.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.15em] text-blue-700">{meta.label}</span>
                            <span className="text-[10px] font-bold text-slate-400">{formatRelativeTime(notification.createdAt)}</span>
                            {!notification.read && <span className="h-2 w-2 rounded-full bg-blue-600" aria-label="Unread" />}
                          </span>
                          <strong className="mt-1.5 block text-sm font-black text-slate-950 sm:text-[15px]">{notification.title}</strong>
                          <span className="mt-1 line-clamp-2 block text-xs font-semibold leading-5 text-slate-600 sm:text-sm">{notification.body}</span>
                        </span>
                        <span className="self-center text-lg text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600">→</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
              <p className="text-[11px] font-semibold text-slate-500">Saved locally per account · 90-day history</p>
              <button type="button" onClick={onMarkAllRead} disabled={unreadCount === 0} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400">Mark all read</button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
};

export default SiteNotificationCenter;
