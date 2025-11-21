
import React from 'react';
import { ProductWithRating, WebsiteSettings, Coupon } from '../App';

interface ProductCardProps {
  settings: WebsiteSettings;
  product: ProductWithRating;
  onViewDetails: (sectionId?: string) => void;
  isWishlisted: boolean;
  onToggleWishlist: (id: number) => void;
  onAddToCart: (productId: number, quantity?: number) => void;
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
        <div className={`group relative bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 ease-out border border-gray-100 flex flex-col overflow-hidden hover:-translate-y-2 product-card-shine ${animationClass}`}>
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
                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out flex items-end justify-center gap-2 pb-6">
                         <button onClick={() => onAddToCart(product.id, 1)} className="bg-white text-gray-900 font-bold px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm shadow-lg active:scale-95">
                             Add to Cart
                         </button>
                         <button onClick={() => onQuickView(product)} className="bg-white/20 backdrop-blur-md border border-white/50 text-white font-bold px-4 py-2 rounded-lg hover:bg-white/30 transition-colors text-sm shadow-lg active:scale-95">
                             Quick View
                         </button>
                    </div>
                )}

                {/* Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-2">
                    {product.isFree && (
                        <span className="bg-blue-600 text-white px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md shadow-md animate-fade-in">
                            Free
                        </span>
                    )}
                    {isCouponAvailable && product.couponCode && !product.isFree && settings.features.showSaleBadges && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); onViewDetails('price-section'); }} 
                            className="bg-purple-600 text-white px-3 py-1 rounded-md text-xs font-bold tracking-wider shadow-md hover:scale-105 transition-transform font-mono"
                            title={`Use coupon ${product.couponCode}`}
                        >
                            {product.couponCode}
                        </button>
                    )}
                    {!product.isFree && product.salePrice && settings.features.showSaleBadges && (
                        <span className="bg-red-500 text-white px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md shadow-md">
                            Sale
                        </span>
                    )}
                </div>

                {/* Wishlist Button */}
                {settings.features.showFavourites && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onToggleWishlist(product.id); }}
                        className="absolute top-3 right-3 bg-white/90 backdrop-blur rounded-full p-2 text-gray-400 hover:text-red-500 hover:bg-white shadow-sm transition-all duration-200 hover:scale-110 z-10"
                        aria-label={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill={isWishlisted ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isWishlisted ? 0 : 2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="p-5 flex flex-col flex-grow">
                <div className="mb-1 flex items-center justify-between">
                    {settings.features.showReviews && product.rating > 0 && (
                        <div className="flex items-center gap-1 text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
                            <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                            {product.rating.toFixed(1)} <span className="text-gray-400">({product.reviewCount})</span>
                        </div>
                    )}
                    {product.category && <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{product.category}</span>}
                </div>

                <h3 className="text-lg font-bold text-gray-900 leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2" title={product.title}>
                    {product.title}
                </h3>
                <p className="text-sm text-gray-500 line-clamp-2 mb-4 flex-grow">{product.description}</p>

                {displayMode === 'showcase' ? (
                     <div className="flex items-end justify-between mt-auto pt-4 border-t border-gray-50">
                        <div className="flex flex-col">
                            {product.isFree ? (
                                <>
                                    <span className="text-xs text-gray-400 font-medium line-through">Price</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-bold text-blue-600">Free</span>
                                        <span className="text-xs text-gray-400">(₹3 fee)</span>
                                    </div>
                                </>
                            ) : product.salePrice ? (
                                <>
                                    <span className="text-xs text-gray-400 font-medium line-through">{product.price}</span>
                                    <span className="text-xl font-bold text-gray-900">{product.salePrice}</span>
                                </>
                            ) : (
                                <>
                                    <span className="text-xs text-gray-400 font-medium">Price</span>
                                    <span className="text-xl font-bold text-gray-900">{product.price}</span>
                                </>
                            )}
                        </div>
                        <button onClick={() => onViewDetails()} className="text-primary font-semibold text-sm hover:underline group-hover:translate-x-1 transition-transform flex items-center">
                            Details <span className="ml-1">&rarr;</span>
                        </button>
                    </div>
                ) : (
                    <div className="mt-4 flex gap-2">
                        <button 
                            onClick={() => onAddToCart(product.id, 1)} 
                            className="flex-1 bg-primary text-white font-semibold py-2 rounded-lg hover:bg-opacity-90 transition-colors text-sm shadow-sm active:scale-95"
                        >
                            Move to Cart
                        </button>
                        <button 
                            onClick={() => onToggleWishlist(product.id)}
                            className="px-3 py-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
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
