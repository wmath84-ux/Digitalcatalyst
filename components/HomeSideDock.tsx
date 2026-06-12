import React, { useEffect, useState } from 'react';
import { User } from '../App';

interface HomeSideDockProps {
  currentUser: User | null;
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

const dockItems = [
  ['Products', '🛍️'], ['Purchases', '📚'], ['Wishlist', '💜'], ['Cart', '🛒'], ['News', '📢'], ['Free', '🎁'], ['Blog', '📝'], ['Profile', '🪙']
] as const;

const HomeSideDock: React.FC<HomeSideDockProps> = ({ currentUser, cartCount, wishlistCount, onOpenBlogModal, onOpenFreeModal, onOpenAnnouncementsModal, onNavigateToAllProducts, onNavigateToWishlist, onNavigateToPurchases, onCartClick, onProfileClick }) => {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('publicSideDockCollapsed') === 'true');
  useEffect(() => localStorage.setItem('publicSideDockCollapsed', String(collapsed)), [collapsed]);

  const actionMap: Record<string, () => void> = {
    Products: onNavigateToAllProducts,
    Purchases: onNavigateToPurchases,
    Wishlist: onNavigateToWishlist,
    Cart: onCartClick,
    News: onOpenAnnouncementsModal,
    Free: onOpenFreeModal,
    Blog: onOpenBlogModal,
    Profile: onProfileClick,
  };

  return (
    <aside className={`hidden xl:flex fixed left-5 top-28 z-40 flex-col transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
      <div className="rounded-[1.75rem] border border-[#D2E3FC] bg-white/95 p-3 shadow-[0_18px_60px_rgba(26,115,232,0.22)] backdrop-blur-2xl ring-1 ring-[#C2E7FF]">
        <button onClick={() => setCollapsed(!collapsed)} className="mb-3 flex w-full items-center justify-between rounded-2xl bg-[#E8F0FE] px-3 py-2 text-sm font-black text-[#202124] shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <span>{collapsed ? '☰' : 'Learning Dock'}</span>
          {!collapsed && <span className="text-[#5F6368]">Hide</span>}
        </button>
        {!collapsed && currentUser && (
          <div className="mb-3 rounded-2xl bg-[#E8F0FE] p-3 text-[#202124] shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-[#5F6368]">EduCoins</p>
            <p className="text-2xl font-black">🪙 {currentUser.eduCoins ?? 120}</p>
          </div>
        )}
        <div className="space-y-2">
          {dockItems.map(([label, icon]) => (
            <button key={label} onClick={actionMap[label]} className="group relative flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-3 font-bold text-[#202124] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#E8F0FE] hover:text-[#1967D2] hover:shadow-sm">
              <span className="text-xl">{icon}</span>
              {!collapsed && <span>{label}</span>}
              {!collapsed && label === 'Cart' && cartCount > 0 && <span className="ml-auto rounded-full bg-gradient-to-r from-[#1A73E8] to-[#174EA6] px-2 py-0.5 text-xs text-white">{cartCount}</span>}
              {!collapsed && label === 'Wishlist' && wishlistCount > 0 && <span className="ml-auto rounded-full bg-[#1A73E8] px-2 py-0.5 text-xs text-white">{wishlistCount}</span>}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
};

export default HomeSideDock;
