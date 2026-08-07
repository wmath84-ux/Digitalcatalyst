
import React, { useEffect, useRef } from 'react';
import { ProductWithRating, WebsiteSettings } from '../App';
import { getProductImage, getProductImageCandidates, getProductImageFallback } from '../utils/productImages';
import SafeImage from './common/SafeImage';
import { pillClassForProductRoundness, resolveProductRoundnessSettings } from '../utils/productRoundness';

const PURCHASED_IMAGE_LOAD_TIMEOUT_MS = 14000;

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
    const isCompactMobileGrid = !isMobileHome;
    const productRoundness = resolveProductRoundnessSettings(settings);
    const purchasedCardRoundClass = productRoundness.myPurchasesCards !== false ? (isMobileHome ? 'rounded-lg' : 'rounded-xl') : 'rounded-none';
    const purchasedBadgeRoundClass = pillClassForProductRoundness(productRoundness.productBadges !== false);
    const purchasedActionButtonRoundClass = productRoundness.productActionButtons !== false ? 'rounded-lg' : 'rounded-none';
    const purchaseImageSlot = isMobileHome ? 'purchaseSquare' : 'purchaseCard';
    const purchaseImageCandidates = getProductImageCandidates(product, purchaseImageSlot).filter(Boolean);
    const purchaseImage = purchaseImageCandidates[0] || getProductImage(product, purchaseImageSlot);
    const purchaseImageFallback = getProductImageFallback(product);
    const purchaseImageKey = `${product.id}-${purchaseImage}-${purchaseImageFallback}`;

    return (
        <div className={`purchased-mobile-grid-card relative flex min-h-full flex-col overflow-hidden border border-gray-200 bg-white/95 ${purchasedCardRoundClass} shadow-[0_6px_18px_rgba(8,26,68,0.08)] transition-[border-color,box-shadow,transform] duration-200 sm:hover:-translate-y-1 sm:hover:border-blue-200 sm:hover:shadow-[0_12px_28px_rgba(8,26,68,0.12)] product-card-shine ${animationClass}`}>
            <div className="purchased-product-media-frame relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                <SafeImage
                    key={purchaseImageKey}
                    src={purchaseImage || purchaseImageFallback}
                    fallbackCandidates={purchaseImageCandidates.slice(1)}
                    fallbackSrc={purchaseImageFallback}
                    alt={product.title}
                    wrapperClassName="absolute inset-0 z-10 block"
                    className="block h-full w-full object-contain"
                    fallbackTitle={product.title}
                    fallbackBadge={product.category || 'Purchased'}
                    fallbackIcon="🎓"
                    fallbackMessage="Image preview unavailable"
                    aspect="video"
                    loading={delay <= 2 ? 'eager' : 'lazy'}
                    fetchPriority={delay <= 2 ? 'high' : 'auto'}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    loadTimeoutMs={PURCHASED_IMAGE_LOAD_TIMEOUT_MS}
                />
                <div className="pointer-events-none absolute inset-0 z-[11] bg-white/5"></div>
                <div className={`absolute z-20 ${purchasedBadgeRoundClass} bg-[#059669] font-black uppercase text-white shadow-sm ring-1 ring-white/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.25)] ${isCompactMobileGrid ? 'right-1.5 top-1.5 px-2 py-1 text-[8px] tracking-[0.12em] sm:right-3 sm:top-3 sm:px-4 sm:py-1.5 sm:text-xs sm:tracking-[0.18em]' : 'right-3 top-3 px-3.5 py-1.5 text-[10px] tracking-[0.18em] sm:px-4 sm:text-xs'}`}>
                    PURCHASED
                </div>
            </div>
            <div className={`${isCompactMobileGrid ? 'p-2.5 sm:p-6' : 'p-4'} flex flex-grow flex-col`}>
                <h3 className={`${isCompactMobileGrid ? 'line-clamp-2 text-[13px] leading-[1.2] sm:line-clamp-1 sm:text-lg sm:leading-normal' : 'line-clamp-1 text-base'} font-bold text-primary`} title={product.title}>{product.title}</h3>
                <p className={`${isCompactMobileGrid ? 'hidden sm:block' : 'block'} mt-2 flex-grow line-clamp-2 text-sm text-text-muted`}>{product.description}</p>
                <div className={isCompactMobileGrid ? 'mt-2.5 sm:mt-6' : 'mt-4'}>
                    <button onClick={onViewProduct} className={`flex w-full items-center justify-center bg-gradient-to-r from-[#1769FF] to-[#6D5CFF] font-semibold text-white shadow-[0_6px_16px_rgba(23,105,255,0.20)] transition active:scale-95 ${purchasedActionButtonRoundClass} ${isCompactMobileGrid ? 'min-h-9 gap-1 px-2 py-2 text-[10px] sm:min-h-0 sm:gap-2 sm:px-5 sm:py-3 sm:text-base' : 'gap-2 px-5 py-3'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className={isCompactMobileGrid ? 'h-4 w-4 sm:h-5 sm:w-5' : 'h-5 w-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <span className="truncate">{buttonText}</span>
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
      className={`${isMobileHome ? 'py-8 bg-blue-50' : 'pt-14 pb-28 sm:py-24 bg-[#F7F9FC]'} ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
    >
      <div className={`container mx-auto ${isMobileHome ? 'px-4' : 'px-6'}`}>
        <div className={`${isMobileHome ? 'mb-5 items-start' : 'mb-10 items-end'} flex flex-col md:flex-row justify-between animate-child animate-delay-1`}>
            <div className="max-w-2xl">
                {isMobileHome ? (
                    <>
                        <h2 className="text-2xl font-bold text-primary">{title}</h2>
                        <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
                    </>
                ) : (
                    <>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#1557B0]">Your learning library</p>
                        <h2 className="mt-3 text-3xl font-black tracking-tight text-[#10213F] sm:text-5xl">{title}</h2>
                        <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-[#526179] sm:text-lg">{subtitle}</p>
                    </>
                )}
            </div>
            <div className={isMobileHome ? 'mt-2 text-xs text-slate-600' : 'mt-5 shrink-0 rounded-full border border-[#D9E7F8] bg-white px-4 py-2 text-sm font-black text-[#1557B0] shadow-sm md:mt-0'}>
                {products.length} item{products.length === 1 ? '' : 's'} unlocked
            </div>
        </div>

        <div className={`purchased-mobile-two-column-grid grid md:grid-cols-2 lg:grid-cols-3 ${isMobileHome ? 'grid-cols-1 gap-4' : 'grid-cols-2 gap-2.5 sm:gap-8'}`}>
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

        {!isMobileHome && products.length === 0 ? (
          <div className="mx-auto mt-4 max-w-2xl rounded-[2rem] border border-dashed border-[#D7E7F8] bg-white p-10 text-center shadow-sm">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#EEF4FF] text-[#1769FF]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>
            </div>
            <h3 className="mt-5 text-2xl font-black text-[#10213F]">Your library is waiting</h3>
            <p className="mt-3 text-base font-bold leading-7 text-[#526179]">Products you purchase will appear here, ready to access anytime.</p>
          </div>
        ) : null}

        {!isMobileHome ? (
          <footer className="purchase-page-tablet-scroll-footer mt-10 hidden md:block 2xl:hidden" aria-label="Purchase page scroll footer">
            <div className="mx-auto max-w-4xl rounded-[2rem] border border-[#D9E7F8] bg-white/80 p-6 text-center shadow-[0_10px_28px_rgba(8,26,69,0.08)]">
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
