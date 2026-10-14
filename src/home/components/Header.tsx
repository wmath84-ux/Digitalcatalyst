import { forwardRef, useEffect, useRef, useState } from "react";
import { Gauge, Heart, Search, Settings, Trophy, UserRound, X } from "lucide-react";
import { PiHandWavingDuotone } from "react-icons/pi";
import ExpandingTabs, { type ExpandingTabItem } from "../../components/ui/ExpandingTabs";
import MobileHeaderMenu from "../../components/MobileHeaderMenu";
import HeaderNotificationsButton from "../../components/HeaderNotificationsButton";
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
import { useViewportBand } from "../../utils/responsive";
import { OPENING_AD_ITEM, OPENING_AD_ITEM_ID, useOpeningAdPlayer } from "../../components/ad/OpeningAdControl";

interface HeaderProps {
  userName: string;
  query: string;
  onQueryChange: (value: string) => void;
  suggestions: Product[];
  onSelectSuggestion: (product: Product) => void;
  favoritesCount: number;
  onOpenFavorites?: () => void;
  onOpenNotifications?: () => void;
  /**
   * Settings gear — rendered in the right-side action cluster ONLY when this
   * callback is provided, so the gear appears exclusively on the pages that
   * pass it (the Flow page). It opens the page's own existing settings
   * surface — FlowPathApp wires it to the same CurveSettingsModal the dock's
   * gear opens; no duplicate settings page is created here.
   */
  onOpenSettings?: () => void;
  /**
   * Header variant — when 'flow', only the gear remains in the compact action
   * row; the standalone Notifications button stays beside it and Profile is in
   * the phone quick-actions drawer / footer. Default 'default' shows page actions.
   */
  headerVariant?: 'default' | 'flow';
  /**
   * Theme toggle — when provided, renders a sun/moon button in the action cluster.
   * Used by FlowPath page to switch between light and dark canvas themes.
   */
  onToggleTheme?: () => void;
  isDarkMode?: boolean;
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
  { userName, query, onQueryChange, suggestions, onSelectSuggestion, favoritesCount, onOpenFavorites, onOpenNotifications, onOpenSettings, headerVariant = 'default' },
  ref,
) {
  const unreadNotificationCount = useUnreadNotificationCount() || 0;
  const viewportBand = useViewportBand();
  const isPhoneLayout = viewportBand === "compact-mobile" || viewportBand === "large-mobile";
  // The `ad` option rides the side panel (the phone drawer here, the rails in
  // DesktopShell). The tablet bands (640–959 portrait) render no side panel,
  // so it stays a pill in this header's cluster there — see Header.tsx.
  const openingAd = useOpeningAdPlayer();
  const tabletWithoutSidePanel = viewportBand === "small-tablet" || viewportBand === "tablet-portrait";
  const firstName = userName.trim().split(/\s+/)[0] || "Learner";
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

  const allHomeActionItems: ExpandingTabItem[] = [
    { id: "leaderboard", label: "Leaderboard", ariaLabel: "Leaderboard", icon: <Trophy size={30} strokeWidth={2.4} /> },
    { id: "profile", label: "Profile", ariaLabel: "Open profile", icon: <UserRound size={30} strokeWidth={2.4} /> },
    {
      id: "favorites",
      label: "Favorites",
      ariaLabel: "Favorites",
      icon: <Heart size={30} strokeWidth={2.4} fill="currentColor" />,
      badge: favoritesCount > 0 ? String(favoritesCount) : undefined,
      badgeTone: "rose",
    },
    ...(onOpenSettings
      ? [{ id: "settings", label: "Settings", ariaLabel: "Open Flow settings", icon: <Settings size={30} strokeWidth={2.4} /> }]
      : []),
  ];
  // See `tabletWithoutSidePanel` above: on the one band with no side panel the
  // `ad` option rides this cluster. It is appended AFTER the variant's own
  // filter, so both the Home header and the FlowPath variant keep it — and the
  // phone drawer list below never doubles it up (the drawer adds its own row).
  const openingAdTabItem: ExpandingTabItem | null = tabletWithoutSidePanel && openingAd.available
    ? {
        id: OPENING_AD_ITEM_ID,
        label: OPENING_AD_ITEM.label,
        ariaLabel: OPENING_AD_ITEM.ariaLabel,
        icon: <OPENING_AD_ITEM.Icon size={30} strokeWidth={2.4} aria-hidden="true" />,
      }
    : null;
  const homeActionItems = [
    ...(headerVariant === "flow"
      ? allHomeActionItems.filter((item) => item.id === "settings")
      : allHomeActionItems.filter((item) => item.id !== "profile")),
    ...(openingAdTabItem ? [openingAdTabItem] : []),
  ];
  // Profile stays reachable in the phone quick-actions drawer while the old
  // header-avatar slot becomes the always-visible glass Notifications button.
  // Usage Limits belongs in the phone drawer and persistent rail only.
  const phoneMenuItems = [
    ...homeActionItems,
    ...allHomeActionItems.filter((item) => item.id === "profile"),
    { id: "usage-limits", label: "Usage Limits", ariaLabel: "Usage Limits", icon: <Gauge size={30} strokeWidth={2.4} /> },
  ];

  const handleHomeAction = (id: string) => {
    // The opening-animation pill is momentary too — it opens the player.
    if (id === OPENING_AD_ITEM_ID) {
      openingAd.openPlayer();
      return;
    }
    // The gear is momentary (opens the page's settings surface), never an
    // active/expanded destination.
    if (id === "settings") {
      onOpenSettings?.();
      return;
    }
    setHomeActiveAction(id);
    if (id === "usage-limits") window.location.hash = "#/usage-limits";
    else if (id === "leaderboard") window.location.hash = "#/leaderboard";
    else if (id === "profile") window.location.hash = "#/profile";
    else if (id === "notifications") onOpenNotifications?.();
    else if (id === "favorites") onOpenFavorites?.();
  };

  return (
    <header
      ref={headerRef}
      data-site-header
      data-home-header
      /* `dc-scene-plate--bar` gives the bar the SAME material the review cards
         wear (glass.css · THE CONTRAST PLATE): a dark, translucent plate with
         an inset top hairline, so the greeting and search pill stay legible on
         the Winter scene instead of floating on a 10% tint, without an exterior
         shadow/glow below the header. The `--bar` variant paints the header
         element itself, because this bar's animated padding band + bottom
         radius live outside the GlassSurface it wraps. The surface keeps the
         pinned docs sensitivity below (tint 0.25 · blur 0) untouched. */
      className="dc-scene-plate dc-scene-plate--bar relative z-30 text-white"
      data-home-gradient-from={gradientFrom}
      data-home-gradient-to={gradientTo}
      data-home-gradient-css={brandGlassGradient(gradientFrom, gradientTo)}
    >
    <GlassSurface
      radius={0}
      tint={0.25}
      blur={0}
      style={{ borderRadius: "0 0 32px 32px" }}
      className="overflow-hidden"
      contentClassName="px-3 pb-5 pt-[calc(0.875rem+env(safe-area-inset-top))] min-[390px]:px-4 md:px-5 md:pb-8 md:pt-[calc(1.5rem+env(safe-area-inset-top))]"
    >
      {/* The header is the pack's GlassSurface at the pinned docs sensitivity
          (websiteglass.com/docs/components/glass playground: radius 24 ·
          strength 0.5 · blur 4 · tint 0.25 · dome 0.1 — the bar keeps
          radius 0 for its full-bleed bottom-rounded shape). The brand gradient
          (`brandGlassGradient`, linear-gradient(to bottom right …)) is kept
          only as a legacy helper/attribute — nothing paints it. */}
      <div data-home-chrome className="relative flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 min-[390px]:gap-3">
          <span data-home-brand data-header-app-icon className="shrink-0">
            <BrandMark className="h-[30px] w-[30px] rounded-[10px] ring-1 ring-white/25" />
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            
            <h1
              data-home-greeting
              className={headerVariant === "flow"
                ? "min-w-0 truncate whitespace-nowrap text-[22px] font-bold leading-[26px] tracking-tight"
                : "flex min-w-0 items-center gap-2 text-[22px] font-bold leading-[26px] tracking-tight"}
            >
              {headerVariant === "flow" ? "FlowPath" : (
                <>
                  <span className="min-w-0 truncate whitespace-nowrap">
                    <strong className="font-extrabold">Hello</strong>
                    <span className="sr-only" data-home-user-name>, {firstName}</span>
                  </span>
                  <PiHandWavingDuotone data-home-wave className="h-[30px] w-[30px] shrink-0 text-amber-200" aria-hidden="true" />
                </>
              )}
            </h1>
          </div>
          {/* The opening-animation `ad` option is a row of the phone
              quick-actions drawer / the page's side panel, not a header
              label — see src/components/ad/OpeningAdControl.tsx. */}
        </div>
        <div data-home-actions className="flex shrink-0 items-center gap-1 min-[390px]:gap-2">
          <HeaderNotificationsButton
            count={unreadNotificationCount}
            size={isPhoneLayout ? 36 : 40}
            onClick={() => {
              if (onOpenNotifications) onOpenNotifications();
              else window.location.hash = "#/notifications";
            }}
          />
          {isPhoneLayout ? (
            <MobileHeaderMenu
              items={phoneMenuItems}
              activeId={homeActiveAction}
              onSelect={handleHomeAction}
              ariaLabel="Home actions"
            />
          ) : (
            <div className="flex items-center gap-1 min-[390px]:gap-2" data-home-actions-inline>
              <ExpandingTabs
                ariaLabel="Home actions"
                activeId={homeActiveAction}
                onSelect={handleHomeAction}
                items={homeActionItems}
                iconSize={30}
              />
            </div>
          )}
        </div>
      </div>

      <div data-home-search-slot className={`relative mt-3 md:mt-5 ${headerVariant === "flow" ? "hidden" : ""}`}>
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
            icon={<Search size={30} strokeWidth={2.4} className="h-[30px] w-[30px]" />}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={openSearch}
            type="text"
            inputMode="search"
            placeholder="Search courses, PDFs, e-books..."
            className="dc-scene-field w-full [&_input]:cursor-pointer [&_input]:pr-20 [&_input]:outline-none md:[&_input]:pr-24 [&_input]:text-[22px] [&_input]:leading-[26px] [&_.relative.flex]:py-2 [&_.relative.flex]:px-3 md:[&_.relative.flex]:px-4 md:[&_.relative.flex]:py-2.5"
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
              className="absolute right-2 top-1/2 -translate-y-1/2 [&_.size-12]:size-[30px]"
            >
              <X size={30} strokeWidth={2.6} className="h-[30px] w-[30px]" />
            </GlassButton>
          ) : null}
        </div>

        {query.trim().length > 0 && (
          <GlassSurface radius={24} tint={0.25} blur={0} className="dc-scene-plate dc-scene-plate--bar absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-80 overflow-y-auto text-white/85" contentClassName="p-1">
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
    {openingAd.player}
    </header>
  );
});

export default Header;
