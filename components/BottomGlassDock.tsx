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
  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[65] flex justify-center px-3 pointer-events-none md:bottom-5">
      <nav className="pointer-events-auto flex max-w-[94vw] items-center gap-2 overflow-x-auto rounded-[2rem] border border-[#D2E3FC] bg-white/95 p-2 shadow-[0_18px_60px_rgba(26,115,232,0.22)] ring-1 ring-[#C2E7FF] backdrop-blur-2xl custom-scrollbar" id="main-bottom-dock" aria-label="Main bottom dock">
        {items.map((item) => {
          return (
            <button key={item.label} onClick={item.action} className="relative min-w-[120px] rounded-2xl bg-white px-4 py-3 text-center text-[#202124] transition duration-300 hover:-translate-y-1 hover:bg-[#E8F0FE] active:scale-95">
              <span className="block text-2xl">{item.icon}</span>
              <span className="text-[11px] font-black">{item.label}</span>
              {item.badge ? <span className="absolute -right-1 -top-1 rounded-full border border-[#D2E3FC] bg-[#D3E3FD] px-1.5 py-0.5 text-[10px] font-black text-[#174EA6] shadow-lg shadow-[#D2E3FC]">{item.badge}</span> : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default BottomGlassDock;
