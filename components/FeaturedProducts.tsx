
import React, { useEffect, useRef } from 'react';
import { ProductWithRating, WebsiteSettings, Coupon } from '../App';
import ProductCard from './ProductCard';

interface FeaturedProductsProps {
  settings: WebsiteSettings;
  title: string;
  products: ProductWithRating[];
  onViewProduct: (product: ProductWithRating, sectionId?: string) => void;
  wishlist: number[];
  onToggleWishlist: (id: number) => void;
  onAddToCart: (productId: number, quantity?: number) => void;
  onBuyNow: (product: ProductWithRating) => void;
  onQuickView: (product: ProductWithRating) => void;
  bgColor?: string;
  coupons: Coupon[];
}

const FeaturedProducts: React.FC<FeaturedProductsProps> = ({ settings, title, products, onViewProduct, wishlist, onToggleWishlist, onAddToCart, onBuyNow, onQuickView, bgColor = 'bg-background', coupons }) => {
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const revealElements = () => {
        if (sectionRef.current) sectionRef.current.querySelector('div.text-center')?.classList.add('is-visible');
        if (gridRef.current) gridRef.current.classList.add('is-visible');
    };

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                }
            });
        },
        // rootMargin bottom 600px: triggers when element is within 600px BELOW the viewport
        { threshold: 0, rootMargin: "0px 0px 600px 0px" } 
    );

    const headerEl = sectionRef.current?.querySelector('div.text-center');
    const gridEl = gridRef.current;

    if (headerEl) observer.observe(headerEl);
    if (gridEl) observer.observe(gridEl);

    // Failsafe: If for some reason observer doesn't trigger, force show after 1s to prevent empty space
    const failsafe = setTimeout(revealElements, 1000);

    return () => {
        if (headerEl) observer.unobserve(headerEl);
        if (gridEl) observer.unobserve(gridEl);
        clearTimeout(failsafe);
    };
  }, []);
  
  if (!products || products.length === 0) return null;

  return (
    <section 
      ref={sectionRef}
      className={`premium-section py-20 sm:py-24`}
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className={`text-center max-w-3xl mx-auto mb-10 sm:mb-16 ${settings.animations.enabled ? 'scroll-animate' : ''}`}>
          <h2 className="mb-3 text-[clamp(2.5rem,4vw,4.2rem)] font-[820] leading-[1.05] tracking-[-0.045em] text-[var(--text-heading)] sm:mb-4">{title}</h2>
          <div className="mx-auto h-1.5 w-24 rounded-full bg-gradient-to-r from-[#1769FF] to-[#7B61FF]"></div>
        </div>
        
        <div 
            ref={gridRef} 
            className={`grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-8 ${products.length === 1 ? 'mx-auto max-w-md' : ''} ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
        >
          {products.map((product, index) => (
            <ProductCard 
              key={product.id} 
              settings={settings}
              product={product} 
              onViewDetails={(sectionId) => onViewProduct(product, sectionId)}
              isWishlisted={wishlist.includes(product.id)}
              onToggleWishlist={onToggleWishlist}
              onAddToCart={onAddToCart}
              onBuyNow={onBuyNow}
              onQuickView={onQuickView}
              animationDelay={index}
              coupons={coupons}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts;
