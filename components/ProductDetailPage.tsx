
// FIX: Imported useState, useEffect, and useRef hooks from React to resolve 'Cannot find name' errors.
import React, { useState, useEffect, useRef } from 'react';
import { ActiveCoinDiscount, ProductWithRating, Review, Coupon, WebsiteSettings, User, ProductAccessState } from '../App';
import { EconomySettings, normalizeCoinPrice, shouldShowCoinButton } from '../utils/economy';
import { getProductCoinPrice, redeemProductWithEduCoins, watchUserCoinWallet } from '../utils/coinWallet';
import PaymentModal from './PaymentModal';
import RatingsAndReviews from './RatingsAndReviews';
import FeaturedProducts from './FeaturedProducts';
import ShareModal from './ShareModal';
import { PRODUCT_IMAGE_SLOTS, ProductImageSlot, getProductImage } from '../utils/productImages';

const ProductAnalyticsChart: React.FC = () => {
    return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
            <h3 className="text-xl font-bold text-primary">30-Day Product Analytics</h3>
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-center">
                <p className="text-3xl" aria-hidden="true">📊</p>
                <p className="mt-3 text-base font-bold text-slate-800">No real 30-day analytics data connected yet.</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                    This product page does not currently have a real daily analytics event source for views, purchases, or engagement.
                    Connect a real analytics/event collection before showing a chart.
                </p>
            </div>
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
  onGoHome: () => void;
  onStartEarning?: () => void;
  onInsufficientCoins?: (details: { requiredCoins: number; balance: number; missingCoins: number; productTitle?: string }) => void;
  isPurchased?: boolean;
  currentUser?: User | null;
  productAccess?: ProductAccessState | null;
  onPurchaseLatestUpdate?: (product: ProductWithRating) => void;
  onCoinPurchase?: (
  product: ProductWithRating,
  quantity: number,
  options?: { coinDebitAlreadyProcessed?: boolean; totalCoinsCharged?: number }
) => boolean | Promise<boolean>;
}

const ShareIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12s-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6.002l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.368a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
    </svg>
);


const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ 
    settings, economySettings, activeCoinDiscount = null, onConsumeCoinDiscount, product, onBack, onPurchase, onAddToCart, isWishlisted, onToggleWishlist, reviews, 
    onAddReview, isLoggedIn, onLoginRequired, autoOpenPaymentModal, onModalOpened, coupons,
    scrollToSection, onSectionScrolled, allProducts, onViewProduct, onBuyNow, wishlist, onGoHome, onStartEarning, onInsufficientCoins,
    isPurchased = false, currentUser = null, productAccess = null, onPurchaseLatestUpdate, onCoinPurchase
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [isCoinButtonChecking, setIsCoinButtonChecking] = useState(false);
  const [liveCoinPrice, setLiveCoinPrice] = useState<number | null>(null);
  const [isCoinRedeemEnabled, setIsCoinRedeemEnabled] = useState(true);
  const [liveUserCoinBalance, setLiveUserCoinBalance] = useState(0);
  const [isRedeemingWithCoins, setIsRedeemingWithCoins] = useState(false);
  const [coinRedeemModal, setCoinRedeemModal] = useState<{ open: boolean; title: string; message: string; showProfileButton?: boolean; }>({ open: false, title: '', message: '' });
  const [openCoinGuideOnMount, setOpenCoinGuideOnMount] = useState(false);
  const [openRazorpayOnMount, setOpenRazorpayOnMount] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [openAccordion, setOpenAccordion] = useState<number | null>(0);

  const [mainImage, setMainImage] = useState<string | null>(null);

  const detailGallerySlots: ProductImageSlot[] = ['galleryThumb', 'detailMobile', 'detailDesktop', 'card'];
  const detailGalleryImages = detailGallerySlots
    .map((slot) => ({ slot, image: product.productImages?.[slot], config: PRODUCT_IMAGE_SLOTS[slot] }))
    .filter((item): item is { slot: ProductImageSlot; image: string; config: typeof PRODUCT_IMAGE_SLOTS[ProductImageSlot] } => Boolean(item.image));
  const quantity = 1;
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [priceJustUpdated, setPriceJustUpdated] = useState(false);

  const productUrl = `https://digitalcatalyst.example.com/product/${product.id}`;

  useEffect(() => {
    setMainImage(null);
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

  useEffect(() => {
    const productId = String(product?.id || '');
    if (!productId) return;

    getProductCoinPrice(productId)
      .then((coinConfig) => {
        setLiveCoinPrice(coinConfig.coinPrice);
        setIsCoinRedeemEnabled(coinConfig.isCoinRedeemEnabled && coinConfig.status === 'active');
      })
      .catch((error) => {
        console.error('Failed to load product EduCoin price:', error);
      });
  }, [product?.id]);

  useEffect(() => {
    const userId = currentUser?.uid || (currentUser?.id ? String(currentUser.id) : '');
    if (!userId) {
      setLiveUserCoinBalance(0);
      return;
    }

    const unsubscribe = watchUserCoinWallet(userId, (wallet) => {
      setLiveUserCoinBalance(wallet.coinBalance);
    });

    return () => unsubscribe();
  }, [currentUser?.uid, currentUser?.id]);


  const handleBuyClick = () => {
    if (!isLoggedIn) {
      onLoginRequired();
      return;
    }
    setOpenCoinGuideOnMount(false);
    setOpenRazorpayOnMount(true);
    window.open(product.paymentLink || 'https://pages.razorpay.com/pl_RIfTCxnYj73xqE/view', '_blank');
    window.scrollTo(0, 0);
    setModalOpen(true);
  };

  const productCoinEligibility = normalizeCoinPrice(product.coinPrice);
  const productCoinPrice = productCoinEligibility.normalizedCoinPrice;
  const canShowProductCoinCheckout = Boolean(onCoinPurchase) && !isPurchased && shouldShowCoinButton(productCoinPrice, isCoinRedeemEnabled);
  const userCoinBalance = liveUserCoinBalance || ((currentUser as (User & { coinBalance?: number }) | null | undefined)?.coinBalance ?? currentUser?.eduCoins ?? 0);
  const requiredProductCoins = Math.max(0, productCoinPrice * quantity);
  const missingProductCoins = Math.max(0, requiredProductCoins - userCoinBalance);
  const hasLockedPaidUpdates = Boolean(isPurchased && productAccess?.hasPaidLockedUpdates && onPurchaseLatestUpdate);
  const coinCheckoutDisabled =
    isCoinButtonChecking ||
    isRedeemingWithCoins ||
    !canShowProductCoinCheckout ||
    requiredProductCoins <= 0;

  const coinCheckoutLabel = isPurchased
    ? 'Course Unlocked'
    : isCoinButtonChecking || isRedeemingWithCoins
      ? 'Unlocking...'
      : !isCoinRedeemEnabled
        ? 'EduCoin checkout disabled'
        : userCoinBalance < requiredProductCoins
            ? `Earn ${missingProductCoins} more coins`
            : `Pay with ${requiredProductCoins} coins`;

  const handleEduCoinButtonClick = async () => {
    if (!isLoggedIn || !currentUser) {
      setCoinRedeemModal({ open: true, title: 'Login required', message: 'Please login to redeem this product with EduCoins.', showProfileButton: false });
      return;
    }

    const userId = currentUser.uid || (currentUser.id ? String(currentUser.id) : '');
    const productId = String(product?.id || '');
    if (!userId) {
      onLoginRequired();
      return;
    }
    if (!productId || isRedeemingWithCoins) return;

    if (!canShowProductCoinCheckout || requiredProductCoins <= 0) return;

    if (userCoinBalance < requiredProductCoins) {
      onInsufficientCoins?.({
        requiredCoins: requiredProductCoins,
        balance: userCoinBalance,
        missingCoins: missingProductCoins,
        productTitle: product.title,
      });
      return;
    }

    try {
      setIsRedeemingWithCoins(true);
      setIsCoinButtonChecking(true);
      const result = await redeemProductWithEduCoins({
        userId,
        productId,
        requiredCoins: requiredProductCoins,
        productTitle: product.title,
      });

      if (result.success) {
        const appUnlockSynced = onCoinPurchase
          ? await onCoinPurchase(product, quantity, {
              coinDebitAlreadyProcessed: true,
              totalCoinsCharged: result.requiredCoins || requiredProductCoins,
            })
          : true;

        setCoinRedeemModal({
          open: true,
          title: appUnlockSynced ? 'Product unlocked successfully' : 'Unlock sync pending',
          message: appUnlockSynced
            ? 'Your EduCoins were deducted once and this product is now unlocked.'
            : 'Coins were deducted, but app access sync failed. Please refresh purchases once.',
          showProfileButton: !appUnlockSynced,
        });
        return;
      }

      if (result.reason === 'not_enough_coins') {
        onInsufficientCoins?.({
          requiredCoins: result.requiredCoins || requiredProductCoins,
          balance: result.currentBalance ?? userCoinBalance,
          missingCoins: Math.max(0, (result.requiredCoins || requiredProductCoins) - (result.currentBalance ?? userCoinBalance)),
          productTitle: product.title,
        });
        return;
      }

      if (result.reason === 'already_unlocked') {
        await onCoinPurchase?.(product, quantity, {
          coinDebitAlreadyProcessed: true,
          totalCoinsCharged: 0,
        });
        setCoinRedeemModal({ open: true, title: 'Already unlocked', message: 'You already have access to this product.', showProfileButton: false });
        return;
      }

      setCoinRedeemModal({ open: true, title: 'EduCoin redeem not available', message: 'This product cannot be redeemed with EduCoins right now.', showProfileButton: false });
    } catch (error) {
      console.error('EduCoin redeem failed:', error);
      setCoinRedeemModal({ open: true, title: 'Redeem failed', message: 'Something went wrong. Please try again.', showProfileButton: false });
    } finally {
      setIsRedeemingWithCoins(false);
      setIsCoinButtonChecking(false);
    }
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setOpenCoinGuideOnMount(false);
    setOpenRazorpayOnMount(false);
    window.setTimeout(() => window.scrollTo(0, 0), 0);
  };

  const handleModalConfirmWithCoins = async () => {
    setIsCoinButtonChecking(true);
    try {
      if (!canShowProductCoinCheckout || requiredProductCoins <= 0) return false;
      const wasPurchased = await (onCoinPurchase?.(product, quantity) || false);
      if (!wasPurchased) {
        setIsCoinButtonChecking(false);
      }
      return wasPurchased;
    } catch (error) {
      console.error('EduCoin product checkout failed:', error);
      setIsCoinButtonChecking(false);
      return false;
    }
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
        coinPrice={canShowProductCoinCheckout ? productCoinPrice * quantity : 0}
        onConfirmWithCoins={canShowProductCoinCheckout ? handleModalConfirmWithCoins : undefined}
        onStartEarning={onStartEarning}
        onInsufficientCoins={(details) => onInsufficientCoins?.({ ...details, productTitle: product.title })}
        initialShowCoinGuide={openCoinGuideOnMount}
        initialCheckoutStep={openRazorpayOnMount ? 'razorpay' : 'checkout'}
        presentation="page"
        razorpayAlreadyOpened={openRazorpayOnMount}
      />
    );
  }

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
      <section className="relative overflow-hidden bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-cyan-50/40 py-10 text-slate-900 sm:py-20">
        <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-28 h-80 w-80 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="container relative z-10 mx-auto px-4 sm:px-6">
          <nav className="mb-5 flex items-center space-x-2 overflow-hidden text-xs text-slate-600 sm:mb-8 sm:text-sm" aria-label="Breadcrumb">
            <button onClick={onGoHome} className="font-bold transition-colors hover:text-primary hover:underline">Home</button>
            <span className="text-slate-400">/</span>
            <button onClick={onBack} className="font-bold transition-colors hover:text-primary hover:underline">Products</button>
            <span className="text-slate-400">/</span>
            <span className="max-w-xs truncate font-black text-primary" title={product.title}>{product.title}</span>
          </nav>

          <div ref={gridRef} className={`grid grid-cols-1 gap-5 sm:gap-8 md:grid-cols-12 ${settings.animations.enabled ? 'scroll-animate' : ''}`}>
            <div className="md:col-span-7">
              <div className="relative w-full overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/80 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:rounded-[2rem]">
                <img src={mainImage || getProductImage(product, 'detailMobile')} alt={product.title} className="block aspect-[4/3] h-auto w-full object-contain lg:hidden" />
                <img src={mainImage || getProductImage(product, 'detailDesktop')} alt={product.title} className="hidden aspect-video h-auto w-full object-contain lg:block" />
                {isWishlisted && <span className="absolute right-3 top-3 rounded-full bg-red-500 px-3 py-1.5 text-xs font-black text-white shadow-lg sm:right-5 sm:top-5 sm:px-4 sm:py-2 sm:text-sm">♥ Wishlisted</span>}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3">
                <div className="rounded-2xl border border-white/70 bg-white/70 p-3 text-center shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-2xl sm:rounded-3xl sm:p-4"><p className="text-xl sm:text-2xl">⚡</p><p className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-slate-500">Instant</p><p className="text-sm font-black text-slate-900">Unlock</p></div>
                <div className="rounded-2xl border border-white/70 bg-white/70 p-3 text-center shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-2xl sm:rounded-3xl sm:p-4"><p className="text-xl sm:text-2xl">🪙</p><p className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-slate-500">Wallet</p><p className="text-sm font-black text-slate-900">{canShowProductCoinCheckout ? `${productCoinPrice} Coins` : 'Razorpay'}</p></div>
                <div className="rounded-2xl border border-white/70 bg-white/70 p-3 text-center shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-2xl sm:rounded-3xl sm:p-4"><p className="text-xl sm:text-2xl">⭐</p><p className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-slate-500">Rating</p><p className="text-sm font-black text-slate-900">{product.rating.toFixed(1)} / 5</p></div>
              </div>

              {(detailGalleryImages.length > 0 || (product.images || []).length > 1) && (
                <div className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:pb-0">
                  {detailGalleryImages.map(({ slot, image, config }) => (
                    <button key={slot} onClick={() => setMainImage(image)} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white/75 transition-all sm:h-20 sm:w-20 sm:rounded-2xl ${mainImage === image ? 'border-primary shadow-lg' : 'border-white/70 hover:border-indigo-300'}`} aria-label={`View ${config.label}`}>
                      <img src={image} alt={`${product.title} ${config.label}`} className="h-full w-full object-contain" />
                    </button>
                  ))}
                  {(product.images || []).map((img, i) => (
                    <button key={`legacy-${i}`} onClick={() => setMainImage(img)} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white/75 transition-all sm:h-20 sm:w-20 sm:rounded-2xl ${mainImage === img ? 'border-primary shadow-lg' : 'border-white/70 hover:border-indigo-300'}`} aria-label={`View fallback thumbnail ${i + 1}`}>
                      <img src={img} alt={`${product.title} fallback thumbnail ${i + 1}`} className="h-full w-full object-contain" />
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-5 rounded-[1.5rem] border border-white/70 bg-white/75 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.07)] backdrop-blur-2xl sm:mt-8 sm:rounded-[2rem] sm:p-8">
                <div className="mb-4 flex gap-2 overflow-x-auto pb-1 sm:mb-6 sm:flex-wrap sm:overflow-visible sm:pb-0">
                  {(product.tags || [product.category || 'Premium resource', 'Digital access', 'Lifetime']).slice(0, 4).map(tag => (
                    <span key={tag} className="shrink-0 rounded-full border border-indigo-100 bg-indigo-50/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600 sm:px-4 sm:py-2 sm:text-xs">{tag}</span>
                  ))}
                </div>
                <div className="flex items-start justify-between gap-3 sm:flex-wrap sm:gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-indigo-500">Digital product</p>
                    <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:mt-3 sm:text-5xl">{product.title}</h1>
                  </div>
                  <button onClick={handleShare} className="shrink-0 rounded-full border border-slate-200 bg-white/80 p-2.5 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:text-primary sm:p-3" aria-label="Share this product"><ShareIcon /></button>
                </div>
                <p className="mt-4 text-base leading-7 text-slate-600 sm:mt-6 sm:text-lg sm:leading-8">{product.longDescription}</p>

                {(product.features || []).length > 0 && (
                  <div className="mt-6 rounded-2xl border border-slate-200/70 bg-slate-50/80 sm:mt-8 sm:rounded-3xl">
                    <h3 className="border-b border-slate-200/70 p-4 text-lg font-black text-primary sm:text-xl">Key Features</h3>
                    <div className="divide-y divide-slate-200/70">
                      {(product.features || []).map((feature, i) => (
                        <div key={i} className="feature-accordion">
                          <button onClick={() => setOpenAccordion(openAccordion === i ? null : i)} className="feature-accordion-header flex w-full items-center justify-between gap-3 p-4 text-left">
                            <span className="font-bold text-slate-900">{feature}</span>
                            <span className={`transform transition-transform duration-300 ${openAccordion === i ? 'rotate-45' : ''}`}><svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></span>
                          </button>
                          <div className={`feature-accordion-content px-4 ${openAccordion === i ? 'is-open' : ''}`}>
                            <p className="text-sm leading-6 text-slate-600">
                              This feature is included to help learners understand the resource clearly, apply it during study sessions, and get practical value from the product without confusion.
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-8">
                  <ProductAnalyticsChart />
                </div>
              </div>
            </div>

            <aside className="md:col-span-5">
              <div id="price-section" className={`overflow-hidden rounded-[1.5rem] border border-white/60 bg-white/75 p-4 shadow-[0_28px_85px_rgba(79,70,229,0.14)] backdrop-blur-2xl sm:rounded-[2rem] sm:p-6 md:sticky md:top-24 ${priceJustUpdated ? 'price-flash' : ''}`}>
                <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-indigo-300/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-cyan-600/20 blur-3xl" />
                <div className="relative">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-indigo-500">Secure checkout</p>
                <h2 className="mt-2 text-xl font-black text-slate-950 sm:mt-3 sm:text-2xl">Unlock instant access</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Digital products are single-quantity purchases with lifetime access from My Purchases.</p>

                <div className="mt-5 rounded-2xl border border-slate-200/70 bg-slate-50/85 p-4 sm:mt-6 sm:rounded-3xl sm:p-5">
                  <div className="flex items-end justify-between gap-4">
                    <span className="text-sm font-black uppercase tracking-widest text-slate-500">Total</span>
                    <div className="text-right">
                      {salePriceNum !== null && !appliedCoupon && <p className="text-sm font-bold text-slate-400 line-through">₹{originalPriceNum.toFixed(2)}</p>}
                      {appliedCoupon && <p className="text-sm font-bold text-emerald-600">Saved ₹{totalCouponDiscount.toFixed(2)}</p>}
                      <p className="text-3xl font-black text-primary sm:text-4xl">{product.isFree ? 'FREE' : `₹${finalTotalPrice.toFixed(2)}`}</p>
                    </div>
                  </div>
                  {eduCoinDiscount > 0 && <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">🪙 {activeCoinDiscount?.coins || 0} EduCoins applied for ₹{eduCoinDiscount.toFixed(2)} off</p>}
                </div>

                {!product.isFree && coupons.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm sm:mt-5 sm:rounded-3xl sm:p-4">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input type="text" value={couponInput} onChange={e => setCouponInput(e.target.value.toUpperCase())} placeholder="Coupon code" className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 font-bold outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" aria-label="Coupon code" />
                      <button onClick={() => handleApplyCoupon(couponInput)} className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white transition hover:-translate-y-0.5">Apply</button>
                    </div>
                    {couponError && <p className="mt-2 text-sm font-bold text-red-500">{couponError}</p>}
                    {appliedCoupon && !couponError && <div className="mt-3 flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><span>{appliedCoupon.code} applied</span><button onClick={handleRemoveCoupon} className="text-red-500 hover:underline">Remove</button></div>}
                  </div>
                )}

                <div className="mt-5 space-y-3 sm:mt-6">
                  <button disabled={isPurchased} onClick={handleBuyClick} className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3.5 text-base font-black text-white shadow-[0_16px_40px_rgba(79,70,229,0.25)] transition hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:px-8 sm:py-4 sm:text-lg">
                    {isPurchased ? 'Purchased' : 'Pay with Razorpay'}
                  </button>
                  {canShowProductCoinCheckout && (
                    <button disabled={coinCheckoutDisabled} onClick={handleEduCoinButtonClick} className="w-full rounded-2xl border border-amber-200/70 bg-white/75 px-6 py-3.5 text-base font-black text-amber-800 shadow-[0_14px_38px_rgba(245,158,11,0.12)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-amber-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:px-8 sm:py-4 sm:text-lg">
                      🪙 {coinCheckoutLabel}
                      {requiredProductCoins > 0 && (
                        <span className="mt-2 block text-xs font-bold text-slate-600">
                          Admin coin price: {requiredProductCoins} EduCoins · Your balance: {userCoinBalance} EduCoins
                          {missingProductCoins > 0 ? ` · Missing: ${missingProductCoins}` : ' · Ready to unlock instantly'}
                        </span>
                      )}
                    </button>
                  )}
                  {hasLockedPaidUpdates && (
                    <button onClick={() => onPurchaseLatestUpdate?.(product)} className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-6 py-3.5 text-base font-black text-white shadow-[0_16px_40px_rgba(16,185,129,0.22)] transition hover:-translate-y-0.5 active:scale-95 sm:px-8 sm:py-4 sm:text-lg">
                      Purchase the latest update
                      <span className="mt-2 block text-xs font-bold text-white/85">
                        {productAccess?.lockedPaidUpdateCount || 0} new paid content item{(productAccess?.lockedPaidUpdateCount || 0) === 1 ? '' : 's'} available
                      </span>
                    </button>
                  )}
                  <button disabled={isPurchased} onClick={() => onAddToCart(product.id, 1)} className="w-full rounded-2xl border border-indigo-200/70 bg-white/85 px-6 py-3.5 text-base font-black text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:px-8 sm:py-4">
                    {isPurchased ? 'Already in My Purchases' : 'Add to Cart'}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-bold text-slate-600 sm:mt-5 sm:gap-3 sm:text-sm md:grid-cols-1 lg:grid-cols-3">
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
                bgColor="bg-transparent"
                coupons={coupons}
            />
        </div>
      )}
      
      {isShareModalOpen && (
        <ShareModal
            url={productUrl}
            title={product.title}
            onClose={() => setIsShareModalOpen(false)}
        />
      )}

      {coinRedeemModal.open && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-900">{coinRedeemModal.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{coinRedeemModal.message}</p>
            </div>
            <div className="flex gap-3">
              {coinRedeemModal.showProfileButton && (
                <button type="button" onClick={() => { window.location.href = '/profile'; }} className="flex-1 rounded-full bg-blue-600 px-4 py-3 text-sm font-bold text-white">Go to Profile</button>
              )}
              <button type="button" onClick={() => setCoinRedeemModal({ open: false, title: '', message: '' })} className="flex-1 rounded-full border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">Close</button>
            </div>
          </div>
        </div>
      )}

    </>
  );
};

export default ProductDetailPage;
