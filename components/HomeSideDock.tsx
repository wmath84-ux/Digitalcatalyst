import React, { useEffect, useRef, useState } from 'react';
import type { ProductWithRating, WebsiteSettings } from '../App';
import type { DockCountDestination } from '../utils/dockNewContent';
import { defaultDockStyle, dockCustomizationItems, dockShadowMap, hexToRgba } from './BottomGlassDock';
import ProfessionalIcon from './common/ProfessionalIcon';
import type { CleanNeutralIconSlotId, ProfessionalIconName } from '../utils/cleanNeutralAdvancedCustomizer';

export type DesktopSidebarCommand = 'preview-start' | 'preview-end' | 'pin' | 'hide';

export const DESKTOP_SIDEBAR_COMMAND_EVENT = 'digital-catalyst:desktop-sidebar-command';

export const dispatchDesktopSidebarCommand = (command: DesktopSidebarCommand) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DESKTOP_SIDEBAR_COMMAND_EVENT, { detail: { command } }));
};

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
  onOpenMayDay?: () => void;
  onOpenCommunity?: () => void;
  authButtonLabel: string;
  settings: WebsiteSettings;
  activeItem?: string;
  showDetachedTrigger?: boolean;
  overlayMode?: boolean;
  openExpandedOnMount?: boolean;
  elevatedLayer?: boolean;
  detachedTriggerPlacement?: 'default' | 'top-left';
  onStateChange?: (state: DesktopSidebarState) => void;
}

export type DesktopSidebarState = 'expanded' | 'collapsed' | 'hidden';

type NavigationItem = {
  id: string;
  label: string;
  icon: ProfessionalIconName;
  slot: CleanNeutralIconSlotId;
  badge: number | null;
  action: () => void;
};

const SIDEBAR_STATE_KEY = 'digitalCatalystDesktopSidebarState';

export const readDesktopSidebarState = (): DesktopSidebarState => {
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

const HomeSideDock = ({ settings, isLoggedIn, purchasedProducts, cartCount, wishlistCount, dockBadgeCounts = {}, onHomeClick, onOpenBlogModal, onOpenFreeModal, onOpenAnnouncementsModal, onNavigateToAllProducts, onNavigateToWishlist, onNavigateToPurchases, onCartClick, onProfileClick, onSubscriptionClick, onOpenMayDay, onOpenCommunity, authButtonLabel, activeItem = '', showDetachedTrigger = true, overlayMode = false, openExpandedOnMount = false, elevatedLayer = false, detachedTriggerPlacement = 'default', onStateChange }: HomeSideDockProps) => {
  const [sidebarState, setSidebarState] = useState<DesktopSidebarState>(() => openExpandedOnMount ? 'expanded' : readDesktopSidebarState());
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const hoverCloseTimerRef = useRef<number | null>(null);
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
  const sidebarBackgroundSource = String((dockStyle as any).sidebarBackgroundColor || dockStyle.backgroundColor || defaultDockStyle.sidebarBackgroundColor);
  const sidebarBackgroundColor = /^#[0-9a-f]{6}$/i.test(sidebarBackgroundSource) ? sidebarBackgroundSource : defaultDockStyle.sidebarBackgroundColor;
  const sidebarBackgroundOpacity = clamp((dockStyle as any).sidebarBackgroundOpacity, 20, 100, defaultDockStyle.sidebarBackgroundOpacity);
  const sidebarTextSource = String((dockStyle as any).sidebarTextColor || dockStyle.textColor || defaultDockStyle.sidebarTextColor);
  const sidebarTextBaseColor = /^#[0-9a-f]{6}$/i.test(sidebarTextSource) ? sidebarTextSource : defaultDockStyle.sidebarTextColor;
  const sidebarTextOpacity = clamp((dockStyle as any).sidebarTextOpacity, 35, 100, defaultDockStyle.sidebarTextOpacity);
  const sidebarTextColor = hexToRgba(sidebarTextBaseColor, sidebarTextOpacity);
  const sidebarBorderSource = String((dockStyle as any).sidebarBorderColor || dockStyle.borderColor || defaultDockStyle.sidebarBorderColor);
  const sidebarBorderColor = /^#[0-9a-f]{6}$/i.test(sidebarBorderSource) ? sidebarBorderSource : defaultDockStyle.sidebarBorderColor;
  const sidebarSurfaceColor = hexToRgba(sidebarBackgroundColor, sidebarBackgroundOpacity);
  const shadowStrength = dockStyle.shadowStrength === 'none' || dockStyle.shadowStrength === 'strong' ? dockStyle.shadowStrength : 'soft';
  const sidebarFontOptions: Record<string, string> = {
    Inter: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    Lato: 'Lato, Inter, ui-sans-serif, system-ui, sans-serif',
    Montserrat: 'Montserrat, Inter, ui-sans-serif, system-ui, sans-serif',
    Roboto: 'Roboto, Inter, ui-sans-serif, system-ui, sans-serif',
    Merriweather: 'Merriweather, Georgia, serif',
    Oswald: 'Oswald, Inter, ui-sans-serif, system-ui, sans-serif',
  };
  const sidebarFontFamily = sidebarFontOptions[String((dockStyle as any).sidebarFontFamily || 'Inter')] || sidebarFontOptions.Inter;

  const isTemporaryPreview = hoverExpanded && (sidebarState === 'collapsed' || sidebarState === 'hidden');
  const isVisuallyExpanded = showLabels && (sidebarState === 'expanded' || isTemporaryPreview);
  const isPanelVisible = sidebarState !== 'hidden' || hoverExpanded;
  const layoutWidth = sidebarState === 'expanded' ? expandedWidth : sidebarState === 'collapsed' ? collapsedWidth : 0;
  const visualWidth = isVisuallyExpanded ? expandedWidth : collapsedWidth;

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STATE_KEY, sidebarState);
    } catch {
      // Persistence is optional.
    }
    onStateChange?.(sidebarState);
  }, [onStateChange, sidebarState]);

  useEffect(() => {
    if (overlayMode) return undefined;
    const root = document.documentElement;
    root.style.setProperty('--desktop-site-sidebar-offset', `${layoutWidth}px`);
    return () => root.style.removeProperty('--desktop-site-sidebar-offset');
  }, [layoutWidth, overlayMode]);

  const cancelHoverClose = () => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  };

  const beginHoverPreview = (pointerType: string) => {
    if (pointerType !== 'mouse' || sidebarState === 'expanded' || !showLabels) return;
    cancelHoverClose();
    setHoverExpanded(true);
  };

  const scheduleHoverClose = (pointerType: string) => {
    if (pointerType !== 'mouse' || sidebarState === 'expanded') return;
    cancelHoverClose();
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setHoverExpanded(false);
      hoverCloseTimerRef.current = null;
    }, 140);
  };

  useEffect(() => () => cancelHoverClose(), []);

  const setPersistentState = (nextState: DesktopSidebarState) => {
    cancelHoverClose();
    setHoverExpanded(false);
    setSidebarState(nextState);
  };

  const runNavigationAction = (action: () => void) => {
    cancelHoverClose();
    setHoverExpanded(false);
    action();
  };

  useEffect(() => {
    const handleExternalCommand = (event: Event) => {
      const command = (event as CustomEvent<{ command?: DesktopSidebarCommand }>).detail?.command;
      if (command === 'preview-start') beginHoverPreview('mouse');
      if (command === 'preview-end') scheduleHoverClose('mouse');
      if (command === 'pin') setPersistentState('expanded');
      if (command === 'hide') setPersistentState('hidden');
    };

    window.addEventListener(DESKTOP_SIDEBAR_COMMAND_EVENT, handleExternalCommand);
    return () => window.removeEventListener(DESKTOP_SIDEBAR_COMMAND_EVENT, handleExternalCommand);
  }, [sidebarState, showLabels]);

  const profileItem: NavigationItem = {
    id: 'Profile',
    label: isLoggedIn ? 'Profile' : authButtonLabel,
    icon: isLoggedIn ? 'user' : 'lock',
    slot: isLoggedIn ? 'nav.profile' : 'nav.login',
    badge: null,
    action: onProfileClick,
  };

  const defaultItems: NavigationItem[] = [
    ...(onOpenMayDay ? [{ id: 'May Day', label: 'May Day', action: onOpenMayDay, icon: 'calendar' as ProfessionalIconName, slot: 'nav.mayDay' as CleanNeutralIconSlotId, badge: null }] : []),
    { id: 'Home', label: 'Home', action: onHomeClick, icon: 'home', slot: 'nav.home', badge: null },
    { id: 'Store', label: 'Store', action: onNavigateToAllProducts, icon: 'store', slot: 'nav.store', badge: dockBadgeCounts.Store || null },
    { id: 'Purchased', label: 'Purchased', action: onNavigateToPurchases, icon: 'book-open', slot: 'nav.purchased', badge: (dockBadgeCounts.Purchased ?? purchasedProducts.length) || null },
    { id: 'Wishlist', label: 'Wishlist', action: onNavigateToWishlist, icon: 'heart', slot: 'nav.wishlist', badge: (dockBadgeCounts.Wishlist ?? wishlistCount) || null },
    { id: 'Cart', label: 'Cart', action: onCartClick, icon: 'shopping-cart', slot: 'nav.cart', badge: (dockBadgeCounts.Cart ?? cartCount) || null },
    { id: 'News', label: 'News', action: onOpenAnnouncementsModal, icon: 'megaphone', slot: 'nav.news', badge: dockBadgeCounts.News || null },
    ...(onOpenCommunity ? [{ id: 'Community', label: 'Community', action: onOpenCommunity, icon: 'message-circle' as ProfessionalIconName, slot: 'nav.community' as CleanNeutralIconSlotId, badge: null }] : []),
    { id: 'Blog', label: 'Blog', action: onOpenBlogModal, icon: 'file-text', slot: 'nav.blog', badge: dockBadgeCounts.Blog || null },
    { id: 'Free', label: 'Free', action: onOpenFreeModal, icon: 'gift', slot: 'nav.free', badge: dockBadgeCounts.Free || null },
    profileItem,
    { id: 'Subscriptions', label: 'Subscriptions', action: onSubscriptionClick, icon: 'gem', slot: 'nav.subscriptions', badge: null },
  ];

  const configuredBase = ((settings.content as any).dockItems || dockCustomizationItems) as string[];
  const configuredWithHome = configuredBase.includes('Home') ? configuredBase : ['Home', ...configuredBase];
  const configuredWithMayDay = onOpenMayDay ? ['May Day', ...configuredWithHome.filter(label => label !== 'May Day')] : configuredWithHome;
  const configuredItems = configuredWithMayDay.filter((label, index, labels) => labels.indexOf(label) === index);
  const itemMap = Object.fromEntries(defaultItems.map(item => [item.id, item])) as Record<string, NavigationItem>;
  itemMap.EduCoins = profileItem;
  itemMap.Purchases = itemMap.Purchased;
  const items = configuredItems.map(label => itemMap[label]).filter((item): item is NavigationItem => Boolean(item));
  const siteName = String((settings.content as any).siteName || 'Digital Catalyst');
  const logoUrl = String((settings.content as any).logoUrl || '/icons/icon-192x192.svg');

  return (
    <>
      {showDetachedTrigger && sidebarState === 'hidden' && (
        <button
          type="button"
          onClick={() => setPersistentState('expanded')}
          onPointerEnter={(event) => { if (event.pointerType === 'mouse') beginHoverPreview(event.pointerType); }}
          onPointerLeave={(event) => { if (event.pointerType === 'mouse') scheduleHoverClose(event.pointerType); }}
          className={`fixed left-3 ${detachedTriggerPlacement === 'top-left' ? 'top-3 z-[1700]' : 'top-24 z-[81]'} hidden items-center justify-center border bg-white/95 font-black transition hover:-translate-y-0.5 lg:flex ${hoverExpanded ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          style={{ width: collapsedWidth - 16, height: collapsedWidth - 16, borderColor, borderRadius: itemRadius, color: accentColor, boxShadow: dockShadowMap[shadowStrength] }}
          aria-label="Preview or pin desktop navigation"
          title="Hover to preview · click to keep open"
        >
          <ProfessionalIcon slot="nav.menu" fallbackName="menu" label="Open navigation" size={24} />
        </button>
      )}

      <aside
        className={`home-side-dock-performance fixed inset-y-0 left-0 ${overlayMode || elevatedLayer ? 'z-[1600]' : 'z-[80]'} hidden overflow-visible bg-transparent transition-[width,transform,opacity] duration-150 ease-out lg:flex ${isPanelVisible ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-[calc(100%+1rem)] opacity-0'}`}
        style={{ width: visualWidth, padding: Math.max(6, padding - 4) }}
        data-sidebar-state={sidebarState}
        data-hover-expanded={hoverExpanded ? 'true' : 'false'}
        data-temporary-preview={isTemporaryPreview ? 'true' : 'false'}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') beginHoverPreview(event.pointerType); }}
        onPointerLeave={(event) => { if (event.pointerType === 'mouse') scheduleHoverClose(event.pointerType); }}
        aria-label="Main desktop navigation"
        data-clean-neutral-region="shell.sidebar"
      >
      <div
        className="home-side-dock-surface flex h-full w-full min-w-0 flex-col overflow-hidden border"
        style={{ backgroundColor: sidebarSurfaceColor, borderColor: sidebarBorderColor, borderRadius: radius, boxShadow: dockShadowMap[shadowStrength], backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`, fontFamily: sidebarFontFamily }}
      >
        <div className="shrink-0 border-b" style={{ borderColor: sidebarBorderColor, padding }}>
          <div className={`flex min-w-0 items-center ${isVisuallyExpanded ? 'justify-between' : 'flex-col'} `} style={{ gap }}>
            <button type="button" onClick={() => runNavigationAction(onHomeClick)} className="flex min-w-0 items-center" style={{ gap }} aria-label="Go to homepage">
              <img src={logoUrl} alt="Digital Catalyst logo" className="shrink-0 border bg-white object-cover shadow-sm" style={{ width: iconSize + 8, height: iconSize + 8, borderColor, borderRadius: itemRadius }} />
              {isVisuallyExpanded && (
                <span className="min-w-0 text-left">
                  <span className="block truncate font-black tracking-tight" style={{ color: sidebarTextColor, fontSize: labelSize + 5 }}>{siteName}</span>
                  <span className="block truncate text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: sidebarTextColor, opacity: 0.62 }}>Learning workspace</span>
                </span>
              )}
            </button>

            <div className={`flex shrink-0 items-center ${isVisuallyExpanded ? '' : 'w-full justify-center'}`} style={{ gap: Math.max(4, gap / 2) }}>
              {showLabels && (
                <button type="button" onClick={() => setPersistentState(sidebarState === 'expanded' ? 'collapsed' : 'expanded')} className="flex items-center justify-center border bg-white/90 font-black transition hover:opacity-80" style={{ width: 32, height: 32, borderColor, borderRadius: Math.max(4, itemRadius - 4), color: accentColor }} aria-label={sidebarState === 'expanded' ? 'Minimize side panel' : 'Pin side panel open'} title={sidebarState === 'expanded' ? 'Minimize' : 'Pin open'}>{sidebarState === 'expanded' ? <ProfessionalIcon slot="nav.menu" fallbackName="minus" label="Minimize" size={18} /> : <ProfessionalIcon slot="nav.pin" fallbackName="pin" label="Pin open" size={18} />}</button>
              )}
              <button type="button" onClick={() => setPersistentState('hidden')} className="flex items-center justify-center border bg-white/90 font-black transition hover:border-red-200 hover:bg-red-50 hover:text-red-600" style={{ width: 32, height: 32, borderColor: sidebarBorderColor, borderRadius: Math.max(4, itemRadius - 4), color: sidebarTextColor }} aria-label="Hide side panel and disable hover expansion" title="Hide panel">×</button>
            </div>
          </div>
        </div>

        <nav data-clean-neutral-region="shell.navigation" className="min-h-0 flex-1 overflow-y-auto custom-scrollbar" style={{ padding, display: 'flex', flexDirection: 'column', gap }} aria-label="Website sections">
          {items.map(item => {
            const isActive = activeItem === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => runNavigationAction(item.action)}
                title={!isVisuallyExpanded ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`group relative flex w-full items-center border transition-colors duration-150 ${isVisuallyExpanded ? 'text-left' : 'justify-center'}`}
                style={{
                  gap,
                  padding: isVisuallyExpanded ? `${Math.max(8, padding - 4)}px` : `${Math.max(6, padding - 6)}px`,
                  minHeight: Math.max(50, iconSize + 14),
                  borderColor: isActive ? accentColor : borderColor,
                  borderRadius: itemRadius,
                  color: isActive ? '#FFFFFF' : sidebarTextColor,
                  background: isActive ? accentColor : itemColor,
                  boxShadow: isActive ? `0 8px 18px ${hexToRgba(accentColor, 22)}` : 'none',
                }}
              >
                <ProfessionalIcon
                  slot={item.slot}
                  fallbackName={item.icon}
                  label={item.label}
                  defaultDisplayMode={isVisuallyExpanded ? 'icon-with-text' : 'icon-only'}
                  defaultPosition="left"
                  size={Math.max(18, iconSize * 0.58)}
                  color={isActive ? '#FFFFFF' : sidebarTextColor}
                  className={isVisuallyExpanded ? 'min-w-0 flex-1 justify-start' : ''}
                  iconClassName="relative flex shrink-0 items-center justify-center border bg-white/95 shadow-inner"
                  iconStyle={{ width: iconSize, height: iconSize, borderColor, borderRadius: Math.max(4, itemRadius - 4), color: isActive ? accentColor : sidebarTextColor }}
                  labelClassName="min-w-0 flex-1 truncate font-black tracking-wide"
                  labelStyle={{ fontSize: labelSize }}
                />
                {showBadges && item.badge ? <span className={`${isVisuallyExpanded ? 'relative' : 'absolute -right-0.5 -top-0.5'} inline-flex min-w-5 items-center justify-center rounded-full border border-white px-1.5 py-0.5 text-[10px] font-black leading-none text-white shadow-sm`} style={{ backgroundColor: accentColor }}>{item.badge > 99 ? '99+' : item.badge}</span> : null}
              </button>
            );
          })}
        </nav>

        {isVisuallyExpanded && (
          <div className="shrink-0 border-t" style={{ borderColor, padding }}>
            <div className="border px-3 py-2.5" style={{ backgroundColor: hexToRgba(accentColor, 8), borderColor, borderRadius: itemRadius }}>
              <p className="text-xs font-black" style={{ color: sidebarTextColor }}>Desktop navigation</p>
              <p className="mt-0.5 text-[10px] leading-4" style={{ color: sidebarTextColor, opacity: 0.68 }}>Minimize for icons, hover to preview, pin it open, or close to the menu trigger.</p>
            </div>
          </div>
        )}
      </div>
      </aside>
    </>
  );
};

export default HomeSideDock;
