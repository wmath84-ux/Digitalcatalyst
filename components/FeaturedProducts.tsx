
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
  variant?: 'default' | 'mobileHome';
  subtitle?: string;
}

const FeaturedProducts: React.FC<FeaturedProductsProps> = ({ settings, title, products, onViewProduct, wishlist, onToggleWishlist, onAddToCart, onBuyNow, onQuickView, bgColor = 'bg-background', coupons, variant = 'default', subtitle }) => {
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const revealElements = () => {
        if (sectionRef.current) sectionRef.current.querySelector('[data-featured-header]')?.classList.add('is-visible');
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

    const headerEl = sectionRef.current?.querySelector('[data-featured-header]');
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

  const isMobileHome = variant === 'mobileHome';
  const sectionPadding = isMobileHome ? 'py-8 sm:py-12' : 'py-14 sm:py-24';
  const headerAlignment = isMobileHome ? 'text-left max-w-2xl mb-6' : 'text-center max-w-3xl mx-auto mb-10 sm:mb-16';
  const titleClassName = isMobileHome
    ? 'mb-2 text-2xl font-extrabold tracking-tight text-primary sm:text-3xl'
    : 'mb-3 text-3xl font-extrabold tracking-tight text-primary sm:mb-4 sm:text-4xl';
  const accentClassName = isMobileHome ? 'w-16 h-1 bg-accent rounded-full' : 'w-24 h-1 bg-accent mx-auto rounded-full';
  const productListClassName = isMobileHome
    ? products.length === 1
      ? `grid grid-cols-1 gap-5 sm:max-w-md ${settings.animations.enabled ? 'stagger-animate-container' : ''}`
      : `flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:pb-0 lg:grid-cols-3 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`
    : `grid grid-cols-1 gap-5 sm:gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-10 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`;

  return (
    <section 
      ref={sectionRef}
      className={`${sectionPadding} ${bgColor}`}
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div data-featured-header className={`${headerAlignment} ${settings.animations.enabled ? 'scroll-animate' : ''}`}>
          <h2 className={titleClassName}>{title}</h2>
          {isMobileHome && (
            <p className="mb-4 text-sm leading-6 text-text-muted sm:text-base">
              {subtitle || 'Highly rated picks from learners to continue exploring next.'}
            </p>
          )}
          <div className={accentClassName}></div>
        </div>
        
        <div 
            ref={gridRef} 
            className={productListClassName}
        >
          {products.map((product, index) => (
            <div key={product.id} className={isMobileHome && products.length > 1 ? 'w-[82%] max-w-sm shrink-0 snap-start sm:w-auto sm:max-w-none' : undefined}>
              <ProductCard 
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
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts;
