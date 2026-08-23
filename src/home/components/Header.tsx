import { forwardRef } from "react";
import type { Product } from "../types";
import { useUnreadNotificationCount } from "../../hooks/useUnreadNotificationCount";
import BrandMark from "../../components/BrandMark";
import { useBranding } from "../../context/BrandingContext";
import { DEFAULT_HOME_GRADIENT_FROM, DEFAULT_HOME_GRADIENT_TO } from "../../utils/branding";

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
  // The header gradient follows the app brand: by default it is the web app
  // icon's own indigo → violet blend, and the admin can re-theme both stops
  // from the branding page. Inline style (not Tailwind classes) so the live
  // Firestore values always win.
  const { homeGradientFrom, homeGradientTo } = useBranding();
  const gradientFrom = homeGradientFrom || DEFAULT_HOME_GRADIENT_FROM;
  const gradientTo = homeGradientTo || DEFAULT_HOME_GRADIENT_TO;
  return (
    <header
      data-site-header
      className="relative rounded-b-[28px] px-4 pb-8 pt-[calc(1.5rem+env(safe-area-inset-top))] text-white shadow-lg shadow-indigo-900/20 min-[390px]:px-5"
      style={{ backgroundImage: `linear-gradient(to bottom right, ${gradientFrom}, ${gradientTo})` }}
      data-home-gradient-from={gradientFrom}
      data-home-gradient-to={gradientTo}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 min-[390px]:gap-3">
          <BrandMark className="h-10 w-10 shrink-0 rounded-2xl bg-white/15 ring-1 ring-white/25 min-[390px]:h-11 min-[390px]:w-11" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <p data-home-welcome className="truncate whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-white/70 min-[390px]:text-xs">
              Good to see you 👋
            </p>
            <h1 data-home-greeting className="mt-0.5 truncate whitespace-nowrap text-[clamp(0.875rem,4.8vw,1.25rem)] font-bold tracking-tight">
              Hello, {userName}
            </h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 min-[390px]:gap-2">
          <button
            type="button"
            aria-label="Leaderboard"
            onClick={() => { window.location.hash = "#/leaderboard"; }}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white/15 backdrop-blur-sm transition hover:bg-white/25 active:scale-95 min-[390px]:h-10 min-[390px]:w-10 min-[430px]:w-auto min-[430px]:gap-1.5 min-[430px]:px-3"
          >
            <span className="text-base leading-none">🏆</span>
            <span className="hidden text-xs font-bold tracking-tight min-[430px]:inline">Leaderboard</span>
          </button>
          <button
            type="button"
            aria-label="Notifications"
            onClick={onOpenNotifications}
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition active:scale-90 min-[390px]:h-10 min-[390px]:w-10"
          >
            <span className="text-lg">🔔</span>
            {unreadNotificationCount > 0 && <span aria-label={`${unreadNotificationCount} unread notifications`} className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold ring-2 ring-indigo-600">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>}
          </button>
          <button
            type="button"
            aria-label="Favorites"
            onClick={onOpenFavorites}
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition active:scale-90 min-[390px]:h-10 min-[390px]:w-10"
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
