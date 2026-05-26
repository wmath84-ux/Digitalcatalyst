import React, { useMemo } from 'react';
import { ProductWithRating, User } from '../App';

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
}

const BottomGlassDock: React.FC<BottomGlassDockProps> = ({ currentUser, purchasedProducts, cartCount, wishlistCount, onOpenBlogModal, onOpenFreeModal, onOpenAnnouncementsModal, onNavigateToAllProducts, onNavigateToWishlist, onNavigateToPurchases, onCartClick, onProfileClick }) => {
  const items = useMemo(() => ([
    { label: 'Store', action: onNavigateToAllProducts, icon: '🛍️', badge: null },
    { label: 'Purchases', action: onNavigateToPurchases, icon: '📚', badge: purchasedProducts.length || null },
    { label: 'Wishlist', action: onNavigateToWishlist, icon: '❤️', badge: wishlistCount || null },
    { label: 'Cart', action: onCartClick, icon: '🛒', badge: cartCount || null },
    { label: 'News', action: onOpenAnnouncementsModal, icon: '📢', badge: null },
    { label: 'Blog', action: onOpenBlogModal, icon: '📝', badge: null },
    { label: 'Free', action: onOpenFreeModal, icon: '🎁', badge: null },
    { label: currentUser ? 'EduCoins' : 'Login', action: onProfileClick, icon: currentUser ? '🪙' : '🔐', badge: null },
  ]), [onNavigateToAllProducts, onNavigateToPurchases, purchasedProducts.length, onNavigateToWishlist, wishlistCount, onCartClick, cartCount, onOpenAnnouncementsModal, onOpenBlogModal, onOpenFreeModal, currentUser, onProfileClick]);

  return (
    <div className="fixed inset-x-0 bottom-4 z-[65] hidden md:flex justify-center pointer-events-none">
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
