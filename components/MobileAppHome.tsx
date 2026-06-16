import React from 'react';
import { Coupon, ProductWithRating, User, WebsiteSettings } from '../App';
import FeaturedProducts from './FeaturedProducts';
import ProductShowcase from './ProductShowcase';
import PurchasedProducts from './PurchasedProducts';

interface MobileAppHomeProps {
  settings: WebsiteSettings;
  currentUser: User | null;
  purchasedProducts: ProductWithRating[];
  topRatedProducts: ProductWithRating[];
  visibleProducts: ProductWithRating[];
  purchasedProductIds: number[];
  wishlist: number[];
  coupons: Coupon[];
  onViewPurchasedProduct: (product: ProductWithRating) => void;
  onViewProduct: (product: ProductWithRating, sectionId?: string) => void;
  onToggleWishlist: (id: number) => void;
  onAddToCart: (productId: number, quantity?: number) => void;
  onBuyNow: (product: ProductWithRating) => void;
  onQuickView: (product: ProductWithRating) => void;
  onNavigateToAllProducts: () => void;
  onNavigateToPurchases: () => void;
  onNavigateToFreeProducts: () => void;
  onOpenNews: () => void;
  onCartClick: () => void;
  onProfileClick: () => void;
}

const MobileQuickAction: React.FC<{
  label: string;
  icon: string;
  onClick: () => void;
}> = ({ label, icon, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex min-h-[86px] flex-col items-center justify-center gap-2 rounded-3xl border border-white/70 bg-white/75 px-3 py-4 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-2xl transition-transform active:scale-95"
  >
    <span className="text-2xl" aria-hidden="true">{icon}</span>
    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-700">{label}</span>
  </button>
);

const MobileAppHome: React.FC<MobileAppHomeProps> = ({
  settings,
  currentUser,
  purchasedProducts,
  topRatedProducts,
  visibleProducts,
  purchasedProductIds,
  wishlist,
  coupons,
  onViewPurchasedProduct,
  onViewProduct,
  onToggleWishlist,
  onAddToCart,
  onBuyNow,
  onQuickView,
  onNavigateToAllProducts,
  onNavigateToPurchases,
  onNavigateToFreeProducts,
  onOpenNews,
  onCartClick,
  onProfileClick,
}) => {
  const unpurchasedProducts = visibleProducts.filter(product => !purchasedProductIds.includes(product.id));
  const firstName = currentUser?.name?.split(' ')[0] || 'Learner';
  const siteName = settings.content.siteName || 'Digital Catalyst';

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-sky-50 to-white pb-36 pt-5">
      <section className="px-4">
        <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-[0_24px_70px_rgba(79,70,229,0.14)] backdrop-blur-2xl">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-indigo-500">{siteName}</p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-slate-950">Welcome back, {firstName}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">Jump into purchases, explore top-rated resources, or discover free learning content.</p>
            </div>
            <button
              type="button"
              onClick={onProfileClick}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-lg font-black text-white shadow-lg active:scale-95"
              aria-label="Open profile"
            >
              {currentUser?.name?.charAt(0).toUpperCase() || '👤'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-3xl bg-indigo-950 p-3 text-white">
            <div className="text-center">
              <p className="text-xl font-black">{purchasedProducts.length}</p>
              <p className="text-[10px] uppercase tracking-widest text-indigo-200">Owned</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black">{wishlist.length}</p>
              <p className="text-[10px] uppercase tracking-widest text-indigo-200">Saved</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black">{visibleProducts.length}</p>
              <p className="text-[10px] uppercase tracking-widest text-indigo-200">Courses</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-3 gap-3 px-4">
        <MobileQuickAction label="Store" icon="🛍️" onClick={onNavigateToAllProducts} />
        <MobileQuickAction label="Purchases" icon="🎓" onClick={onNavigateToPurchases} />
        <MobileQuickAction label="Free" icon="🎁" onClick={onNavigateToFreeProducts} />
        <MobileQuickAction label="News" icon="📰" onClick={onOpenNews} />
        <MobileQuickAction label="Cart" icon="🛒" onClick={onCartClick} />
        <MobileQuickAction label="Profile" icon="👤" onClick={onProfileClick} />
      </section>

      {purchasedProducts.length > 0 && (
        <PurchasedProducts settings={settings} products={purchasedProducts} onViewPurchasedProduct={onViewPurchasedProduct} />
      )}

      <FeaturedProducts
        settings={settings}
        title="Top Rated Products"
        products={topRatedProducts}
        onViewProduct={onViewProduct}
        wishlist={wishlist}
        onToggleWishlist={onToggleWishlist}
        onAddToCart={onAddToCart}
        onBuyNow={onBuyNow}
        onQuickView={onQuickView}
        bgColor="bg-transparent"
        coupons={coupons}
      />

      <ProductShowcase
        settings={settings}
        products={unpurchasedProducts}
        onViewProduct={onViewProduct}
        wishlist={wishlist}
        onToggleWishlist={onToggleWishlist}
        onAddToCart={onAddToCart}
        onBuyNow={onBuyNow}
        onQuickView={onQuickView}
        coupons={coupons}
      />
    </div>
  );
};

export default MobileAppHome;
