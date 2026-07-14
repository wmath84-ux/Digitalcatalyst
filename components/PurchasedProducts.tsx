
import React, { useEffect, useRef } from 'react';
import { ProductWithRating, WebsiteSettings } from '../App';
import { getProductImage, getProductImageFallback } from '../utils/productImages';
import SafeImage from './common/SafeImage';

const PurchasedProductCard: React.FC<{
  settings: WebsiteSettings;
  product: ProductWithRating;
  onViewProduct: () => void;
  delay: number;
  variant?: 'default' | 'mobileHome';
}> = ({ settings, product, onViewProduct, delay, variant = 'default' }) => {
    const animationClass = settings.animations.enabled ? `animate-child animate-delay-${delay}` : '';
    const buttonText = 'Access Files';
    const isMobileHome = variant === 'mobileHome';
    const purchaseImage = getProductImage(product, isMobileHome ? 'purchaseSquare' : 'purchaseCard');
    const purchaseImageFallback = getProductImageFallback(product);

    return (
        <div className={`relative bg-white/70 backdrop-blur-xl ${isMobileHome ? 'rounded-lg' : 'rounded-xl'} shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden border border-gray-200 flex flex-col transform hover:-translate-y-2 transition-all duration-300 ease-in-out hover:shadow-sm product-card-shine ${animationClass}`}>
            <div className="purchased-product-media-frame aspect-[4/3] overflow-hidden relative bg-gray-100" style={{ backgroundImage: `url("${purchaseImageFallback}")`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
                <SafeImage src={purchaseImage} fallbackSrc={purchaseImageFallback} alt={product.title} className="h-full w-full object-contain" fallbackTitle={product.title} fallbackBadge={product.category || 'Purchased'} fallbackIcon="🎓" fallbackMessage="Image preview unavailable" aspect="video" loading="eager" fetchPriority={delay <= 8 ? 'high' : 'auto'} decoding="async" loadTimeoutMs={16000} />
                <div className="absolute inset-0 bg-white/20"></div>
                <div className="absolute right-3 top-3 z-20 rounded-full bg-[#059669] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-[0_10px_28px_rgba(5,150,105,0.45)] ring-2 ring-white/95 backdrop-blur-md [text-shadow:0_1px_2px_rgba(0,0,0,0.35)] sm:px-4 sm:text-xs">
                    PURCHASED
                </div>
            </div>
            <div className={`${isMobileHome ? 'p-4' : 'p-6'} flex flex-col flex-grow`}>
                <h3 className={`${isMobileHome ? 'text-base' : 'text-lg'} font-bold text-primary line-clamp-1`} title={product.title}>{product.title}</h3>
                <p className="mt-2 text-text-muted text-sm flex-grow line-clamp-2">{product.description}</p>
                <div className={isMobileHome ? 'mt-4' : 'mt-6'}>
                    <button onClick={onViewProduct} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold px-5 py-3 rounded-lg hover:opacity-90 transition-all duration-300 transform active:scale-95 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        {buttonText}
                    </button>
                </div>
            </div>
        </div>
    );
};


interface PurchasedProductsProps {
  settings: WebsiteSettings;
  products: ProductWithRating[];
  onViewPurchasedProduct: (product: ProductWithRating) => void;
  variant?: 'default' | 'mobileHome';
}

const PurchasedProducts: React.FC<PurchasedProductsProps> = ({ settings, products, onViewPurchasedProduct, variant = 'default' }) => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                }
            });
        },
        { threshold: 0.1, rootMargin: "0px 0px 0px 0px" }
    );

    const currentRef = sectionRef.current;
    if (currentRef) {
        observer.observe(currentRef);
    }

    return () => {
        if (currentRef) {
            observer.unobserve(currentRef);
        }
    };
  }, []);

  const isMobileHome = variant === 'mobileHome';
  const title = isMobileHome ? 'Continue Learning' : 'My Purchases';
  const subtitle = isMobileHome ? 'Access your purchased products instantly.' : 'Welcome back! Here are the products you have access to.';

  return (
    <section 
      ref={sectionRef}
      className={`${isMobileHome ? 'py-8' : 'py-20'} bg-blue-50 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
    >
      <div className={`container mx-auto ${isMobileHome ? 'px-4' : 'px-6'}`}>
        <div className={`${isMobileHome ? 'mb-5 items-start' : 'mb-12 items-end'} flex flex-col md:flex-row justify-between animate-child animate-delay-1`}>
            <div className="max-w-2xl">
                <h2 className={`${isMobileHome ? 'text-2xl' : 'text-3xl'} font-bold text-primary`}>{title}</h2>
                <p className={`${isMobileHome ? 'mt-1 text-sm' : 'mt-2'} text-text-muted`}>
                    {subtitle}
                </p>
            </div>
            <div className={`${isMobileHome ? 'mt-2 text-xs' : 'mt-4 md:mt-0 text-sm'} text-slate-600`}>
                Showing {products.length} item{products.length !== 1 && 's'}
            </div>
        </div>
        
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${isMobileHome ? 'gap-4' : 'gap-8'}`}>
          {products.map((product, index) => (
            <PurchasedProductCard 
              key={product.id} 
              settings={settings}
              product={product} 
              onViewProduct={() => onViewPurchasedProduct(product)}
              delay={index + 2}
              variant={variant}
            />
          ))}
        </div>

        {!isMobileHome ? (
          <footer className="purchase-page-tablet-scroll-footer mt-10 hidden md:block 2xl:hidden" aria-label="Purchase page scroll footer">
            <div className="mx-auto max-w-4xl rounded-[2rem] border border-[#D9E7F8] bg-white/80 p-6 text-center shadow-[0_18px_45px_rgba(8,26,69,0.08)] backdrop-blur-xl">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#1769FF]">Learning library</p>
              <h3 className="mt-2 text-xl font-black text-[#081A45]">Your purchased products are ready whenever you are.</h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-[#536178]">
                This soft footer keeps the purchases page comfortable to scroll on tablet and medium screens without changing your product access flow.
              </p>
            </div>
            <div className="h-[22vh] min-h-32" aria-hidden="true" />
          </footer>
        ) : null}
      </div>
    </section>
  );
};

export default PurchasedProducts;
