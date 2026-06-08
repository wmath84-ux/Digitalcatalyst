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
  settings: WebsiteSettings;
}

const dockToneClasses: Record<string, string> = {
  Store: 'from-indigo-500/35 to-cyan-400/25 hover:border-indigo-300/40',
  Purchases: 'from-emerald-500/30 to-teal-400/25 hover:border-emerald-300/40',
  Wishlist: 'from-rose-500/30 to-pink-400/25 hover:border-rose-300/40',
  Cart: 'from-amber-500/30 to-orange-400/25 hover:border-amber-300/40',
  News: 'from-sky-500/30 to-blue-400/25 hover:border-sky-300/40',
  Blog: 'from-violet-500/32 to-fuchsia-400/24 hover:border-violet-300/40',
  Free: 'from-lime-500/28 to-emerald-400/22 hover:border-lime-300/40',
  Profile: 'from-cyan-500/30 to-indigo-400/24 hover:border-cyan-300/40',
  Login: 'from-cyan-500/30 to-indigo-400/24 hover:border-cyan-300/40',
  Subscriptions: 'from-purple-500/32 to-indigo-400/25 hover:border-purple-300/40',
};


const defaultDockStyle = {
  backgroundColor: '#020617',
  backgroundOpacity: 82,
  itemOpacity: 8,
  accentOpacity: 45,
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

const BottomGlassDock: React.FC<BottomGlassDockProps> = ({ settings, currentUser, purchasedProducts, cartCount, wishlistCount, onOpenBlogModal, onOpenFreeModal, onOpenAnnouncementsModal, onNavigateToAllProducts, onNavigateToWishlist, onNavigateToPurchases, onCartClick, onProfileClick, onSubscriptionClick }) => {
  const defaultItems = useMemo(() => ([
    { label: 'Store', action: onNavigateToAllProducts, icon: '🛍️', badge: null },
    { label: 'Purchases', action: onNavigateToPurchases, icon: '📚', badge: purchasedProducts.length || null },
    { label: 'Wishlist', action: onNavigateToWishlist, icon: '❤️', badge: wishlistCount || null },
    { label: 'Cart', action: onCartClick, icon: '🛒', badge: cartCount || null },
    { label: 'News', action: onOpenAnnouncementsModal, icon: '📢', badge: null },
    { label: 'Blog', action: onOpenBlogModal, icon: '📝', badge: null },
    { label: 'Free', action: onOpenFreeModal, icon: '🎁', badge: null },
    { label: currentUser ? 'Profile' : 'Login', action: onProfileClick, icon: currentUser ? '🪙' : '🔐', badge: null },
  ]), [onNavigateToAllProducts, onNavigateToPurchases, purchasedProducts.length, onNavigateToWishlist, wishlistCount, onCartClick, cartCount, onOpenAnnouncementsModal, onOpenBlogModal, onOpenFreeModal, currentUser, onProfileClick]);
  const configured = ((settings.content as any).dockItems || defaultItems.map(i => i.label)) as string[];
  const map: any = Object.fromEntries(defaultItems.map(i => [i.label, i]));
  map['EduCoins'] = map['Profile'] || { label: 'Profile', action: onProfileClick, icon: '🪙', badge: null };
  map['Profile'] = map['Profile'] || { label: 'Profile', action: onProfileClick, icon: '🪙', badge: null };
  map['Subscriptions'] = { label: 'Subscriptions', action: onSubscriptionClick, icon: '💎', badge: null };
  const items = configured.map((l) => map[l]).filter(Boolean);
  const dockStyle = { ...defaultDockStyle, ...((settings.content as any).dockStyle || {}) };
  const dockBackground = hexToRgba(dockStyle.backgroundColor, dockStyle.backgroundOpacity);
  const itemBackground = `rgba(255, 255, 255, ${clampPercent(dockStyle.itemOpacity, defaultDockStyle.itemOpacity) / 100})`;
  const accentOpacity = clampPercent(dockStyle.accentOpacity, defaultDockStyle.accentOpacity) / 100;

  return (
    <div className="fixed inset-x-0 bottom-2 md:bottom-4 z-[65] flex justify-center pointer-events-none px-3">
      <div className="pointer-events-auto group relative max-w-[95vw] overflow-hidden rounded-[2rem] border border-white/15 px-3 py-3 shadow-[0_24px_80px_rgba(15,23,42,0.34)] ring-1 ring-slate-900/10 backdrop-blur-3xl transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_28px_90px_rgba(30,41,59,0.38)] data-[hidden=true]:translate-y-24 md:px-4" id="main-bottom-dock" style={{ backgroundColor: dockBackground }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_82%_10%,rgba(139,92,246,0.20),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.03))]" />
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent" />
        <div className="relative flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {items.map((item) => {
            const tone = dockToneClasses[item.label] || 'from-slate-400/24 to-white/10 hover:border-white/30';
            return (
              <button key={item.label} onClick={item.action} className={`group/item relative flex min-w-[86px] flex-col items-center rounded-2xl border border-white/10 px-3 py-2.5 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_14px_32px_rgba(15,23,42,0.28)] md:min-w-[92px] ${tone}`} style={{ backgroundColor: itemBackground }}>
                <span className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${tone.split(' hover:')[0]} transition duration-300 group-hover/item:opacity-75`} style={{ opacity: accentOpacity }} />
                <span className="relative flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/35 text-xl shadow-inner transition duration-300 group-hover/item:scale-110 group-hover/item:bg-slate-900/45">{item.icon}</span>
                <span className="relative mt-1.5 text-[11px] font-black tracking-wide text-slate-100/90 transition group-hover/item:text-white">{item.label}</span>
                {item.badge ? <span className="absolute -right-1 -top-1 rounded-full border border-white/20 bg-gradient-to-r from-indigo-500 to-violet-500 px-1.5 py-0.5 text-[10px] font-black text-white shadow-[0_8px_20px_rgba(79,70,229,0.38)]">{item.badge}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BottomGlassDock;
