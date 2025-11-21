
// FIX: Imported useState, useEffect, and useRef hooks from React to resolve 'Cannot find name' errors.
import React, { useState, useEffect, useRef } from 'react';
import { ProductWithRating, Review, Coupon, WebsiteSettings, PriceHistoryEntry } from '../App';
import PaymentModal from './PaymentModal';
import RatingsAndReviews from './RatingsAndReviews';
import FeaturedProducts from './FeaturedProducts';
import ShareModal from './ShareModal';
import AiMentor from './AiMentor';

// ... (ImageZoomModal and PriceChart components remain unchanged, keeping them here for brevity) ...
// A new, self-contained component for the image zoom modal with pan, zoom, and swipe-to-dismiss
const ImageZoomModal: React.FC<{ src: string; alt: string; onClose: () => void; }> = ({ src, alt, onClose }) => {
    const [offset, setOffset] = React.useState({ x: 0, y: 0 });
    const [scale, setScale] = React.useState(1);
    
    const imgRef = React.useRef<HTMLImageElement>(null);
    const overlayRef = React.useRef<HTMLDivElement>(null);

    // Using refs for values that change frequently in event listeners to avoid re-renders
    const isDraggingRef = React.useRef(false);
    const dragStartRef = React.useRef({ x: 0, y: 0 });
    const pointersRef = React.useRef<PointerEvent[]>([]);
    const initialPinchDistRef = React.useRef(0);

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        pointersRef.current.push(e.nativeEvent);
        
        if (pointersRef.current.length === 1) { // Pan / Swipe start
            isDraggingRef.current = true;
            dragStartRef.current = {
                x: e.clientX - offset.x,
                y: e.clientY - offset.y,
            };
        } else if (pointersRef.current.length === 2) { // Pinch start
            const [p1, p2] = pointersRef.current;
            initialPinchDistRef.current = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        }
    };
    
    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDraggingRef.current) return;

        if (pointersRef.current.length === 1) { // Panning or Swiping
            const currentX = e.clientX - dragStartRef.current.x;
            const currentY = e.clientY - dragStartRef.current.y;

            if (scale > 1) { // Panning
                setOffset({ x: currentX, y: currentY });
            } else { // Swiping to dismiss
                setOffset({ x: 0, y: currentY }); // Only allow vertical movement
                const opacity = Math.max(0.2, 1 - Math.abs(currentY) / 500);
                if (overlayRef.current) {
                    overlayRef.current.style.backgroundColor = `rgba(0, 0, 0, ${0.8 * opacity})`;
                }
            }
        } else if (pointersRef.current.length === 2) { // Pinching
            // Find and update the moved pointer
            const pointerIndex = pointersRef.current.findIndex(p => p.pointerId === e.pointerId);
            if (pointerIndex !== -1) {
                pointersRef.current[pointerIndex] = e.nativeEvent;
            }
            const [p1, p2] = pointersRef.current;
            const currentDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
            
            if (initialPinchDistRef.current > 0) {
                const newScale = scale * (currentDist / initialPinchDistRef.current);
                setScale(Math.max(1, Math.min(newScale, 5)));
                initialPinchDistRef.current = currentDist;
            }
        }
    };
    
    const handlePointerUp = (e: React.PointerEvent) => {
        pointersRef.current = pointersRef.current.filter(p => p.pointerId !== e.pointerId);
        
        if (pointersRef.current.length < 2) {
            initialPinchDistRef.current = 0;
        }
        if (pointersRef.current.length < 1) {
            isDraggingRef.current = false;
            // Check for swipe-to-dismiss completion
            if (scale === 1 && Math.abs(offset.y) > 100) {
                onClose();
            } else {
                // Animate back to center if not dismissed
                setOffset({ x: 0, y: 0 });
                if (overlayRef.current) {
                    overlayRef.current.style.transition = 'background-color 0.3s ease';
                    overlayRef.current.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                }
            }
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const { clientX, clientY, deltaY } = e;
        const img = imgRef.current;
        if (!img) return;

        const rect = img.getBoundingClientRect();
        
        // Position of the pointer inside the image element
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        const scaleMultiplier = 1 - deltaY * 0.001;
        const newScale = Math.max(1, Math.min(scale * scaleMultiplier, 5));

        // How much the image will grow from the pointer's perspective
        const newX = offset.x - (x - offset.x) * (newScale / scale - 1);
        const newY = offset.y - (y - offset.y) * (newScale / scale - 1);

        setScale(newScale);
        setOffset({ x: newX, y: newY });
    };

    const handleCloseClick = () => {
        // If zoomed in, first zoom out. Otherwise, close.
        if (scale > 1) {
            setScale(1);
            setOffset({ x: 0, y: 0 });
        } else {
            onClose();
        }
    }

    const imageStyle: React.CSSProperties = {
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
        transition: isDraggingRef.current ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0, 0.38, 0.9)',
        cursor: isDraggingRef.current ? 'grabbing' : (scale > 1 ? 'grab' : 'zoom-out'),
    };
    
    // Animate out on close
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div 
            ref={overlayRef}
            className="image-zoom-overlay" 
            onClick={handleCloseClick}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
        >
            <div className="image-zoom-content" onClick={e => e.stopPropagation()}>
                <img 
                    ref={imgRef}
                    src={src} 
                    alt={alt}
                    style={imageStyle}
                    onPointerDown={handlePointerDown}
                />
            </div>
             <button onClick={onClose} className="image-zoom-close" aria-label="Close image view">&times;</button>
        </div>
    );
};


const PriceChart: React.FC<{ basePrice: number, priceHistory?: PriceHistoryEntry[] }> = ({ basePrice, priceHistory }) => {
    const data: { date: Date; price: number; }[] = (() => {
        if (priceHistory && priceHistory.length > 1) {
            const sortedHistory = [...priceHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const last7DaysHistory = sortedHistory.slice(-7);
            return last7DaysHistory.map(entry => ({ date: new Date(entry.date), price: entry.price }));
        }
        
        // Generate flat data for the last 7 days if no history
        return Array.from({ length: 7 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - i));
            return { date, price: basePrice };
        });
    })();

    const svgWidth = 500;
    const svgHeight = 200;
    const margin = { top: 20, right: 20, bottom: 30, left: 50 };
    const width = svgWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;

    const prices = data.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    const priceRange = maxPrice - minPrice;
    const priceBuffer = priceRange < 1 ? Math.max(1, maxPrice * 0.1) : 0;
    const yMin = Math.max(0, minPrice - priceBuffer);
    const yMax = maxPrice + priceBuffer;
    
    const getX = (index: number) => (index / (Math.max(1, data.length - 1))) * width;
    const getY = (price: number) => {
        const totalRange = yMax - yMin;
        if (totalRange === 0) return height / 2;
        return height - ((price - yMin) / totalRange) * height;
    }

    const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.price)}`).join(' ');

    const last7Dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.getDate();
    });
    
    const xLabels = data.length > 1 ? data.map(d => d.date.getDate()) : last7Dates;
    
    return (
        <div className="bg-gray-50 p-6 rounded-lg border">
            <h3 className="text-xl font-bold text-primary mb-4">7-Day Price History</h3>
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto">
                <g transform={`translate(${margin.left}, ${margin.top})`}>
                    {/* Y-axis */}
                    <text x={-10} y={0} dy="0.32em" textAnchor="end" className="text-xs fill-current text-gray-500">₹{yMax.toFixed(0)}</text>
                    <text x={-10} y={height} dy="0.32em" textAnchor="end" className="text-xs fill-current text-gray-500">₹{yMin.toFixed(0)}</text>
                    <line x1={0} y1={0} x2={0} y2={height} className="stroke-current text-gray-300" />
                    {/* X-axis */}
                    {xLabels.map((d, i) => (
                         <text key={i} x={getX(i)} y={height + 20} textAnchor="middle" className="text-xs fill-current text-gray-500">{d}</text>
                    ))}
                    <line x1={0} y1={height} x2={width} y2={height} className="stroke-current text-gray-300" />
                    {/* Chart */}
                    <path d={linePath} fill="none" className="stroke-current text-primary" strokeWidth="2" />
                    {data.map((d, i) => (
                        <circle key={i} cx={getX(i)} cy={getY(d.price)} r="3" className="fill-current text-primary" />
                    ))}
                </g>
            </svg>
        </div>
    );
};

interface ProductDetailPageProps {
  settings: WebsiteSettings;
  product: ProductWithRating;
  onBack: () => void;
  onPurchase: (appliedCouponCode: string | null, quantity: number) => void;
  onAddToCart: (productId: number, quantity: number) => void;
  isWishlisted: boolean;
  onToggleWishlist: (id: number) => void;
  reviews: Review[];
  onAddReview: (reviewData: Omit<Review, 'name' | 'date'>) => void;
  isLoggedIn: boolean;
  onLoginRequired: () => void;
  autoOpenPaymentModal: boolean;
  onModalOpened: () => void;
  coupons: Coupon[];
  scrollToSection: string | null;
  onSectionScrolled: () => void;
  allProducts: ProductWithRating[];
  onViewProduct: (product: ProductWithRating, sectionId?: string) => void;
  wishlist: number[];
  onQuickView: (product: ProductWithRating) => void;
  onGoHome: () => void;
}

const ShareIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12s-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6.002l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.368a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
    </svg>
);


const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ 
    settings, product, onBack, onPurchase, onAddToCart, isWishlisted, onToggleWishlist, reviews, 
    onAddReview, isLoggedIn, onLoginRequired, autoOpenPaymentModal, onModalOpened, coupons,
    scrollToSection, onSectionScrolled, allProducts, onViewProduct, wishlist, onQuickView, onGoHome
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [openAccordion, setOpenAccordion] = useState<number | null>(0);

  const [mainImage, setMainImage] = useState(product.images[0] || `https://picsum.photos/seed/${product.imageSeed}/800/600`);
  const [quantity, setQuantity] = useState(1);
  const [isImageZoomOpen, setIsImageZoomOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isMentorOpen, setIsMentorOpen] = useState(false);

  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [priceJustUpdated, setPriceJustUpdated] = useState(false);

  const productUrl = `https://digitalcatalyst.example.com/product/${product.id}`;

  useEffect(() => {
    setMainImage(product.images[0] || `https://picsum.photos/seed/${product.imageSeed}/800/600`);
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
    setQuantity(1);
  }, [product]);

  useEffect(() => {
    const observer = new IntersectionObserver(
        (entries) => {
            const [entry] = entries;
            entry.target.classList.toggle('is-visible', entry.isIntersecting);
        },
        { threshold: 0.05 }
    );
    const currentRef = gridRef.current;
    if (currentRef) observer.observe(currentRef);
    return () => { if (currentRef) observer.unobserve(currentRef); };
  }, []);

  const originalPriceNum = parseFloat(product.price.replace('₹', ''));
  const salePriceNum = product.salePrice && product.salePrice !== '₹' ? parseFloat(product.salePrice.replace('₹', '')) : null;
  const currentPriceNum = salePriceNum ?? originalPriceNum;

  // Total price for quantity, before discount
  const preDiscountTotal = currentPriceNum * quantity;

  const calculateTotalDiscount = (coupon: Coupon | null): number => {
    if (!coupon) return 0;
    if (coupon.type === 'fixed') {
        // Fixed discount applies once to the total
        return Math.min(coupon.value, preDiscountTotal);
    }
    if (coupon.type === 'percentage') {
        // Percentage discount applies to the total
        return (preDiscountTotal * coupon.value) / 100;
    }
    return 0;
  };
  
  const totalCouponDiscount = calculateTotalDiscount(appliedCoupon);
  const finalTotalPrice = preDiscountTotal - totalCouponDiscount;
  
  const handleApplyCoupon = (code: string) => {
    const codeUpper = code.toUpperCase();
    setCouponInput(codeUpper);
    setCouponError(null);
    setAppliedCoupon(null); // Reset first

    if (!codeUpper) {
        return;
    }

    const couponToApply = coupons.find(c => c.code.toUpperCase() === codeUpper);

    if (!couponToApply) {
        setCouponError("Invalid coupon code.");
        return;
    }
    if (!couponToApply.isActive) {
        setCouponError("This coupon is inactive.");
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    try {
        const [year, month, day] = couponToApply.expiryDate.split('-').map(Number);
        const expiry = new Date(year, month - 1, day);
        expiry.setHours(23, 59, 59, 999); // Coupon is valid until end of expiry day

        if (expiry < today) {
            setCouponError("This coupon has expired.");
            return;
        }
    } catch (e) {
        setCouponError("Invalid coupon date format.");
        return;
    }

    if (couponToApply.timesUsed >= couponToApply.usageLimit) {
        setCouponError("This coupon has reached its usage limit.");
        return;
    }

    setAppliedCoupon(couponToApply);
    setPriceJustUpdated(true);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponInput('');
    setPriceJustUpdated(true);
  };
  
  useEffect(() => {
    if (autoOpenPaymentModal) { setModalOpen(true); onModalOpened(); }
  }, [autoOpenPaymentModal, onModalOpened]);

  useEffect(() => {
    if (scrollToSection) {
        const timer = setTimeout(() => {
            const element = document.getElementById(scrollToSection);
            if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            onSectionScrolled();
        }, 150);
        return () => clearTimeout(timer);
    }
  }, [scrollToSection, onSectionScrolled]);

  useEffect(() => {
    if (priceJustUpdated) {
        const timer = setTimeout(() => setPriceJustUpdated(false), 800); // Match animation duration
        return () => clearTimeout(timer);
    }
  }, [priceJustUpdated]);

  const handleBuyClick = () => { if (isLoggedIn) setModalOpen(true); else onLoginRequired(); };
  const handleModalClose = () => setModalOpen(false);
  const handleModalConfirm = () => { setModalOpen(false); onPurchase(appliedCoupon ? appliedCoupon.code : null, quantity); };

  const handleImageZoom = (e: React.MouseEvent<HTMLDivElement>) => {
    const zoomer = e.currentTarget.firstChild as HTMLElement;
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    zoomer.style.transformOrigin = `${x}% ${y}%`;
  };

  const handleShare = async () => {
    const shareData = {
        title: product.title,
        text: product.description,
        url: productUrl,
    };
    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (err: any) {
            // Do not show an error or fallback modal if the user cancels the share action.
            if (err.name !== 'AbortError') {
                console.error("Error using Web Share API:", err);
                setIsShareModalOpen(true);
            }
        }
    } else {
        setIsShareModalOpen(true);
    }
  };

  const relatedProducts = allProducts.filter(p => p.category === product.category && p.id !== product.id).slice(0, 3);

  return (
    <>
      <section className="py-16 sm:py-20 bg-white">
        <div className="container mx-auto px-6">
          <nav className="flex text-sm text-gray-500 mb-6 items-center space-x-2" aria-label="Breadcrumb">
            <button onClick={onGoHome} className="hover:text-primary hover:underline transition-colors font-medium">Home</button>
            <span className="text-gray-300">/</span>
            <button onClick={onBack} className="hover:text-primary hover:underline transition-colors font-medium">Products</button>
            <span className="text-gray-300">/</span>
            <span className="text-primary font-semibold truncate max-w-xs" title={product.title}>{product.title}</span>
          </nav>

          <div ref={gridRef} className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start ${settings.animations.enabled ? 'scroll-animate' : ''}`}>
            {/* --- LEFT COLUMN: IMAGES --- */}
            <div>
              <button onClick={() => setIsImageZoomOpen(true)} className="w-full bg-gray-100 rounded-xl shadow-md overflow-hidden border relative animate-fade-in group" aria-label="View larger image">
                 <div className="zoom-container" onMouseMove={handleImageZoom}>
                    <img src={mainImage} alt={product.title} className="w-full h-auto object-cover aspect-video" />
                 </div>
                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                 </div>
                {settings.features.showFavourites && (
                    <button onClick={(e) => { e.stopPropagation(); onToggleWishlist(product.id); }} className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm rounded-full p-2 text-text-muted hover:text-red-500 hover:scale-110 transition-all duration-200 z-10" aria-label={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill={isWishlisted ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isWishlisted ? 0 : 2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" /></svg>
                    </button>
                )}
              </button>
              <div className="mt-4 flex space-x-2">
                  {product.images.map((img, i) => (
                      <button key={i} onClick={() => setMainImage(img)} className={`w-20 h-20 rounded-md overflow-hidden border-2 transition-all ${mainImage === img ? 'border-primary' : 'border-transparent hover:border-gray-400'}`}>
                          <img src={img} alt={`thumbnail ${i+1}`} className="w-full h-full object-cover"/>
                      </button>
                  ))}
              </div>
            </div>

            {/* --- RIGHT COLUMN: DETAILS --- */}
            <div className="lg:col-span-1">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-4xl sm:text-5xl font-extrabold text-primary tracking-tight">{product.title}</h1>
                <button onClick={handleShare} className="p-3 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200 hover:text-primary transition-colors flex-shrink-0" aria-label="Share this product">
                    <ShareIcon />
                </button>
              </div>
              <p className="mt-6 text-lg text-text-muted">{product.longDescription}</p>

              <div className="mt-8 border rounded-lg">
                <h3 className="text-xl font-bold text-primary p-4 border-b">Key Features:</h3>
                <div className="divide-y">
                    {product.features.map((feature, i) => (
                        <div key={i} className="feature-accordion">
                            <button onClick={() => setOpenAccordion(openAccordion === i ? null : i)} className="feature-accordion-header w-full flex justify-between items-center p-4 text-left">
                                <span className="font-semibold text-text">{feature}</span>
                                <span className={`transform transition-transform duration-300 ${openAccordion === i ? 'rotate-45' : ''}`}>
                                  <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                </span>
                            </button>
                            <div className={`feature-accordion-content px-4 ${openAccordion === i ? 'is-open' : ''}`}>
                                <p className="text-text-muted text-sm">Detailed information about '{feature}' would go here, explaining the benefits and how it helps the customer achieve their goals.</p>
                            </div>
                        </div>
                    ))}
                </div>
              </div>
              
              <div className="mt-8">
                  <PriceChart basePrice={currentPriceNum} priceHistory={product.priceHistory} />
              </div>
              
              <div id="price-section" className={`mt-10 bg-gray-50 p-6 rounded-lg border scroll-mt-24 ${priceJustUpdated ? 'price-flash' : ''}`}>
                <div className="mb-6">
                    {(() => {
                        if (product.isFree) {
                            return (
                                <div className="text-center">
                                    <span className="text-4xl font-bold text-blue-600 bg-blue-100 px-4 py-2 rounded-lg">FREE</span>
                                    <p className="text-sm text-text-muted mt-2">Nominal Fee of ₹3 applies.</p>
                                </div>
                            );
                        }

                        if (appliedCoupon) {
                            return (
                                <div className="flex items-baseline gap-3">
                                    <span className="text-4xl font-bold text-primary">₹{finalTotalPrice.toFixed(2)}</span>
                                    <span className="text-2xl font-medium text-gray-400 line-through">₹{preDiscountTotal.toFixed(2)}</span>
                                    <span className="text-sm font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">SAVE ₹{totalCouponDiscount.toFixed(2)}</span>
                                </div>
                            );
                        }

                        if (salePriceNum !== null) {
                            const originalTotal = originalPriceNum * quantity;
                            const saleTotal = salePriceNum * quantity;
                            const saleDiscount = originalTotal - saleTotal;
                            return (
                                <div className="flex items-baseline gap-3">
                                    <span className="text-4xl font-bold text-primary">₹{saleTotal.toFixed(2)}</span>
                                    <span className="text-2xl font-medium text-gray-400 line-through">₹{originalTotal.toFixed(2)}</span>
                                    {saleDiscount > 0 && <span className="text-sm font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">SAVE ₹{saleDiscount.toFixed(2)}</span>}
                                </div>
                            );
                        }

                        return (
                            <div>
                                <span className="text-sm text-text-muted">Price</span>
                                <p className="text-4xl font-bold text-primary">₹{(originalPriceNum * quantity).toFixed(2)}</p>
                            </div>
                        );
                    })()}
                </div>
              </div>
            </div>
          </div>
          
           {/* --- COUPON & PRICE BREAKDOWN SECTION --- */}
            {!product.isFree && coupons.length > 0 && (
              <div className="mt-8 max-w-3xl mx-auto">
                <div className="bg-white rounded-xl shadow-lg border p-6 transition-all duration-300">
                  {/* New Coupon UI */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">Have a coupon?</h3>
                    <div className="mt-2 flex gap-2">
                        <input
                            type="text"
                            value={couponInput}
                            onChange={e => setCouponInput(e.target.value.toUpperCase())}
                            placeholder="Enter coupon code"
                            className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-transparent transition"
                            aria-label="Coupon code"
                        />
                        <button
                            onClick={() => handleApplyCoupon(couponInput)}
                            className="bg-gray-700 text-white font-semibold px-6 py-2 rounded-md hover:bg-gray-800 transition-colors"
                        >
                            Apply
                        </button>
                    </div>
                    {couponError && <p className="text-red-500 text-sm mt-2">{couponError}</p>}
                    {appliedCoupon && !couponError && <p className="text-green-600 text-sm mt-2">Coupon '{appliedCoupon.code}' applied successfully!</p>}

                    <h3 className="text-lg font-semibold text-gray-800 mt-6">Available Coupons:</h3>
                    <div className="mt-2 space-y-3">
                        {coupons.filter(c => c.isActive).map(coupon => {
                            const isSelected = coupon.code === couponInput;
                            const isApplied = appliedCoupon?.id === coupon.id;
                            return (
                                <div
                                    key={coupon.id}
                                    className={`p-4 border-2 rounded-lg transition-all border-dashed ${
                                        isSelected && !isApplied && couponError ? 'border-red-400 bg-red-50' : 
                                        isApplied || (isSelected && !couponError) ? 'border-green-500 bg-green-50' : 
                                        'border-gray-300'
                                    }`}
                                >
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="font-bold font-mono text-gray-800">{coupon.code}</p>
                                            <p className="text-sm text-gray-600">
                                                {coupon.type === 'percentage' ? `${coupon.value}% off` : `Flat ₹${coupon.value} off`}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleApplyCoupon(coupon.code)}
                                            className="font-semibold text-green-600 hover:underline disabled:text-gray-400 disabled:no-underline"
                                            disabled={isApplied}
                                        >
                                            {isApplied ? 'Applied' : 'Apply'}
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                  </div>

                  {/* Price Breakdown on Success */}
                  {appliedCoupon && (
                      <div className="mt-6 animate-fade-in">
                          <div className="flex justify-between items-center">
                              <h3 className="text-xl font-bold text-gray-800">Price Breakdown</h3>
                              <button onClick={handleRemoveCoupon} className="text-sm text-red-600 hover:underline font-semibold">Remove Coupon</button>
                          </div>
                          <div className="mt-4 space-y-2 border-t pt-4">
                              <div className="flex justify-between text-text-muted">
                                  <span>Subtotal ({quantity} item{quantity > 1 ? 's' : ''})</span>
                                  <span>₹{preDiscountTotal.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between font-semibold text-green-700">
                                  <span>Coupon ({appliedCoupon.code})</span>
                                  <span>- ₹{totalCouponDiscount.toFixed(2)}</span>
                              </div>
                              <div className="border-t my-2"></div>
                              <div className="flex justify-between font-bold text-2xl text-primary">
                                  <span>Final Price</span>
                                  <span>₹{finalTotalPrice.toFixed(2)}</span>
                              </div>
                          </div>
                      </div>
                  )}
                </div>
              </div>
            )}
            
            {/* --- ACTION BUTTONS SECTION --- */}
            <div className="mt-8 max-w-3xl mx-auto">
                <div className="bg-white rounded-xl shadow-lg border p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                        <div className="flex items-center border rounded-lg justify-center">
                            <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="px-4 py-3 text-xl font-bold text-gray-600 hover:bg-gray-100 rounded-l-lg">-</button>
                            <input type="number" value={quantity} onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="w-16 text-center border-l border-r font-semibold focus:outline-none bg-transparent" />
                            <button onClick={() => setQuantity(q => q + 1)} className="px-4 py-3 text-xl font-bold text-gray-600 hover:bg-gray-100 rounded-r-lg">+</button>
                        </div>
                        <button onClick={() => onAddToCart(product.id, quantity)} className="w-full bg-primary text-white font-bold px-8 py-4 rounded-lg hover:opacity-90 transition-all duration-300 transform active:scale-95 text-lg">
                            Add to Cart
                        </button>
                    </div>
                    <div className="mt-4">
                        <button onClick={handleBuyClick} className="w-full bg-green-500 text-white font-bold px-10 py-4 rounded-lg hover:bg-green-600 transition-all duration-300 transform hover:scale-105 active:scale-100 text-lg">
                            Buy Now
                        </button>
                    </div>
                </div>
            </div>

        </div>
      </section>
      
      {settings.features.showReviews && (
        <div id="reviews-section" className="py-20 sm:py-24 bg-gray-50 scroll-mt-24 border-t border-gray-200">
            <RatingsAndReviews 
                settings={settings} 
                productTitle={product.title} 
                reviews={reviews} 
                onAddReview={onAddReview} 
            />
        </div>
      )}

      {relatedProducts.length > 0 && (
        <div className="bg-white">
           <FeaturedProducts
                settings={settings}
                title="Related Products"
                products={relatedProducts}
                onViewProduct={onViewProduct}
                wishlist={wishlist}
                onToggleWishlist={onToggleWishlist}
                onAddToCart={onAddToCart}
                onQuickView={onQuickView}
                bgColor="bg-transparent"
                coupons={coupons}
            />
        </div>
      )}
      
      {/* AI Mentor Floating UI */}
      <div className="fixed bottom-6 right-6 z-40">
        {isMentorOpen && (
          <div className="w-full max-w-sm h-[70vh] max-h-[600px] bg-white rounded-xl shadow-2xl flex flex-col mb-4 animate-fade-in-up">
              <AiMentor productTitle={product.title} activeContentName={"Product Overview"} />
          </div>
        )}
        <button
            onClick={() => setIsMentorOpen(!isMentorOpen)}
            className="bg-primary text-white rounded-full shadow-lg p-4 hover:scale-110 transition-transform flex items-center justify-center"
            aria-label={isMentorOpen ? "Close AI Mentor" : "Open AI Mentor"}
        >
            {isMentorOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
            )}
        </button>
      </div>

      {isShareModalOpen && (
        <ShareModal
            url={productUrl}
            title={product.title}
            onClose={() => setIsShareModalOpen(false)}
        />
      )}

      {isImageZoomOpen && (
        <ImageZoomModal src={mainImage} alt={product.title} onClose={() => setIsImageZoomOpen(false)} />
      )}

      {modalOpen && <PaymentModal 
        settings={settings} 
        productTitle={product.title} 
        originalPrice={originalPriceNum * quantity} 
        salePrice={salePriceNum !== null ? salePriceNum * quantity : null} 
        couponDiscount={totalCouponDiscount} 
        finalPrice={finalTotalPrice} 
        onClose={handleModalClose} 
        onConfirm={handleModalConfirm} 
        paymentLink={product.paymentLink}
      />}
    </>
  );
};

export default ProductDetailPage;
