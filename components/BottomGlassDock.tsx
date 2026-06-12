import React, { useMemo } from 'react';
import { ProductWithRating, User, WebsiteSettings } from '../App';

interface BottomGlassDockProps {
  currentUser: User | null;
  purchasedProducts: ProductWithRating[];
  cartCount: number;
  wishlistCount: number;
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
  Store: 'from-[#E8F0FE] to-[#C2E7FF] hover:border-[#C2E7FF]',
  Purchases: 'from-[#E8F0FE] to-[#C2E7FF] hover:border-[#C2E7FF]',
  Wishlist: 'from-[#E8F0FE] to-[#D3E3FD] hover:border-[#D2E3FC]',
  Cart: 'from-[#FEF7E0] to-[#E8F0FE] hover:border-[#D2E3FC]',
  News: 'from-[#E8F0FE] to-[#D3E3FD] hover:border-[#D2E3FC]',
  Blog: 'from-[#E8F0FE] to-[#D3E3FD] hover:border-[#D2E3FC]',
  Free: 'from-[#E6F4EA] to-[#E8F0FE] hover:border-[#CEEAD6]',
  Profile: 'from-[#E8F0FE] to-[#C2E7FF] hover:border-[#C2E7FF]',
  Login: 'from-[#E8F0FE] to-[#C2E7FF] hover:border-[#C2E7FF]',
  Subscriptions: 'from-[#E8F0FE] to-[#D3E3FD] hover:border-[#D2E3FC]',
  Community: 'from-[#E8F0FE] to-[#C2E7FF] hover:border-[#C2E7FF]',
};


const defaultDockStyle = {
  backgroundColor: '#FFFFFF',
  backgroundOpacity: 95,
  itemOpacity: 100,
  accentOpacity: 100,
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

const BottomGlassDock: React.FC<BottomGlassDockProps> = ({ settings, currentUser, purchasedProducts, cartCount, wishlistCount, onOpenBlogModal, onOpenFreeModal, onOpenAnnouncementsModal, onNavigateToAllProducts, onNavigateToWishlist, onNavigateToPurchases, onCartClick, onProfileClick, onSubscriptionClick, onOpenCommunity, authButtonLabel }) => {
  const defaultItems = useMemo(() => ([
    { label: 'Store', action: onNavigateToAllProducts, icon: '🛍️', badge: null },
    { label: 'Purchases', action: onNavigateToPurchases, icon: '📚', badge: purchasedProducts.length || null },
    { label: 'Wishlist', action: onNavigateToWishlist, icon: '❤️', badge: wishlistCount || null },
    { label: 'Cart', action: onCartClick, icon: '🛒', badge: cartCount || null },
    { label: 'News', action: onOpenAnnouncementsModal, icon: '📢', badge: null },
    ...(onOpenCommunity ? [{ label: 'Community', action: onOpenCommunity, icon: '💬', badge: null }] : []),
    { label: 'Blog', action: onOpenBlogModal, icon: '📝', badge: null },
    { label: 'Free', action: onOpenFreeModal, icon: '🎁', badge: null },
    { label: currentUser ? 'Profile' : authButtonLabel, action: onProfileClick, icon: currentUser ? '🪙' : '🔐', badge: null },
  ]), [onNavigateToAllProducts, onNavigateToPurchases, purchasedProducts.length, onNavigateToWishlist, wishlistCount, onCartClick, cartCount, onOpenAnnouncementsModal, onOpenCommunity, onOpenBlogModal, onOpenFreeModal, currentUser, authButtonLabel, onProfileClick]);
  const configuredBase = ((settings.content as any).dockItems || defaultItems.map(i => i.label)) as string[];
  const configured = onOpenCommunity && !configuredBase.includes('Community')
    ? [...configuredBase.slice(0, Math.max(configuredBase.indexOf('News') + 1, 0)), 'Community', ...configuredBase.slice(Math.max(configuredBase.indexOf('News') + 1, 0))]
    : configuredBase;
  const map: any = Object.fromEntries(defaultItems.map(i => [i.label, i]));
  map['EduCoins'] = map['Profile'] || { label: currentUser ? 'Profile' : authButtonLabel, action: onProfileClick, icon: currentUser ? '🪙' : '🔐', badge: null };
  map['Profile'] = map['Profile'] || { label: currentUser ? 'Profile' : authButtonLabel, action: onProfileClick, icon: currentUser ? '🪙' : '🔐', badge: null };
  map['Subscriptions'] = { label: 'Subscriptions', action: onSubscriptionClick, icon: '💎', badge: null };
  const items = configured.map((l) => map[l]).filter(Boolean);
  const dockStyle = { ...defaultDockStyle, ...((settings.content as any).dockStyle || {}) };
  const dockBackground = hexToRgba(dockStyle.backgroundColor, dockStyle.backgroundOpacity);
  const itemBackground = `rgba(255, 255, 255, ${clampPercent(dockStyle.itemOpacity, defaultDockStyle.itemOpacity) / 100})`;
  const accentOpacity = clampPercent(dockStyle.accentOpacity, defaultDockStyle.accentOpacity) / 100;

  return (
    <div className="fixed inset-x-0 bottom-2 md:bottom-4 z-[65] flex justify-center pointer-events-none px-3">
      <div className="pointer-events-auto group relative max-w-[95vw] overflow-hidden rounded-[2rem] border border-[#D2E3FC] px-3 py-3 shadow-[0_18px_60px_rgba(26,115,232,0.22)] ring-1 ring-[#C2E7FF] backdrop-blur-3xl transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_24px_80px_rgba(26,115,232,0.24)] data-[hidden=true]:translate-y-24 md:px-4" id="main-bottom-dock" style={{ backgroundColor: dockBackground }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(26,115,232,0.12),transparent_30%),radial-gradient(circle_at_82%_10%,rgba(194,231,255,0.40),transparent_30%),linear-gradient(180deg,rgba(232,240,254,0.42),rgba(255,255,255,0.16))]" />
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#C2E7FF] to-transparent" />
        <div className="relative flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {items.map((item) => {
            const tone = dockToneClasses[item.label] || 'from-[#F8FAFD] to-[#E8F0FE] hover:border-[#D2E3FC]';
            return (
              <button key={item.label} onClick={item.action} className={`group/item relative flex min-w-[86px] flex-col items-center rounded-2xl border border-[#DADCE0] px-3 py-2.5 text-[#202124] shadow-[0_8px_24px_rgba(60,64,67,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_12px_34px_rgba(26,115,232,0.14)] md:min-w-[92px] ${tone}`} style={{ backgroundColor: itemBackground }}>
                <span className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${tone.split(' hover:')[0]} transition duration-300 group-hover/item:opacity-75`} style={{ opacity: accentOpacity }} />
                <span className="relative flex h-9 w-9 items-center justify-center rounded-2xl border border-[#D2E3FC] bg-[#E8F0FE] text-xl shadow-inner transition duration-300 group-hover/item:scale-110 group-hover/item:bg-[#D3E3FD]">{item.icon}</span>
                <span className="relative mt-1.5 text-[11px] font-black tracking-wide text-[#202124] transition group-hover/item:text-[#174EA6]">{item.label}</span>
                {item.badge ? <span className="absolute -right-1 -top-1 rounded-full border border-[#D2E3FC] bg-gradient-to-r from-[#1A73E8] to-[#174EA6] px-1.5 py-0.5 text-[10px] font-black text-white shadow-[0_8px_20px_rgba(79,70,229,0.38)]">{item.badge}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BottomGlassDock;
