import { BellIcon, BookIcon, CartIcon, CrownIcon, DownloadIcon, SearchIcon } from "./icons";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";

type HeaderProps = {
  cartCount: number;
  notifCount: number;
  onNavigateToSubscription: () => void;
  onNavigateToCart: () => void;
  onNavigateToNotifications: () => void;
  /**
   * Branding override. The store shows "Eduvora"; My Day shows
   * "Eduvora Taskar".
   */
  title?: string;
  /**
   * Tagline override. The store shows "Premium learning store"; My Day
   * shows "My Day Activities".
   */
  subtitle?: string;
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
};

export default function Header({
  cartCount,
  onNavigateToSubscription,
  onNavigateToCart,
  onNavigateToNotifications,
  title = "Eduvora",
  subtitle = "Premium learning store",
  onDownloadReport,
  onToggleSearch,
  searchActive = false,
}: HeaderProps) {
  const liveNotificationCount = useUnreadNotificationCount();
  const displayedNotificationCount = liveNotificationCount ?? 0;
  return (
    <header data-site-header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-200">
            <BookIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-lg font-extrabold tracking-tight text-slate-900">{title}</h1>
            <p className="truncate text-xs font-medium text-slate-400">{subtitle}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {onToggleSearch ? (
            <button
              type="button"
              aria-label="Search"
              onClick={onToggleSearch}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95 ${
                searchActive
                  ? "bg-indigo-100 text-indigo-600"
                  : "text-slate-700 hover:bg-slate-100"
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
              className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-95"
            >
              <DownloadIcon className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Cart"
              onClick={onNavigateToCart}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-95"
            >
              <CartIcon className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            aria-label="Notifications"
            onClick={onNavigateToNotifications}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-95"
          >
            <BellIcon className="h-5 w-5" />
            {displayedNotificationCount > 0 && (
              <span aria-label={`${displayedNotificationCount} unread notifications`} className="absolute -top-0.5 -right-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-bold text-white">
                {displayedNotificationCount > 99 ? "99+" : displayedNotificationCount}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label="Subscription"
            onClick={onNavigateToSubscription}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-600 transition hover:bg-violet-100 active:scale-95"
          >
            <CrownIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
