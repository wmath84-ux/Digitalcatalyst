
import React from 'react';
import { ProductWithRating, WebsiteSettings, Coupon } from '../App';

interface ProductCardProps {
  settings: WebsiteSettings;
  product: ProductWithRating;
  onViewDetails: (sectionId?: string) => void;
  isWishlisted: boolean;
  onToggleWishlist: (id: number) => void;
  onAddToCart: (productId: number, quantity?: number) => void;
  onBuyNow: (product: ProductWithRating) => void;
  onQuickView: (product: ProductWithRating) => void;
  animationDelay: number;
  displayMode?: 'showcase' | 'wishlist';
  coupons: Coupon[];
}

const ProductCard: React.FC<ProductCardProps> = ({ settings, product, onViewDetails, isWishlisted, onToggleWishlist, onAddToCart, onQuickView, animationDelay, displayMode = 'showcase', coupons }) => {
    // Use 'animate-child' class to hook into the parent's stagger logic.
    // The 'animate-delay-X' class comes from index.html CSS
    const animationClass = settings.animations.enabled 
        ? `animate-child animate-delay-${(animationDelay % 12) + 1}` 
        : '';
    
    const displayImage = product.images && product.images.length > 0 ? product.images[0] : `https://picsum.photos/seed/${product.imageSeed}/600/400`;
    const handleQuickViewClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onQuickView(product);
    };
    
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
        <div className={`group relative bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm hover:shadow-sm transition-all duration-300 ease-out border border-gray-100 flex flex-col overflow-hidden hover:-translate-y-2 product-card-shine ${animationClass}`}>
            {/* Image Container */}
            <div className="relative w-full overflow-hidden aspect-[4/3] bg-gray-100">
                <img 
                    src={displayImage} 
                    alt={product.title} 
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110" 
                    loading="lazy"
                />
                
                {/* Overlay on Hover (Desktop) */}
                {displayMode === 'showcase' && (
                    <div className="absolute inset-x-0 bottom-0 flex translate-y-0 items-end justify-center bg-gradient-to-t from-slate-50/80 via-indigo-50/30/40 to-transparent p-3 pb-4 transition-transform duration-300 ease-in-out sm:translate-y-full sm:p-4 sm:pb-6 sm:group-hover:translate-y-0">
                         <button onClick={handleQuickViewClick} className="w-full max-w-[13rem] rounded-xl border border-white/60 bg-white/30 px-4 py-2.5 text-sm font-bold text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md transition-colors hover:bg-white/45 active:scale-95 sm:px-5 sm:py-3">
                             Quick View
                         </button>
                    </div>
                )}

                {/* Badges */}
                <div className="absolute left-2 top-2 flex flex-col gap-1.5 sm:left-3 sm:top-3 sm:gap-2">
                    {product.isFree && (
                        <span className="rounded-md bg-gradient-to-r from-indigo-600 to-purple-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-fade-in sm:px-3 sm:text-xs">
                            Free
                        </span>
                    )}
                    {isCouponAvailable && product.couponCode && !product.isFree && settings.features.showSaleBadges && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); onViewDetails('price-section'); }} 
                            className="rounded-md bg-purple-600 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-transform hover:scale-105 sm:px-3 sm:text-xs"
                            title={`Use coupon ${product.couponCode}`}
                        >
                            {product.couponCode}
                        </button>
                    )}
                    {!product.isFree && product.salePrice && settings.features.showSaleBadges && (
                        <span className="rounded-md bg-red-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:px-3 sm:text-xs">
                            Sale
                        </span>
                    )}
                </div>

                {/* Wishlist Button */}
                {settings.features.showFavourites && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onToggleWishlist(product.id); }}
                        className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-2 text-slate-600 shadow-sm backdrop-blur transition-all duration-200 hover:scale-110 hover:bg-white hover:text-red-500 sm:right-3 sm:top-3"
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
                <div className="mb-1 flex items-center justify-between gap-2">
                    {settings.features.showReviews && product.rating > 0 && (
                        <div className="flex items-center gap-1 text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
                            <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                            {product.rating.toFixed(1)} <span className="text-slate-600">({product.reviewCount})</span>
                        </div>
                    )}
                    {product.category && <span className="text-xs text-slate-600 font-medium uppercase tracking-wide">{product.category}</span>}
                </div>

                <h3 className="mb-2 line-clamp-2 text-base font-bold leading-tight text-gray-900 transition-colors group-hover:text-primary sm:text-lg" title={product.title}>
                    {product.title}
                </h3>
                <p className="mb-3 line-clamp-2 flex-grow text-sm leading-6 text-slate-600 sm:mb-4">{product.description}</p>

                {displayMode === 'showcase' ? (
                     <div className="mt-auto flex items-end justify-between gap-3 border-t border-gray-50 pt-3 sm:pt-4">
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
                        <button onClick={() => onViewDetails()} className="flex shrink-0 items-center rounded-full border border-indigo-200/70 bg-white/85 px-3 py-2 text-xs font-black text-primary shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50 active:scale-95 sm:px-4 sm:text-sm">
                            Details <span className="ml-1">&rarr;</span>
                        </button>
                    </div>
                ) : (
                    <div className="mt-4 flex gap-2">
                        <button 
                            onClick={() => onAddToCart(product.id, 1)} 
                            className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold py-2 rounded-lg hover:bg-opacity-90 transition-colors text-sm shadow-sm active:scale-95"
                        >
                            Move to Cart
                        </button>
                        <button 
                            onClick={() => onToggleWishlist(product.id)}
                            className="px-3 py-2 border border-gray-200 text-slate-600 rounded-lg hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                            title="Remove from Wishlist"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductCard;
