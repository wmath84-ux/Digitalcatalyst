
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
  onQuickView: (product: ProductWithRating) => void;
  bgColor?: string;
  coupons: Coupon[];
}

const FeaturedProducts: React.FC<FeaturedProductsProps> = ({ settings, title, products, onViewProduct, wishlist, onToggleWishlist, onAddToCart, onQuickView, bgColor = 'bg-background', coupons }) => {
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
      className={`py-24 ${bgColor}`}
    >
      <div className="container mx-auto px-6">
        <div className={`text-center max-w-3xl mx-auto mb-16 ${settings.animations.enabled ? 'scroll-animate' : ''}`}>
          <h2 className="text-4xl font-extrabold text-primary tracking-tight mb-4">{title}</h2>
          <div className="w-24 h-1 bg-accent mx-auto rounded-full"></div>
        </div>
        
        <div 
            ref={gridRef} 
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
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
