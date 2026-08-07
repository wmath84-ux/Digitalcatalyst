
import React, { useRef, useEffect } from 'react';
import { ProductWithRating, WebsiteSettings } from '../App';
import ProductCard from './ProductCard';

// --- Free Products Modal ---
interface FreeProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductWithRating[];
  settings: WebsiteSettings;
  onAddToCart: (productId: number, quantity?: number) => void;
  onBuyNow: (product: ProductWithRating) => void;
  onViewProduct: (product: ProductWithRating) => void;
}

export const FreeProductsModal: React.FC<FreeProductsModalProps> = ({ isOpen, onClose, products, settings, onAddToCart, onBuyNow, onViewProduct }) => {
    const modalContentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen || !settings.animations.enabled) return;
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    entry.target.classList.toggle('is-visible', entry.isIntersecting);
                });
            },
            { root: modalContentRef.current, rootMargin: '0px 0px -50px 0px', threshold: 0.1 }
        );
        const elements = modalContentRef.current?.querySelectorAll('.scroll-animate');
        if (elements) elements.forEach(el => observer.observe(el));
        return () => { if (elements) elements.forEach(el => observer.unobserve(el)); };
    }, [isOpen, products, settings.animations.enabled]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-white/70 p-4 backdrop-blur-xl" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="free-modal-title">
            <div ref={modalContentRef} className="relative max-h-[90vh] w-[90vw] max-w-5xl overflow-y-auto rounded-[2rem] border border-white/50 bg-white/70 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-3xl" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-3 right-4 text-slate-600 hover:text-slate-900 font-bold text-2xl z-10" aria-label="Close free products modal">&times;</button>
                
                <div className="text-center mb-8">
                    <h2 id="free-modal-title" className="text-3xl font-extrabold text-slate-900">Free Digital Goodies</h2>
                    <p className="mt-2 text-lg text-slate-600">
                        Enjoy these complimentary resources, on us! A nominal fee of ₹3 applies.
                    </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {products.length > 0 ? products.map((product) => (
                        <div key={product.id} className={settings.animations.enabled ? 'scroll-animate' : ''}>
                            <ProductCard 
                                settings={settings}
                                product={product} 
                                onViewDetails={() => onViewProduct(product)}
                                isWishlisted={false} // Wishlist isn't relevant here
                                onToggleWishlist={() => {}} // No-op
                                onAddToCart={onAddToCart}
                                onBuyNow={onBuyNow}
                                                  animationDelay={0} // Stagger animation is disabled here
                                coupons={[]} // Empty coupons for free products
                            />
                        </div>
                    )) : (
                        <div className="col-span-full text-center py-12 text-slate-600">
                            <p>No free products available at the moment. Check back soon!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

interface FreeProductsPageProps {
  settings: WebsiteSettings;
  products: ProductWithRating[];
  onBack: () => void;
  onAddToCart: (productId: number, quantity?: number) => void;
  onBuyNow: (product: ProductWithRating) => void;
  onViewProduct: (product: ProductWithRating) => void;
}

export const FreeProductsPage: React.FC<FreeProductsPageProps> = ({ settings, products, onBack, onAddToCart, onBuyNow, onViewProduct }) => (
  <section className="min-h-screen bg-gradient-to-b from-[#F2FAF5] via-[#F7F9FC] to-[#F7F9FC] px-4 pt-8 pb-28 text-slate-900 sm:px-6 sm:py-12">
    <div className="mx-auto max-w-6xl">
      <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-[#CDEBDC] bg-white px-5 py-2.5 text-sm font-black text-[#0E7A4D] shadow-sm transition hover:-translate-y-0.5 hover:border-[#9BD9B9] hover:bg-[#F4FBF6]">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        Back to store
      </button>

      <div className="mx-auto mt-10 max-w-3xl text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-[1.35rem] bg-gradient-to-br from-[#10B981] to-[#0E7A4D] text-white shadow-[0_14px_34px_rgba(16,185,129,0.28)]">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v9H4v-9" /><path d="M2 7h20v5H2z" /><path d="M12 7v14" /><path d="M12 7s-1-5-4-5c-2 0-3 1.5-3 3s1 2 3 2h4z" /><path d="M12 7s1-5 4-5c2 0 3 1.5 3 3s-1 2-3 2h-4z" /></svg>
        </div>
        <p className="mt-6 text-sm font-black uppercase tracking-[0.2em] text-[#0E7A4D]">Free product library</p>
        <h1 className="mt-3 text-balance text-3xl font-black tracking-tight text-[#10213F] sm:text-5xl">Free Digital Goodies</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base font-bold leading-7 text-[#526179] sm:text-lg">Every free resource in one place. Grab them anytime — no payment, no catch.</p>
        <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#CDEBDC] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#0E7A4D] shadow-sm">
          {products.length} free resource{products.length === 1 ? '' : 's'}
        </span>
      </div>

      {products.length > 0 ? (
        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-14 sm:gap-8 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product, index) => (
            <ProductCard
              key={product.id}
              settings={settings}
              product={product}
              onViewDetails={() => onViewProduct(product)}
              isWishlisted={false}
              onToggleWishlist={() => {}}
              onAddToCart={onAddToCart}
              onBuyNow={onBuyNow}
              animationDelay={index}
              coupons={[]}
            />
          ))}
        </div>
      ) : (
        <div className="mx-auto mt-12 max-w-2xl rounded-[2rem] border border-dashed border-[#CDEBDC] bg-white p-8 text-center shadow-sm sm:p-10">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#EAF7F0] text-[#0E7A4D]">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v9H4v-9" /><path d="M2 7h20v5H2z" /><path d="M12 7v14" /></svg>
          </div>
          <h2 className="mt-5 text-2xl font-black text-[#10213F]">No free products right now</h2>
          <p className="mt-3 text-base font-bold leading-7 text-[#526179]">Check back soon for new complimentary resources.</p>
          <button onClick={onBack} className="mt-6 rounded-full bg-gradient-to-r from-[#10B981] to-[#0E7A4D] px-6 py-3 text-sm font-black text-white shadow-[0_12px_30px_rgba(16,185,129,0.25)] transition hover:opacity-90 active:scale-95">
            Back to store
          </button>
        </div>
      )}
    </div>
  </section>
);
