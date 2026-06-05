
// FIX: Imported useState, useEffect, and useRef hooks from React to resolve 'Cannot find name' errors.
import React, { useState, useEffect, useRef } from 'react';
import { ActiveCoinDiscount, ProductWithRating, Review, Coupon, WebsiteSettings, PriceHistoryEntry, User } from '../App';
import { EconomySettings, resolveCoinPrice } from '../utils/economy';
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
    const isZoomPanningRef = React.useRef(false);
    const dragStartRef = React.useRef({ x: 0, y: 0 });
    const pointersRef = React.useRef<PointerEvent[]>([]);
    const initialPinchDistRef = React.useRef(0);

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        pointersRef.current.push(e.nativeEvent);
        
        if (pointersRef.current.length === 1) { // Pan / Swipe start
            isZoomPanningRef.current = true;
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
        if (!isZoomPanningRef.current) return;

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
            isZoomPanningRef.current = false;
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
        transition: isZoomPanningRef.current ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0, 0.38, 0.9)',
        cursor: isZoomPanningRef.current ? 'grabbing' : (scale > 1 ? 'grab' : 'zoom-out'),
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
                    <text x={-10} y={0} dy="0.32em" textAnchor="end" className="text-xs fill-current text-slate-600">₹{yMax.toFixed(0)}</text>
                    <text x={-10} y={height} dy="0.32em" textAnchor="end" className="text-xs fill-current text-slate-600">₹{yMin.toFixed(0)}</text>
                    <line x1={0} y1={0} x2={0} y2={height} className="stroke-current text-slate-600" />
                    {/* X-axis */}
                    {xLabels.map((d, i) => (
                         <text key={i} x={getX(i)} y={height + 20} textAnchor="middle" className="text-xs fill-current text-slate-600">{d}</text>
                    ))}
                    <line x1={0} y1={height} x2={width} y2={height} className="stroke-current text-slate-600" />
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
  economySettings: EconomySettings;
  activeCoinDiscount?: ActiveCoinDiscount | null;
  onConsumeCoinDiscount?: () => void;
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
  onBuyNow: (product: ProductWithRating) => void;
  wishlist: number[];
  onQuickView: (product: ProductWithRating) => void;
  onGoHome: () => void;
  onStartEarning?: () => void;
  onInsufficientCoins?: (details: { requiredCoins: number; balance: number; missingCoins: number; productTitle?: string }) => void;
  isPurchased?: boolean;
  currentUser?: User | null;
  onCoinPurchase?: (product: ProductWithRating, quantity: number) => boolean | Promise<boolean>;
}

const ShareIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12s-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6.002l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.368a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
    </svg>
);


const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ 
    settings, economySettings, activeCoinDiscount = null, onConsumeCoinDiscount, product, onBack, onPurchase, onAddToCart, isWishlisted, onToggleWishlist, reviews, 
    onAddReview, isLoggedIn, onLoginRequired, autoOpenPaymentModal, onModalOpened, coupons,
    scrollToSection, onSectionScrolled, allProducts, onViewProduct, onBuyNow, wishlist, onQuickView, onGoHome, onStartEarning, onInsufficientCoins,
    isPurchased = false, currentUser = null, onCoinPurchase
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [isCoinButtonChecking, setIsCoinButtonChecking] = useState(false);
  const [openCoinGuideOnMount, setOpenCoinGuideOnMount] = useState(false);
  const [openRazorpayOnMount, setOpenRazorpayOnMount] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [openAccordion, setOpenAccordion] = useState<number | null>(0);

  const [mainImage, setMainImage] = useState((product.images || [])[0] || `https://picsum.photos/seed/${product.imageSeed}/800/600`);
  const quantity = 1;
  const [isImageZoomOpen, setIsImageZoomOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isMentorOpen, setIsMentorOpen] = useState(false);

  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [priceJustUpdated, setPriceJustUpdated] = useState(false);

  const productUrl = `https://digitalcatalyst.example.com/product/${product.id}`;

  useEffect(() => {
    setMainImage((product.images || [])[0] || `https://picsum.photos/seed/${product.imageSeed}/800/600`);
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
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

  const preDiscountTotal = currentPriceNum;

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
  const eduCoinDiscount = activeCoinDiscount ? Math.min(preDiscountTotal - totalCouponDiscount, activeCoinDiscount.amount) : 0;
  const finalTotalPrice = Math.max(0, preDiscountTotal - totalCouponDiscount - eduCoinDiscount);
  
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

  useEffect(() => {
    if (autoOpenPaymentModal) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      setModalOpen(true);
      onModalOpened();
    }
  }, [autoOpenPaymentModal, onModalOpened]);

  useEffect(() => {
    if (modalOpen) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [modalOpen]);

  const handleBuyClick = () => {
    if (!isLoggedIn) {
      onLoginRequired();
      return;
    }
    setOpenCoinGuideOnMount(false);
    setOpenRazorpayOnMount(false);
    window.scrollTo(0, 0);
    setModalOpen(true);
  };

  const productCoinPrice = resolveCoinPrice(product.coinPrice, economySettings, 'product', product.id);
  const userCoinBalance = (currentUser as (User & { coinBalance?: number }) | null | undefined)?.coinBalance ?? currentUser?.eduCoins ?? 0;

  const handleEduCoinButtonClick = async () => {
    if (!isLoggedIn) {
      onLoginRequired();
      return;
    }

    window.scrollTo(0, 0);
    if (userCoinBalance >= productCoinPrice * quantity && productCoinPrice > 0) {
      const wasPurchased = await handleModalConfirmWithCoins();
      if (!wasPurchased) {
        setOpenCoinGuideOnMount(true);
        setModalOpen(true);
      }
      return;
    }

    if (onInsufficientCoins) {
      onInsufficientCoins({ requiredCoins: productCoinPrice * quantity, balance: userCoinBalance, missingCoins: Math.max(0, (productCoinPrice * quantity) - userCoinBalance), productTitle: product.title });
      return;
    }

    setOpenCoinGuideOnMount(true);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setOpenCoinGuideOnMount(false);
    setOpenRazorpayOnMount(false);
    window.setTimeout(() => window.scrollTo(0, 0), 0);
  };

  const handleModalConfirmWithCoins = async () => {
    setIsCoinButtonChecking(true);
    const wasPurchased = await (onCoinPurchase?.(product, quantity) || false);
    if (!wasPurchased) {
      setIsCoinButtonChecking(false);
    }
    return wasPurchased;
  };

  const handleModalConfirm = () => {
    // Call the main purchase function first
    onPurchase(appliedCoupon ? appliedCoupon.code : null, quantity);

    if (onConsumeCoinDiscount) {
      onConsumeCoinDiscount();
    }

    // Delay closing the modal so App.tsx can safely transition to 'congratulations'
    setTimeout(() => {
      setModalOpen(false);
    }, 150);
  };

  if (modalOpen) {
    return (
      <PaymentModal
        settings={settings}
        economySettings={economySettings}
        productTitle={product.title}
        originalPrice={originalPriceNum * quantity}
        salePrice={salePriceNum !== null ? salePriceNum * quantity : null}
        couponDiscount={totalCouponDiscount}
        finalPrice={finalTotalPrice}
        eduCoinDiscount={eduCoinDiscount}
        appliedEduCoins={activeCoinDiscount?.coins || 0}
        coinRedeemRate={economySettings.coinToFiatRatio}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        paymentLink={product.paymentLink}
        currentUser={currentUser}
        coinPrice={resolveCoinPrice(product.coinPrice, economySettings, 'product', product.id) * quantity}
        onConfirmWithCoins={onCoinPurchase ? handleModalConfirmWithCoins : undefined}
        onStartEarning={onStartEarning}
        onInsufficientCoins={(details) => onInsufficientCoins?.({ ...details, productTitle: product.title })}
        initialShowCoinGuide={openCoinGuideOnMount}
        initialCheckoutStep={openRazorpayOnMount ? 'razorpay' : 'checkout'}
        presentation="page"
      />
    );
  }

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
      <section className="relative overflow-hidden bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-cyan-50/40 py-16 text-slate-900 sm:py-20">
        <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-28 h-80 w-80 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="container relative z-10 mx-auto px-6">
          <nav className="mb-8 flex items-center space-x-2 text-sm text-slate-600" aria-label="Breadcrumb">
            <button onClick={onGoHome} className="font-bold transition-colors hover:text-primary hover:underline">Home</button>
            <span className="text-slate-400">/</span>
            <button onClick={onBack} className="font-bold transition-colors hover:text-primary hover:underline">Products</button>
            <span className="text-slate-400">/</span>
            <span className="max-w-xs truncate font-black text-primary" title={product.title}>{product.title}</span>
          </nav>

          <div ref={gridRef} className={`grid grid-cols-1 gap-8 md:grid-cols-12 ${settings.animations.enabled ? 'scroll-animate' : ''}`}>
            <div className="md:col-span-7">
              <button onClick={() => setIsImageZoomOpen(true)} className="group relative w-full overflow-hidden rounded-[2rem] border border-white/70 bg-white/80 shadow-[0_24px_70px_rgba(15,23,42,0.10)]" aria-label="View larger image">
                <div className="zoom-container" onMouseMove={handleImageZoom}>
                  <img src={mainImage} alt={product.title} className="aspect-video h-auto w-full object-cover" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-white/35 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                  <div className="rounded-full bg-white/85 p-4 text-slate-900 shadow-xl"><svg xmlns="http://www.w3.org/2000/svg" className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg></div>
                </div>
                {isWishlisted && <span className="absolute right-5 top-5 rounded-full bg-red-500 px-4 py-2 text-sm font-black text-white shadow-lg">♥ Wishlisted</span>}
              </button>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/70 bg-white/70 p-4 text-center shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-2xl"><p className="text-2xl">⚡</p><p className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-slate-500">Instant</p><p className="text-sm font-black text-slate-900">Unlock</p></div>
                <div className="rounded-3xl border border-white/70 bg-white/70 p-4 text-center shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-2xl"><p className="text-2xl">🪙</p><p className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-slate-500">Wallet</p><p className="text-sm font-black text-slate-900">{productCoinPrice > 0 ? `${productCoinPrice} Coins` : 'Razorpay'}</p></div>
                <div className="rounded-3xl border border-white/70 bg-white/70 p-4 text-center shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-2xl"><p className="text-2xl">⭐</p><p className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-slate-500">Rating</p><p className="text-sm font-black text-slate-900">{product.rating.toFixed(1)} / 5</p></div>
              </div>


              {(product.images || []).length > 1 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {(product.images || []).map((img, i) => (
                    <button key={i} onClick={() => setMainImage(img)} className={`h-20 w-20 overflow-hidden rounded-2xl border-2 bg-white/75 transition-all ${mainImage === img ? 'border-primary shadow-lg' : 'border-white/70 hover:border-indigo-300'}`} aria-label={`View thumbnail ${i + 1}`}>
                      <img src={img} alt={`thumbnail ${i + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-8 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.07)] backdrop-blur-2xl sm:p-8">
                <div className="mb-6 flex flex-wrap gap-2">
                  {(product.tags || [product.category || 'Premium resource', 'Digital access', 'Lifetime']).slice(0, 4).map(tag => (
                    <span key={tag} className="rounded-full border border-indigo-100 bg-indigo-50/80 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-indigo-600">{tag}</span>
                  ))}
                </div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-indigo-500">Digital product</p>
                    <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">{product.title}</h1>
                  </div>
                  <button onClick={handleShare} className="rounded-full border border-slate-200 bg-white/80 p-3 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:text-primary" aria-label="Share this product"><ShareIcon /></button>
                </div>
                <p className="mt-6 text-lg leading-8 text-slate-600">{product.longDescription}</p>

                {(product.features || []).length > 0 && (
                  <div className="mt-8 rounded-3xl border border-slate-200/70 bg-slate-50/80">
                    <h3 className="border-b border-slate-200/70 p-4 text-xl font-black text-primary">Key Features</h3>
                    <div className="divide-y divide-slate-200/70">
                      {(product.features || []).map((feature, i) => (
                        <div key={i} className="feature-accordion">
                          <button onClick={() => setOpenAccordion(openAccordion === i ? null : i)} className="feature-accordion-header flex w-full items-center justify-between p-4 text-left">
                            <span className="font-bold text-slate-900">{feature}</span>
                            <span className={`transform transition-transform duration-300 ${openAccordion === i ? 'rotate-45' : ''}`}><svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></span>
                          </button>
                          <div className={`feature-accordion-content px-4 ${openAccordion === i ? 'is-open' : ''}`}>
                            <p className="text-sm leading-6 text-slate-600">Detailed information about '{feature}' would go here, explaining the benefits and how it helps the customer achieve their goals.</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-8">
                  <PriceChart basePrice={currentPriceNum} priceHistory={product.priceHistory || []} />
                </div>
              </div>
            </div>

            <aside className="md:col-span-5">
              <div id="price-section" className={`sticky top-24 overflow-hidden rounded-[2rem] border border-white/60 bg-white/75 p-6 shadow-[0_28px_85px_rgba(79,70,229,0.14)] backdrop-blur-2xl ${priceJustUpdated ? 'price-flash' : ''}`}>
                <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-indigo-300/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl" />
                <div className="relative">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-indigo-500">Secure checkout</p>
                <h2 className="mt-3 text-2xl font-black text-slate-950">Unlock instant access</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Digital products are single-quantity purchases with lifetime access from My Purchases.</p>

                <div className="mt-6 rounded-3xl border border-slate-200/70 bg-slate-50/85 p-5">
                  <div className="flex items-end justify-between gap-4">
                    <span className="text-sm font-black uppercase tracking-widest text-slate-500">Total</span>
                    <div className="text-right">
                      {salePriceNum !== null && !appliedCoupon && <p className="text-sm font-bold text-slate-400 line-through">₹{originalPriceNum.toFixed(2)}</p>}
                      {appliedCoupon && <p className="text-sm font-bold text-emerald-600">Saved ₹{totalCouponDiscount.toFixed(2)}</p>}
                      <p className="text-4xl font-black text-primary">{product.isFree ? 'FREE' : `₹${finalTotalPrice.toFixed(2)}`}</p>
                    </div>
                  </div>
                  {eduCoinDiscount > 0 && <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">🪙 {activeCoinDiscount?.coins || 0} EduCoins applied for ₹{eduCoinDiscount.toFixed(2)} off</p>}
                </div>

                {!product.isFree && coupons.length > 0 && (
                  <div className="mt-5 rounded-3xl border border-white/70 bg-white/70 p-4 shadow-sm">
                    <div className="flex gap-2">
                      <input type="text" value={couponInput} onChange={e => setCouponInput(e.target.value.toUpperCase())} placeholder="Coupon code" className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 font-bold outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" aria-label="Coupon code" />
                      <button onClick={() => handleApplyCoupon(couponInput)} className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white transition hover:-translate-y-0.5">Apply</button>
                    </div>
                    {couponError && <p className="mt-2 text-sm font-bold text-red-500">{couponError}</p>}
                    {appliedCoupon && !couponError && <div className="mt-3 flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><span>{appliedCoupon.code} applied</span><button onClick={handleRemoveCoupon} className="text-red-500 hover:underline">Remove</button></div>}
                  </div>
                )}

                <div className="mt-6 space-y-3">
                  <button disabled={isPurchased} onClick={handleBuyClick} className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-4 text-lg font-black text-white shadow-[0_16px_40px_rgba(79,70,229,0.25)] transition hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
                    {isPurchased ? 'Purchased' : 'Pay with Razorpay'}
                  </button>
                  {onCoinPurchase && productCoinPrice > 0 && (
                    <button disabled={isPurchased || isCoinButtonChecking} onClick={handleEduCoinButtonClick} className="w-full rounded-2xl border border-amber-200/70 bg-white/75 px-8 py-4 text-lg font-black text-amber-800 shadow-[0_14px_38px_rgba(245,158,11,0.12)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-amber-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
                      {isCoinButtonChecking ? 'Checking EduCoins...' : `Pay with ${productCoinPrice} EduCoins`}
                    </button>
                  )}
                  <button onClick={() => onAddToCart(product.id, 1)} className="w-full rounded-2xl border border-indigo-200/70 bg-white/85 px-8 py-4 text-base font-black text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50 active:scale-95">
                    Add to Cart
                  </button>
                </div>

                <div className="mt-5 grid gap-3 text-sm font-bold text-slate-600 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
                  <div className="rounded-2xl border border-white/70 bg-white/75 p-3 text-center shadow-sm backdrop-blur-xl">🔒 Razorpay</div>
                  <div className="rounded-2xl border border-white/70 bg-white/75 p-3 text-center shadow-sm backdrop-blur-xl">🪙 EduCoins</div>
                  <div className="rounded-2xl border border-white/70 bg-white/75 p-3 text-center shadow-sm backdrop-blur-xl">📚 Lifetime</div>
                </div>
                </div>
              </div>
            </aside>
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
        <div className="bg-white/70 backdrop-blur-xl">
           <FeaturedProducts
                settings={settings}
                title="Related Products"
                products={relatedProducts}
                onViewProduct={onViewProduct}
                wishlist={wishlist}
                onToggleWishlist={onToggleWishlist}
                onAddToCart={onAddToCart}
                onBuyNow={onBuyNow}
                onQuickView={onQuickView}
                bgColor="bg-transparent"
                coupons={coupons}
            />
        </div>
      )}
      
      {/* AI Mentor Floating UI */}
      <div className="fixed bottom-6 right-6 z-40">
        {isMentorOpen && (
          <div className="w-full max-w-sm h-[70vh] max-h-[600px] bg-white/70 backdrop-blur-xl rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col mb-4 animate-fade-in-up">
              <AiMentor productTitle={product.title} activeContentName={"Product Overview"} />
          </div>
        )}
        <button
            onClick={() => setIsMentorOpen(!isMentorOpen)}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 hover:scale-110 transition-transform flex items-center justify-center"
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

    </>
  );
};

export default ProductDetailPage;
