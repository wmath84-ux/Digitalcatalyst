import React, { useEffect, useState } from 'react';
import type { ProductWithRating, WebsiteSettings } from '../App';
import { defaultDockStyle, dockCustomizationItems } from './BottomGlassDock';

interface HomeSideDockProps {
  isLoggedIn: boolean;
  purchasedProducts: ProductWithRating[];
  cartCount: number;
  wishlistCount: number;
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
const EXPANDED_WIDTH = 320;
const COLLAPSED_WIDTH = 88;

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

const clampPercent = (value: unknown, fallback: number) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, number));
};

const HomeSideDock: React.FC<HomeSideDockProps> = ({
  settings,
  isLoggedIn,
  purchasedProducts,
  cartCount,
  wishlistCount,
  onHomeClick,
  onOpenBlogModal,
  onOpenFreeModal,
  onOpenAnnouncementsModal,
  onNavigateToAllProducts,
  onNavigateToWishlist,
  onNavigateToPurchases,
  onCartClick,
  onProfileClick,
  onSubscriptionClick,
  onOpenCommunity,
  authButtonLabel,
  activeItem = '',
}) => {
  const [sidebarState, setSidebarState] = useState<SidebarState>(readInitialState);
  const [hoverExpanded, setHoverExpanded] = useState(false);

  const isVisuallyExpanded =
    sidebarState === 'expanded' ||
    (sidebarState === 'collapsed' && hoverExpanded);

  const layoutWidth =
    sidebarState === 'expanded'
      ? EXPANDED_WIDTH
      : sidebarState === 'collapsed'
        ? COLLAPSED_WIDTH
        : 0;

  const visualWidth = isVisuallyExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

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
    { id: 'Store', label: 'Store', action: onNavigateToAllProducts, icon: '🛍️', badge: null },
    { id: 'Purchases', label: 'Purchases', action: onNavigateToPurchases, icon: '📚', badge: purchasedProducts.length || null },
    { id: 'Wishlist', label: 'Wishlist', action: onNavigateToWishlist, icon: '❤️', badge: wishlistCount || null },
    { id: 'Cart', label: 'Cart', action: onCartClick, icon: '🛒', badge: cartCount || null },
    { id: 'News', label: 'News', action: onOpenAnnouncementsModal, icon: '📢', badge: null },
    ...(onOpenCommunity
      ? [{ id: 'Community', label: 'Community', action: onOpenCommunity, icon: '💬', badge: null }]
      : []),
    { id: 'Blog', label: 'Blog', action: onOpenBlogModal, icon: '📝', badge: null },
    { id: 'Free', label: 'Free', action: onOpenFreeModal, icon: '🎁', badge: null },
    profileItem,
    { id: 'Subscriptions', label: 'Subscriptions', action: onSubscriptionClick, icon: '💎', badge: null },
  ];

  const configuredBase =
    ((settings.content as any).dockItems || dockCustomizationItems) as string[];

  const configuredWithHome = configuredBase.includes('Home')
    ? configuredBase
    : ['Home', ...configuredBase];

  const configuredItems = configuredWithHome.filter(
    (label, index, labels) => labels.indexOf(label) === index,
  );

  const itemMap = Object.fromEntries(
    defaultItems.map(item => [item.id, item]),
  ) as Record<string, NavigationItem>;

  itemMap.EduCoins = profileItem;

  const items = configuredItems
    .map(label => itemMap[label])
    .filter((item): item is NavigationItem => Boolean(item));

  const dockStyle = {
    ...defaultDockStyle,
    ...((settings.content as any).dockStyle || {}),
  };

  const tileOpacity =
    clampPercent(dockStyle.itemOpacity, defaultDockStyle.itemOpacity) / 100;

  const siteName = String(
    (settings.content as any).siteName || 'Digital Catalyst',
  );

  const logoUrl = String(
    (settings.content as any).logoUrl || '/icons/icon-192x192.svg',
  );

  if (sidebarState === 'hidden') {
    return (
      <button
        type="button"
        onClick={() => setPersistentState('expanded')}
        className="fixed left-3 top-24 z-[80] hidden h-12 w-12 items-center justify-center rounded-2xl border border-[#BFD7FF] bg-white/95 text-xl font-black text-[#1769FF] shadow-[0_14px_36px_rgba(23,105,255,0.22)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-[#EEF6FF] lg:flex"
        aria-label="Open desktop navigation"
        title="Open navigation"
      >
        ☰
      </button>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 z-[80] hidden overflow-visible bg-[var(--color-background)] p-2 transition-[width] duration-300 ease-out lg:flex"
      style={{ width: visualWidth }}
      data-sidebar-state={sidebarState}
      data-hover-expanded={hoverExpanded ? 'true' : 'false'}
      onPointerEnter={() => {
        if (sidebarState === 'collapsed') setHoverExpanded(true);
      }}
      onPointerLeave={() => {
        if (sidebarState === 'collapsed') setHoverExpanded(false);
      }}
      aria-label="Main desktop navigation"
    >
      <div
        className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-[#DDE5EF] bg-[var(--color-background)] shadow-[0_18px_48px_rgba(8,26,69,0.08)]"
      >
        <div className={`shrink-0 border-b border-[#D9E7F8] p-3 ${isVisuallyExpanded ? '' : 'flex flex-col items-center'}`}>
          <div className={`flex min-w-0 items-center ${isVisuallyExpanded ? 'justify-between gap-3' : 'flex-col gap-2'}`}>
            <button
              type="button"
              onClick={onHomeClick}
              className="flex min-w-0 items-center gap-3"
              aria-label="Go to homepage"
            >
              <img
                src={logoUrl}
                alt="Digital Catalyst logo"
                className="h-11 w-11 shrink-0 rounded-2xl border border-[#BFD7FF] bg-white object-cover shadow-sm"
              />

              {isVisuallyExpanded && (
                <span className="min-w-0 text-left">
                  <span className="block truncate text-lg font-black tracking-tight text-[#081A45]">
                    {siteName}
                  </span>
                  <span className="block truncate text-[10px] font-black uppercase tracking-[0.18em] text-[#7C879A]">
                    Learning workspace
                  </span>
                </span>
              )}
            </button>

            <div className={`flex shrink-0 items-center ${isVisuallyExpanded ? 'gap-1.5' : 'w-full justify-center gap-1'}`}>
              <button
                type="button"
                onClick={() =>
                  setPersistentState(
                    sidebarState === 'collapsed' ? 'expanded' : 'collapsed',
                  )
                }
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#D9E7F8] bg-white/90 text-base font-black text-[#1769FF] transition hover:bg-[#E8F2FF]"
                aria-label={
                  sidebarState === 'collapsed'
                    ? 'Keep side panel expanded'
                    : 'Minimize side panel'
                }
                title={sidebarState === 'collapsed' ? 'Keep expanded' : 'Minimize'}
              >
                {sidebarState === 'collapsed' ? '›' : '‹'}
              </button>

              <button
                type="button"
                onClick={() => setPersistentState('hidden')}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#D9E7F8] bg-white/90 text-base font-black text-[#536178] transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                aria-label="Hide side panel and disable hover expansion"
                title="Hide panel"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <nav
          className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 py-3 custom-scrollbar"
          aria-label="Website sections"
        >
          {items.map(item => {
            const isActive = activeItem === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                title={!isVisuallyExpanded ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`group relative flex min-h-[54px] w-full items-center rounded-2xl border transition-all duration-200 ${
                  isVisuallyExpanded
                    ? 'gap-3 px-3 text-left'
                    : 'justify-center px-2'
                } ${
                  isActive
                    ? 'border-transparent bg-gradient-to-r from-[#1769FF] to-[#7B61FF] text-white shadow-[0_12px_28px_rgba(23,105,255,0.24)]'
                    : 'border-[#D9E7F8] text-[#536178] shadow-[0_6px_18px_rgba(8,26,69,0.05)] hover:-translate-y-0.5 hover:border-[#BFD7FF] hover:bg-[#EEF6FF] hover:text-[#1769FF]'
                }`}
                style={
                  !isActive
                    ? {
                        backgroundColor: `rgba(255,255,255,${Math.max(
                          0.72,
                          tileOpacity,
                        )})`,
                      }
                    : undefined
                }
              >
                <span
                  className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-xl shadow-inner ${
                    isActive
                      ? 'border-white/30 bg-white/95'
                      : 'border-[#D9E7F8] bg-white'
                  }`}
                >
                  {item.icon}
                </span>

                {isVisuallyExpanded && (
                  <span className="min-w-0 flex-1 truncate text-sm font-black tracking-wide">
                    {item.label}
                  </span>
                )}

                {item.badge ? (
                  <span
                    className={`${
                      isVisuallyExpanded
                        ? 'relative'
                        : 'absolute -right-0.5 -top-0.5'
                    } inline-flex min-w-5 items-center justify-center rounded-full border border-white bg-[#1769FF] px-1.5 py-0.5 text-[10px] font-black leading-none text-white shadow-sm`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-[#D9E7F8] p-3">
          {isVisuallyExpanded ? (
            <div className="rounded-2xl border border-[#D9E7F8] bg-[#EEF6FF]/90 px-3 py-2.5">
              <p className="text-xs font-black text-[#081A45]">
                Desktop navigation
              </p>
              <p className="mt-0.5 text-[10px] leading-4 text-[#7C879A]">
                Minimize for icons, then hover to preview. The × button fully
                hides hover expansion.
              </p>
            </div>
          ) : (
            <div className="mx-auto h-2 w-2 rounded-full bg-gradient-to-r from-[#1769FF] to-[#7B61FF] shadow-[0_0_14px_rgba(23,105,255,0.55)]" />
          )}
        </div>
      </div>
    </aside>
  );
};

export default HomeSideDock;
