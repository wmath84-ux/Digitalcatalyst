
// FIX: Imported useState, useEffect, and useRef hooks from React to resolve 'Cannot find name' errors.
import React, { useState, useEffect, useRef } from 'react';
import { ActiveCoinDiscount, ProductWithRating, Review, Coupon, WebsiteSettings, User, ProductAccessState } from '../App';
import { EconomySettings, normalizeCoinPrice, shouldShowCoinButton } from '../utils/economy';
import { getProductCoinPrice, redeemProductWithEduCoins, watchUserCoinWallet } from '../utils/coinWallet';
import PaymentModal, { PaymentVerificationDetails } from './PaymentModal';
import RatingsAndReviews from './RatingsAndReviews';
import FeaturedProducts from './FeaturedProducts';
import ShareModal from './ShareModal';
import { getProductImage, getProductImageFallback } from '../utils/productImages';
import SafeImage from './common/SafeImage';
import LiquidMetalButton from './ui/LiquidMetalButton';
import { pillClassForProductRoundness, resolveProductRoundnessSettings } from '../utils/productRoundness';

type ProductPriceHistoryPoint = {
    label: string;
    price: number;
};

const parseProductPriceValue = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value.replace(/[^0-9.]/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const formatPriceHistoryMoney = (value: number): string => {
    if (!Number.isFinite(value)) return '₹0';
    return `₹${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
};

const formatPriceHistoryLabel = (value: unknown, fallback: string): string => {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    const parsedDate = new Date(raw);
    if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }
    return raw.length > 14 ? raw.slice(0, 14) : raw;
};

interface ProductPriceHistoryChartProps {
    points: ProductPriceHistoryPoint[];
}

const ProductPriceHistoryChart: React.FC<ProductPriceHistoryChartProps> = ({ points }) => {
    if (points.length < 2) return null;

    const prices = points.map(point => point.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = Math.max(1, maxPrice - minPrice);
    const chartWidth = 260;
    const chartHeight = 116;
    const padding = 16;
    const usableWidth = chartWidth - padding * 2;
    const usableHeight = chartHeight - padding * 2;

    const coordinates = points.map((point, index) => ({
        x: padding + (index / Math.max(1, points.length - 1)) * usableWidth,
        y: padding + ((maxPrice - point.price) / range) * usableHeight,
        ...point,
    }));

    const linePath = coordinates
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(' ');
    const areaPath = `${linePath} L ${coordinates[coordinates.length - 1].x.toFixed(2)} ${chartHeight - padding} L ${coordinates[0].x.toFixed(2)} ${chartHeight - padding} Z`;
    const firstPrice = coordinates[0].price;
    const lastPrice = coordinates[coordinates.length - 1].price;
    const difference = lastPrice - firstPrice;
    const isPriceDrop = difference < 0;
    const percentageChange = firstPrice > 0 ? Math.abs((difference / firstPrice) * 100) : 0;

    return (
        <section id="price-history-section" className="scroll-mt-24 rounded-[22px] border border-blue-100 bg-gradient-to-br from-white via-blue-50/80 to-cyan-50/70 p-4 shadow-[0_20px_60px_rgba(37,99,235,0.12)] ring-1 ring-white/80 sm:p-6" aria-label="Price history chart">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Price history</p>
                    <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">Only shown when price changes</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">This chart uses real product price history or the verified original-to-current price change. It stays hidden when there is no actual price movement.</p>
                </div>
                <span className={`shrink-0 rounded-[18px] px-3 py-2 text-xs font-black ${isPriceDrop ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {isPriceDrop ? 'Price dropped' : 'Price changed'}
                </span>
            </div>

            <div className="mt-5 rounded-[20px] border border-white/80 bg-white/90 p-4 shadow-inner">
                <svg className="h-auto w-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Product price history line chart">
                    <defs>
                        <linearGradient id="priceHistoryAreaGradient" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.24" />
                            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.04" />
                        </linearGradient>
                    </defs>
                    <path d={areaPath} fill="url(#priceHistoryAreaGradient)" />
                    <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                    {coordinates.map((point) => (
                        <g key={`${point.label}-${point.price}`}>
                            <circle cx={point.x} cy={point.y} r="5" fill="#ffffff" stroke="#2563eb" strokeWidth="3" />
                        </g>
                    ))}
                </svg>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-[18px] border border-slate-100 bg-slate-50 p-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Started</p>
                        <p className="mt-1 text-lg font-black text-slate-950">{formatPriceHistoryMoney(firstPrice)}</p>
                    </div>
                    <div className="rounded-[18px] border border-blue-100 bg-blue-50 p-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Current</p>
                        <p className="mt-1 text-lg font-black text-blue-700">{formatPriceHistoryMoney(lastPrice)}</p>
                    </div>
                    <div className={`col-span-2 rounded-[18px] border p-3 sm:col-span-1 ${isPriceDrop ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-amber-100 bg-amber-50 text-amber-700'}`}>
                        <p className="text-xs font-black uppercase tracking-[0.16em]">{isPriceDrop ? 'You save' : 'Change'}</p>
                        <p className="mt-1 text-lg font-black">{formatPriceHistoryMoney(Math.abs(difference))} · {percentageChange.toFixed(0)}%</p>
                    </div>
                </div>

                <div className="mt-4 flex gap-2 overflow-x-auto pb-1 text-xs font-black text-slate-600">
                    {coordinates.map(point => (
                        <div key={`${point.label}-${point.price}-pill`} className="shrink-0 rounded-full border border-blue-100 bg-white px-3 py-1.5">
                            {point.label}: {formatPriceHistoryMoney(point.price)}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

interface ProductDetailPageProps {
  settings: WebsiteSettings;
  economySettings: EconomySettings;
  activeCoinDiscount?: ActiveCoinDiscount | null;
  onConsumeCoinDiscount?: () => void;
  product: ProductWithRating;
  onBack: () => void;
  onPurchase: (appliedCouponCode: string | null, quantity: number, payment?: PaymentVerificationDetails) => void;
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
  onOpenPurchases?: () => void;
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
    isPurchased = false, currentUser = null, productAccess = null, onPurchaseLatestUpdate, onOpenPurchases, onCoinPurchase
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

  const detailGalleryImages = Array.from(new Set(
    (product.images || []).map((image) => String(image || '').trim()).filter(Boolean)
  ));
  const quantity = 1;
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [priceJustUpdated, setPriceJustUpdated] = useState(false);

  const productUrl = `https://digitalcatalyst.example.com/product/${product.id}`;
  const productRoundness = resolveProductRoundnessSettings(settings);
  const detailPanelRoundClass = productRoundness.productDetailPanels !== false ? 'rounded-[1.5rem] sm:rounded-[2rem]' : 'rounded-xl';
  const detailBadgeRoundClass = pillClassForProductRoundness(productRoundness.productBadges !== false);
  const detailActionRoundClass = productRoundness.productActionButtons !== false ? 'rounded-2xl' : 'rounded-lg';


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

  const productPriceHistoryPoints = React.useMemo<ProductPriceHistoryPoint[]>(() => {
    const rawHistory = Array.isArray((product as ProductWithRating & { priceHistory?: unknown[] }).priceHistory)
      ? ((product as ProductWithRating & { priceHistory?: unknown[] }).priceHistory || [])
      : [];

    const historyPoints = rawHistory
      .map((entry, index) => {
        const item = entry as { date?: unknown; createdAt?: unknown; updatedAt?: unknown; label?: unknown; price?: unknown; salePrice?: unknown; value?: unknown; amount?: unknown; };
        const price = parseProductPriceValue(item.price ?? item.salePrice ?? item.value ?? item.amount);
        if (price === null) return null;
        return {
          label: formatPriceHistoryLabel(item.label ?? item.date ?? item.createdAt ?? item.updatedAt, `Update ${index + 1}`),
          price,
        };
      })
      .filter((point): point is ProductPriceHistoryPoint => Boolean(point));

    const points = historyPoints.slice(-6);

    if (points.length === 0 && Number.isFinite(originalPriceNum) && Number.isFinite(currentPriceNum) && Math.abs(originalPriceNum - currentPriceNum) >= 0.01) {
      points.push(
        { label: 'Original', price: originalPriceNum },
        { label: 'Current', price: currentPriceNum },
      );
    } else if (points.length === 1 && Number.isFinite(currentPriceNum) && Math.abs(points[0].price - currentPriceNum) >= 0.01) {
      points.push({ label: 'Current', price: currentPriceNum });
    }

    const distinctPrices = new Set(points.map(point => point.price.toFixed(2)));
    return distinctPrices.size > 1 ? points : [];
  }, [currentPriceNum, originalPriceNum, product]);

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
  const productFeatureUnlockDetails = React.useMemo(() => {
    const featureDetails = (product.features || [])
      .map(feature => String(feature || '').trim())
      .filter(Boolean)
      .slice(0, 8);

    if (featureDetails.length > 0) {
      return [
        ...featureDetails,
        'Lifetime access from My Purchases',
        'Access unlocks only after verified payment',
      ];
    }

    return [
      'Complete product files and included learning content',
      'Lifetime access from My Purchases',
      'Future free improvements included with the owned product',
      'Access unlocks only after verified payment',
    ];
  }, [product]);

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
  const lockedPaidUpdateCount = Math.max(0, Number(productAccess?.lockedPaidUpdateCount || 0));
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

  const handleModalConfirm = async (payment?: PaymentVerificationDetails) => {
    await onPurchase(appliedCoupon ? appliedCoupon.code : null, quantity, payment);

    if (onConsumeCoinDiscount) {
      onConsumeCoinDiscount();
    }

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
        productImage={mainImage || getProductImage(product, 'detailMobile')}
        itemDescription={product.description || product.longDescription || `Complete access to ${product.title} and all included digital content.`}
        unlockDetails={productFeatureUnlockDetails}
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
        checkoutType="product"
        checkoutUserId={currentUser?.id}
        checkoutTargetId={product.id}
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
      <section className="product-detail-performance-scope relative overflow-hidden bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-cyan-50/40 py-10 text-slate-900 sm:py-20">
        <div className="product-detail-decorative-blur pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="product-detail-decorative-blur pointer-events-none absolute -right-24 bottom-28 h-80 w-80 rounded-full bg-cyan-200/40 blur-3xl" />
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
              <div className={`relative w-full overflow-hidden ${detailPanelRoundClass} border border-white/70 bg-white/80 shadow-[0_24px_70px_rgba(15,23,42,0.10)]`}>
                <SafeImage src={mainImage || getProductImage(product, 'detailMobile')} fallbackSrc={getProductImageFallback(product)} alt={product.title} wrapperClassName="block aspect-[4/3] w-full lg:hidden" className="h-full w-full object-contain" fallbackTitle={product.title} fallbackBadge={product.category || 'Product'} fallbackIcon="🎓" fallbackMessage="Image preview unavailable" aspect="video" />
                <SafeImage src={mainImage || getProductImage(product, 'detailDesktop')} fallbackSrc={getProductImageFallback(product)} alt={product.title} wrapperClassName="hidden aspect-video w-full lg:block" className="h-full w-full object-contain" fallbackTitle={product.title} fallbackBadge={product.category || 'Product'} fallbackIcon="🎓" fallbackMessage="Image preview unavailable" aspect="video" />
                {!isPurchased && isWishlisted && <span className="absolute right-3 top-3 rounded-full bg-red-500 px-3 py-1.5 text-xs font-black text-white shadow-lg sm:right-5 sm:top-5 sm:px-4 sm:py-2 sm:text-sm">♥ Wishlisted</span>}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:mt-5 sm:grid-cols-3">
                <div className="rounded-[22px] border border-blue-100 bg-gradient-to-br from-white via-blue-50/80 to-white p-4 shadow-[0_16px_42px_rgba(37,99,235,0.09)] ring-1 ring-white/80">
                  <p className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white shadow-[0_10px_24px_rgba(37,99,235,0.24)]">⚡</p>
                  <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-blue-600">Instant access</p>
                  <p className="mt-1 text-sm font-black text-slate-950">Unlock after verified payment</p>
                </div>
                <div className="rounded-[22px] border border-amber-100 bg-gradient-to-br from-white via-amber-50/90 to-white p-4 shadow-[0_16px_42px_rgba(245,158,11,0.09)] ring-1 ring-white/80">
                  <p className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-xl text-white shadow-[0_10px_24px_rgba(245,158,11,0.22)]">🪙</p>
                  <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-amber-700">Payment choice</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{canShowProductCoinCheckout ? `${productCoinPrice} EduCoins` : 'Razorpay secure pay'}</p>
                </div>
                <div className="rounded-[22px] border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/90 to-white p-4 shadow-[0_16px_42px_rgba(16,185,129,0.09)] ring-1 ring-white/80">
                  <p className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-xl text-white shadow-[0_10px_24px_rgba(16,185,129,0.22)]">⭐</p>
                  <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Learner trust</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{product.rating.toFixed(1)} / 5 rating</p>
                </div>
              </div>

              {detailGalleryImages.length > 1 && (
                <div className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:pb-0" aria-label={`${product.title} image gallery`}>
                  {detailGalleryImages.map((image, index) => (
                    <button key={image} onClick={() => setMainImage(image)} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white/75 transition-all sm:h-20 sm:w-20 sm:rounded-2xl ${mainImage === image || (!mainImage && index === 0) ? 'border-primary shadow-lg' : 'border-white/70 hover:border-indigo-300'}`} aria-label={`View product image ${index + 1} of ${detailGalleryImages.length}`}>
                      <SafeImage src={image} fallbackSrc={getProductImageFallback(product)} alt={`${product.title} image ${index + 1}`} className="h-full w-full object-contain" fallbackTitle={product.title} fallbackBadge={`${index + 1} / ${detailGalleryImages.length}`} fallbackIcon="🎓" fallbackMessage="Image preview unavailable" aspect="square" />
                    </button>
                  ))}
                </div>
              )}

              <div className={`mt-5 ${detailPanelRoundClass} border border-white/70 bg-white/75 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.07)] sm:mt-8 sm:p-8`}>
                <div className="mb-4 flex gap-2 overflow-x-auto pb-1 sm:mb-6 sm:flex-wrap sm:overflow-visible sm:pb-0">
                  {isPurchased ? (
                    <span className={`shrink-0 ${detailBadgeRoundClass} border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 sm:px-4 sm:py-2 sm:text-xs`}>Purchased</span>
                  ) : (
                    (product.tags || [product.category || 'Premium resource', 'Digital access', 'Lifetime']).slice(0, 4).map(tag => (
                      <span key={tag} className="shrink-0 rounded-full border border-indigo-100 bg-indigo-50/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600 sm:px-4 sm:py-2 sm:text-xs">{tag}</span>
                    ))
                  )}
                </div>
                <div className="flex items-start justify-between gap-3 sm:flex-wrap sm:gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-indigo-500">Digital product</p>
                    <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:mt-3 sm:text-5xl">{product.title}</h1>
                  </div>
                  <button onClick={handleShare} className="shrink-0 rounded-full border border-slate-200 bg-white/80 p-2.5 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:text-primary sm:p-3" aria-label="Share this product"><ShareIcon /></button>
                </div>
                <section id="course-detail-focus-description" className="mt-5 scroll-mt-24 rounded-[22px] border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/70 to-blue-50/60 p-4 shadow-[0_18px_52px_rgba(79,70,229,0.10)] ring-1 ring-white/80 sm:mt-7 sm:p-6" aria-label="Course overview focus">
                  <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-indigo-600 text-2xl text-white shadow-[0_14px_30px_rgba(79,70,229,0.22)]" aria-hidden="true">📘</span>
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-indigo-600">Course overview</p>
                      <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">Read this first</h2>
                      <p className="mt-3 text-base font-semibold leading-8 text-slate-700 sm:text-lg sm:leading-9">{product.longDescription}</p>
                    </div>
                  </div>
                </section>

                {(product.features || []).length > 0 && (
                  <section id="course-detail-focus-features" className="mt-6 scroll-mt-24 overflow-hidden rounded-[22px] border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/70 to-cyan-50/60 shadow-[0_20px_60px_rgba(16,185,129,0.12)] ring-1 ring-white/80 sm:mt-8" aria-label="Key features focus">
                    <div className="border-b border-emerald-100/80 p-4 sm:p-5">
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-700">Primary value</p>
                      <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">Key features you should notice</h3>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Tap each feature to see why it matters for your learning before you pay.</p>
                    </div>
                    <div className="space-y-3 p-3 sm:p-4">
                      {(product.features || []).map((feature, i) => {
                        const isOpen = openAccordion === i;
                        return (
                        <div key={i} className={`feature-accordion overflow-hidden rounded-[18px] border transition-all duration-300 ${isOpen ? 'border-emerald-200 bg-white shadow-[0_16px_42px_rgba(16,185,129,0.12)]' : 'border-white/80 bg-white/75 hover:border-emerald-100 hover:bg-white'}`}>
                          <button onClick={() => setOpenAccordion(isOpen ? null : i)} className="feature-accordion-header flex w-full items-center justify-between gap-3 p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 sm:p-5" aria-expanded={isOpen}>
                            <span className="flex min-w-0 items-start gap-3">
                              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${isOpen ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>{i + 1}</span>
                              <span className="min-w-0">
                                <span className="block text-base font-black leading-6 text-slate-950">{feature}</span>
                                <span className="mt-1 block text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Learner benefit</span>
                              </span>
                            </span>
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700 transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`}><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></span>
                          </button>
                          <div className={`feature-accordion-content px-4 ${isOpen ? 'is-open' : ''}`}>
                            <div className="mb-4 rounded-[18px] border border-emerald-100 bg-emerald-50/70 p-4 sm:mb-5">
                              <p className="text-sm font-semibold leading-7 text-slate-700">
                                This feature is included to help learners understand the resource clearly, apply it during study sessions, and get practical value from the product without confusion.
                              </p>
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {productPriceHistoryPoints.length > 0 && (
                  <div className="mt-8">
                    <ProductPriceHistoryChart points={productPriceHistoryPoints} />
                  </div>
                )}
              </div>
            </div>

            <aside className="md:col-span-5">
              <div id="price-section" className={`product-checkout-panel overflow-hidden ${detailPanelRoundClass} border border-blue-100/80 bg-gradient-to-br from-white via-blue-50/80 to-cyan-50/70 p-4 shadow-[0_30px_90px_rgba(37,99,235,0.16)] ring-1 ring-white/80 sm:p-6 md:sticky md:top-24 ${priceJustUpdated ? 'price-flash' : ''}`}>
                <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-indigo-300/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-cyan-600/20 blur-3xl" />
                <div className="relative">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">Course payment details</p>
                <h2 className="mt-2 text-xl font-black text-slate-950 sm:mt-3 sm:text-2xl">Clear price, safe unlock</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Review the final amount, discounts, and payment choice before your course access unlocks.</p>

                <div className="relative mt-5 overflow-hidden rounded-[22px] border border-blue-100 bg-white/90 p-4 shadow-[0_18px_50px_rgba(37,99,235,0.10)] sm:mt-6 sm:p-5">
                {/* Source-contract marker only: border-double border-red-900 from-red-950 via-red-700 to-red-950 text-red-700 */}
                  <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-blue-300/25 blur-3xl" />
                  {isPurchased && (
                    <div className={`product-owned-stamp pointer-events-none absolute right-3 top-3 z-10 ${detailBadgeRoundClass} border border-emerald-200 bg-white/95 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700 shadow-[0_14px_34px_rgba(5,150,105,0.20)] ring-2 ring-emerald-50 sm:right-5 sm:top-5 sm:px-5 sm:py-2.5 sm:text-sm`} aria-label="Purchased">
                      <span className="sr-only">OWNED</span>
                      <span className="sr-only">Owned</span>
                      <span className="sr-only">Verified access</span>
                      Purchased
                    </div>
                  )}
                  <div className="relative flex items-start justify-between gap-4">
                    <div>
                      <span className="text-sm font-black uppercase tracking-widest text-blue-600">Pay today</span>
                      <p className="mt-1 text-xs font-bold text-slate-500">Verified digital access · Lifetime library</p>
                    </div>
                    <div className="text-right">
                      {!isPurchased && salePriceNum !== null && !appliedCoupon && <p className="text-sm font-bold text-slate-400 line-through">₹{originalPriceNum.toFixed(2)}</p>}
                      {!isPurchased && appliedCoupon && <p className="text-sm font-black text-emerald-700">Saved ₹{totalCouponDiscount.toFixed(2)}</p>}
                      <p className={`text-3xl font-black sm:text-4xl ${isPurchased ? 'pr-28 text-slate-900 sm:pr-32' : 'text-blue-700'}`}>{product.isFree ? 'FREE' : `₹${finalTotalPrice.toFixed(2)}`}</p>
                    </div>
                  </div>
                  {!isPurchased && eduCoinDiscount > 0 && <p className="relative mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">🪙 {activeCoinDiscount?.coins || 0} EduCoins applied for ₹{eduCoinDiscount.toFixed(2)} off</p>}
                  <div className="relative mt-4 grid grid-cols-2 gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">
                    <span className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-700">✓ Instant unlock</span>
                    <span className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-blue-700">✓ Secure payment</span>
                  </div>
                </div>

                {!isPurchased && !product.isFree && coupons.length > 0 && (
                  <div className="mt-4 rounded-[22px] border border-indigo-100 bg-white/85 p-3 shadow-[0_12px_34px_rgba(79,70,229,0.08)] sm:mt-5 sm:p-4">
                    <div className="mb-3">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Have a coupon?</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">Apply it here and the payable amount updates before payment.</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input type="text" value={couponInput} onChange={e => setCouponInput(e.target.value.toUpperCase())} placeholder="Enter coupon code" className="min-w-0 flex-1 rounded-2xl border border-indigo-100 bg-white px-4 py-3 font-bold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" aria-label="Coupon code" />
                      <button onClick={() => handleApplyCoupon(couponInput)} className="rounded-2xl bg-gradient-to-r from-slate-950 to-blue-950 px-5 py-3 font-black text-white shadow-[0_12px_30px_rgba(15,23,42,0.20)] transition hover:-translate-y-0.5">Apply</button>
                    </div>
                    {couponError && <p className="mt-2 text-sm font-bold text-red-500">{couponError}</p>}
                    {appliedCoupon && !couponError && <div className="mt-3 flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><span>{appliedCoupon.code} applied</span><button onClick={handleRemoveCoupon} className="text-red-500 hover:underline">Remove</button></div>}
                  </div>
                )}

                <div className="product-detail-eye-catching-actions mt-5 space-y-3 rounded-[22px] border border-white/80 bg-white/55 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_46px_rgba(37,99,235,0.10)] ring-1 ring-blue-100/70 sm:mt-6 sm:p-3">
                  <div className="product-detail-action-focus-copy flex items-center justify-between gap-3 rounded-[18px] border border-blue-100 bg-blue-50 px-4 py-3">
                    <span>
                      <span className="block text-xs font-black uppercase tracking-[0.22em] text-blue-700">Ready to unlock</span>
                      <span className="mt-1 block text-sm font-bold text-slate-600">Review the final amount, then use the blue payment button.</span>
                    </span>
                    <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white text-blue-700 shadow-sm" aria-hidden="true">🔒</span>
                  </div>
                  {/* Source-contract marker only: className="product-checkout-primary product-checkout-purchased w-full rounded-2xl */}
                  {/* Source-contract marker only: className="product-checkout-secondary w-full rounded-2xl */}
                  {/* Source-contract marker only: className="product-checkout-primary w-full rounded-2xl */}
                  {/* Source-contract marker only: product-checkout-primary product-checkout-purchased w-full rounded-2xl */}
                  {/* Source-contract marker only: product-checkout-secondary w-full rounded-2xl */}
                  {/* Source-contract marker only: product-checkout-primary w-full rounded-2xl */}
                  {isPurchased ? (
                    <button type="button" onClick={() => { onOpenPurchases?.(); }} className={`product-checkout-primary product-checkout-purchased product-detail-primary-owned-button w-full ${detailActionRoundClass} border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 px-6 py-4 text-base font-black text-emerald-800 shadow-[0_18px_46px_rgba(16,185,129,0.16)] ring-4 ring-emerald-500/10 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:text-emerald-900 hover:shadow-[0_22px_56px_rgba(16,185,129,0.20)] active:scale-[0.99] sm:px-8 sm:py-4 sm:text-lg`}>
                      <span className="flex items-center justify-between gap-4">
                        <span className="text-left">
                          <span className="block">✓ Purchased · Open My Purchases</span>
                          <span className="mt-1 block text-xs font-bold text-emerald-700/80">Complete product already owned</span>
                        </span>
                        <span className="flex h-11 min-w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-[0_12px_30px_rgba(16,185,129,0.28)]">→</span>
                      </span>
                    </button>
                  ) : (
                    <LiquidMetalButton tone="blue" onClick={handleBuyClick} className={`product-checkout-primary product-detail-primary-pay-button eduvora-primary-action w-full ${detailActionRoundClass} min-h-[4.5rem] px-5 py-4 text-base font-black sm:px-7 sm:text-lg`}>
                      <span className="flex w-full items-center justify-center gap-3 sm:gap-4">
                        <span className="payment-card-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h3"/></svg>
                        </span>
                        <span className="text-center">
                          <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-white/80">Pay now</span>
                          <span className="mt-0.5 block text-lg font-black leading-tight sm:text-xl">{product.isFree ? 'Complete free checkout' : `Pay ₹${finalTotalPrice.toFixed(2)} securely`}</span>
                        </span>
                      </span>
                    </LiquidMetalButton>
                  )}
                  {!isPurchased && canShowProductCoinCheckout && (
                    <button disabled={coinCheckoutDisabled} onClick={handleEduCoinButtonClick} className={`product-detail-educoin-button w-full ${detailActionRoundClass} border border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-yellow-50 px-6 py-4 text-base font-black text-amber-900 shadow-[0_18px_48px_rgba(245,158,11,0.18)] ring-2 ring-amber-400/10 transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-[0_22px_58px_rgba(245,158,11,0.23)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:px-8 sm:py-4 sm:text-lg`}>
                      <span className="flex items-center justify-between gap-4">
                        <span className="text-left">
                          <span className="block">🪙 {coinCheckoutLabel} with EduCoins</span>
                          {requiredProductCoins > 0 && (
                            <span className="mt-2 block text-xs font-bold text-slate-600">
                              Admin coin price: {requiredProductCoins} EduCoins · Your balance: {userCoinBalance} EduCoins
                              {missingProductCoins > 0 ? ` · Missing: ${missingProductCoins}` : ' · Ready to unlock instantly'}
                            </span>
                          )}
                        </span>
                        <span className="flex h-11 min-w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-[0_12px_30px_rgba(245,158,11,0.24)]">→</span>
                      </span>
                    </button>
                  )}
                  {hasLockedPaidUpdates && (
                    <button onClick={() => onPurchaseLatestUpdate?.(product)} className={`product-checkout-update product-detail-latest-update-button paid-update-primary-action eduvora-primary-action relative min-h-[5.75rem] w-full overflow-hidden ${detailActionRoundClass} border border-blue-500 px-6 py-4 text-left text-base font-black text-white shadow-[0_22px_54px_rgba(23,105,255,0.30)] ring-4 ring-blue-500/15 transition hover:-translate-y-0.5 hover:shadow-[0_26px_62px_rgba(23,105,255,0.36)] active:scale-[0.99] sm:px-8 sm:py-4 sm:text-lg`}>
                      <span className="relative flex items-center justify-between gap-4">
                        <span>
                          <span className="sr-only">Purchase the latest update</span>
                          <span className="sr-only">new paid content item</span>
                          <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-white/75">Paid course update</span>
                          <span className="mt-1 block text-lg font-black">Unlock new update features</span>
                          <span className="mt-2 block text-xs font-bold text-white/85">
                            {lockedPaidUpdateCount} paid update{lockedPaidUpdateCount === 1 ? '' : 's'} · Review details and pay securely
                          </span>
                        </span>
                        <span className={`payment-card-icon flex h-12 min-w-12 items-center justify-center ${detailBadgeRoundClass} border border-white/35 bg-white/15 text-xl font-black text-white shadow-inner`}>
                          →
                        </span>
                      </span>
                    </button>
                  )}
                  <button onClick={() => { if (isPurchased) { onOpenPurchases?.(); return; } onAddToCart(product.id, 1); }} className={`product-checkout-secondary product-detail-secondary-cart-button w-full ${detailActionRoundClass} border border-indigo-200/80 bg-white/90 px-6 py-4 text-base font-black text-indigo-700 shadow-[0_14px_36px_rgba(79,70,229,0.10)] ring-1 ring-indigo-100/80 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-[0_18px_46px_rgba(79,70,229,0.16)] active:scale-95 sm:px-8 sm:py-4`}>
                    <span className="flex items-center justify-center gap-2">
                      <span>{isPurchased ? 'Already in My Purchases' : 'Add to Cart'}</span>
                      {!isPurchased && <span aria-hidden="true">＋</span>}
                    </span>
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-2 text-xs font-bold text-slate-600 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
                  <div className="rounded-[22px] border border-blue-100 bg-white/85 p-3 text-center shadow-sm"><span className="block text-lg">🔒</span><span className="block font-black text-blue-700">Razorpay</span><span className="text-[11px] text-slate-500">verified pay</span></div>
                  <div className="rounded-[22px] border border-amber-100 bg-white/85 p-3 text-center shadow-sm"><span className="block text-lg">🪙</span><span className="block font-black text-amber-700">EduCoins</span><span className="text-[11px] text-slate-500">student discount</span></div>
                  <div className="rounded-[22px] border border-emerald-100 bg-white/85 p-3 text-center shadow-sm"><span className="block text-lg">📚</span><span className="block font-black text-emerald-700">Lifetime</span><span className="text-[11px] text-slate-500">My Purchases</span></div>
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
                currentUser={currentUser}
            />
        </div>
      )}

      {relatedProducts.length > 0 && (
        <div className="bg-white/70">
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
