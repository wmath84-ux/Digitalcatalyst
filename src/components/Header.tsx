import type { ComponentType, ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { BellIcon, BookIcon, CartIcon, CrownIcon, DownloadIcon, SearchIcon } from "./icons";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";
import BrandMark from "./BrandMark";
import { DEFAULT_LOGO_URL } from "@/utils/branding";
import { useBranding } from "@/context/BrandingContext";

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
  return (
    <header
      data-site-header
      className={`sticky top-0 z-30 bg-white/75 px-4 py-3 sm:px-5 backdrop-blur-xl transition-all duration-300 ${
        hideFrameBorders ? "" : "border-b border-slate-200/50 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.08)]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/30">
            {customLogo ? <BrandMark className="h-11 w-11" /> : <LogoIcon className="h-6 w-6" />}
          </div>
          <div className="min-w-0 leading-tight pt-0.5">
            <h1 className="truncate text-[1.125rem] font-black tracking-tight text-slate-900 drop-shadow-sm">{headerTitle}</h1>
            <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">{subtitle}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onToggleSearch ? (
            <button
              type="button"
              aria-label="Search"
              onClick={onToggleSearch}
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all active:scale-95 ${
                searchActive
                  ? "border-indigo-200 bg-indigo-50 text-indigo-600"
                  : "border-slate-200/70 bg-white/60 text-slate-600 shadow-sm backdrop-blur-sm hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <SearchIcon className="h-5 w-5" />
            </button>
          ) : null}
          {onDownloadReport ? (
            <button
              type="button"
              aria-label="Download report"
              title="Download My Day report"
              onClick={onDownloadReport}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/70 bg-white/60 text-slate-600 shadow-sm backdrop-blur-sm transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-95"
            >
              <DownloadIcon className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Cart"
              onClick={onNavigateToCart}
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/70 bg-white/60 text-slate-600 shadow-sm backdrop-blur-sm transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-95"
            >
              <CartIcon className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                  {cartCount}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            aria-label="Notifications"
            onClick={onNavigateToNotifications}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/70 bg-white/60 text-slate-600 shadow-sm backdrop-blur-sm transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-95"
          >
            <BellIcon className="h-5 w-5" />
            {displayedNotificationCount > 0 && (
              <span aria-label={`${displayedNotificationCount} unread notifications`} className="absolute -right-0.5 -top-0.5 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                {displayedNotificationCount > 99 ? "99+" : displayedNotificationCount}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label="Subscription"
            onClick={onNavigateToSubscription}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-200/70 bg-violet-50/80 text-violet-600 shadow-sm backdrop-blur-sm transition-all hover:bg-violet-100 hover:text-violet-700 active:scale-95"
          >
            <CrownIcon className="h-5 w-5" />
          </button>
          {onHelpClick ? (
            <button
              type="button"
              aria-label="Help & FAQ"
              onClick={onHelpClick}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/70 bg-white/60 text-slate-600 shadow-sm backdrop-blur-sm transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-95"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
          ) : null}
          {action}
        </div>
      </div>
      {children}
    </header>
  );
}
