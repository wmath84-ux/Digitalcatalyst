import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ProductWithRating, User, WebsiteSettings } from '../App';
import type { DockCountDestination } from '../utils/dockNewContent';
import ProfessionalIcon from './common/ProfessionalIcon';
import type { CleanNeutralIconSlotId, ProfessionalIconName } from '../utils/cleanNeutralAdvancedCustomizer';

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
  settings: WebsiteSettings;
}

const dockToneClasses: Record<string, string> = {
  'May Day': 'from-[#EEF2FF] to-[#DDE8FF] hover:border-[#7C8DFF]',
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

const BottomGlassDock = ({ settings, currentUser, isLoggedIn, purchasedProducts, cartCount, wishlistCount, dockBadgeCounts = {}, dockGlowItems = [], activeItem = '', onHomeClick, onOpenBlogModal, onOpenFreeModal, onOpenAnnouncementsModal, onNavigateToAllProducts, onNavigateToWishlist, onNavigateToPurchases, onCartClick, onProfileClick, onSubscriptionClick, onOpenMayDay, onOpenCommunity, isAdmin = false, onAdminClick, authButtonLabel }: BottomGlassDockProps) => {
  const defaultItems = useMemo(() => ([
    { label: 'Home', action: onHomeClick, icon: 'home' as ProfessionalIconName, slot: 'nav.home' as CleanNeutralIconSlotId, badge: null },
    { label: 'Store', action: onNavigateToAllProducts, icon: 'store' as ProfessionalIconName, slot: 'nav.store' as CleanNeutralIconSlotId, badge: dockBadgeCounts.Store || null },
    { label: 'Purchased', action: onNavigateToPurchases, icon: 'book-open' as ProfessionalIconName, slot: 'nav.purchased' as CleanNeutralIconSlotId, badge: (dockBadgeCounts.Purchased ?? purchasedProducts.length) || null },
    { label: 'Wishlist', action: onNavigateToWishlist, icon: 'heart' as ProfessionalIconName, slot: 'nav.wishlist' as CleanNeutralIconSlotId, badge: (dockBadgeCounts.Wishlist ?? wishlistCount) || null },
    { label: 'Cart', action: onCartClick, icon: 'shopping-cart' as ProfessionalIconName, slot: 'nav.cart' as CleanNeutralIconSlotId, badge: (dockBadgeCounts.Cart ?? cartCount) || null },
    { label: 'News', action: onOpenAnnouncementsModal, icon: 'megaphone' as ProfessionalIconName, slot: 'nav.news' as CleanNeutralIconSlotId, badge: dockBadgeCounts.News || null },
    ...(onOpenCommunity ? [{ label: 'Community', action: onOpenCommunity, icon: 'message-circle' as ProfessionalIconName, slot: 'nav.community' as CleanNeutralIconSlotId, badge: null }] : []),
    { label: 'Blog', action: onOpenBlogModal, icon: 'file-text' as ProfessionalIconName, slot: 'nav.blog' as CleanNeutralIconSlotId, badge: dockBadgeCounts.Blog || null },
    { label: 'Free', action: onOpenFreeModal, icon: 'gift' as ProfessionalIconName, slot: 'nav.free' as CleanNeutralIconSlotId, badge: dockBadgeCounts.Free || null },
    { label: isLoggedIn ? 'Profile' : authButtonLabel, action: () => {
      if (typeof onProfileClick === 'function') {
        onProfileClick();
        return;
      }

      window.history.pushState({}, '', '/profile');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, icon: (isLoggedIn ? 'user' : 'lock') as ProfessionalIconName, slot: (isLoggedIn ? 'nav.profile' : 'nav.login') as CleanNeutralIconSlotId, badge: null },
    ...(isAdmin && onAdminClick ? [{ label: 'Admin', action: onAdminClick, icon: 'shield' as ProfessionalIconName, slot: 'nav.admin' as CleanNeutralIconSlotId, badge: null }] : []),
  ]), [onHomeClick, onNavigateToAllProducts, onNavigateToPurchases, purchasedProducts.length, onNavigateToWishlist, wishlistCount, onCartClick, cartCount, onOpenAnnouncementsModal, onOpenCommunity, onOpenBlogModal, onOpenFreeModal, isLoggedIn, authButtonLabel, onProfileClick, dockBadgeCounts.Store, dockBadgeCounts.Purchased, dockBadgeCounts.Wishlist, dockBadgeCounts.Cart, dockBadgeCounts.News, dockBadgeCounts.Blog, dockBadgeCounts.Free, isAdmin, onAdminClick]);

  const configuredBase = ((settings.content as any).dockItems || dockCustomizationItems) as string[];
  const configuredWithHome = configuredBase.includes('Home') ? configuredBase : ['Home', ...configuredBase];
  const configured = configuredWithHome.filter((label, index, labels) => labels.indexOf(label) === index);
  const map: any = Object.fromEntries(defaultItems.map(item => [item.label, item]));
  map.Home = map.Home || { label: 'Home', action: onHomeClick, icon: 'home' as ProfessionalIconName, slot: 'nav.home' as CleanNeutralIconSlotId, badge: null };
  map.Purchases = map.Purchased;
  map.EduCoins = map.Profile || { label: isLoggedIn ? 'Profile' : authButtonLabel, action: onProfileClick, icon: (isLoggedIn ? 'user' : 'lock') as ProfessionalIconName, slot: (isLoggedIn ? 'nav.profile' : 'nav.login') as CleanNeutralIconSlotId, badge: null };
  map['Profile'] = map['Profile'] || { label: isLoggedIn ? 'Profile' : authButtonLabel, action: onProfileClick, icon: (isLoggedIn ? 'user' : 'lock') as ProfessionalIconName, slot: (isLoggedIn ? 'nav.profile' : 'nav.login') as CleanNeutralIconSlotId, badge: null };
  map.Subscriptions = { label: 'Subscriptions', action: onSubscriptionClick, icon: 'gem' as ProfessionalIconName, slot: 'nav.subscriptions' as CleanNeutralIconSlotId, badge: null };
  map['May Day'] = onOpenMayDay ? { label: 'May Day', action: onOpenMayDay, icon: 'calendar' as ProfessionalIconName, slot: 'nav.mayDay' as CleanNeutralIconSlotId, badge: null, mobileOnly: true } : null;
  const configuredItems = configured.map(label => map[label]).filter(Boolean);
  const configuredWithAdmin = isAdmin && map.Admin && !configuredItems.some((item: any) => item.label === 'Admin') ? [...configuredItems, map.Admin] : configuredItems;
  const items = map['May Day'] ? [map['May Day'], ...configuredWithAdmin.filter((item: any) => item.label !== 'May Day')] : configuredWithAdmin;

  const dockStyle = { ...defaultDockStyle, ...((settings.content as any).dockStyle || {}) };
  const dockBackground = hexToRgba(dockStyle.backgroundColor, dockStyle.backgroundOpacity);
  const itemBackground = hexToRgba(dockStyle.itemColor, dockStyle.itemOpacity);
  const accentColor = normalizeHex(dockStyle.accentColor, defaultDockStyle.accentColor);
  const textColor = normalizeHex(dockStyle.textColor, defaultDockStyle.textColor);
  const borderColor = normalizeHex(dockStyle.borderColor, defaultDockStyle.borderColor);
  const accentOpacity = clampPercent(dockStyle.accentOpacity, defaultDockStyle.accentOpacity) / 100;
  const dockHeight = clampNumber(dockStyle.height, 58, 112, defaultDockStyle.height);
  const iconSize = clampNumber(dockStyle.iconSize, 28, 52, defaultDockStyle.iconSize);
  const labelSize = clampNumber(dockStyle.labelSize, 9, 14, defaultDockStyle.labelSize);
  const dockPadding = clampNumber(dockStyle.padding, 8, 22, defaultDockStyle.padding);
  const dockGap = clampNumber(dockStyle.gap, 4, 20, defaultDockStyle.gap);
  const dockRadius = clampNumber(dockStyle.radius, 0, 40, defaultDockStyle.radius);
  const itemRadius = clampNumber(dockStyle.itemRadius, 0, 28, defaultDockStyle.itemRadius);
  const bottomOffset = clampNumber(dockStyle.bottomOffset, 0, 32, defaultDockStyle.bottomOffset);
  const blur = clampNumber(dockStyle.blur, 0, 36, defaultDockStyle.blur);
  const showLabels = dockStyle.showLabels !== false;
  const showBadges = dockStyle.showBadges !== false;
  const autoHideOnScroll = dockStyle.autoHideOnScroll === true;
  const showOnDesktop = settings.desktop.navigationMode === 'dock';
  const shadowStrength = dockStyle.shadowStrength === 'none' || dockStyle.shadowStrength === 'strong' ? dockStyle.shadowStrength : 'soft';
  const [isAutoHidden, setIsAutoHidden] = useState(false);
  const dockScrollRef = useRef<HTMLDivElement>(null);
  const dockScrollLeftRef = useRef(0);

  const preserveDockScroll = () => {
    if (dockScrollRef.current) dockScrollLeftRef.current = dockScrollRef.current.scrollLeft;
  };

  useEffect(() => {
    const dock = dockScrollRef.current;
    if (!dock) return;
    dock.scrollLeft = dockScrollLeftRef.current;
  }, [items.length, currentUser?.id, isLoggedIn]);

  useEffect(() => {
    if (!autoHideOnScroll || typeof window === 'undefined') {
      setIsAutoHidden(false);
      return;
    }

    let previousY = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const nextY = window.scrollY;
        if (nextY < 24 || nextY < previousY - 8) setIsAutoHidden(false);
        else if (nextY > previousY + 8) setIsAutoHidden(true);
        previousY = nextY;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [autoHideOnScroll]);

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
      <div
        className={`fixed inset-x-0 z-[65] flex justify-center px-3 pointer-events-none ${showOnDesktop ? '' : 'md:hidden'}`}
        style={{ bottom: `max(${bottomOffset}px, env(safe-area-inset-bottom))` }}
      >
        <div
          className="pointer-events-auto group relative max-w-[95vw] overflow-hidden border transition-[transform,opacity] duration-300 data-[hidden=true]:translate-y-[calc(100%+2rem)] data-[hidden=true]:opacity-0 lg:max-w-[min(96vw,1120px)]"
          id="main-bottom-dock"
          data-clean-neutral-region="navigation.mobileDock"
          data-hidden={isAutoHidden ? 'true' : 'false'}
          onPointerEnter={() => setIsAutoHidden(false)}
          style={{
            backgroundColor: dockBackground,
            minHeight: dockHeight,
            padding: dockPadding,
            borderColor,
            borderRadius: dockRadius,
            boxShadow: dockShadowMap[shadowStrength],
            backdropFilter: `blur(${blur}px)`,
            WebkitBackdropFilter: `blur(${blur}px)`,
          }}
        >
          <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 20% 10%, ${hexToRgba(accentColor, accentOpacity * 100)}, transparent 36%), linear-gradient(180deg, rgba(255,255,255,0.22), transparent)` }} />
          <div ref={dockScrollRef} onScroll={preserveDockScroll} className="relative flex items-center overflow-x-auto pb-1 custom-scrollbar" style={{ gap: dockGap }}>
            {items.map((item) => {
              const isLoggedOutProfileVisual = !isLoggedIn && (item.label === authButtonLabel || item.label === 'Login');
              const visualLabel = isLoggedOutProfileVisual ? 'Profile' : item.label;
              const visualIcon = isLoggedOutProfileVisual ? 'user' as ProfessionalIconName : item.icon as ProfessionalIconName;
              const visualSlot = isLoggedOutProfileVisual ? 'nav.profile' as CleanNeutralIconSlotId : item.slot as CleanNeutralIconSlotId;
              const tone = dockToneClasses[visualLabel] || dockToneClasses[item.label] || 'from-[var(--mobile-bg)] to-[var(--mobile-bg-soft)] hover:border-[var(--mobile-border-active)]';
              const hasNewGlow = dockGlowItems.includes(item.label as DockCountDestination);
              const isActive = activeItem === item.label || (item.label === 'Purchased' && activeItem === 'Purchases') || (visualLabel === 'Profile' && activeItem === 'Profile');

              return (
                <button
                  key={item.label}
                  aria-label={isLoggedOutProfileVisual ? authButtonLabel : item.label}
                  aria-current={isActive ? 'page' : undefined}
                  onPointerDown={preserveDockScroll}
                  onClick={() => {
                    preserveDockScroll();
                    item.action();
                    requestAnimationFrame(() => {
                      if (dockScrollRef.current) dockScrollRef.current.scrollLeft = dockScrollLeftRef.current;
                    });
                  }}
                  className={`group/item relative ${item.mobileOnly ? 'md:hidden' : ''} flex shrink-0 flex-col items-center border transition duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-4 ${hasNewGlow ? 'dock-new-content-glow' : ''} ${tone}`}
                  style={{
                    backgroundColor: isActive ? hexToRgba(accentColor, 18) : itemBackground,
                    borderColor: isActive ? accentColor : borderColor,
                    borderRadius: itemRadius,
                    color: isActive ? accentColor : textColor,
                    padding: Math.max(7, dockPadding - 3),
                    minWidth: showLabels ? Math.max(74, iconSize + 38) : iconSize + 20,
                    boxShadow: isActive ? `0 8px 22px ${hexToRgba(accentColor, 20)}` : 'none',
                  }}
                >
                  <span className={`absolute inset-0 bg-gradient-to-br ${tone.split(' hover:')[0]} transition duration-200 group-hover/item:opacity-75`} style={{ opacity: accentOpacity, borderRadius: itemRadius }} />
                  <ProfessionalIcon
                    slot={visualSlot}
                    fallbackName={visualIcon}
                    label={visualLabel}
                    defaultDisplayMode={showLabels ? 'icon-with-text' : 'icon-only'}
                    defaultPosition="top"
                    size={Math.max(18, iconSize * 0.58)}
                    color={isActive ? accentColor : textColor}
                    iconClassName="relative flex items-center justify-center border bg-white/90 shadow-inner transition duration-200 group-hover/item:scale-105"
                    iconStyle={{ width: iconSize, height: iconSize, borderRadius: Math.max(4, itemRadius - 4), borderColor }}
                    labelClassName="relative font-black tracking-wide"
                    labelStyle={{ fontSize: labelSize, color: isActive ? accentColor : textColor }}
                  />
                  {showBadges && item.badge ? <span className="dock-count-badge absolute -right-1 -top-1 rounded-full border border-white px-1.5 py-0.5 text-[10px] font-black text-white shadow-[0_8px_20px_rgba(15,23,42,0.24)]" style={{ backgroundColor: accentColor }}>{item.badge > 99 ? '99+' : item.badge}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

export default BottomGlassDock;
