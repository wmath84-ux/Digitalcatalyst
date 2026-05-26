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

const BottomGlassDock: React.FC<BottomGlassDockProps> = ({ settings, currentUser, purchasedProducts, cartCount, wishlistCount, onOpenBlogModal, onOpenFreeModal, onOpenAnnouncementsModal, onNavigateToAllProducts, onNavigateToWishlist, onNavigateToPurchases, onCartClick, onProfileClick, onSubscriptionClick }) => {
  const defaultItems = useMemo(() => ([
    { label: 'Store', action: onNavigateToAllProducts, icon: '🛍️', badge: null },
    { label: 'Purchases', action: onNavigateToPurchases, icon: '📚', badge: purchasedProducts.length || null },
    { label: 'Wishlist', action: onNavigateToWishlist, icon: '❤️', badge: wishlistCount || null },
    { label: 'Cart', action: onCartClick, icon: '🛒', badge: cartCount || null },
    { label: 'News', action: onOpenAnnouncementsModal, icon: '📢', badge: null },
    { label: 'Blog', action: onOpenBlogModal, icon: '📝', badge: null },
    { label: 'Free', action: onOpenFreeModal, icon: '🎁', badge: null },
    { label: currentUser ? 'EduCoins' : 'Login', action: onProfileClick, icon: currentUser ? '🪙' : '🔐', badge: null },
  ]), [onNavigateToAllProducts, onNavigateToPurchases, purchasedProducts.length, onNavigateToWishlist, wishlistCount, onCartClick, cartCount, onOpenAnnouncementsModal, onOpenBlogModal, onOpenFreeModal, currentUser, onProfileClick]);
  const configured = ((settings.content as any).dockItems || defaultItems.map(i => i.label)) as string[];
  const map: any = Object.fromEntries(defaultItems.map(i => [i.label, i]));
  map['Subscriptions'] = { label: 'Subscriptions', action: onSubscriptionClick, icon: '💎', badge: null };
  const items = configured.map((l) => map[l]).filter(Boolean);

  return (
    <div className="fixed inset-x-0 bottom-2 md:bottom-4 z-[65] flex justify-center pointer-events-none">
      <div className="pointer-events-auto group max-w-[95vw] rounded-3xl border border-white/30 bg-white/20 px-4 py-3 shadow-2xl backdrop-blur-2xl transition-all duration-500 hover:translate-y-0 data-[hidden=true]:translate-y-24" id="main-bottom-dock">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {items.map((item) => (
            <button key={item.label} onClick={item.action} className="relative flex min-w-[92px] flex-col items-center rounded-2xl bg-white/30 px-3 py-2 text-slate-800 transition hover:-translate-y-1 hover:bg-white/70">
              <span className="text-xl">{item.icon}</span>
              <span className="mt-1 text-xs font-bold">{item.label}</span>
              {item.badge ? <span className="absolute -right-1 -top-1 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.badge}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BottomGlassDock;
