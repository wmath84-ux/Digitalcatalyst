import { forwardRef, useEffect, useRef } from "react";
import { Bell, Heart, Search, Trophy, UserRound, X } from "lucide-react";
import { GlassSwitch } from "../../components/ui/glass-switch";
import { GlassSurface } from "../../components/ui/glass";
import { GlassButton } from "../../components/ui/glass-button";
import { useGlassScheme } from "../../lib/glassScheme";
import { openCommandPalette } from "../../lib/commandPalette";
import type { Product } from "../types";
import { useUnreadNotificationCount } from "../../hooks/useUnreadNotificationCount";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/glass-tooltip";
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
  const [scheme, setScheme] = useGlassScheme();
  const unreadNotificationCount = useUnreadNotificationCount() || 0;
  // Tap on the search box → the pack's GlassCommand palette (the ⌘K component),
  // exactly as the store's search box does. A pre-filled draft still deep-links
  // to the full results page so `#/search?q=` keeps working for shared links.
  const openSearch = () => {
    const trimmed = query.trim();
    if (trimmed) {
      window.location.hash = `#/search?q=${encodeURIComponent(trimmed)}`;
      return;
    }
    openCommandPalette();
  };
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
      className="relative z-30 text-white"
      data-home-gradient-from={gradientFrom}
      data-home-gradient-to={gradientTo}
      data-home-gradient-css={brandGlassGradient(gradientFrom, gradientTo)}
    >
    <GlassSurface
      radius={0}
      style={{ borderRadius: "0 0 32px 32px" }}
      className="overflow-hidden"
      contentClassName="px-4 pb-8 pt-[calc(1.5rem+env(safe-area-inset-top))] min-[390px]:px-5"
    >
      {/* Phase A: the header is the pack's GlassSurface at websiteglass.com
          defaults (tint 0.5 · blur 14 · saturation 1.6). The brand gradient
          (`brandGlassGradient`, linear-gradient(to bottom right …)) is kept
          only as a legacy helper/attribute — nothing paints it; the header's
          former inline backdropFilter: blur(18px) saturate(160%) is gone. */}
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
          <GlassButton
            aria-label="Leaderboard"
            onClick={() => { window.location.hash = "#/leaderboard"; }}
            className="dc-home-pill [&_.size-12]:size-10 [&_.size-12]:min-[430px]:w-auto [&_.size-12]:min-[430px]:px-3"
            >
            <span className="inline-flex items-center gap-1.5"><Trophy size={17} strokeWidth={2.4} className="shrink-0" /><span className="hidden text-xs font-bold tracking-tight min-[430px]:inline">Leaderboard</span></span>
          </GlassButton>
          {/* Profile shortcut — this slot used to hold the FlowPath "+"
              button; FlowPath moved to the footer dock (former Profile slot)
              and Profile now lives here in the header. */}
          {/* The hero's last native `title` bubble became the same delayed,
              focusable glass tooltip the app-wide header uses (Wave 2), so the
              shortcut reads identically on keyboard and touch. */}
          <Tooltip>
            <TooltipTrigger
              type="button"
              aria-label="Open profile"
              onClick={() => { window.location.hash = "#/profile"; }}
              className="dc-home-pill grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/[0.08] transition hover:bg-white/[0.12] active:scale-90"
            >
              <UserRound size={18} strokeWidth={2.4} />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span>Profile</span>
            </TooltipContent>
          </Tooltip>
          {/* websiteglass.com Glass Switch — the docs' controlled "Dark mode"
              example, flipping the pack between its own light and dark material. */}
          <GlassSwitch checked={scheme === "dark"} onCheckedChange={(v) => setScheme(v ? "dark" : "light")} ariaLabel="Dark mode" />
          <GlassButton
            aria-label="Notifications"
            onClick={onOpenNotifications}
            className="dc-home-pill relative [&_.size-12]:size-10"
            >
            <Bell size={18} strokeWidth={2.4} />
            {unreadNotificationCount > 0 && <span aria-label={`${unreadNotificationCount} unread notifications`} className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold ring-2 ring-[#0a0c12]">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>}
          </GlassButton>
          <GlassButton
            aria-label="Favorites"
            onClick={onOpenFavorites}
            className="dc-home-pill relative [&_.size-12]:size-10"
            >
            <Heart size={18} strokeWidth={2.4} fill="currentColor" />
            {favoritesCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold ring-2 ring-[#0a0c12]">
                {favoritesCount}
              </span>
            )}
          </GlassButton>
        </div>
      </div>

      <div data-home-search-slot className="relative mt-5">
        <div
          className="dc-glass-toolbar flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-3 transition active:scale-[0.99]"
          onClick={openSearch}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openSearch();
            }
          }}
        >
          <Search size={18} className="shrink-0 text-white/55" strokeWidth={2.4} />
          <input
            ref={ref}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={openSearch}
            type="text"
            inputMode="search"
            placeholder="Search courses, PDFs, e-books..."
            className="w-full cursor-pointer bg-transparent text-sm text-white/85 placeholder:text-white/55 focus:outline-none"
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
              className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-white/85 transition active:scale-90"
            >
              <X size={13} strokeWidth={2.6} />
            </button>
          ) : (
            <span className="hidden shrink-0 rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/85 sm:inline">
              Tap to search
            </span>
          )}
        </div>

        {query.trim().length > 0 && (
          <div className="dc-glass-toolbar absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-80 overflow-y-auto rounded-2xl p-2 text-white/85 shadow-2xl shadow-indigo-950/20">
            {suggestions.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-white/55">
                No matches for “{query}”. Try a different keyword.
              </p>
            ) : (
              suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectSuggestion(item)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/10 active:scale-[0.99]"
                >
                  <img
                    src={item.image}
                    alt=""
                    className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block text-xs text-white/55">
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
    </GlassSurface>
    </header>
  );
});

export default Header;
