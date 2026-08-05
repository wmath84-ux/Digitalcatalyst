import React, { useEffect, useRef } from 'react';
import { ProductWithRating, WebsiteSettings, Coupon } from '../App';
import ProductCard from './ProductCard';

interface WishlistPageProps {
  settings: WebsiteSettings;
  products: ProductWithRating[];
  onViewProduct: (product: ProductWithRating, sectionId?: string) => void;
  wishlist: number[];
  onToggleWishlist: (id: number) => void;
  onNavigateToAllProducts: () => void;
  onAddToCart: (productId: number, quantity?: number) => void;
  onBuyNow: (product: ProductWithRating) => void;
  onClearWishlist: () => void;
  coupons: Coupon[];
  purchasedProductIds?: number[];
}

const HeartIcon: React.FC<{ className?: string }> = ({ className = "h-8 w-8" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
  </svg>
);

const WishlistPage: React.FC<WishlistPageProps> = ({ settings, products, onViewProduct, wishlist, onToggleWishlist, onNavigateToAllProducts, onAddToCart, onBuyNow, onClearWishlist, coupons, purchasedProductIds = [] }) => {
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
        (entries) => {
            const [entry] = entries;
            entry.target.classList.toggle('is-visible', entry.isIntersecting);
        },
        { threshold: 0.05 }
    );
    const currentRef = sectionRef.current;
    if (currentRef) observer.observe(currentRef);

     const gridObserver = new IntersectionObserver(
        (entries) => {
            const [entry] = entries;
            entry.target.classList.toggle('is-visible', entry.isIntersecting);
        },
        { threshold: 0.05 }
    );
    const currentGridRef = gridRef.current;
    if(currentGridRef) gridObserver.observe(currentGridRef);

    return () => {
        if(currentRef) observer.unobserve(currentRef);
        if(currentGridRef) gridObserver.unobserve(currentGridRef);
    };
  }, []);

  const handleMoveToCart = (productId: number, quantity: number = 1) => {
    onAddToCart(productId, quantity);
    onToggleWishlist(productId);
  };

  if (!settings.features.showFavourites) {
    return (
        <div className="py-20 sm:py-24 bg-white/90 backdrop-blur-xl min-h-[60vh] flex items-center justify-center">
            <div className="text-center">
                <p className="text-xl text-text-muted">This feature is currently disabled.</p>
            </div>
        </div>
    );
  }

  return (
    <section ref={sectionRef} className={`py-16 sm:py-20 bg-white/90 backdrop-blur-xl min-h-[60vh] ${settings.animations.enabled ? 'scroll-animate' : ''}`}>
      <div className="container mx-auto px-5 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-[#E3E8F5] bg-gradient-to-br from-[#F1EEFF] to-white text-[#5B4BFF] shadow-[0_14px_34px_rgba(91,75,255,0.14)]">
            <HeartIcon className="h-8 w-8" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#081A45]">My Wishlist</h2>
          {products.length > 0 && (
            <>
              <p className="mt-3 text-base font-semibold text-[#667085]">{products.length} saved {products.length === 1 ? 'item' : 'items'} · revisit them anytime and move them to your cart when you are ready.</p>
              <button
                onClick={onClearWishlist}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50/80 px-5 py-2.5 text-sm font-black text-rose-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-100 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-300/60"
              >
                Clear All
              </button>
            </>
          )}
        </div>

        <div ref={gridRef} className={`mt-12 sm:mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10 lg:gap-12 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}>
          {products.length > 0 ? (
            products.map((product, index) => (
              <ProductCard
                key={product.id}
                settings={settings}
                product={product}
                onViewDetails={(sectionId) => onViewProduct(product, sectionId)}
                isWishlisted={wishlist.includes(product.id)}
                onToggleWishlist={onToggleWishlist}
                onAddToCart={handleMoveToCart}
                onBuyNow={onBuyNow}
                animationDelay={index}
                displayMode="wishlist"
                coupons={coupons}
                isPurchased={purchasedProductIds.includes(product.id)}
                roundnessSurface="wishlist"
              />
            ))
          ) : (
            <div className="col-span-full text-center py-14">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-[#E3E8F5] bg-white text-[#C9C2FF] shadow-[0_14px_34px_rgba(91,75,255,0.10)]">
                <HeartIcon className="h-9 w-9" />
              </div>
              <p className="text-xl font-extrabold text-[#081A45]">Your wishlist is empty</p>
              <p className="mx-auto mt-2 max-w-md text-base font-semibold leading-relaxed text-[#667085]">Tap the heart on any course to save it here, then move it to your cart when you are ready to learn.</p>
              <button onClick={onNavigateToAllProducts} className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#5B4BFF] to-[#7B61FF] px-8 py-3.5 text-base font-black text-white shadow-[0_18px_40px_rgba(91,75,255,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(91,75,255,0.34)] active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#7B61FF]/50">
                Browse Products
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default WishlistPage;
