import React, { useEffect, useMemo, useRef } from 'react';
import type { ProductWithRating, User, WebsiteSettings } from '../App';
import type { DockCountDestination } from '../utils/dockNewContent';

interface BottomGlassDockProps {
  currentUser: User | null;
  isLoggedIn: boolean;
  purchasedProducts: ProductWithRating[];
  cartCount: number;
  wishlistCount: number;
  dockBadgeCounts?: Partial<Record<DockCountDestination, number>>;
  dockGlowItems?: DockCountDestination[];
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
}

const dockToneClasses: Record<string, string> = {
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
};


export const dockCustomizationItems = ['Home', 'Store', 'Purchased', 'Wishlist', 'Cart', 'News', 'Community', 'Blog', 'Free', 'Profile', 'Subscriptions'];

export const defaultDockStyle = {
  backgroundColor: '#FFFFFF',
  backgroundOpacity: 92,
  itemOpacity: 96,
  accentOpacity: 22,
  height: 76,
  iconSize: 36,
  labelSize: 11,
  padding: 12,
};

const clampPercent = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, numeric));
};

const hexToRgba = (hex: string, opacityPercent: number) => {
  const normalized = /^#?[0-9a-f]{6}$/i.test(hex || '') ? hex.replace('#', '') : defaultDockStyle.backgroundColor.replace('#', '');
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clampPercent(opacityPercent, defaultDockStyle.backgroundOpacity) / 100})`;
};

const BottomGlassDock = ({ settings, currentUser, isLoggedIn, purchasedProducts, cartCount, wishlistCount, dockBadgeCounts = {}, dockGlowItems = [], onHomeClick, onOpenBlogModal, onOpenFreeModal, onOpenAnnouncementsModal, onNavigateToAllProducts, onNavigateToWishlist, onNavigateToPurchases, onCartClick, onProfileClick, onSubscriptionClick, onOpenCommunity, authButtonLabel }: BottomGlassDockProps) => {
  const defaultItems = useMemo(() => ([
    { label: 'Home', action: onHomeClick, icon: '🏠', badge: null },
    { label: 'Store', action: onNavigateToAllProducts, icon: '🛍️', badge: dockBadgeCounts.Store || null },
    { label: 'Purchased', action: onNavigateToPurchases, icon: '📚', badge: (dockBadgeCounts.Purchased ?? purchasedProducts.length) || null },
    { label: 'Wishlist', action: onNavigateToWishlist, icon: '❤️', badge: (dockBadgeCounts.Wishlist ?? wishlistCount) || null },
    { label: 'Cart', action: onCartClick, icon: '🛒', badge: (dockBadgeCounts.Cart ?? cartCount) || null },
    { label: 'News', action: onOpenAnnouncementsModal, icon: '📢', badge: dockBadgeCounts.News || null },
    ...(onOpenCommunity ? [{ label: 'Community', action: onOpenCommunity, icon: '💬', badge: null }] : []),
    { label: 'Blog', action: onOpenBlogModal, icon: '📝', badge: dockBadgeCounts.Blog || null },
    { label: 'Free', action: onOpenFreeModal, icon: '🎁', badge: dockBadgeCounts.Free || null },
    { label: isLoggedIn ? 'Profile' : authButtonLabel, action: () => {
      if (typeof onProfileClick === 'function') {
        onProfileClick();
        return;
      }

      window.history.pushState({}, '', '/profile');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, icon: isLoggedIn ? '🪙' : '🔐', badge: null },
  ]), [onHomeClick, onNavigateToAllProducts, onNavigateToPurchases, purchasedProducts.length, onNavigateToWishlist, wishlistCount, onCartClick, cartCount, onOpenAnnouncementsModal, onOpenCommunity, onOpenBlogModal, onOpenFreeModal, isLoggedIn, authButtonLabel, onProfileClick, dockBadgeCounts.Store, dockBadgeCounts.Purchased, dockBadgeCounts.Wishlist, dockBadgeCounts.Cart, dockBadgeCounts.News, dockBadgeCounts.Blog, dockBadgeCounts.Free]);
  const configuredBase = ((settings.content as any).dockItems || dockCustomizationItems) as string[];
  const configuredWithHome = configuredBase.includes('Home') ? configuredBase : ['Home', ...configuredBase];
  const configured = configuredWithHome.filter((label, index, labels) => labels.indexOf(label) === index);
  const map: any = Object.fromEntries(defaultItems.map(i => [i.label, i]));
  map['Home'] = map['Home'] || { label: 'Home', action: onHomeClick, icon: '🏠', badge: null };
  map['Purchases'] = map['Purchased'];
  map['EduCoins'] = map['Profile'] || { label: isLoggedIn ? 'Profile' : authButtonLabel, action: () => {
    if (typeof onProfileClick === 'function') {
      onProfileClick();
      return;
    }

    window.history.pushState({}, '', '/profile');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, icon: isLoggedIn ? '🪙' : '🔐', badge: null };
  map['Profile'] = map['Profile'] || { label: isLoggedIn ? 'Profile' : authButtonLabel, action: () => {
    if (typeof onProfileClick === 'function') {
      onProfileClick();
      return;
    }

    window.history.pushState({}, '', '/profile');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, icon: isLoggedIn ? '🪙' : '🔐', badge: null };
  map['Subscriptions'] = { label: 'Subscriptions', action: onSubscriptionClick, icon: '💎', badge: null };
  const items = configured.map((l) => map[l]).filter(Boolean);
  const dockStyle = { ...defaultDockStyle, ...((settings.content as any).dockStyle || {}) };
  const dockBackground = hexToRgba(dockStyle.backgroundColor, dockStyle.backgroundOpacity);
  const itemBackground = `rgba(255, 255, 255, ${clampPercent(dockStyle.itemOpacity, defaultDockStyle.itemOpacity) / 100})`;
  const accentOpacity = clampPercent(dockStyle.accentOpacity, defaultDockStyle.accentOpacity) / 100;
  const dockHeight = Math.min(112, Math.max(58, Number(dockStyle.height || defaultDockStyle.height)));
  const iconSize = Math.min(52, Math.max(28, Number(dockStyle.iconSize || defaultDockStyle.iconSize)));
  const labelSize = Math.min(14, Math.max(9, Number(dockStyle.labelSize || defaultDockStyle.labelSize)));
  const dockPadding = Math.min(22, Math.max(8, Number(dockStyle.padding || defaultDockStyle.padding)));

  const dockScrollRef = useRef<HTMLDivElement>(null);
  const dockScrollLeftRef = useRef(0);

  const preserveDockScroll = () => {
    if (dockScrollRef.current) {
      dockScrollLeftRef.current = dockScrollRef.current.scrollLeft;
    }
  };

  useEffect(() => {
    const dock = dockScrollRef.current;
    if (!dock) return;
    dock.scrollLeft = dockScrollLeftRef.current;
  }, [items.length, currentUser?.id, isLoggedIn]);

  return (
    <>
      <style>{`
        @keyframes dock-new-content-glow-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(23,105,255,0.15), 0 8px 24px rgba(23,105,255,0.12); }
          50% { box-shadow: 0 0 0 7px rgba(23,105,255,0.08), 0 12px 30px rgba(109,92,255,0.22); }
        }
        .dock-new-content-glow { animation: dock-new-content-glow-pulse 1.9s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .dock-new-content-glow { animation: none; box-shadow: 0 0 0 3px rgba(23,105,255,0.15); } }
      `}</style>
    <div className="fixed inset-x-0 bottom-2 z-[65] flex justify-center px-3 pointer-events-none md:hidden">
      <div className="pointer-events-auto group relative max-w-[95vw] overflow-hidden rounded-[2rem] border border-[var(--mobile-border)] shadow-[var(--shadow-blue)] ring-1 ring-[var(--mobile-border-active)] backdrop-blur-3xl transition-all duration-500 hover:-translate-y-0.5 data-[hidden=true]:translate-y-24" id="main-bottom-dock" style={{ backgroundColor: dockBackground, minHeight: dockHeight, padding: dockPadding }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(23,105,255,0.12),transparent_30%),radial-gradient(circle_at_82%_10%,rgba(191,215,255,0.46),transparent_30%),linear-gradient(180deg,rgba(238,246,255,0.52),rgba(255,255,255,0.18))]" />
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--mobile-border-active)] to-transparent" />
        <div ref={dockScrollRef} onScroll={preserveDockScroll} className="relative flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {items.map((item) => {
            const isLoggedOutProfileVisual = !isLoggedIn && (item.label === authButtonLabel || item.label === 'Login');
            const visualLabel = isLoggedOutProfileVisual ? 'Profile' : item.label;
            const visualIcon = isLoggedOutProfileVisual ? '🪙' : item.icon;
            const tone = dockToneClasses[visualLabel] || dockToneClasses[item.label] || 'from-[var(--mobile-bg)] to-[var(--mobile-bg-soft)] hover:border-[var(--mobile-border-active)]';
            const hasNewGlow = dockGlowItems.includes(item.label as DockCountDestination);
            return (
              <button
  key={item.label}
  aria-label={isLoggedOutProfileVisual ? authButtonLabel : item.label}
  onPointerDown={preserveDockScroll}
  onClick={() => {
    preserveDockScroll();
    item.action();
    requestAnimationFrame(() => {
      if (dockScrollRef.current) {
        dockScrollRef.current.scrollLeft = dockScrollLeftRef.current;
      }
    });
  }}
  className={`group/item relative flex min-w-[86px] flex-col items-center rounded-2xl border border-[var(--mobile-border)] text-[var(--mobile-body)] shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-1 hover:border-[var(--mobile-border-active)] hover:text-[var(--mobile-primary)] md:min-w-[92px] ${hasNewGlow ? 'dock-new-content-glow border-blue-300 ring-2 ring-blue-300/50' : ''} ${tone}`}
  style={{ backgroundColor: itemBackground, padding: Math.max(8, dockPadding - 2) }}
>
                <span className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${tone.split(' hover:')[0]} transition duration-300 group-hover/item:opacity-75`} style={{ opacity: accentOpacity }} />
                <span className="relative flex items-center justify-center rounded-2xl border border-[var(--mobile-border)] bg-[var(--mobile-bg-soft)] shadow-inner transition duration-300 group-hover/item:scale-110 group-hover/item:bg-[var(--mobile-card)]" style={{ width: iconSize, height: iconSize, fontSize: Math.max(16, iconSize * 0.55) }}>{visualIcon}</span>
                <span className="relative mt-1.5 font-black tracking-wide text-[var(--mobile-body)] transition group-hover/item:text-[var(--mobile-primary)]" style={{ fontSize: labelSize }}>{visualLabel}</span>
                {item.badge ? <span className="dock-count-badge absolute -right-1 -top-1 rounded-full border border-[var(--mobile-border-active)] bg-gradient-to-r from-[var(--mobile-primary)] to-[var(--mobile-violet)] px-1.5 py-0.5 text-[10px] font-black text-white shadow-[0_8px_20px_rgba(79,70,229,0.38)]">{item.badge > 99 ? '99+' : item.badge}</span> : null}
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
