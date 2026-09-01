import { forwardRef, useEffect, useRef } from "react";
import { Bell, Heart, Search, Trophy, UserRound, X } from "lucide-react";
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

const COLLAPSE_RANGE = 96;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Brand stops stay customisable; alpha keeps the MAG/WebsiteGlass frost see-through. */
function brandGlassGradient(from: string, to: string) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  if (!start || !end) return `linear-gradient(to bottom right, ${from}, ${to})`;
  return `linear-gradient(to bottom right, rgba(${start.r},${start.g},${start.b},0.58), rgba(${end.r},${end.g},${end.b},0.48))`;
}

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
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const scrollers: HTMLElement[] = [];
    const frame = header.closest("[data-app-frame]");
    if (frame instanceof HTMLElement) {
      const main = frame.querySelector(":scope > main");
      if (main instanceof HTMLElement) scrollers.push(main);
      scrollers.push(frame);
    }
    const desktop = document.querySelector("[data-desktop-content]");
    if (desktop instanceof HTMLElement) scrollers.push(desktop);
    // Pages that render this header outside an app frame (FlowPath) scroll
    // the document itself, so fall back to the window as the scroller —
    // the collapse animation then behaves exactly like it does on Home.
    const useWindowScroll = scrollers.length === 0;

    const measureSeat = () => {
      if (!(frame instanceof HTMLElement)) return;
      const collapse = header.style.getPropertyValue("--home-collapse");
      header.style.setProperty("--home-collapse", "0");
      frame.style.setProperty("--dc-home-header-seat", `${header.offsetHeight}px`);
      if (collapse) header.style.setProperty("--home-collapse", collapse);
      else header.style.removeProperty("--home-collapse");
    };
    measureSeat();

    let raf = 0;
    const apply = () => {
      raf = 0;
      const y = useWindowScroll
        ? Math.max(0, window.scrollY)
        : Math.max(0, ...scrollers.map((node) => node.scrollTop));
      const t = Math.min(1, Math.max(0, y / COLLAPSE_RANGE));
      header.style.setProperty("--home-collapse", t.toFixed(3));
      if (t >= 0.88) header.setAttribute("data-collapsed", "true");
      else header.removeAttribute("data-collapsed");
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(apply);
    };
    if (useWindowScroll) window.addEventListener("scroll", onScroll, { passive: true });
    else scrollers.forEach((node) => node.addEventListener("scroll", onScroll, { passive: true }));
    window.addEventListener("resize", measureSeat);
    apply();
    return () => {
      if (useWindowScroll) window.removeEventListener("scroll", onScroll);
      else scrollers.forEach((node) => node.removeEventListener("scroll", onScroll));
      window.removeEventListener("resize", measureSeat);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      data-site-header
      data-home-header
      className="relative z-30 overflow-hidden rounded-b-[32px] border-b border-white/25 px-4 pb-8 pt-[calc(1.5rem+env(safe-area-inset-top))] text-white shadow-[0_24px_50px_-26px_rgba(49,46,129,0.42)] min-[390px]:px-5"
      style={{
        backgroundImage: brandGlassGradient(gradientFrom, gradientTo),
        backdropFilter: "blur(18px) saturate(160%)",
        WebkitBackdropFilter: "blur(18px) saturate(160%)",
      }}
      data-home-gradient-from={gradientFrom}
      data-home-gradient-to={gradientTo}
    >
      <div
        aria-hidden
        data-home-glass-sheen
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.32) 0%, transparent 38%, transparent 62%, rgba(255,255,255,0.14) 100%)",
        }}
      />
      <div aria-hidden data-home-orbs className="pointer-events-none absolute -left-10 top-10 h-32 w-32 rounded-full bg-white/12 blur-3xl" />
      <div aria-hidden data-home-orbs className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
      <div aria-hidden data-home-orbs className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/10 to-transparent" />
      <div data-home-chrome className="relative flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 min-[390px]:gap-3">
          <span data-home-brand className="shrink-0">
            <BrandMark className="h-10 w-10 rounded-2xl bg-white/15 ring-1 ring-white/25 min-[390px]:h-11 min-[390px]:w-11" />
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p data-home-welcome className="truncate whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-white/70 min-[390px]:text-xs">
              Good to see you 👋
            </p>
            <h1 data-home-greeting className="mt-0.5 truncate whitespace-nowrap text-[clamp(0.875rem,4.8vw,1.25rem)] font-bold tracking-tight">
              Hello, {userName}
            </h1>
          </div>
        </div>
        <div data-home-actions className="flex shrink-0 items-center gap-1 min-[390px]:gap-2">
          <button
            type="button"
            aria-label="Leaderboard"
            onClick={() => { window.location.hash = "#/leaderboard"; }}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/35 bg-white/16 shadow-lg shadow-indigo-950/10 backdrop-blur-md transition hover:bg-white/24 active:scale-95 min-[390px]:h-10 min-[390px]:w-10 min-[430px]:w-auto min-[430px]:gap-1.5 min-[430px]:px-3"
          >
            <Trophy size={17} strokeWidth={2.4} className="shrink-0" />
            <span className="hidden text-xs font-bold tracking-tight min-[430px]:inline">Leaderboard</span>
          </button>
          {/* Profile shortcut — this slot used to hold the FlowPath "+"
              button; FlowPath moved to the footer dock (former Profile slot)
              and Profile now lives here in the header. */}
          <button
            type="button"
            aria-label="Open profile"
            title="Profile"
            onClick={() => { window.location.hash = "#/profile"; }}
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/35 bg-white/16 shadow-lg shadow-indigo-950/10 backdrop-blur-md transition hover:bg-white/24 active:scale-90 min-[390px]:h-10 min-[390px]:w-10"
          >
            <UserRound size={18} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            aria-label="Notifications"
            onClick={onOpenNotifications}
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/16 shadow-lg shadow-indigo-950/10 backdrop-blur-md transition active:scale-90 min-[390px]:h-10 min-[390px]:w-10"
          >
            <Bell size={18} strokeWidth={2.4} />
            {unreadNotificationCount > 0 && <span aria-label={`${unreadNotificationCount} unread notifications`} className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold ring-2 ring-indigo-600">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>}
          </button>
          <button
            type="button"
            aria-label="Favorites"
            onClick={onOpenFavorites}
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/16 shadow-lg shadow-indigo-950/10 backdrop-blur-md transition active:scale-90 min-[390px]:h-10 min-[390px]:w-10"
          >
            <Heart size={18} strokeWidth={2.4} fill="currentColor" />
            {favoritesCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold ring-2 ring-indigo-600">
                {favoritesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div data-home-search-slot className="relative mt-5">
        <div
          className="dc-glass-toolbar flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-3 transition active:scale-[0.99]"
          onClick={() => {
            const trimmed = query.trim();
            window.location.hash = trimmed ? `#/search?q=${encodeURIComponent(trimmed)}` : "#/search";
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              const trimmed = query.trim();
              window.location.hash = trimmed ? `#/search?q=${encodeURIComponent(trimmed)}` : "#/search";
            }
          }}
        >
          <Search size={18} className="shrink-0 text-slate-400" strokeWidth={2.4} />
          <input
            ref={ref}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => {
              const trimmed = query.trim();
              window.location.hash = trimmed ? `#/search?q=${encodeURIComponent(trimmed)}` : "#/search";
            }}
            type="text"
            inputMode="search"
            placeholder="Search courses, PDFs, e-books..."
            className="w-full cursor-pointer bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            readOnly
          />
          {query ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQueryChange("");
              }}
              aria-label="Clear search"
              className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-500 transition active:scale-90"
            >
              <X size={13} strokeWidth={2.6} />
            </button>
          ) : (
            <span className="hidden shrink-0 rounded-md bg-slate-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:inline">
              Tap to search
            </span>
          )}
        </div>

        {query.trim().length > 0 && (
          <div className="dc-glass-toolbar absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-80 overflow-y-auto rounded-2xl p-2 text-slate-800 shadow-2xl shadow-indigo-950/20">
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
