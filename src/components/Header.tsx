import type { ComponentType, ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { BellIcon, BookIcon, CartIcon, CrownIcon, DownloadIcon, SearchIcon } from "./icons";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";
import BrandMark from "./BrandMark";
import { DEFAULT_LOGO_URL } from "@/utils/branding";
import { useBranding } from "@/context/BrandingContext";
import { GlassSurface } from "./ui/glass";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/glass-tooltip";

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
      className={`sticky top-0 z-30 bg-white/75 px-4 py-3 sm:px-5 md:px-8 md:py-4 backdrop-blur-xl transition-all duration-300 ${
        hideFrameBorders ? "" : "mobile-header-glow"
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

        <TooltipProvider delayMs={320}>
          <div className="flex shrink-0 items-center gap-2">
            {onToggleSearch ? (
              <HeaderIconButton
                aria-label="Search"
                hint={searchActive ? "Close search" : "Search the store"}
                onClick={onToggleSearch}
                active={searchActive}
                icon={<SearchIcon className="h-5 w-5" />}
              />
            ) : null}
            {onDownloadReport ? (
              <HeaderIconButton
                aria-label="Download report"
                hint="Download My Day report"
                onClick={onDownloadReport}
                icon={<DownloadIcon className="h-5 w-5" />}
              />
            ) : (
              <HeaderIconButton
                aria-label="Cart"
                hint="View cart"
                onClick={onNavigateToCart}
                badge={cartCount > 0 ? String(cartCount) : undefined}
                badgeTone="rose"
                icon={<CartIcon className="h-5 w-5" />}
              />
            )}
            <HeaderIconButton
              aria-label="Notifications"
              hint={
                displayedNotificationCount > 0
                  ? `${displayedNotificationCount} unread`
                  : "No unread notifications"
              }
              onClick={onNavigateToNotifications}
              badge={
                displayedNotificationCount > 0
                  ? displayedNotificationCount > 99
                    ? "99+"
                    : String(displayedNotificationCount)
                  : undefined
              }
              badgeAriaLabel={
                displayedNotificationCount > 0
                  ? `${displayedNotificationCount} unread notifications`
                  : undefined
              }
              icon={<BellIcon className="h-5 w-5" />}
            />
            <HeaderIconButton
              aria-label="Subscription"
              hint="EduVora plans"
              onClick={onNavigateToSubscription}
              tone="accent"
              icon={<CrownIcon className="h-5 w-5" />}
            />
            {onHelpClick ? (
              <HeaderIconButton
                aria-label="Help & FAQ"
                onClick={onHelpClick}
                icon={<HelpCircle className="h-5 w-5" />}
              />
            ) : null}
            {action}
          </div>
        </TooltipProvider>
      </div>
      {children}
    </header>
  );
}

/**
 * HeaderIconButton — one header action.
 *
 * Wave 2 (liquid glass): the disc is the pack's `GlassSurface` (frost +
 * specular rim) rather than a hand-painted `bg-white/60 border` pill, and the
 * hover text that used to live in `title=` is now a real `glass-tooltip` chip,
 * and each action's `aria-label` is written literally at its call site — the
 * accessible names of the header must stay greppable (`Help & FAQ` in
 * particular is pinned by tests/subscriptionDowngradeGuard.test.mjs).
 * so it is keyboard-reachable (the trigger focuses → the chip opens) and
 * legible over any background. Sizing, hit area and the badge geometry are
 * deliberately identical to the old buttons — the mobile header must not grow.
 */
type HeaderIconTone = "neutral" | "accent" | "active";

function HeaderIconButton({
  "aria-label": ariaLabel,
  hint,
  onClick,
  icon,
  badge,
  badgeAriaLabel,
  badgeTone = "indigo",
  tone = "neutral",
  active = false,
}: {
  /** Both the accessible name and, unless `hint` overrides it, the tooltip. */
  "aria-label": string;
  /** Tooltip copy; falls back to the aria-label. */
  hint?: string;
  onClick: () => void;
  icon: ReactNode;
  badge?: string;
  badgeAriaLabel?: string;
  badgeTone?: "indigo" | "rose";
  tone?: HeaderIconTone;
  active?: boolean;
}) {
  const resolved: HeaderIconTone = active ? "active" : tone;
  const surface =
    resolved === "accent"
      ? { tint: 0.6, rgb: "196,181,253", label: "text-violet-700 hover:text-violet-900" }
      : resolved === "active"
        ? { tint: 0.62, rgb: "224,231,255", label: "text-indigo-700" }
        : { tint: 0.6, rgb: "255,255,255", label: "text-slate-600 hover:text-slate-900" };

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={ariaLabel}
        onClick={onClick}
        className={`relative grid size-10 place-items-center rounded-full outline-none transition-all active:scale-95 ${surface.label}`}
      >
        {/* the material sits under the glyph; pointer-events-none so the button
            keeps owning every click and the 40px hit area */}
        <GlassSurface
          tint={surface.tint}
          tintColor={surface.rgb}
          blur={12}
          saturation={1.35}
          radius={999}
          className="dc-chrome-disc pointer-events-none absolute inset-0"
          aria-hidden="true"
        />
        <span className="relative">{icon}</span>
        {badge ? (
          <span
            aria-label={badgeAriaLabel}
            className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-white ${
              badgeTone === "rose" ? "bg-rose-500" : "bg-indigo-600"
            }`}
          >
            {badge}
          </span>
        ) : null}
      </TooltipTrigger>
      {/* The chip is a *light* panel over the light header, so the label colour
          is set on the child span: `text-white` lives on the surface root and
          would win on that element, not on ours. */}
      <TooltipContent side="bottom" tint={0.85}>
        <span className="text-slate-800">{hint ?? ariaLabel}</span>
      </TooltipContent>
    </Tooltip>
  );
}
