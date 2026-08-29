// src/components/DesktopShell.tsx
//
// The first-class desktop experience.
//
// The app is mobile-first: every screen has a phone-shaped frame
// (`max-w-md`, rounded corners, big drop shadow) and a floating
// bottom-nav pill. On a tablet we drop the phone frame and let
// content use a 720 px column. On a desktop we go further — the
// phone framing disappears, a PERSISTENT LEFT SIDEBAR takes over
// from the bottom nav, and a global TOP BAR provides search,
// notifications and a quick profile switcher.
//
// This shell is the single place that owns the desktop chrome. Every
// app page (Home, Store, MyDay, Profile, Revision, …) renders inside
// it. The shell:
//   1. Reads the current hash to highlight the active rail item.
//   2. Renders the right rail for the current page (Store vs MyDay
//      vs Revision all have different secondary surfaces).
//   3. Wires the global top-bar search to the page's own search
//      handler (passed in as a prop, with the store search used as
//      the default for every page that does not opt out).
//   4. Hosts a page's own page-switcher inside the top bar. A page
//      publishes it with `useRegisterTopBarTabs` (Revision does), and
//      the bar grows a second row of text tabs for as long as that
//      page is mounted — no other page ever sees the row.
//
// The shell is RENDERED ON DESKTOP + TABLET (see `src/components/AppShell.tsx`).
// Mobile keeps the existing per-page chrome and the bottom nav. The desktop CSS
// lives in `src/index.css`, and the shell owns the scroll: it is pinned to the
// viewport, `[data-desktop-content]` is the one scroll container, and pages
// inside it are released from their phone clipping (search for
// "TABLET / DESKTOP SCROLL MODEL" in `src/index.css`).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import useScreenSize from "@/hooks/useScreenSize";
import {
  Bell,
  CalendarDays,
  Crown,
  Heart,
  Home,
  LogOut,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useBranding } from "../context/BrandingContext";
import { useCommerce } from "../context/CommerceContext";
import { useCatalog } from "../context/CatalogContext";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";
import BrandMark from "./BrandMark";
import { DEFAULT_LOGO_URL } from "@/utils/branding";
import { cn } from "../utils/cn";
import { TopBarTabsProvider, type TopBarTabsConfig } from "./TopBarTabsContext";

/** The hash-prefixed routes the rail can drive. Each one navigates by
 *  setting `window.location.hash` so the change is persistent + the
 *  global `Root` switch in `main.tsx` picks the right page. */
export type DesktopRailKey =
  | "home"
  | "store"
  | "purchases"
  | "favorites"
  | "myday"
  | "revision"
  | "profile"
  | "settings";

interface RailEntry {
  key: DesktopRailKey;
  label: string;
  description: string;
  Icon: typeof Home;
  hash: string;
  /** Optional badge counter (cart / favorites / notifications). */
  badge?: number;
  group: "primary" | "workspace";
}

interface DesktopShellProps {
  /** Active rail entry, derived from the current hash. */
  active: DesktopRailKey;
  /**
   * Page body — rendered inside the desktop content frame, beside the
   * persistent left rail.
   */
  children: ReactNode;
  /**
   * Page-specific quick actions rendered on the right side of the
   * top bar (e.g. "Add to cart" on a product page). Most pages leave
   * this empty and the top bar shows only the global actions.
   */
  topBarRight?: ReactNode;
  /**
   * Top-bar search handler. The search input lives in the shell so
   * every page shares the same input style; the page decides what
   * the query does. Pass `null` to hide the search input on this
   * page (e.g. a media player where the keyboard is busy).
   */
  onSearch?: (query: string) => void;
  /**
   * Initial search query (used to keep the input in sync when a page
   * already has a query in state — e.g. the Home page's product
   * search).
   */
  initialSearchQuery?: string;
  /**
   * Right-side panel content for the page (e.g. the My Day right rail
   * with streak + quick actions, or the PDP's "you may also like"
   * list). Stacks on tablet, side-by-side on desktop.
   */
  sidePanel?: ReactNode;
  /**
   * Headline displayed in the top bar — usually the page's own
   * heading. When omitted, the rail's `label` for the active page
   * is used.
   */
  pageTitle?: string;
  /**
   * Subtitle displayed under the page title in the top bar.
   */
  pageSubtitle?: string;
}

const PRIMARY_RAIL: RailEntry[] = [
  { key: "home", label: "Home", description: "Today's learning", Icon: Home, hash: "#/home", group: "primary" },
  { key: "store", label: "Store", description: "Browse the catalog", Icon: Store, hash: "#/store", group: "primary" },
  { key: "purchases", label: "My Library", description: "Courses you own", Icon: ShoppingBag, hash: "#/store/purchases", group: "primary" },
  { key: "myday", label: "My Day", description: "Tasks & schedule", Icon: CalendarDays, hash: "#/my-day", group: "primary" },
  { key: "revision", label: "Revision", description: "Tests & smart session", Icon: Sparkles, hash: "#/revision", group: "primary" },
];

const WORKSPACE_RAIL: RailEntry[] = [
  { key: "favorites", label: "Favorites", description: "Saved for later", Icon: Heart, hash: "#/favorites", group: "workspace" },
  { key: "profile", label: "Profile", description: "Account & plan", Icon: UserRound, hash: "#/profile", group: "workspace" },
  // Settings is its own page (`#/settings`) — it used to deep-link into the
  // Profile page, which made the rail's "Settings" entry open the wrong screen.
  { key: "settings", label: "Settings", description: "Preferences & privacy", Icon: Settings, hash: "#/settings", group: "workspace" },
];

const ALL_RAIL: RailEntry[] = [...PRIMARY_RAIL, ...WORKSPACE_RAIL];

/** Resolve a hash to a rail key so the active entry lights up. */
function resolveActiveFromHash(hash: string): DesktopRailKey {
  if (!hash || hash.startsWith("#/home") || hash.startsWith("#/leaderboard")) return "home";
  if (hash.startsWith("#/store/purchases") || hash.startsWith("#/course/")) return "purchases";
  if (hash.startsWith("#/search") || hash.startsWith("#/store") || hash.startsWith("#/product/")) return "store";
  if (hash.startsWith("#/favorites")) return "favorites";
  if (hash.startsWith("#/cart")) return "purchases";
  if (hash.startsWith("#/my-day")) return "myday";
  if (hash.startsWith("#/revision")) return "revision";
  // The Settings page is its own route; without this the rail falls back to
  // "home" and no entry lights up while the learner is on it.
  if (hash.startsWith("#/settings")) return "settings";
  if (hash.startsWith("#/profile")) return "profile";
  if (hash.startsWith("#/checkout") || hash.startsWith("#/subscription")) return "store";
  return "home";
}

export default function DesktopShell({
  active,
  children,
  topBarRight,
  onSearch,
  initialSearchQuery = "",
  sidePanel,
  pageTitle,
  pageSubtitle,
}: DesktopShellProps) {
  const { user, logout } = useAuth();
  const screenSize = useScreenSize();

  // Set a body class for CSS-based theming based on screen size + tablet landscape
  useEffect(() => {
    const updateBodyClass = () => {
      const classes = ["is-desktop", "is-tablet", "is-mobile", "is-tablet-landscape", "is-wide-tablet"];
      classes.forEach((c) => document.body.classList.remove(c));
      if (screenSize === "desktop") document.body.classList.add("is-desktop");
      if (screenSize === "tablet") document.body.classList.add("is-tablet");
      if (screenSize === "mobile") document.body.classList.add("is-mobile");

      // Tablet landscape detection for CSS
      try {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const landscape = w > h;
        let isTabletDevice = false;
        try {
          const sw = window.screen?.width ?? 0;
          const sh = window.screen?.height ?? 0;
          isTabletDevice = Math.min(sw, sh) >= 600;
        } catch {
          isTabletDevice = w >= 640;
        }
        if (landscape && isTabletDevice && w >= 640) {
          document.body.classList.add("is-tablet-landscape");
          document.documentElement.setAttribute("data-tablet-landscape", "true");
        } else {
          document.documentElement.removeAttribute("data-tablet-landscape");
        }
        if (w >= 960) {
          document.body.classList.add("is-wide-tablet");
          document.documentElement.setAttribute("data-wide-tablet", "true");
        } else {
          document.documentElement.removeAttribute("data-wide-tablet");
        }
        if ((landscape && isTabletDevice && w >= 640) || w >= 960) {
          document.documentElement.setAttribute("data-tablet-landscape-desktop", "true");
        } else {
          document.documentElement.removeAttribute("data-tablet-landscape-desktop");
        }
      } catch {}
    };
    updateBodyClass();
    window.addEventListener("resize", updateBodyClass);
    window.addEventListener("orientationchange", updateBodyClass);
    return () => {
      window.removeEventListener("resize", updateBodyClass);
      window.removeEventListener("orientationchange", updateBodyClass);
    };
  }, [screenSize]);
  const { appName, logoUrl } = useBranding();
  const { cartIds, favoriteIds } = useCommerce();
  const { purchasedIds } = useCatalog();
  const liveNotificationCount = useUnreadNotificationCount();
  const [query, setQuery] = useState(initialSearchQuery);
  // Page-switcher published by the mounted page (Revision is the first user).
  // `null` on every other page, so the extra header row only exists while the
  // publishing page is mounted.
  const [topBarTabs, setTopBarTabs] = useState<TopBarTabsConfig | null>(null);

  // Keep the search input in sync with the page's own query when the
  // page changes the initial value. The dependency is the string so
  // we re-sync on hash navigation (where initialSearchQuery may flip).
  useEffect(() => {
    setQuery(initialSearchQuery);
  }, [initialSearchQuery]);

  // Bubble the typed query back to the page (debounced 180 ms so the
  // page's filter pipeline does not run on every keystroke).
  useEffect(() => {
    if (!onSearch) return undefined;
    const timer = window.setTimeout(() => onSearch(query), 180);
    return () => window.clearTimeout(timer);
  }, [query, onSearch]);

  // The top-bar search is a global launcher: every page benefits from
  // a single, predictable search affordance, so a query typed here
  // jumps to the dedicated `#/search` page with the current value
  // carried over as a `?q=` deep link. The shell's `onSearch` is
  // still wired for any page that wants the inline (non-page-jump)
  // behaviour (kept for future per-page filters).
  const handleSearchSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed) {
      window.location.hash = `#/search?q=${encodeURIComponent(trimmed)}`;
      setQuery("");
    } else {
      window.location.hash = "#/search";
    }
  }, [query]);

  const handleNavigate = useCallback((hash: string) => {
    // Use the same hash protocol as the rest of the app so all
    // sessionStorage + auth guards see the change.
    window.location.hash = hash;
  }, []);

  const initials = useMemo(() => {
    if (!user?.name) return "U";
    return user.name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [user?.name]);

  const activeEntry = ALL_RAIL.find((entry) => entry.key === active) ?? PRIMARY_RAIL[0];
  const resolvedTitle = pageTitle ?? activeEntry.label;
  const resolvedSubtitle = pageSubtitle ?? activeEntry.description;

  // The cart / favorites / notifications badges come from the live
  // commerce / catalog / notification streams. The pill counter
  // is the same on desktop and mobile so the value the learner sees
  // in the rail matches the bottom nav they used to have.
  const cartCount = cartIds.size;
  const favoritesCount = favoriteIds.size;
  const ownedCount = purchasedIds.size;
  const notifications = liveNotificationCount ?? 0;
  const railEntries: RailEntry[] = [
    ...PRIMARY_RAIL.map((entry) =>
      entry.key === "purchases" ? { ...entry, badge: ownedCount } : entry
    ),
    ...WORKSPACE_RAIL.map((entry) => {
      if (entry.key === "favorites") return { ...entry, badge: favoritesCount };
      return entry;
    }),
  ];

  const customLogo = logoUrl && logoUrl !== DEFAULT_LOGO_URL;

  return (
    <div className="dc-desktop-shell flex min-h-[100dvh] w-full bg-[#f6f7fb] text-slate-900" data-desktop-shell data-tablet-responsive>
      {/* ── Persistent left rail ─────────────────────────────────────
          Tablet landscape: width scales with clamp() so it fits tablet screens
      */}
      <aside
        data-desktop-rail
        className="sticky top-0 z-40 flex h-[100dvh] w-[260px] shrink-0 flex-col border-r border-slate-200/80 bg-white/85 backdrop-blur-2xl max-[1023px]:w-[clamp(200px,22vw,260px)] landscape:max-[1023px]:w-[clamp(200px,22vw,240px)]"
        aria-label="Primary"
        style={{ width: 'clamp(200px, 22vw, 260px)' } as any}
      >
        {/* Brand block — same logo + name that lives in the mobile header,
            so the rail feels like a continuation of the app's identity
            rather than a separate desktop chrome. */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/40">
            {customLogo ? <BrandMark className="h-11 w-11" /> : <Sparkles className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-black tracking-tight text-slate-900">{appName}</p>
            <p className="truncate text-[11px] font-semibold text-slate-400">Learning workspace</p>
          </div>
        </div>

        {/* Primary nav — the screens a learner visits every day. Each
            entry has a hover background + active accent so the eye
            lands on the current page in a single glance. The icon +
            label + 1-line description match the visual rhythm of
            Notion / Linear / Figma — every entry tells you what the
            page does, not just where it is. */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Primary navigation">
          <RailGroup label="Workspace">
            {railEntries
              .filter((entry) => entry.group === "primary")
              .map((entry) => (
                <RailItem
                  key={entry.key}
                  entry={entry}
                  active={active === entry.key}
                  onNavigate={handleNavigate}
                />
              ))}
          </RailGroup>

          <RailGroup label="Account">
            {railEntries
              .filter((entry) => entry.group === "workspace")
              .map((entry) => (
                <RailItem
                  key={entry.key}
                  entry={entry}
                  active={active === entry.key}
                  onNavigate={handleNavigate}
                />
              ))}
          </RailGroup>

          {/* Quick stats card — gives the rail a little "personality"
              rather than a flat list of links. Shows the learner's
              cart size + favorites so the rail doubles as a status
              indicator. */}
          <div className="mx-2 mt-3 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50 to-white p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Quick stats</p>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <RailStat label="Cart" value={cartCount} />
              <RailStat label="Favorites" value={favoritesCount} />
              <RailStat label="Owned" value={ownedCount} />
              <RailStat label="Inbox" value={notifications} highlight={notifications > 0} />
            </dl>
            <button
              type="button"
              onClick={() => handleNavigate("#/flowpath")}
              className="mt-3 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-2 text-[11px] font-black text-white shadow-sm transition hover:brightness-110 active:scale-95"
            >
              plan today in Flowpath
            </button>
            <button
              type="button"
              onClick={() => handleNavigate("#/leaderboard")}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 active:scale-95"
            >
              <Trophy size={12} /> Leaderboard
            </button>
          </div>
        </nav>

        {/* Profile footer — the rail always shows the signed-in learner
            at the bottom, with a one-click logout. Keeping the rail
            signed-in-aware means the desktop chrome is never an
            anonymous sidebar. */}
        <div className="border-t border-slate-200/80 p-3">
          {user ? (
            <div className="flex items-center gap-2.5 rounded-2xl p-2 transition hover:bg-slate-50">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-slate-200" />
              ) : (
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-black text-white">
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-black text-slate-900">{user.name}</p>
                <p className="truncate text-[10px] font-semibold text-slate-400">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => void logout().then(() => { window.location.hash = "#/auth?mode=login"; })}
                aria-label="Log out"
                title="Log out"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleNavigate("#/auth?mode=login")}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-black text-white transition hover:bg-slate-800"
            >
              <Crown size={13} /> Sign in
            </button>
          )}
        </div>
      </aside>

      {/* ── Main column (top bar + page body + optional side panel) ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — global actions shared across every page.
            A page can publish its own page-switcher into this bar through
            `useRegisterTopBarTabs` (see src/components/TopBarTabsContext.tsx);
            when one is registered the bar grows a second row of text tabs and
            carries `data-topbar-tabs="<feature>"`. */}
        <header
          data-desktop-topbar
          data-topbar-tabs={topBarTabs ? topBarTabs.feature : undefined}
          className="sticky top-0 z-30 shrink-0 border-b border-slate-200/80 bg-white/85 px-6 backdrop-blur-2xl"
        >
          <div data-desktop-topbar-row className="flex h-16 items-center gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-black tracking-tight text-slate-900" data-desktop-page-title>
                {resolvedTitle}
              </h1>
              <p className="truncate text-[11px] font-semibold text-slate-400" data-desktop-page-subtitle>
                {resolvedSubtitle}
              </p>
            </div>

            {/* Search input — appears on every page that provides an
                onSearch handler. The input is hidden on pages that
                have no handler (e.g. media viewers, fullscreen flows). */}
            {onSearch ? (
              <div className="relative flex w-[320px] max-w-[36vw] items-center">
                <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => {
                    // A bare focus jumps to the search page with no
                    // pre-fill, so the user can start fresh. Typing a
                    // value first then focusing keeps the value in the
                    // input.
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSearchSubmit();
                    }
                  }}
                  placeholder={`Search ${appName}…`}
                  aria-label="Search"
                  className="w-full rounded-xl border border-slate-200/80 bg-slate-50/80 py-2 pl-10 pr-9 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  data-desktop-search
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2 grid h-6 w-6 place-items-center rounded-full text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-700"
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Top-bar quick actions: notifications, cart, favorites, plans. */}
            <div className="flex items-center gap-1.5" data-desktop-topbar-actions>
              {topBarRight}
              <TopBarButton
                ariaLabel="Notifications"
                icon={<Bell size={16} />}
                badge={notifications > 0 ? notifications : undefined}
                onClick={() => handleNavigate("#/notifications")}
                active={active === "profile" && (window.location.hash.includes("notifications") || false)}
              />
              <TopBarButton
                ariaLabel="Favorites"
                icon={<Heart size={16} />}
                badge={favoritesCount > 0 ? favoritesCount : undefined}
                onClick={() => handleNavigate("#/favorites")}
              />
              <TopBarButton
                ariaLabel="Cart"
                icon={<ShoppingBag size={16} />}
                badge={cartCount > 0 ? cartCount : undefined}
                onClick={() => handleNavigate("#/cart")}
              />
              <TopBarButton
                ariaLabel="Subscription"
                icon={<Crown size={16} />}
                onClick={() => handleNavigate("#/subscription")}
                active={false}
              />
            </div>
          </div>

          {/* The page's own page-switcher, published by the page itself. Only
              the mounted page's tabs are here — Revision's row disappears the
              moment the learner leaves the Revision screens. */}
          {topBarTabs ? <TopBarTabRow config={topBarTabs} /> : null}
        </header>

        {/* ── Page body + optional side panel ─────────────────────
            The page is the main column. When the page supplies a
            `sidePanel`, it gets its own column on the right with
            a max-width of 320 px, so the panel never eats the page
            on a mid-sized desktop monitor. The grid only flips on
            when the panel is present — pages without a panel
            continue to use the full content width. */}
        <TopBarTabsProvider setTabs={setTopBarTabs}>
          <div
            className={`flex min-h-0 flex-1 gap-6 px-6 py-6 ${sidePanel ? "xl:px-8" : ""}`}
            data-desktop-content
          >
            <main className="min-w-0 flex-1">
              {children}
            </main>
            {sidePanel ? (
              <aside
                data-desktop-side-panel
                className="w-[320px] shrink-0 max-[1023px]:w-[clamp(280px,30vw,320px)]"
                style={{ width: 'clamp(280px, 30vw, 320px)' } as any}
              >
                {sidePanel}
              </aside>
            ) : null}
          </div>
        </TopBarTabsProvider>
      </div>
    </div>
  );
}

function RailGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4 first:mt-2">
      <p className="px-3 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function RailItem({
  entry,
  active,
  onNavigate,
}: {
  entry: RailEntry;
  active: boolean;
  onNavigate: (hash: string) => void;
}) {
  const Icon = entry.Icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(entry.hash)}
      aria-current={active ? "page" : undefined}
      data-desktop-rail-item={entry.key}
      data-active={active ? "true" : "false"}
      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
        active
          ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
      title={entry.description}
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
          active
            ? "bg-white/20 text-white"
            : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-indigo-600"
        }`}
      >
        <Icon size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold leading-tight">{entry.label}</span>
        <span
          className={`block truncate text-[10.5px] font-medium leading-tight ${
            active ? "text-white/80" : "text-slate-400"
          }`}
        >
          {entry.description}
        </span>
      </span>
      {entry.badge && entry.badge > 0 ? (
        <span
          className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1.5 text-[10px] font-black ${
            active ? "bg-white text-indigo-700" : "bg-indigo-100 text-indigo-700"
          }`}
        >
          {entry.badge > 99 ? "99+" : entry.badge}
        </span>
      ) : null}
    </button>
  );
}

function RailStat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white/80 px-2 py-1.5">
      <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className={`mt-0.5 text-base font-black ${highlight ? "text-indigo-600" : "text-slate-900"}`}>
        {value > 99 ? "99+" : value}
      </dd>
    </div>
  );
}

/**
 * The second row of the top bar: the mounted page's own page-switcher.
 *
 * It is the desktop-header twin of `src/components/ui/PageTabs.tsx` — plain
 * text labels, the active page marked by colour + an underline on the row's
 * rule, no icons and no pills — so moving these destinations into the header
 * does not change how they read. The row scrolls sideways on narrow desktops
 * instead of wrapping, which keeps the bar a single fixed-height strip.
 */
function TopBarTabRow({ config }: { config: TopBarTabsConfig }) {
  return (
    <nav
      data-desktop-topbar-tabs={config.feature}
      aria-label={config.ariaLabel}
      className="flex items-center gap-x-0.5 overflow-x-auto border-t border-slate-200/70 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="-mb-px flex min-w-0 items-center gap-x-0.5">
        {config.items.map((item) => {
          const isActive = item.id === config.activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => config.onSelect(item.id)}
              title={item.hint}
              aria-current={isActive ? "page" : undefined}
              data-topbar-tab={item.id}
              data-active={isActive ? "true" : "false"}
              className={cn(
                "relative shrink-0 rounded-t-xl px-3 py-2.5 text-[13px] font-bold outline-none transition-colors duration-200",
                "focus-visible:ring-2 focus-visible:ring-indigo-300/70",
                isActive ? "text-indigo-600" : "text-slate-500 hover:bg-slate-100/70 hover:text-slate-900",
              )}
            >
              {item.label}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-2 bottom-0 h-[3px] rounded-full transition-opacity duration-200",
                  isActive ? "bg-gradient-to-r from-indigo-500 to-violet-500 opacity-100" : "opacity-0",
                )}
              />
            </button>
          );
        })}
      </div>

      {config.onHome ? (
        <button
          type="button"
          onClick={config.onHome}
          data-topbar-tab="home"
          title={`Back to ${config.homeLabel ?? "Home"}`}
          className="ml-auto shrink-0 rounded-xl px-2 py-2.5 text-[13px] font-bold text-slate-400 outline-none transition-colors duration-200 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-indigo-300/70"
        >
          {config.homeLabel ?? "Home"}
        </button>
      ) : null}
    </nav>
  );
}

function TopBarButton({
  ariaLabel,
  icon,
  badge,
  onClick,
  active = false,
}: {
  ariaLabel: string;
  icon: ReactNode;
  badge?: number;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      data-desktop-topbar-button={ariaLabel.toLowerCase()}
      className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${
        active
          ? "bg-indigo-50 text-indigo-600"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {icon}
      {badge && badge > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  );
}

export { resolveActiveFromHash, ALL_RAIL, PRIMARY_RAIL, WORKSPACE_RAIL };
