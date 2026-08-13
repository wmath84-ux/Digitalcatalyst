import { forwardRef } from "react";
import type { Product } from "../types";
import { useUnreadNotificationCount } from "../../hooks/useUnreadNotificationCount";

interface HeaderProps {
  userName: string;
  query: string;
  onQueryChange: (value: string) => void;
  suggestions: Product[];
  onSelectSuggestion: (product: Product) => void;
  favoritesCount: number;
  onOpenFavorites?: () => void;
  onOpenNotifications?: () => void;
}

const typeLabel: Record<string, string> = {
  video: "Video Lecture",
  pdf: "PDF",
  ebook: "E-book",
  live: "Live Class",
};

const Header = forwardRef<HTMLInputElement, HeaderProps>(function Header(
  { userName, query, onQueryChange, suggestions, onSelectSuggestion, favoritesCount, onOpenFavorites, onOpenNotifications },
  ref,
) {
  const unreadNotificationCount = useUnreadNotificationCount() || 0;
  return (
    <header className="relative rounded-b-[28px] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-5 pb-8 pt-6 text-white shadow-lg shadow-indigo-900/20">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-white/70">
            Good to see you 👋
          </p>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight">Hello, {userName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Notifications"
            onClick={onOpenNotifications}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition active:scale-90"
          >
            <span className="text-lg">🔔</span>
            {unreadNotificationCount > 0 && <span aria-label={`${unreadNotificationCount} unread notifications`} className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold ring-2 ring-indigo-600">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>}
          </button>
          <button
            type="button"
            aria-label="Favorites"
            onClick={onOpenFavorites}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition active:scale-90"
          >
            <span className="text-lg">❤️</span>
            {favoritesCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold ring-2 ring-indigo-600">
                {favoritesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="relative mt-5">
        <div className="flex items-center gap-2 rounded-2xl bg-white/95 px-4 py-3 shadow-sm">
          <span className="text-slate-400">🔍</span>
          <input
            ref={ref}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            type="text"
            inputMode="search"
            placeholder="Search courses, PDFs, e-books..."
            className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-500 transition active:scale-90"
            >
              ✕
            </button>
          )}
        </div>

        {query.trim().length > 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-80 overflow-y-auto rounded-2xl bg-white p-2 text-slate-800 shadow-2xl shadow-indigo-950/30">
            {suggestions.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-slate-400">
                No matches for “{query}”. Try a different keyword.
              </p>
            ) : (
              suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectSuggestion(item)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-slate-100 active:scale-[0.99]"
                >
                  <img
                    src={item.image}
                    alt=""
                    className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block text-xs text-slate-400">
                      {typeLabel[item.type]} · ₹{item.price}
                    </span>
                  </span>
                  <span className="flex-shrink-0 text-xs text-indigo-500">↗</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </header>
  );
});

export default Header;
