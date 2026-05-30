
import React, { useRef, useEffect } from 'react';
import { ProductWithRating, WebsiteSettings } from '../App';
import ProductCard from './ProductCard';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

// --- Free Products Modal ---
interface FreeProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductWithRating[];
  settings: WebsiteSettings;
  onAddToCart: (productId: number, quantity?: number) => void;
  onViewProduct: (product: ProductWithRating) => void;
}

export const FreeProductsModal: React.FC<FreeProductsModalProps> = ({ isOpen, onClose, products, settings, onAddToCart, onViewProduct }) => {
    const modalContentRef = useRef<HTMLDivElement>(null);
    useBodyScrollLock(isOpen);

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
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-xl" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="free-modal-title">
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
