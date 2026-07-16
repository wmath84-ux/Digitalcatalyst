
import React from 'react';
import { ProductWithRating, WebsiteSettings, Coupon } from '../App';
import { getProductImage, getProductImageFallback } from '../utils/productImages';
import SafeImage from './common/SafeImage';
import { pillClassForProductRoundness, resolveProductRoundnessSettings } from '../utils/productRoundness';
import type { ProductRoundnessKey } from '../utils/productRoundness';

type ProductCardRoundnessSurface = 'store' | 'homeFeatured' | 'wishlist';

const productCardRoundnessKeyBySurface: Record<ProductCardRoundnessSurface, ProductRoundnessKey> = {
  store: 'storeCards',
  homeFeatured: 'homeFeaturedCards',
  wishlist: 'wishlistCards',
};

interface ProductCardProps {
  settings: WebsiteSettings;
  product: ProductWithRating;
  onViewDetails: (sectionId?: string) => void;
  isWishlisted: boolean;
  onToggleWishlist: (id: number) => void;
  onAddToCart: (productId: number, quantity?: number) => void;
  onBuyNow: (product: ProductWithRating) => void;
  animationDelay: number;
  displayMode?: 'showcase' | 'wishlist';
  coupons: Coupon[];
  isPurchased?: boolean;
  roundnessSurface?: ProductCardRoundnessSurface;
}

const ProductCard: React.FC<ProductCardProps> = ({ settings, product, onViewDetails, isWishlisted, onToggleWishlist, onAddToCart, animationDelay, displayMode = 'showcase', coupons, isPurchased = false, roundnessSurface = 'store' }) => {
    // Use 'animate-child' class to hook into the parent's stagger logic.
    // The 'animate-delay-X' class comes from index.html CSS
    const animationClass = settings.animations.enabled
        ? `animate-child animate-delay-${(animationDelay % 12) + 1}`
        : '';

    const productRoundness = resolveProductRoundnessSettings(settings);
    const surfaceRoundnessKey = productCardRoundnessKeyBySurface[roundnessSurface];
    const isSurfaceRounded = productRoundness[surfaceRoundnessKey] !== false;
    const isInnerFrameRounded = productRoundness.mediaInnerFrame !== false;
    const cardRoundClass = isSurfaceRounded ? 'rounded-[22px]' : 'rounded-xl';
    const mediaPaddingClass = isInnerFrameRounded ? 'p-2 sm:p-3' : '';
    const mediaFrameRoundClass = isInnerFrameRounded ? 'rounded-[18px] bg-white/85 shadow-inner ring-1 ring-white/80' : 'rounded-none bg-transparent';
    const badgeRoundClass = pillClassForProductRoundness(productRoundness.productBadges !== false);
    const actionButtonRoundClass = productRoundness.productActionButtons !== false ? 'rounded-full' : 'rounded-lg';

    const displayImage = getProductImage(product, 'card');
    // Coupon availability logic
    const associatedCoupon = product.couponCode ? coupons.find(c => c.code === product.couponCode) : null;
    let isCouponAvailable = false;
    if (associatedCoupon) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let expiryDate = new Date();
        try {
            const [year, month, day] = associatedCoupon.expiryDate.split('-').map(Number);
            expiryDate = new Date(year, month - 1, day);
            expiryDate.setHours(23, 59, 59, 999);
        } catch(e) { /* ignore invalid date */ }

        isCouponAvailable =
            associatedCoupon.isActive &&
            associatedCoupon.timesUsed < associatedCoupon.usageLimit &&
            expiryDate >= today;
    }

    return (
        <article className={`product-card-shine group relative flex min-h-full flex-col overflow-hidden ${cardRoundClass} border border-[#D6E4F5] bg-gradient-to-b from-white to-[#F8FBFF] shadow-[0_14px_38px_rgba(16,33,63,0.08)] ring-1 ring-white/70 transition duration-300 ease-out hover:-translate-y-1 hover:border-[#AFC8EC] hover:shadow-[0_24px_60px_rgba(16,33,63,0.15)] ${animationClass}`}>
            {/* Image Container */}
            <div className={`relative aspect-[4/3] w-full overflow-hidden border-b border-[#E1EAF6] bg-gradient-to-br from-[#F6FAFF] via-white to-[#EEF4FF] ${mediaPaddingClass}`}>
                <div className={`product-card-media-safe-frame relative h-full w-full overflow-hidden ${mediaFrameRoundClass}`}>
                <SafeImage
                    src={displayImage}
                    fallbackSrc={getProductImageFallback(product)}
                    alt={product.title}
                    wrapperClassName="absolute inset-0"
                    className="h-full w-full object-contain p-1"
                    fallbackTitle={product.title}
                    fallbackBadge={product.category || 'Product'}
                    fallbackIcon="🎓"
                    fallbackMessage="Image preview unavailable"
                    aspect="video"
                />
                </div>
                <button
                    type="button"
                    onClick={() => onViewDetails()}
                    aria-label={`Open ${product.title}`}
                    className="absolute inset-0 z-10 cursor-pointer focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[-4px] focus-visible:outline-indigo-500/70"
                />

                {/* Badges */}
                <div className="absolute left-2 top-2 z-20 flex max-w-[72%] flex-col items-start gap-1.5 sm:left-3 sm:top-3 sm:gap-2">
                    {isPurchased ? (
                        <span className={`w-fit ${badgeRoundClass} bg-[#059669] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-[0_10px_28px_rgba(5,150,105,0.45)] ring-2 ring-white/95 backdrop-blur-md [text-shadow:0_1px_2px_rgba(0,0,0,0.35)] sm:px-4 sm:text-xs`}>
                            Purchased
                        </span>
                    ) : (
                        <>
                            {product.isFree && (
                                <span className={`w-fit ${badgeRoundClass} bg-gradient-to-r from-[#0757d8] to-[#6d28d9] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-[0_10px_28px_rgba(37,99,235,0.45)] ring-2 ring-white/95 backdrop-blur-md [text-shadow:0_1px_2px_rgba(0,0,0,0.35)] sm:px-4 sm:text-xs`}>
                                    Free
                                </span>
                            )}
                            {isCouponAvailable && product.couponCode && !product.isFree && settings.features.showSaleBadges && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onViewDetails('price-section'); }}
                                    className={`w-fit ${badgeRoundClass} bg-[#6d28d9] px-3.5 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-[0_10px_28px_rgba(109,40,217,0.45)] ring-2 ring-white/95 backdrop-blur-md transition-transform hover:scale-105 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)] sm:px-4 sm:text-xs`}
                                    title={`Use coupon ${product.couponCode}`}
                                >
                                    {product.couponCode}
                                </button>
                            )}
                            {!product.isFree && product.salePrice && settings.features.showSaleBadges && (
                                <span className={`w-fit ${badgeRoundClass} bg-[#e11d48] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-[0_10px_28px_rgba(225,29,72,0.45)] ring-2 ring-white/95 backdrop-blur-md [text-shadow:0_1px_2px_rgba(0,0,0,0.35)] sm:px-4 sm:text-xs`}>
                                    Sale
                                </span>
                            )}
                        </>
                    )}
                </div>

                {/* Wishlist Button */}
                {settings.features.showFavourites && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleWishlist(product.id); }}
                        className={`absolute right-2 top-2 z-30 ${badgeRoundClass} bg-white/90 p-2 text-slate-600 shadow-sm backdrop-blur transition-all duration-200 hover:scale-110 hover:bg-white hover:text-red-500 sm:right-3 sm:top-3`}
                        aria-label={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill={isWishlisted ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isWishlisted ? 0 : 2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="flex flex-grow flex-col p-4 sm:p-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                    {settings.features.showReviews && product.rating > 0 && (
                        <div className={`flex items-center gap-1 border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-600 shadow-sm ${badgeRoundClass}`}>
                            <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                            {product.rating.toFixed(1)} <span className="text-slate-600">({product.reviewCount})</span>
                        </div>
                    )}
                    {!isPurchased && product.category && <span className={`${badgeRoundClass} border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#1557B0] ring-1 ring-white/80`}>{product.category}</span>}
                </div>

                <h3 className="mb-2 line-clamp-2 text-base font-black leading-tight text-[#081A44] transition-colors group-hover:text-primary sm:text-lg" title={product.title}>
                    <button type="button" onClick={() => onViewDetails()} className="block w-full text-left focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
                        {product.title}
                    </button>
                </h3>
                <p className="mb-3 line-clamp-2 flex-grow text-[13px] font-semibold leading-5 text-[#64708F] sm:mb-4 sm:text-sm">{product.description}</p>

                {displayMode === 'showcase' ? (
                     <div className="mt-auto flex items-end justify-between gap-3 rounded-2xl border border-[#E6EEF9] bg-white/75 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-3.5">
                        <div className="flex flex-col">
                            {product.isFree ? (
                                <>
                                    <span className="text-xs text-slate-600 font-medium line-through">Price</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-lg font-bold text-blue-600 sm:text-xl">Free</span>
                                        <span className="text-xs text-slate-600">(₹3 fee)</span>
                                    </div>
                                </>
                            ) : product.salePrice ? (
                                <>
                                    <span className="text-xs text-slate-600 font-medium line-through">{product.price}</span>
                                    <span className="text-lg font-bold text-gray-900 sm:text-xl">{product.salePrice}</span>
                                </>
                            ) : (
                                <>
                                    <span className="text-xs text-slate-600 font-medium">Price</span>
                                    <span className="text-lg font-bold text-gray-900 sm:text-xl">{product.price}</span>
                                </>
                            )}
                        </div>
                        <button onClick={() => onViewDetails()} className={`flex shrink-0 items-center ${actionButtonRoundClass} bg-gradient-to-r from-[#1769FF] to-[#6D5CFF] px-3.5 py-2.5 text-xs font-black text-white shadow-[0_10px_24px_rgba(23,105,255,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(23,105,255,0.32)] active:scale-95 sm:px-4 sm:text-sm`}>
                            {isPurchased ? 'Purchased' : 'Details'} <span className="ml-1">&rarr;</span>
                        </button>
                    </div>
                ) : (
                    <div className="mt-4 flex gap-2">
                        <button
                            disabled={isPurchased}
                            onClick={() => onAddToCart(product.id, 1)}
                            className={`flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold py-2 ${actionButtonRoundClass} hover:bg-opacity-90 transition-colors text-sm shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            {isPurchased ? 'Purchased' : 'Move to Cart'}
                        </button>
                        <button
                            onClick={() => onToggleWishlist(product.id)}
                            className={`px-3 py-2 border border-gray-200 text-slate-600 ${actionButtonRoundClass} hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors`}
                            title="Remove from Wishlist"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>
        </article>
    );
};

export default ProductCard;
