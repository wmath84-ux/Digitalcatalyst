import { useState } from "react";
import { useApp } from "../context/AppContext";
import Avatar from "../components/Avatar";
import { timeAgo } from "../utils/time";
import { cn } from "../utils/cn";

interface NotificationsScreenProps {
  onBack: () => void;
  onOpenProfile: (userId: string) => void;
}

const iconFor = (type: string) => {
  switch (type) {
    case "like":
      return "❤️";
    case "comment":
      return "💬";
    case "follow":
      return "👤";
    case "mention":
      return "📣";
    case "poll_vote":
      return "📊";
    case "story_like":
      return "✨";
    case "repost":
      return "🔁";
    case "message":
      return "✉️";
    default:
      return "🔔";
  }
};

export default function NotificationsScreen({ onBack, onOpenProfile }: NotificationsScreenProps) {
  const { state, markNotificationsRead, toggleNotificationRead, deleteNotification, currentUser, follow, unfollow } = useApp();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [menuId, setMenuId] = useState<string | null>(null);

  const sorted = [...state.notifications]
    .filter((n) => filter === "all" || !n.read)
    .sort((a, b) => b.createdAt - a.createdAt);

  const unreadCount = state.notifications.filter((n) => !n.read).length;

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onBack} className="text-xl text-slate-700">←</button>
          <h2 className="text-sm font-bold text-slate-900">Activity</h2>
          <button 
            onClick={markNotificationsRead}
            className="text-xs font-semibold text-violet-600"
          >
            Mark all read
          </button>
        </div>
        
        {/* Filter Tabs */}
        <div className="flex gap-2 px-4 pb-3">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold",
              filter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5",
              filter === "unread" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
            )}
          >
            Unread
            {unreadCount > 0 && (
              <span className={cn(
                "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                filter === "unread" ? "bg-white text-slate-900" : "bg-fuchsia-500 text-white"
              )}>
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-5xl mb-3">🔔</span>
          <p className="text-sm font-semibold text-slate-700">
            {filter === "unread" ? "No unread notifications" : "You're all caught up!"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {filter === "unread" ? "Switch to 'All' to see past activity" : "Check back later for new activity"}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {sorted.map((n) => {
            const from = state.users[n.fromUserId];
            if (!from) return null;
            const isFollowing = currentUser.following.includes(from.id);
            
            return (
              <div
                key={n.id}
                className={cn(
                  "relative flex items-center justify-between gap-3 px-4 py-3 transition",
                  !n.read && "bg-violet-50/60"
                )}
              >
                <button onClick={() => onOpenProfile(from.id)} className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="relative shrink-0">
                    <Avatar user={from} size="md" />
                    <span className="absolute -bottom-1 -right-1 text-sm">{iconFor(n.type)}</span>
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-slate-700">
                      <span className="font-semibold text-slate-900">{from.displayName}</span> {n.text}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                      {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500" />}
                    </div>
                  </div>
                </button>
                
                <div className="flex items-center gap-2 shrink-0">
                  {n.type === "follow" && (
                    <button
                      onClick={() => (isFollowing ? unfollow(from.id) : follow(from.id))}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-[11px] font-bold",
                        isFollowing ? "border border-slate-200 text-slate-400" : "bg-slate-900 text-white"
                      )}
                    >
                      {isFollowing ? "Following" : "Follow Back"}
                    </button>
                  )}
                  
                  <button
                    onClick={() => setMenuId(menuId === n.id ? null : n.id)}
                    className="p-1 text-slate-300 hover:text-slate-500"
                  >
                    ⋯
                  </button>
                </div>

                {/* Action Menu */}
                {menuId === n.id && (
                  <div className="absolute right-12 top-1/2 -translate-y-1/2 z-20 rounded-xl bg-white shadow-xl border border-slate-100 overflow-hidden">
                    <button
                      onClick={() => {
                        toggleNotificationRead(n.id);
                        setMenuId(null);
                      }}
                      className="block w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      {n.read ? "📩 Mark unread" : "✓ Mark read"}
                    </button>
                    <button
                      onClick={() => {
                        deleteNotification(n.id);
                        setMenuId(null);
                      }}
                      className="block w-full px-4 py-2.5 text-left text-xs font-medium text-red-500 hover:bg-red-50 whitespace-nowrap"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
