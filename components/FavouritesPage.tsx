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
  onQuickView: (product: ProductWithRating) => void;
  onClearWishlist: () => void;
  coupons: Coupon[];
}

const WishlistPage: React.FC<WishlistPageProps> = ({ settings, products, onViewProduct, wishlist, onToggleWishlist, onNavigateToAllProducts, onAddToCart, onQuickView, onClearWishlist, coupons }) => {
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
        <div className="py-20 sm:py-24 bg-white min-h-[60vh] flex items-center justify-center">
            <div className="text-center">
                <p className="text-xl text-text-muted">This feature is currently disabled.</p>
            </div>
        </div>
    );
  }
    
  return (
    <section ref={sectionRef} className={`py-20 sm:py-24 bg-white min-h-[60vh] ${settings.animations.enabled ? 'scroll-animate' : ''}`}>
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-primary">My Wishlist</h2>
          {products.length > 0 && (
             <button 
                onClick={onClearWishlist} 
                className="mt-4 text-sm text-red-500 font-semibold hover:underline"
              >
                Clear All
            </button>
          )}
        </div>

        <div ref={gridRef} className={`mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}>
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
                onQuickView={onQuickView}
                animationDelay={index}
                displayMode="wishlist"
                coupons={coupons}
              />
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-xl text-text-muted mb-6">You haven't added any products to your wishlist yet.</p>
              <button onClick={onNavigateToAllProducts} className="bg-primary text-white font-semibold px-8 py-3 rounded-lg hover:opacity-90 transition-all duration-300 transform active:scale-95">
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