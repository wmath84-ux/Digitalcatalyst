import type { ComponentType, ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { BellIcon, BookIcon, CartIcon, CrownIcon, DownloadIcon, SearchIcon } from "./icons";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";
import BrandMark from "./BrandMark";
import { DEFAULT_LOGO_URL } from "@/utils/branding";
import { useBranding } from "@/context/BrandingContext";
import ExpandingTabs, { type ExpandingTabItem } from "./ui/ExpandingTabs";

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
  /**
   * Tagline override. The store shows "Premium learning store"; My Day
   * shows "My Day Activities".
   */
  subtitle?: string;
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
   * When provided, a circular help (?) button is rendered at the far right
   * of the header. The subscription page uses this for its Help & FAQ
   * overlay so the shortcut lives on the main header itself.
   */
  onHelpClick?: () => void;
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
  subtitle = "Premium learning store",
  icon,
  action,
  children,
  onDownloadReport,
  onToggleSearch,
  searchActive = false,
  onHelpClick,
}: HeaderProps) {
  const liveNotificationCount = useUnreadNotificationCount();
  const displayedNotificationCount = liveNotificationCount ?? 0;
  const LogoIcon = icon ?? BookIcon;
  const { logoUrl, appName, hideFrameBorders } = useBranding();
  const customLogo = logoUrl && logoUrl !== DEFAULT_LOGO_URL;
  const headerTitle = title ?? appName;

  const tabItems: ExpandingTabItem[] = [
    ...(onToggleSearch
      ? [{
          id: "search",
          label: "Search",
          ariaLabel: "Search",
          icon: <SearchIcon className="h-5 w-5" />,
        }]
      : []),
    onDownloadReport
      ? {
          id: "download",
          label: "Report",
          ariaLabel: "Download report",
          icon: <DownloadIcon className="h-5 w-5" />,
        }
      : {
          id: "cart",
          label: "Cart",
          ariaLabel: "Cart",
          icon: <CartIcon className="h-5 w-5" />,
          badge: cartCount > 0 ? String(cartCount) : undefined,
          badgeTone: "rose" as const,
        },
    {
      id: "notifications",
      label: "Alerts",
      ariaLabel: "Notifications",
      icon: <BellIcon className="h-5 w-5" />,
      badge:
        displayedNotificationCount > 0
          ? displayedNotificationCount > 99
            ? "99+"
            : String(displayedNotificationCount)
          : undefined,
      badgeAriaLabel:
        displayedNotificationCount > 0
          ? `${displayedNotificationCount} unread notifications`
          : undefined,
    },
    {
      id: "subscription",
      label: "Plans",
      ariaLabel: "Subscription",
      icon: <CrownIcon className="h-5 w-5" />,
    },
    ...(onHelpClick
      ? [{
          id: "help",
          label: "Help",
          ariaLabel: "Help & FAQ",
          icon: <HelpCircle className="h-5 w-5" />,
        }]
      : []),
  ];

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
          : null;

  const handleSelect = (id: string) => {
    if (id === "search") onToggleSearch?.();
    else if (id === "download") onDownloadReport?.();
    else if (id === "cart") onNavigateToCart();
    else if (id === "notifications") onNavigateToNotifications();
    else if (id === "subscription") onNavigateToSubscription();
    else if (id === "help") onHelpClick?.();
  };

  return (
    <header
      data-site-header
      className={`sticky top-0 z-30 bg-white/75 px-4 py-3 sm:px-5 md:px-8 md:py-4 backdrop-blur-xl transition-all duration-300 ${
        hideFrameBorders ? "" : "mobile-header-glow"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/30">
            {customLogo ? <BrandMark className="h-11 w-11" /> : <LogoIcon className="h-6 w-6" />}
          </div>
          <div className="min-w-0 leading-tight pt-0.5">
            <h1 className="truncate text-[1.125rem] font-black tracking-tight text-white">{headerTitle}</h1>
            <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-widest text-white/55">{subtitle}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ExpandingTabs
            items={tabItems}
            activeId={activeId}
            onSelect={handleSelect}
            ariaLabel="Header actions"
          />
          {action}
        </div>
      </div>
      {children}
    </header>
  );
}
