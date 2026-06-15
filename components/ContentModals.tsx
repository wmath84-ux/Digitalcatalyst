
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
                                onQuickView={() => {}} // No quick view from this modal
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
  <section className="min-h-screen bg-gradient-to-br from-white via-cyan-50 to-indigo-50 px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
    <div className="mx-auto max-w-6xl">
      <button onClick={onBack} className="rounded-full border border-cyan-100 bg-white/90 px-5 py-2.5 text-sm font-black text-slate-700 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-cyan-50">← Back</button>
      <div className="mx-auto mt-8 max-w-3xl text-center">
        <p className="text-sm font-black uppercase tracking-[0.28em] text-cyan-700">Free product library</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-primary sm:text-5xl">Free Digital Goodies</h1>
        <p className="mt-4 text-base font-semibold leading-7 text-slate-600 sm:text-lg">Browse every available free product in a full page experience.</p>
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
              onQuickView={() => {}}
              animationDelay={index}
              coupons={[]}
            />
          ))}
        </div>
      ) : (
        <div className="mx-auto mt-12 max-w-2xl rounded-[2rem] border border-dashed border-cyan-200 bg-white/85 p-8 text-center shadow-sm backdrop-blur-xl sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-50 text-3xl">🎁</div>
          <h2 className="mt-5 text-2xl font-black text-slate-900">There is no free product available right now.</h2>
          <p className="mt-3 text-base font-bold leading-7 text-slate-600">Contact to your master, tag your master in Eduvora community.</p>
        </div>
      )}
    </div>
  </section>
);
