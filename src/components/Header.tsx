import type { ComponentType, ReactNode } from "react";
import { Gauge, HelpCircle } from "lucide-react";
import { BookIcon, CartIcon, CrownIcon, DownloadIcon, SearchIcon } from "./icons";
import HeaderNotificationsButton from "./HeaderNotificationsButton";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";
import BrandMark from "./BrandMark";
import { DEFAULT_LOGO_URL } from "@/utils/branding";
import { useBranding } from "@/context/BrandingContext";
import { useViewportBand } from "../utils/responsive";
import ExpandingTabs, { type ExpandingTabItem } from "./ui/ExpandingTabs";
import MobileHeaderMenu from "./MobileHeaderMenu";
import { OPENING_AD_ITEM, OPENING_AD_ITEM_ID, useOpeningAdPlayer } from "./ad/OpeningAdControl";

/** Keep the visible app-shell header title to one short word. */
export function singleWordHeaderTitle(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed.toLocaleLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    "my day": "Today",
    "usage limits": "Usage",
    "sign in to open my day": "Sign-in",
    "eduvora tasker": "Today",
    "help & faq": "Help",
    "help and faq": "Help",
    "quick study / review": "Study",
    "add card or deck": "Add",
    "store & purchases": "Store",
    "store and purchases": "Store",
  };
  if (aliases[normalized]) return aliases[normalized];
  return trimmed.split(/\s+/)[0]?.replace(/[,:;!?]+$/, "") || "Home";
}

type HeaderProps = {
  cartCount: number;
  notifCount: number;
  onNavigateToSubscription: () => void;
  onNavigateToCart: () => void;
  onNavigateToNotifications: () => void;
  /**
   * Branding override. The store shows the configured app name; My Day shows
   * "<AppName> Tasker".
   */
  title?: string;
  /** Route-specific subtitle, when the default page tagline does not fit. */
  subtitle?: string;
  /** Let a long route subtitle wrap instead of truncating it to one line. */
  subtitleWrap?: boolean;
  /** Paint a flat, shadow-free chrome strip for a seamless page transition. */
  seamless?: boolean;
  /**
   * Logo icon override. The store shows a book; the notifications page
   * shows a bell.
   */
  icon?: ComponentType<{ className?: string }>;
  /**
   * Optional extra action rendered at the far right of the header (for
   * example the notifications page's circular "Mark all read" button).
   */
  action?: ReactNode;
  /**
   * Optional content rendered underneath the main row (for example the
   * notifications page's filter chips).
   */
  children?: ReactNode;
  /**
   * When provided, the cart icon is replaced by a Download (report)
   * button. My Day uses this — its report download takes the cart's slot.
   */
  onDownloadReport?: () => void;
  /**
   * When provided, a search toggle button is rendered to the LEFT of the
   * download/cart button (My Day's global task search).
   */
  onToggleSearch?: () => void;
  /** Highlights the search button while its input is open. */
  searchActive?: boolean;
  /**
   * When provided, a centred search pill is rendered on desktop widths
   * (the header search with its Ctrl+K hint). Phones keep the toggle
   * strip driven by `onToggleSearch`.
   */
  centerSearch?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    inputId?: string;
  };
  /**
   * When provided, a circular help (?) button is rendered at the far right
   * of the header. The subscription page uses this for its Help & FAQ
   * overlay so the shortcut lives on the main header itself.
   */
  onHelpClick?: () => void;
  /**
   * Allow-list for the ExpandingTabs action cluster. When omitted every
   * contextual action renders (search/download/cart + alerts + plans +
   * help). The notifications page passes `["notifications"]` so the bell
   * is the only header action while the learner is already on that page.
   */
  visibleActions?: Array<"search" | "download" | "cart" | "notifications" | "subscription" | "help">;
};

/**
 * App header (mobile + tablet). The action cluster is the aicanvas.me
 * "Expanding Tabs" bar (https://aicanvas.me/components/expanding-tabs): a
 * monochrome row of icon circles where the contextually active action
 * expands into an icon-and-label pill (the notifications page expands the
 * bell, the subscription page the crown, an open search the magnifier) while
 * the rest stay plain circles. Accessible names are written literally at the
 * call sites — they stay greppable ("Help & FAQ" is pinned by
 * tests/subscriptionDowngradeGuard.test.mjs).
 */
export default function Header({
  cartCount,
  onNavigateToSubscription,
  onNavigateToCart,
  onNavigateToNotifications,
  title,
  seamless = false,
  icon,
  action,
  children,
  onDownloadReport,
  onToggleSearch,
  searchActive = false,
  centerSearch,
  onHelpClick,
  visibleActions,
}: HeaderProps) {
  const liveNotificationCount = useUnreadNotificationCount();
  const displayedNotificationCount = liveNotificationCount ?? 0;
  const viewportBand = useViewportBand();
  const isPhoneLayout = viewportBand === "compact-mobile" || viewportBand === "large-mobile";
  // The opening-animation (`ad`) option rides the SIDE PANEL everywhere one
  // exists: the phone drawer here, the rails in DesktopShell. The tablet
  // bands (640–959 portrait) render no side panel at all — the desktop shell
  // starts at 960 or in landscape — so the option stays a normal pill in this
  // header's action cluster there, instead of becoming unreachable.
  const openingAd = useOpeningAdPlayer();
  const tabletWithoutSidePanel = viewportBand === "small-tablet" || viewportBand === "tablet-portrait";
  const LogoIcon = icon ?? BookIcon;
  const { logoUrl, appName, hideFrameBorders } = useBranding();
  const customLogo = logoUrl && logoUrl !== DEFAULT_LOGO_URL;
  const headerTitle = singleWordHeaderTitle(title ?? appName);

  const tabItems: ExpandingTabItem[] = [
    ...(onToggleSearch
      ? [{
          id: "search",
          label: "Search",
          ariaLabel: "Search",
          icon: <SearchIcon className="h-[30px] w-[30px]" />,
        }]
      : []),
    onDownloadReport
      ? {
          id: "download",
          label: "Report",
          ariaLabel: "Download report",
          icon: <DownloadIcon className="h-[30px] w-[30px]" />,
        }
      : {
          id: "cart",
          label: "Cart",
          ariaLabel: "Cart",
          icon: <CartIcon className="h-[30px] w-[30px]" />,
          badge: cartCount > 0 ? String(cartCount) : undefined,
          badgeTone: "rose" as const,
        },
    {
      id: "subscription",
      label: "Plans",
      ariaLabel: "Subscription",
      icon: <CrownIcon className="h-[30px] w-[30px]" />,
    },
    ...(onHelpClick
      ? [{
          id: "help",
          label: "Help",
          ariaLabel: "Help & FAQ",
          icon: <HelpCircle className="h-[30px] w-[30px]" />,
        }]
      : []),
  ];

  // See `tabletWithoutSidePanel` above: on the one band with no side panel the
  // `ad` option stays a pill here. It is appended AFTER the page's action
  // allow-list is applied, so a page that narrows the cluster (the
  // notifications page shows only its bell) cannot make the option vanish.
  const openingAdTabItems: ExpandingTabItem[] = tabletWithoutSidePanel && openingAd.available
    ? [{
        id: OPENING_AD_ITEM_ID,
        label: OPENING_AD_ITEM.label,
        ariaLabel: OPENING_AD_ITEM.ariaLabel,
        icon: <OPENING_AD_ITEM.Icon className="h-[30px] w-[30px]" aria-hidden="true" />,
      }]
    : [];

  const visibleTabItems = visibleActions
    ? tabItems.filter((item) => (visibleActions as string[]).includes(item.id))
    : tabItems;

  // The expanded pill follows context: an open search wins, otherwise the
  // route the header currently sits on (notifications / cart / subscription).
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const activeId = searchActive
    ? "search"
    : hash.startsWith("#/notifications")
      ? "notifications"
      : hash.startsWith("#/cart")
        ? "cart"
        : hash.startsWith("#/subscription")
          ? "subscription"
          : hash.startsWith("#/usage-limits")
            ? "usage-limits"
            : null;

  const handleSelect = (id: string) => {
    if (id === "search") onToggleSearch?.();
    else if (id === "download") onDownloadReport?.();
    else if (id === "cart") onNavigateToCart();
    else if (id === "notifications") onNavigateToNotifications();
    else if (id === "subscription") onNavigateToSubscription();
    else if (id === "usage-limits") window.location.hash = "#/usage-limits";
    else if (id === "help") onHelpClick?.();
    else if (id === OPENING_AD_ITEM_ID) openingAd.openPlayer();
  };

  const mobileMenuItems = [
    ...visibleTabItems.map((item) => ({
      id: item.id,
      label: item.label,
      ariaLabel: item.ariaLabel,
      icon: item.icon,
      badge: item.badge,
    })),
    {
      id: "usage-limits",
      label: "Usage Limits",
      ariaLabel: "Usage Limits",
      icon: <Gauge className="h-[30px] w-[30px]" />,
      color: "#8B7CF6",
    },
  ];

  return (
    <header
      data-site-header
      data-header-seamless={seamless ? "true" : undefined}
      /* `dc-scene-plate dc-scene-plate--bar` is the shared contrast plate from
         src/glass.css: index.css paints every app chrome strip with the pack's
         10% `--dc-chrome-glass` tint, which reads as *no material at all* over
         the winter scene's bright snow band, so the white app name, subtitle and
         action icons had nothing to sit on. The bar variant paints the plate on
         the strip itself (the strip is not a GlassSurface), kills its blur, and
         keeps only the inset hairline; a late chrome rule removes the exterior
         shadow and glow. `bg-white/75` and `backdrop-blur-xl` stay in the class list — they are the published
         material that `?glass=off` restores, and the gate means this rule only
         ever applies while glass is on. */
      className={`dc-scene-plate dc-scene-plate--bar sticky top-0 z-30 bg-white/75 px-3 py-2 min-[390px]:px-4 sm:px-5 sm:py-3 md:px-8 md:py-4 backdrop-blur-xl transition-all duration-300 ${
        hideFrameBorders || seamless ? "" : "mobile-header-glow"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div data-header-app-icon className="flex h-[42px] w-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/30">
            {customLogo ? <BrandMark className="h-[42px] w-[42px]" /> : <LogoIcon className="h-[42px] w-[42px]" />}
          </div>
          <div className="flex min-w-0 flex-col justify-center leading-tight">
            <h1 className="truncate text-[27px] font-bold leading-[32px] tracking-tight text-white">{headerTitle}</h1>
          </div>
          {/* The opening-animation `ad` option is a row of the quick-actions
              drawer (MobileHeaderMenu), not a header label — see
              src/components/ad/OpeningAdControl.tsx. */}
        </div>

        {centerSearch && (
          <div className="hidden min-w-0 flex-1 justify-center px-2 lg:flex">
            <label className="myrem-hsearch [&_input]:text-[22px] [&_input]:leading-[26px]" htmlFor={centerSearch.inputId ?? "dc-header-search"}>
              <SearchIcon className="h-[30px] w-[30px] shrink-0" aria-hidden="true" />
              <span className="sr-only">Search</span>
              <input
                id={centerSearch.inputId ?? "dc-header-search"}
                type="search"
                value={centerSearch.value}
                onChange={(e) => centerSearch.onChange(e.target.value)}
                placeholder={centerSearch.placeholder ?? "Search…"}
                autoComplete="off"
              />
              <kbd>Ctrl + K</kbd>
            </label>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2" data-header-action-cluster>
          <HeaderNotificationsButton
            count={displayedNotificationCount}
            size={isPhoneLayout ? 36 : 40}
            onClick={onNavigateToNotifications}
          />
          {isPhoneLayout ? (
            <MobileHeaderMenu
              items={mobileMenuItems}
              activeId={activeId}
              onSelect={handleSelect}
              extraContent={action}
              ariaLabel="Header actions"
            />
          ) : (
            <div className="flex items-center gap-2" data-header-actions-inline>
              <ExpandingTabs
                items={[...visibleTabItems, ...openingAdTabItems]}
                activeId={activeId}
                onSelect={handleSelect}
                ariaLabel="Header actions"
                iconSize={30}
              />
              {action}
            </div>
          )}
        </div>
      </div>
      {children}
      {openingAd.player}
    </header>
  );
}
