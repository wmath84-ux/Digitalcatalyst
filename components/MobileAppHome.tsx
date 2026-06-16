import React from 'react';
import type { ProductWithRating, User, WebsiteSettings } from '../App';

interface MobileAppHomeProps {
  settings: WebsiteSettings;
  currentUser: User | null;
  featuredProducts: ProductWithRating[];
  purchasedCount: number;
  wishlistCount: number;
  cartCount: number;
  authButtonLabel: string;
  onNavigateToAllProducts: () => void;
  onNavigateToPurchases: () => void;
  onNavigateToWishlist: () => void;
  onOpenCart: () => void;
  onOpenProfile: () => void;
  onOpenBlog: () => void;
  onOpenAnnouncements: () => void;
  onOpenFreeProducts: () => void;
  onOpenSubscription: () => void;
  onOpenCommunity: () => void;
  onViewProduct: (product: ProductWithRating) => void;
}

const MobileAppHome: React.FC<MobileAppHomeProps> = ({
  settings,
  currentUser,
  featuredProducts,
  purchasedCount,
  wishlistCount,
  cartCount,
  authButtonLabel,
  onNavigateToAllProducts,
  onNavigateToPurchases,
  onNavigateToWishlist,
  onOpenCart,
  onOpenProfile,
  onOpenBlog,
  onOpenAnnouncements,
  onOpenFreeProducts,
  onOpenSubscription,
  onOpenCommunity,
  onViewProduct,
}) => {
  const siteName = settings.content.siteName || 'Digital Catalyst';
  const displayName = currentUser?.name?.split(' ')[0] || 'Learner';
  const quickActions = [
    { label: 'Store', icon: '🛍️', action: onNavigateToAllProducts, badge: null },
    { label: 'My Courses', icon: '📚', action: onNavigateToPurchases, badge: purchasedCount || null },
    { label: 'Wishlist', icon: '❤️', action: onNavigateToWishlist, badge: wishlistCount || null },
    { label: 'Cart', icon: '🛒', action: onOpenCart, badge: cartCount || null },
    { label: 'News', icon: '📢', action: onOpenAnnouncements, badge: null },
    { label: 'Blog', icon: '📝', action: onOpenBlog, badge: null },
    { label: 'Free', icon: '🎁', action: onOpenFreeProducts, badge: null },
    { label: currentUser ? 'EduCoins' : authButtonLabel, icon: currentUser ? '🪙' : '🔐', action: onOpenProfile, badge: null },
    { label: 'Plans', icon: '💎', action: onOpenSubscription, badge: null },
    { label: 'Community', icon: '💬', action: onOpenCommunity, badge: null },
  ];

  return (
    <section className="min-h-screen overflow-hidden bg-[var(--bg-main)] px-4 pb-32 pt-5 text-[var(--text-primary)]">
      <div className="mx-auto max-w-md">
        <div className="rounded-[2rem] border border-[var(--border-soft)] bg-white/75 p-5 shadow-[var(--shadow-blue)] backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--primary)]">{siteName}</p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-[var(--text-primary)]">Welcome, {displayName}</h1>
              <p className="mt-2 text-sm font-semibold text-[var(--text-muted)]">Your compact learning app home is ready.</p>
            </div>
            <button onClick={onOpenProfile} className="grid h-14 w-14 shrink-0 place-items-center rounded-3xl border border-[var(--border-active)] bg-[var(--tag-blue)] text-2xl shadow-inner" aria-label="Open profile">
              {currentUser ? '🪙' : '🔐'}
            </button>
          </div>
          <button onClick={onNavigateToAllProducts} className="mt-5 w-full rounded-2xl bg-gradient-to-r from-[#1A73E8] to-[#174EA6] px-5 py-4 text-sm font-black text-white shadow-[0_18px_45px_rgba(26,115,232,0.25)]">
            Explore digital products
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {quickActions.map((item) => (
            <button key={item.label} onClick={item.action} className="relative rounded-3xl border border-[var(--border-soft)] bg-white/80 p-4 text-left shadow-[var(--shadow-soft)] backdrop-blur-xl transition active:scale-[0.98]">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--tag-blue)] text-2xl shadow-inner">{item.icon}</span>
              <span className="mt-3 block text-sm font-black text-[var(--text-primary)]">{item.label}</span>
              {item.badge ? <span className="absolute right-3 top-3 rounded-full bg-[#1A73E8] px-2 py-0.5 text-xs font-black text-white">{item.badge}</span> : null}
            </button>
          ))}
        </div>

        {featuredProducts.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-[var(--text-primary)]">Featured picks</h2>
              <button onClick={onNavigateToAllProducts} className="text-sm font-black text-[var(--primary)]">View all</button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {featuredProducts.slice(0, 5).map((product) => (
                <button key={product.id} onClick={() => onViewProduct(product)} className="min-w-[180px] rounded-3xl border border-[var(--border-soft)] bg-white/80 p-3 text-left shadow-[var(--shadow-soft)] backdrop-blur-xl">
                  <img src={product.images?.[0] || `https://picsum.photos/seed/${product.imageSeed}/320/220`} alt={product.title} className="h-28 w-full rounded-2xl object-cover" />
                  <p className="mt-3 line-clamp-2 text-sm font-black text-[var(--text-primary)]">{product.title}</p>
                  <p className="mt-1 text-xs font-bold text-[var(--text-muted)]">{product.salePrice || product.price}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default MobileAppHome;
