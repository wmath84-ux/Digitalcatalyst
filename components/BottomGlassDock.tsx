import React, { useMemo } from 'react';
import type { ProductWithRating, User } from '../App';
import type { DockCountDestination } from '../utils/dockNewContent';
import type { CleanNeutralIconSlotId, ProfessionalIconName } from '../utils/cleanNeutralAdvancedCustomizer';
import { BagIcon, CalendarIcon, HomeIcon, StoreIcon, WalletIcon } from './store-new/icons';

interface BottomGlassDockProps {
  currentUser: User | null;
  isLoggedIn: boolean;
  purchasedProducts: ProductWithRating[];
  cartCount: number;
  wishlistCount: number;
  dockBadgeCounts?: Partial<Record<DockCountDestination, number>>;
  dockGlowItems?: DockCountDestination[];
  activeItem?: string;
  onHomeClick: () => void;
  onOpenBlogModal: () => void;
  onOpenFreeModal: () => void;
  onOpenAnnouncementsModal: () => void;
  onNavigateToAllProducts: () => void;
  onNavigateToWishlist: () => void;
  onNavigateToPurchases: () => void;
  onCartClick: () => void;
  onProfileClick: () => void;
  onSubscriptionClick: () => void;
  onOpenMayDay?: () => void;
  onOpenCommunity?: () => void;
  isAdmin?: boolean;
  onAdminClick?: () => void;
  authButtonLabel: string;
}

const dockToneClasses: Record<string, string> = {
  'My Day': 'from-[#EEF2FF] to-[#DDE8FF] hover:border-[#7C8DFF]',
  Store: 'from-[var(--mobile-bg-soft)] to-[var(--mobile-border-active)] hover:border-[var(--mobile-border-active)]',
  Purchased: 'from-[var(--mobile-bg-soft)] to-[var(--mobile-border-active)] hover:border-[var(--mobile-border-active)]',
  Purchases: 'from-[var(--mobile-bg-soft)] to-[var(--mobile-border-active)] hover:border-[var(--mobile-border-active)]',
  Wishlist: 'from-[var(--mobile-bg-soft)] to-[var(--mobile-border)] hover:border-[var(--mobile-border-active)]',
  Cart: 'from-[#FEF7E0] to-[var(--mobile-bg-soft)] hover:border-[var(--mobile-border-active)]',
  News: 'from-[var(--mobile-bg-soft)] to-[var(--mobile-border)] hover:border-[var(--mobile-border-active)]',
  Blog: 'from-[var(--mobile-bg-soft)] to-[var(--mobile-border)] hover:border-[var(--mobile-border-active)]',
  Free: 'from-[#E6F4EA] to-[var(--mobile-bg-soft)] hover:border-[#CEEAD6]',
  Profile: 'from-[var(--mobile-bg-soft)] to-[var(--mobile-border-active)] hover:border-[var(--mobile-border-active)]',
  Login: 'from-[var(--mobile-bg-soft)] to-[var(--mobile-border-active)] hover:border-[var(--mobile-border-active)]',
  Subscriptions: 'from-[var(--mobile-bg-soft)] to-[var(--mobile-border)] hover:border-[var(--mobile-border-active)]',
  Community: 'from-[var(--mobile-bg-soft)] to-[var(--mobile-border-active)] hover:border-[var(--mobile-border-active)]',
  Admin: 'from-[#EEF2FF] to-[var(--mobile-bg-soft)] hover:border-[#7C8DFF]',
};

export const dockCustomizationItems = ['Home', 'Store', 'Purchased', 'Wishlist', 'Cart', 'News', 'Community', 'Blog', 'Free', 'Profile', 'Subscriptions'];

export const defaultDockStyle = {
  backgroundColor: '#FBFDFF',
  backgroundOpacity: 92,
  itemColor: '#FFFFFF',
  itemOpacity: 96,
  accentColor: '#1769FF',
  accentOpacity: 22,
  textColor: '#334155',
  borderColor: '#BFD7FF',
  height: 76,
  iconSize: 36,
  labelSize: 11,
  padding: 12,
  gap: 8,
  radius: 24,
  itemRadius: 16,
  bottomOffset: 8,
  blur: 24,
  shadowStrength: 'soft' as 'none' | 'soft' | 'strong',
  showLabels: true,
  showBadges: true,
  autoHideOnScroll: false,
  persistAcrossPages: true,
  mobileEnabled: true,
  desktopExpandedWidth: 320,
  desktopCollapsedWidth: 88,
  sidebarFontFamily: 'Inter',
  sidebarBackgroundColor: '#FBFDFF',
  sidebarBackgroundOpacity: 92,
  sidebarTextColor: '#334155',
  sidebarTextOpacity: 100,
  sidebarBorderColor: '#BFD7FF',
};

const clampNumber = (value: unknown, minimum: number, maximum: number, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
};

const clampPercent = (value: unknown, fallback: number) => clampNumber(value, 0, 100, fallback);

const normalizeHex = (value: unknown, fallback: string) => {
  const candidate = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
};

export const hexToRgba = (hex: string, opacityPercent: number) => {
  const normalized = normalizeHex(hex, defaultDockStyle.backgroundColor).replace('#', '');
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clampPercent(opacityPercent, defaultDockStyle.backgroundOpacity) / 100})`;
};

export const dockShadowMap = {
  none: 'none',
  soft: '0 14px 36px rgba(15,23,42,0.14)',
  strong: '0 24px 60px rgba(15,23,42,0.24)',
};

const TAB_ICONS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  Home: HomeIcon,
  'My Day': CalendarIcon,
  Store: StoreIcon,
  Purchases: BagIcon,
  Wallet: WalletIcon,
};

const BottomGlassDock = ({ currentUser, isLoggedIn, purchasedProducts, cartCount, wishlistCount, dockBadgeCounts = {}, dockGlowItems = [], activeItem = '', onHomeClick, onOpenBlogModal, onOpenFreeModal, onOpenAnnouncementsModal, onNavigateToAllProducts, onNavigateToWishlist, onNavigateToPurchases, onCartClick, onProfileClick, onSubscriptionClick, onOpenMayDay, onOpenCommunity, isAdmin = false, onAdminClick, authButtonLabel }: BottomGlassDockProps) => {
  const defaultItems = useMemo(() => ([
    { label: 'Home', action: onHomeClick, icon: 'home' as ProfessionalIconName, slot: 'nav.home' as CleanNeutralIconSlotId, badge: null },
    { label: 'My Day', action: onOpenMayDay || onHomeClick, icon: 'calendar' as ProfessionalIconName, slot: 'nav.mayDay' as CleanNeutralIconSlotId, badge: null },
    { label: 'Store', action: onNavigateToAllProducts, icon: 'store' as ProfessionalIconName, slot: 'nav.store' as CleanNeutralIconSlotId, badge: dockBadgeCounts.Store || null },
    { label: 'Purchases', action: onNavigateToPurchases, icon: 'book-open' as ProfessionalIconName, slot: 'nav.purchased' as CleanNeutralIconSlotId, badge: (dockBadgeCounts.Purchased ?? purchasedProducts.length) || null },
    { label: 'Wallet', action: onProfileClick, icon: 'gem' as ProfessionalIconName, slot: 'nav.profile' as CleanNeutralIconSlotId, badge: null },
  ]), [onOpenMayDay, onHomeClick, onNavigateToAllProducts, onNavigateToPurchases, purchasedProducts.length, onProfileClick, dockBadgeCounts.Store, dockBadgeCounts.Purchased]);

  const items = defaultItems;
  // Hardcoded default: the bottom dock renders only on mobile. The desktop side panel
  // handles desktop navigation with the default "sidebar" layout.
  const showOnDesktop = false;
  // Keep the navigation dock pinned like a header; admin/user actions must remain visible while scrolling.
  const autoHideOnScroll = false;

  return (
    <>
      <style>{`
        @keyframes dock-new-content-glow-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(23,105,255,0.15), 0 8px 24px rgba(23,105,255,0.12); }
          50% { box-shadow: 0 0 0 7px rgba(23,105,255,0.08), 0 12px 30px rgba(109,92,255,0.22); }
        }
        @media (max-width: 767px) {
          .dock-new-content-glow { animation: dock-new-content-glow-pulse 1.9s ease-in-out infinite; outline: 2px solid rgba(23,105,255,0.34); outline-offset: 1px; }
        }
        @media (prefers-reduced-motion: reduce) { .dock-new-content-glow { animation: none; } }
      `}</style>
      <div className={`fixed inset-x-0 z-[65] ${showOnDesktop ? '' : 'md:hidden'}`} style={{ bottom: 'max(0px, env(safe-area-inset-bottom))' }}>
        <nav
          id="main-bottom-dock"
          data-clean-neutral-region="navigation.mobileDock"
          className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur"
        >
          <div className="flex items-stretch justify-between">
            {items.map((item) => {
              const Icon = TAB_ICONS[item.label] || HomeIcon;
              const isLoggedOutProfileVisual = !isLoggedIn && (item.label === authButtonLabel || item.label === 'Login');
              const visualLabel = isLoggedOutProfileVisual ? 'Profile' : item.label;
              const visualIcon = isLoggedOutProfileVisual ? 'user' as ProfessionalIconName : item.icon as ProfessionalIconName;
              const visualSlot = isLoggedOutProfileVisual ? 'nav.profile' as CleanNeutralIconSlotId : item.slot as CleanNeutralIconSlotId;
              const tone = dockToneClasses[visualLabel] || dockToneClasses[item.label] || 'from-[var(--mobile-bg)] to-[var(--mobile-bg-soft)] hover:border-[var(--mobile-border-active)]';
              const hasNewGlow = dockGlowItems.includes(item.label as DockCountDestination);
              const isActive = activeItem === item.label || (item.label === 'Purchases' && activeItem === 'Purchased') || (visualLabel === 'Profile' && activeItem === 'Profile');
              const badge = item.badge;

              return (
                <button
                  key={item.label}
                  type="button"
                  aria-label={isLoggedOutProfileVisual ? authButtonLabel : item.label}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    item.action();
                  }}
                  className={`relative flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition ${
                    isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                  } ${item.mobileOnly ? 'md:hidden' : ''} ${hasNewGlow ? 'dock-new-content-glow' : ''}`}
                >
                  <span
                    className={`relative flex h-9 w-14 items-center justify-center rounded-full transition ${
                      isActive ? 'bg-indigo-100' : ''
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {!!item.badge && item.badge > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </span>
                  {visualLabel}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </>
  );
};

export default BottomGlassDock;
