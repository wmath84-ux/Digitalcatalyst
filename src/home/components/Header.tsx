import { forwardRef, useEffect, useRef, useState } from "react";
import { Bell, Heart, Search, Trophy, UserRound, X } from "lucide-react";
import ExpandingTabs from "../../components/ui/ExpandingTabs";
import { GlassSurface } from "../../components/ui/glass";
import { GlassButton } from "../../components/ui/glass-button";
import { GlassInput } from "../../components/ui/glass-input";
import { PopoverItem } from "../../components/ui/glass-popover";
import { openCommandPalette } from "../../lib/commandPalette";
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
  // Which header action wears the expanded pill. On Home none of the
  // shortcuts is "the current page", so the bar starts collapsed and the
  // tapped action expands on its way out (route pages remount the header).
  const [homeActiveAction, setHomeActiveAction] = useState<string | null>(null);
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

    // The seat (the header's un-collapsed height) is written onto the app
    // frame, or — for pages that mount this header outside a frame (FlowPath)
    // — onto the nearest `[data-home-header-host]`, whose CSS height is pinned
    // to it. That keeps the scroll container's content height constant while
    // the header shrinks; otherwise the collapse feeds back into scrollY and
    // the header flickers as the page is scrolled slowly.
    const seatHost = header.closest("[data-app-frame], [data-home-header-host]");
    const measureSeat = () => {
      if (!(seatHost instanceof HTMLElement)) return;
      const collapse = header.style.getPropertyValue("--home-collapse");
      header.style.setProperty("--home-collapse", "0");
      seatHost.style.setProperty("--dc-home-header-seat", `${header.offsetHeight}px`);
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
            <BrandMark className="h-10 w-10 rounded-2xl ring-1 ring-white/25 min-[390px]:h-11 min-[390px]:w-11" />
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
          {/* aicanvas.me Expanding Tabs — the action cluster is the same
              monochrome icon-circle bar the app-wide header wears; the tapped
              action expands into an icon-and-label pill on its way out. */}
          <ExpandingTabs
            ariaLabel="Home actions"
            activeId={homeActiveAction}
            onSelect={(id) => {
              setHomeActiveAction(id);
              if (id === "leaderboard") window.location.hash = "#/leaderboard";
              else if (id === "profile") window.location.hash = "#/profile";
              else if (id === "notifications") onOpenNotifications?.();
              else if (id === "favorites") onOpenFavorites?.();
            }}
            items={[
              { id: "leaderboard", label: "Leaderboard", ariaLabel: "Leaderboard", icon: <Trophy size={17} strokeWidth={2.4} /> },
              { id: "profile", label: "Profile", ariaLabel: "Open profile", icon: <UserRound size={17} strokeWidth={2.4} /> },
              {
                id: "notifications",
                label: "Alerts",
                ariaLabel: "Notifications",
                icon: <Bell size={17} strokeWidth={2.4} />,
                badge: unreadNotificationCount > 0 ? (unreadNotificationCount > 99 ? "99+" : String(unreadNotificationCount)) : undefined,
                badgeAriaLabel: unreadNotificationCount > 0 ? `${unreadNotificationCount} unread notifications` : undefined,
                badgeTone: "rose",
              },
              {
                id: "favorites",
                label: "Favorites",
                ariaLabel: "Favorites",
                icon: <Heart size={17} strokeWidth={2.4} fill="currentColor" />,
                badge: favoritesCount > 0 ? String(favoritesCount) : undefined,
                badgeTone: "rose",
              },
            ]}
          />
          {/* The "Dark mode" GlassSwitch moved off the header — appearance now
              lives with the rest of the account preferences (Profile →
              Preferences modal and the #/settings page). */}
        </div>
      </div>

      <div data-home-search-slot className="relative mt-5">
        {/* Wave 14: the search pill is the pack Glass Input (websiteglass.com
            defaults — tint 0.4, radius 9999), the same component the store
            page's search bar renders; `dc-glass-toolbar` is gone from here. */}
        <div
          data-search-launcher
          className="relative cursor-pointer outline-none transition active:scale-[0.99]"
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
          <GlassInput
            ref={ref}
            icon={<Search size={18} strokeWidth={2.4} />}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={openSearch}
            type="text"
            inputMode="search"
            placeholder="Search courses, PDFs, e-books..."
            className="w-full [&_input]:cursor-pointer [&_input]:pr-24 [&_input]:outline-none"
            readOnly
          />
          {query ? (
            <GlassButton
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQueryChange("");
              }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 [&_.size-12]:size-6"
            >
              <X size={13} strokeWidth={2.6} />
            </GlassButton>
          ) : (
            <span className="absolute right-3 top-1/2 hidden -translate-y-1/2 shrink-0 rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/85 sm:inline">
              Tap to search
            </span>
          )}
        </div>

        {query.trim().length > 0 && (
          <GlassSurface radius={20} className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-80 overflow-y-auto text-white/85" contentClassName="p-1">
            {suggestions.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-white/55">
                No matches for “{query}”. Try a different keyword.
              </p>
            ) : (
              suggestions.map((item) => (
                <PopoverItem
                  key={item.id}
                  onClick={() => onSelectSuggestion(item)}
                  className="rounded-xl px-2 py-2 text-left active:scale-[0.99]"
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
                  <span className="flex-shrink-0 text-xs text-indigo-300">↗</span>
                </PopoverItem>
              ))
            )}
          </GlassSurface>
        )}
      </div>
    </GlassSurface>
    </header>
  );
});

export default Header;
