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
      <div className="rounded-[1.75rem] border border-white/50 bg-white/20 p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl ring-1 ring-slate-900/5">
        <button onClick={() => setCollapsed(!collapsed)} className="mb-3 flex w-full items-center justify-between rounded-2xl bg-white/70 px-3 py-2 text-sm font-black text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <span>{collapsed ? '☰' : 'Learning Dock'}</span>
          {!collapsed && <span className="text-slate-900/70">Hide</span>}
        </button>
        {!collapsed && currentUser && (
          <div className="mb-3 rounded-2xl bg-white/70 p-3 text-slate-900 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-600">EduCoins</p>
            <p className="text-2xl font-black">🪙 {currentUser.eduCoins ?? 120}</p>
          </div>
        )}
        <div className="space-y-2">
          {dockItems.map(([label, icon]) => (
            <button key={label} onClick={actionMap[label]} className="group relative flex w-full items-center gap-3 rounded-2xl bg-white/65 px-3 py-3 font-bold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:text-primary hover:shadow-sm">
              <span className="text-xl">{icon}</span>
              {!collapsed && <span>{label}</span>}
              {!collapsed && label === 'Cart' && cartCount > 0 && <span className="ml-auto rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-2 py-0.5 text-xs text-white">{cartCount}</span>}
              {!collapsed && label === 'Wishlist' && wishlistCount > 0 && <span className="ml-auto rounded-full bg-pink-500 px-2 py-0.5 text-xs text-white">{wishlistCount}</span>}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
};

export default HomeSideDock;
