import React, { useEffect, useState } from 'react';
import type { ProductWithRating, WebsiteSettings } from '../App';
import type { DockCountDestination } from '../utils/dockNewContent';
import { defaultDockStyle, dockCustomizationItems, dockShadowMap, hexToRgba } from './BottomGlassDock';

interface HomeSideDockProps {
  isLoggedIn: boolean;
  purchasedProducts: ProductWithRating[];
  cartCount: number;
  wishlistCount: number;
  dockBadgeCounts?: Partial<Record<DockCountDestination, number>>;
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
  onOpenCommunity?: () => void;
  authButtonLabel: string;
  settings: WebsiteSettings;
  activeItem?: string;
}

type SidebarState = 'expanded' | 'collapsed' | 'hidden';

type NavigationItem = {
  id: string;
  label: string;
  icon: string;
  badge: number | null;
  action: () => void;
};

const SIDEBAR_STATE_KEY = 'digitalCatalystDesktopSidebarState';

const readInitialState = (): SidebarState => {
  if (typeof window === 'undefined') return 'expanded';
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STATE_KEY);
    if (stored === 'expanded' || stored === 'collapsed' || stored === 'hidden') return stored;
    if (window.localStorage.getItem('publicSideDockCollapsed') === 'true') return 'collapsed';
  } catch {
    // Blocked storage must not prevent navigation rendering.
  }
  return 'expanded';
};

const clamp = (value: unknown, minimum: number, maximum: number, fallback: number) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
};

const HomeSideDock = ({ settings, isLoggedIn, purchasedProducts, cartCount, wishlistCount, dockBadgeCounts = {}, onHomeClick, onOpenBlogModal, onOpenFreeModal, onOpenAnnouncementsModal, onNavigateToAllProducts, onNavigateToWishlist, onNavigateToPurchases, onCartClick, onProfileClick, onSubscriptionClick, onOpenCommunity, authButtonLabel, activeItem = '' }: HomeSideDockProps) => {
  const [sidebarState, setSidebarState] = useState<SidebarState>(readInitialState);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const dockStyle = { ...defaultDockStyle, ...((settings.content as any).dockStyle || {}) };
  const showLabels = dockStyle.showLabels !== false;
  const showBadges = dockStyle.showBadges !== false;
  const expandedWidth = clamp(dockStyle.desktopExpandedWidth, 260, 380, defaultDockStyle.desktopExpandedWidth);
  const collapsedWidth = clamp(dockStyle.desktopCollapsedWidth, 72, 108, defaultDockStyle.desktopCollapsedWidth);
  const iconSize = clamp(dockStyle.iconSize, 28, 52, defaultDockStyle.iconSize);
  const labelSize = clamp(dockStyle.labelSize, 9, 16, defaultDockStyle.labelSize);
  const padding = clamp(dockStyle.padding, 8, 22, defaultDockStyle.padding);
  const gap = clamp(dockStyle.gap, 4, 20, defaultDockStyle.gap);
  const radius = clamp(dockStyle.radius, 0, 40, defaultDockStyle.radius);
  const itemRadius = clamp(dockStyle.itemRadius, 0, 28, defaultDockStyle.itemRadius);
  const blur = clamp(dockStyle.blur, 0, 36, defaultDockStyle.blur);
  const backgroundColor = hexToRgba(dockStyle.backgroundColor, dockStyle.backgroundOpacity);
  const itemColor = hexToRgba(dockStyle.itemColor, dockStyle.itemOpacity);
  const accentColor = /^#[0-9a-f]{6}$/i.test(dockStyle.accentColor || '') ? dockStyle.accentColor : defaultDockStyle.accentColor;
  const textColor = /^#[0-9a-f]{6}$/i.test(dockStyle.textColor || '') ? dockStyle.textColor : defaultDockStyle.textColor;
  const borderColor = /^#[0-9a-f]{6}$/i.test(dockStyle.borderColor || '') ? dockStyle.borderColor : defaultDockStyle.borderColor;
  const shadowStrength = dockStyle.shadowStrength === 'none' || dockStyle.shadowStrength === 'strong' ? dockStyle.shadowStrength : 'soft';

  const isVisuallyExpanded = showLabels && (sidebarState === 'expanded' || (sidebarState === 'collapsed' && hoverExpanded));
  const layoutWidth = sidebarState === 'hidden' ? 0 : isVisuallyExpanded ? expandedWidth : collapsedWidth;
  const visualWidth = isVisuallyExpanded ? expandedWidth : collapsedWidth;

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STATE_KEY, sidebarState);
    } catch {
      // Persistence is optional.
    }
  }, [sidebarState]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--desktop-site-sidebar-offset', `${layoutWidth}px`);
    return () => root.style.removeProperty('--desktop-site-sidebar-offset');
  }, [layoutWidth]);

  const setPersistentState = (nextState: SidebarState) => {
    setHoverExpanded(false);
    setSidebarState(nextState);
  };

  const profileItem: NavigationItem = {
    id: 'Profile',
    label: isLoggedIn ? 'Profile' : authButtonLabel,
    icon: isLoggedIn ? '🪙' : '🔐',
    badge: null,
    action: onProfileClick,
  };

  const defaultItems: NavigationItem[] = [
    { id: 'Home', label: 'Home', action: onHomeClick, icon: '🏠', badge: null },
    { id: 'Store', label: 'Store', action: onNavigateToAllProducts, icon: '🛍️', badge: dockBadgeCounts.Store || null },
    { id: 'Purchased', label: 'Purchased', action: onNavigateToPurchases, icon: '📚', badge: (dockBadgeCounts.Purchased ?? purchasedProducts.length) || null },
    { id: 'Wishlist', label: 'Wishlist', action: onNavigateToWishlist, icon: '❤️', badge: (dockBadgeCounts.Wishlist ?? wishlistCount) || null },
    { id: 'Cart', label: 'Cart', action: onCartClick, icon: '🛒', badge: (dockBadgeCounts.Cart ?? cartCount) || null },
    { id: 'News', label: 'News', action: onOpenAnnouncementsModal, icon: '📢', badge: dockBadgeCounts.News || null },
    ...(onOpenCommunity ? [{ id: 'Community', label: 'Community', action: onOpenCommunity, icon: '💬', badge: null }] : []),
    { id: 'Blog', label: 'Blog', action: onOpenBlogModal, icon: '📝', badge: dockBadgeCounts.Blog || null },
    { id: 'Free', label: 'Free', action: onOpenFreeModal, icon: '🎁', badge: dockBadgeCounts.Free || null },
    profileItem,
    { id: 'Subscriptions', label: 'Subscriptions', action: onSubscriptionClick, icon: '💎', badge: null },
  ];

  const configuredBase = ((settings.content as any).dockItems || dockCustomizationItems) as string[];
  const configuredWithHome = configuredBase.includes('Home') ? configuredBase : ['Home', ...configuredBase];
  const configuredItems = configuredWithHome.filter((label, index, labels) => labels.indexOf(label) === index);
  const itemMap = Object.fromEntries(defaultItems.map(item => [item.id, item])) as Record<string, NavigationItem>;
  itemMap.EduCoins = profileItem;
  itemMap.Purchases = itemMap.Purchased;
  const items = configuredItems.map(label => itemMap[label]).filter((item): item is NavigationItem => Boolean(item));
  const siteName = String((settings.content as any).siteName || 'Digital Catalyst');
  const logoUrl = String((settings.content as any).logoUrl || '/icons/icon-192x192.svg');

  if (sidebarState === 'hidden') {
    return (
      <button
        type="button"
        onClick={() => setPersistentState('expanded')}
        className="fixed left-3 top-24 z-[80] hidden items-center justify-center border bg-white/95 font-black transition hover:-translate-y-0.5 lg:flex"
        style={{ width: collapsedWidth - 16, height: collapsedWidth - 16, borderColor, borderRadius: itemRadius, color: accentColor, boxShadow: dockShadowMap[shadowStrength] }}
        aria-label="Open desktop navigation"
        title="Open navigation"
      >
        ☰
      </button>
    );
  }

  return (
    <aside
      className="home-side-dock-performance fixed inset-y-0 left-0 z-[80] hidden overflow-visible bg-transparent transition-[width] duration-150 ease-out lg:flex"
      style={{ width: visualWidth, padding: Math.max(6, padding - 4) }}
      data-sidebar-state={sidebarState}
      data-hover-expanded={hoverExpanded ? 'true' : 'false'}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse' && sidebarState === 'collapsed' && showLabels) setHoverExpanded(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse' && sidebarState === 'collapsed') setHoverExpanded(false);
      }}
      aria-label="Main desktop navigation"
    >
      <div
        className="home-side-dock-surface flex h-full w-full min-w-0 flex-col overflow-hidden border"
        style={{ backgroundColor, borderColor, borderRadius: radius, boxShadow: dockShadowMap[shadowStrength], backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)` }}
      >
        <div className="shrink-0 border-b" style={{ borderColor, padding }}>
          <div className={`flex min-w-0 items-center ${isVisuallyExpanded ? 'justify-between' : 'flex-col'} `} style={{ gap }}>
            <button type="button" onClick={onHomeClick} className="flex min-w-0 items-center" style={{ gap }} aria-label="Go to homepage">
              <img src={logoUrl} alt="Digital Catalyst logo" className="shrink-0 border bg-white object-cover shadow-sm" style={{ width: iconSize + 8, height: iconSize + 8, borderColor, borderRadius: itemRadius }} />
              {isVisuallyExpanded && (
                <span className="min-w-0 text-left">
                  <span className="block truncate font-black tracking-tight" style={{ color: textColor, fontSize: labelSize + 5 }}>{siteName}</span>
                  <span className="block truncate text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: textColor, opacity: 0.62 }}>Learning workspace</span>
                </span>
              )}
            </button>

            <div className={`flex shrink-0 items-center ${isVisuallyExpanded ? '' : 'w-full justify-center'}`} style={{ gap: Math.max(4, gap / 2) }}>
              {showLabels && (
                <button type="button" onClick={() => setPersistentState(sidebarState === 'collapsed' ? 'expanded' : 'collapsed')} className="flex items-center justify-center border bg-white/90 font-black transition hover:opacity-80" style={{ width: 32, height: 32, borderColor, borderRadius: Math.max(4, itemRadius - 4), color: accentColor }} aria-label={sidebarState === 'collapsed' ? 'Keep side panel expanded' : 'Minimize side panel'} title={sidebarState === 'collapsed' ? 'Keep expanded' : 'Minimize'}>{sidebarState === 'collapsed' ? '›' : '‹'}</button>
              )}
              <button type="button" onClick={() => setPersistentState('hidden')} className="flex items-center justify-center border bg-white/90 font-black transition hover:border-red-200 hover:bg-red-50 hover:text-red-600" style={{ width: 32, height: 32, borderColor, borderRadius: Math.max(4, itemRadius - 4), color: textColor }} aria-label="Hide side panel and disable hover expansion" title="Hide panel">×</button>
            </div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto custom-scrollbar" style={{ padding, display: 'flex', flexDirection: 'column', gap }} aria-label="Website sections">
          {items.map(item => {
            const isActive = activeItem === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                title={!isVisuallyExpanded ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`group relative flex w-full items-center border transition-colors duration-150 ${isVisuallyExpanded ? 'text-left' : 'justify-center'}`}
                style={{
                  gap,
                  padding: isVisuallyExpanded ? `${Math.max(8, padding - 4)}px` : `${Math.max(6, padding - 6)}px`,
                  minHeight: Math.max(50, iconSize + 14),
                  borderColor: isActive ? accentColor : borderColor,
                  borderRadius: itemRadius,
                  color: isActive ? '#FFFFFF' : textColor,
                  background: isActive ? accentColor : itemColor,
                  boxShadow: isActive ? `0 8px 18px ${hexToRgba(accentColor, 22)}` : 'none',
                }}
              >
                <span className="relative flex shrink-0 items-center justify-center border bg-white/95 shadow-inner" style={{ width: iconSize, height: iconSize, borderColor, borderRadius: Math.max(4, itemRadius - 4), fontSize: Math.max(16, iconSize * 0.52) }}>{item.icon}</span>
                {isVisuallyExpanded && <span className="min-w-0 flex-1 truncate font-black tracking-wide" style={{ fontSize: labelSize }}>{item.label}</span>}
                {showBadges && item.badge ? <span className={`${isVisuallyExpanded ? 'relative' : 'absolute -right-0.5 -top-0.5'} inline-flex min-w-5 items-center justify-center rounded-full border border-white px-1.5 py-0.5 text-[10px] font-black leading-none text-white shadow-sm`} style={{ backgroundColor: accentColor }}>{item.badge > 99 ? '99+' : item.badge}</span> : null}
              </button>
            );
          })}
        </nav>

        {isVisuallyExpanded && (
          <div className="shrink-0 border-t" style={{ borderColor, padding }}>
            <div className="border px-3 py-2.5" style={{ backgroundColor: hexToRgba(accentColor, 8), borderColor, borderRadius: itemRadius }}>
              <p className="text-xs font-black" style={{ color: textColor }}>Desktop navigation</p>
              <p className="mt-0.5 text-[10px] leading-4" style={{ color: textColor, opacity: 0.68 }}>Minimize for icons, hover to preview, or hide the panel completely.</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default HomeSideDock;
