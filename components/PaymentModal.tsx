import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WebsiteSettings, ProductWithRating, CartItem, User } from '../App';
import { DEFAULT_ECONOMY_SETTINGS, EconomySettings, normalizeCoinPrice } from '../utils/economy';
import MacWindowModal from './ui/MacWindowModal';

export interface PaymentVerificationDetails {
  provider: 'razorpay' | 'free';
  status: 'verified' | 'free';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  amount: number;
  currency: 'INR';
  recovered?: boolean;
  recoveryStatus?: 'handler' | 'dismiss' | 'focus' | 'manual' | 'mount';
}

interface PaymentModalProps {
  settings: WebsiteSettings;
  economySettings?: EconomySettings;
  originalPrice: number;
  salePrice?: number | null;
  couponDiscount: number;
  finalPrice: number;
  eduCoinDiscount?: number;
  appliedEduCoins?: number;
  coinRedeemRate?: number;
  onClose: () => void;
  onConfirm: (payment?: PaymentVerificationDetails) => void | Promise<void>;
  productTitle?: string;
  productImage?: string;
  itemDescription?: string;
  unlockDetails?: string[];
  cartItems?: ({ product: ProductWithRating } & CartItem)[];
  paymentLink?: string;
  currentUser?: User | null;
  coinPrice?: number;
  onConfirmWithCoins?: () => boolean | Promise<boolean>;
  initialCheckoutStep?: 'checkout' | 'razorpay';
  onStartEarning?: () => void;
  onInsufficientCoins?: (details: { requiredCoins: number; balance: number; missingCoins: number }) => void;
  initialShowCoinGuide?: boolean;
  presentation?: 'modal' | 'page';
  razorpayAlreadyOpened?: boolean;
  checkoutType?: 'product' | 'cart' | 'subscription' | 'latest-update';
  checkoutUserId?: string;
  checkoutTargetId?: string | number;
  billingCycle?: 'monthly' | 'yearly';
}

type CheckoutStep = 'checkout' | 'razorpay' | 'loading';

interface PendingCheckoutSession {
  id: string;
  orderId?: string;
  amount: number;
  checkoutType: PaymentModalProps['checkoutType'];
  checkoutUserId?: string;
  checkoutTargetId?: string | number;
  productTitle?: string;
  billingCycle?: 'monthly' | 'yearly';
  createdAt: number;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  economySettings = DEFAULT_ECONOMY_SETTINGS,
  productTitle,
  productImage,
  itemDescription,
  unlockDetails: providedUnlockDetails,
  originalPrice,
  salePrice,
  couponDiscount,
  finalPrice,
  eduCoinDiscount = 0,
  appliedEduCoins = 0,
  coinRedeemRate = 10,
  onClose,
  onConfirm,
  cartItems,
  currentUser,
  coinPrice = 0,
  onConfirmWithCoins,
  onStartEarning,
  onInsufficientCoins,
  initialShowCoinGuide = false,
  initialCheckoutStep = 'checkout',
  presentation = 'modal',
  razorpayAlreadyOpened = false,
  checkoutType = 'product',
  checkoutUserId = '',
  checkoutTargetId,
  billingCycle,
}) => {
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>(initialCheckoutStep);
  const [isCompleting, setIsCompleting] = useState(false);
  const [coinStatus, setCoinStatus] = useState<string | null>(null);
  const [showCoinGuide, setShowCoinGuide] = useState(initialShowCoinGuide);
  const pageRef = useRef<HTMLDivElement>(null);
  const autoStartedRazorpayRef = useRef(false);
  const pendingStatusCheckRef = useRef(false);
  const razorpayCheckoutSource = 'https://checkout.razorpay.com/v1/checkout.js';
  const checkoutStorageKey = useMemo(
    () => `dc_pending_checkout:${checkoutUserId || 'guest'}:${checkoutType}:${String(checkoutTargetId || productTitle || 'checkout')}:${billingCycle || 'na'}`,
    [billingCycle, checkoutTargetId, checkoutType, checkoutUserId, productTitle]
  );
  const isCartMode = !!cartItems && cartItems.length > 0;
  const eduCoinBalance = Math.max(0, Math.floor(Number((currentUser as (User & { coinBalance?: number }) | null | undefined)?.coinBalance ?? currentUser?.eduCoins ?? 0)));
  const coinEligibility = normalizeCoinPrice(coinPrice);
  const normalizedCoinPrice = coinEligibility.normalizedCoinPrice;
  const isCoinCheckoutEnabled = !!onConfirmWithCoins && coinEligibility.isCoinPurchaseEnabled;
  const canPayWithCoins = isCoinCheckoutEnabled && eduCoinBalance >= normalizedCoinPrice;
  const missingCoins = Math.max(0, normalizedCoinPrice - eduCoinBalance);

  const earnMethods = useMemo(() => [
    { icon: '🎬', title: 'Watch purchased video lessons', text: `${economySettings.coinPerVideoMinute} EduCoin${economySettings.coinPerVideoMinute === 1 ? '' : 's'} per focused video minute`, detail: 'Open an unlocked course/video from My Purchases. Coins are credited only while the video is playing and the tab is focused.' },
    { icon: '📖', title: 'Read Study Blog / News articles', text: `${economySettings.coinPerArticleRead} EduCoins after ${Math.ceil(economySettings.articleReadTimeRequiredSec / 60)} min`, detail: 'Open the reading drawer from the dock and keep reading/scrolling until the timer completes. Each article can be rewarded once.' },
    { icon: '🎯', title: 'Complete course quizzes', text: `${economySettings.coinPerQuizCorrect} EduCoins per correct answer`, detail: 'Quiz files inside unlocked products credit coins after submission. Re-attempt rewards are protected by quiz reward history.' },
    { icon: '🛒', title: 'Purchase reward', text: `${economySettings.coinPerPurchase} EduCoins after verified checkout unlock`, detail: 'Regular checkout credits the configured purchase reward after verified product access unlocks.' },
    { icon: '🏆', title: 'Profile milestones', text: '500 / 1000 / 2000 lifetime coin goals', detail: 'Open Profile → Glowing Milestones to claim packs, course access, and badges after crossing lifetime coin requirements.' },
    { icon: '💎', title: 'Rewards Vault claims', text: `${Math.max(1, Number(economySettings.coinToFiatRatio))} EduCoins = ₹1 discount`, detail: 'The profile vault calculates live claim cards from products/subscriptions, coin prices, and admin economy overrides.' },
  ], [economySettings]);

  useEffect(() => {
    if (presentation === 'page') {
      window.scrollTo(0, 0);
      pageRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    return () => {
      document.body.classList.remove('overflow-hidden', 'pointer-events-none');
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
    };
  }, [presentation]);

  useEffect(() => {
    if (presentation === 'page') {
      pageRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
  }, [checkoutStep, presentation, showCoinGuide]);

  const closeAfterStateSettles = () => {
    window.setTimeout(() => onClose(), 100);
  };

  const readPendingCheckout = (): PendingCheckoutSession | null => {
    try {
      const parsed = JSON.parse(localStorage.getItem(checkoutStorageKey) || 'null');
      if (!parsed || typeof parsed !== 'object') return null;
      const createdAt = Number(parsed.createdAt || 0);
      if (!createdAt || Date.now() - createdAt > 1000 * 60 * 45) {
        localStorage.removeItem(checkoutStorageKey);
        return null;
      }
      return {
        id: String(parsed.id || ''),
        orderId: parsed.orderId ? String(parsed.orderId) : undefined,
        amount: Number(parsed.amount || 0),
        checkoutType: parsed.checkoutType || checkoutType,
        checkoutUserId: parsed.checkoutUserId ? String(parsed.checkoutUserId) : checkoutUserId,
        checkoutTargetId: parsed.checkoutTargetId,
        productTitle: parsed.productTitle ? String(parsed.productTitle) : productTitle,
        billingCycle: parsed.billingCycle === 'yearly' ? 'yearly' : parsed.billingCycle === 'monthly' ? 'monthly' : billingCycle,
        createdAt,
      };
    } catch {
      return null;
    }
  };

  const savePendingCheckout = (session: PendingCheckoutSession) => {
    try {
      localStorage.setItem(checkoutStorageKey, JSON.stringify(session));
    } catch {
      // Ignore storage failures; checkout can still complete through the live handler.
    }
  };

  const clearPendingCheckout = () => {
    try {
      localStorage.removeItem(checkoutStorageKey);
    } catch {
      // Ignore storage cleanup failures.
    }
  };

  const reconcilePendingCheckout = async (orderId: string, source: PaymentVerificationDetails['recoveryStatus'] = 'manual') => {
    if (!orderId || pendingStatusCheckRef.current) return false;
    pendingStatusCheckRef.current = true;
    setIsCompleting(true);
    setCheckoutStep('loading');
    setCoinStatus('Checking live payment status...');

    try {
      const statusResponse = await fetch('/api/razorpay/payment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, expectedAmount: finalPrice }),
      });
      const statusData = await statusResponse.json().catch(() => ({}));
      if (!statusResponse.ok) throw new Error(statusData?.error || 'Could not fetch payment status.');

      if (statusData?.status === 'paid' && statusData?.amountMatches !== false) {
        clearPendingCheckout();
        await onConfirm({
          provider: 'razorpay',
          status: 'verified',
          razorpayOrderId: String(statusData.orderId || orderId),
          razorpayPaymentId: String(statusData.paymentId || ''),
          amount: finalPrice,
          currency: 'INR',
          recovered: source !== 'handler',
          recoveryStatus: source,
        });
        closeAfterStateSettles();
        return true;
      }

      if (statusData?.status === 'amount_mismatch') {
        setCoinStatus('Payment detected, but the amount does not match this checkout. Access was not unlocked. Please contact support with the Razorpay payment id.');
      } else if (statusData?.status === 'failed') {
        setCoinStatus(statusData?.error || 'Payment failed or was cancelled. No access was unlocked.');
        clearPendingCheckout();
      } else {
        setCoinStatus('Payment not completed yet. No access was unlocked. You can retry or check status again.');
      }

      setCheckoutStep('razorpay');
      setIsCompleting(false);
      return false;
    } catch (error) {
      setCoinStatus(error instanceof Error ? error.message : 'Payment status check failed.');
      setCheckoutStep('razorpay');
      setIsCompleting(false);
      return false;
    } finally {
      pendingStatusCheckRef.current = false;
    }
  };

  const completeFreeCheckout = async () => {
    setCheckoutStep('loading');
    await onConfirm({ provider: 'free', status: 'free', amount: 0, currency: 'INR' });
    closeAfterStateSettles();
  };

  const loadRazorpayCheckout = async () => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${razorpayCheckoutSource}"]`);
    if ((window as any).Razorpay) return;
    if (existing) {
      await new Promise<void>((resolve, reject) => {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Payment app/window could not load. Check your internet connection, disable blocking extensions, then retry.')), { once: true });
      });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = razorpayCheckoutSource;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Payment app/window could not load. Check your internet connection, disable blocking extensions, then retry.'));
      document.body.appendChild(script);
    });

    if (!(window as any).Razorpay) {
      throw new Error('Payment app/window is not available on this browser right now. Please retry, switch browser, or use another payment method.');
    }
  };

  const handlePayNow = async (_openRazorpayWindow = true) => {
    if (isCompleting || checkoutStep === 'loading') return;
    if (finalPrice <= 0) {
      await completeFreeCheckout();
      return;
    }

    setShowCoinGuide(false);
    setIsCompleting(true);
    setCheckoutStep('loading');
    setCoinStatus('Creating a secure Razorpay order...');

    try {
      await loadRazorpayCheckout();
      const checkoutReceipt = `${checkoutType}_${String(checkoutTargetId || 'checkout').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16)}_${Date.now()}`.slice(0, 40);
      const orderResponse = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: finalPrice,
          receipt: checkoutReceipt,
          checkoutType,
          userId: checkoutUserId,
          targetId: checkoutTargetId,
          billingCycle,
        }),
      });
      const orderData = await orderResponse.json().catch(() => ({}));
      if (!orderResponse.ok || !orderData?.orderId || !orderData?.keyId) {
        throw new Error(orderData?.error || 'Could not create Razorpay order.');
      }

      savePendingCheckout({
        id: String(orderData.receipt || checkoutReceipt),
        orderId: String(orderData.orderId),
        amount: finalPrice,
        checkoutType: checkoutType as NonNullable<PaymentModalProps['checkoutType']>,
        checkoutUserId,
        checkoutTargetId,
        productTitle,
        billingCycle,
        createdAt: Date.now(),
      });

      const RazorpayConstructor = (window as any).Razorpay;
      if (typeof RazorpayConstructor !== 'function') {
        throw new Error('Payment app/window is not available on this browser right now. Please retry, switch browser, or use another payment method.');
      }

      const normalizedMobile = String(currentUser?.mobile || '').replace(/\D/g, '').slice(-10);
      const razorpay = new RazorpayConstructor({
        key: orderData.keyId,
        order_id: orderData.orderId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'Digital Catalyst',
        description: primaryItemTitle || productTitle || 'Secure checkout',
        prefill: {
          name: currentUser?.name || '',
          email: currentUser?.email || '',
          ...(normalizedMobile ? { contact: `+91${normalizedMobile}` } : {}),
        },
        handler: async (response: Record<string, string>) => {
          try {
            setCoinStatus('Verifying payment signature...');
            const verifyResponse = await fetch('/api/razorpay/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(response),
            });
            const verifyData = await verifyResponse.json().catch(() => ({}));
            if (!verifyResponse.ok || !verifyData?.verified) throw new Error(verifyData?.error || 'Payment verification failed.');

            clearPendingCheckout();
            await onConfirm({
              provider: 'razorpay',
              status: 'verified',
              razorpayOrderId: verifyData.razorpayOrderId || response.razorpay_order_id,
              razorpayPaymentId: verifyData.razorpayPaymentId || response.razorpay_payment_id,
              amount: finalPrice,
              currency: 'INR',
              recovered: false,
              recoveryStatus: 'handler',
            });
            closeAfterStateSettles();
          } catch (error) {
            setCheckoutStep('razorpay');
            setCoinStatus(error instanceof Error ? error.message : 'Payment verification failed. Access was not unlocked.');
            setIsCompleting(false);
          }
        },
        modal: {
          confirm_close: true,
          escape: true,
          handleback: true,
          ondismiss: () => {
            void reconcilePendingCheckout(String(orderData.orderId), 'dismiss').then((unlocked) => {
              if (!unlocked) {
                setCheckoutStep('razorpay');
                setCoinStatus('Payment window was closed/cancelled or the payment app was not available. No access was unlocked. If money was deducted, tap “Check payment status”.');
                setIsCompleting(false);
              }
            });
          },
        },
        retry: { enabled: true },
        theme: { color: '#111827' },
      });

      if (typeof razorpay.on === 'function') {
        razorpay.on('payment.failed', (response: any) => {
          const description = response?.error?.description || response?.error?.reason || 'Payment failed or was cancelled. No access was unlocked.';
          setCheckoutStep('razorpay');
          setCoinStatus(description);
          setIsCompleting(false);
        });
      }

      try {
        razorpay.open();
        setCoinStatus('Razorpay checkout opened. Complete the payment in the selected app/window.');
      } catch (openError) {
        throw new Error(openError instanceof Error ? openError.message : 'Payment app/window could not open. Please check that a payment app/browser is available and retry.');
      }
    } catch (error) {
      setCheckoutStep('razorpay');
      setCoinStatus(error instanceof Error ? error.message : 'Payment setup failed.');
      setIsCompleting(false);
    }
  };

  useEffect(() => {
    const pendingCheckout = readPendingCheckout();
    if (pendingCheckout?.orderId && Math.abs(Number(pendingCheckout.amount || 0) - finalPrice) < 0.01) {
      window.setTimeout(() => void reconcilePendingCheckout(pendingCheckout.orderId!, 'mount'), 250);
      return;
    }

    if (initialCheckoutStep !== 'razorpay' || autoStartedRazorpayRef.current) return;
    autoStartedRazorpayRef.current = true;
    window.setTimeout(() => handlePayNow(!razorpayAlreadyOpened), 0);
  }, [checkoutStorageKey, finalPrice, initialCheckoutStep, razorpayAlreadyOpened]);

  useEffect(() => {
    const handleReturnToApp = () => {
      const pendingCheckout = readPendingCheckout();
      if (!pendingCheckout?.orderId || Math.abs(Number(pendingCheckout.amount || 0) - finalPrice) >= 0.01) return;
      void reconcilePendingCheckout(pendingCheckout.orderId, 'focus');
    };

    window.addEventListener('focus', handleReturnToApp);
    document.addEventListener('visibilitychange', handleReturnToApp);
    return () => {
      window.removeEventListener('focus', handleReturnToApp);
      document.removeEventListener('visibilitychange', handleReturnToApp);
    };
  }, [checkoutStorageKey, finalPrice]);

  const handleFreeCheckout = async () => {
    await completeFreeCheckout();
  };

  const handleCoinCheckout = async () => {
    const user = currentUser as (User & { coinBalance?: number }) | null | undefined;
    const userCoinBalance = Math.max(0, Math.floor(Number(user?.coinBalance ?? user?.eduCoins ?? 0)));
    if (!isCoinCheckoutEnabled || userCoinBalance < normalizedCoinPrice || !onConfirmWithCoins) {
      const shortfall = Math.max(0, normalizedCoinPrice - userCoinBalance);
      setCoinStatus(`You have ${userCoinBalance} EduCoins and need ${normalizedCoinPrice}. Earn ${shortfall} more.`);
      if (onInsufficientCoins) {
        onClose();
        window.setTimeout(() => onInsufficientCoins({ requiredCoins: normalizedCoinPrice, balance: userCoinBalance, missingCoins: shortfall }), 0);
      } else {
        setShowCoinGuide(true);
      }
      return;
    }

    setIsCompleting(true);
    setCoinStatus('Checking your EduCoin wallet balance...');
    let unlocked = false;
    try {
      unlocked = await onConfirmWithCoins();
    } catch (error) {
      console.error('EduCoin checkout failed before unlock:', error);
      unlocked = false;
    }
    if (!unlocked) {
      const latestBalance = (currentUser as (User & { coinBalance?: number }) | null | undefined)?.coinBalance ?? currentUser?.eduCoins ?? 0;
      const shortfall = Math.max(0, normalizedCoinPrice - latestBalance);
      setCoinStatus('Your wallet balance could not complete this EduCoin checkout. Follow the earning guide below.');
      setIsCompleting(false);
      if (onInsufficientCoins) {
        onClose();
        window.setTimeout(() => onInsufficientCoins({ requiredCoins: normalizedCoinPrice, balance: latestBalance, missingCoins: shortfall }), 0);
      } else {
        setShowCoinGuide(true);
      }
      return;
    }
    setCoinStatus('EduCoins deducted. Unlocking your product...');
    closeAfterStateSettles();
  };

  const coinGuideContent = (
    <div className="space-y-4 p-4 text-slate-900 sm:space-y-6 sm:p-8">
      <div className="relative overflow-hidden rounded-[1.5rem] border border-white/60 bg-white/75 p-4 text-center shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-2xl sm:rounded-[2rem] sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(251,191,36,0.22),transparent_28%),radial-gradient(circle_at_86%_12%,rgba(99,102,241,0.18),transparent_24%)]" />
        <div className="relative">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber-200 bg-amber-100/80 text-2xl shadow-inner sm:h-16 sm:w-16 sm:text-3xl">🪙</div>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.28em] text-amber-600">EduCoin balance low</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Earn more EduCoins</h3>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600">Your live wallet shows {eduCoinBalance} EduCoins. This checkout needs {normalizedCoinPrice} EduCoins, so you need {missingCoins} more. These are the exact earning routes already connected in Digital Catalyst.</p>
        </div>
      </div>

      {coinStatus && <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm font-black text-amber-800">{coinStatus}</div>}

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        {earnMethods.map(method => (
          <div key={method.title} className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:rounded-[1.5rem] sm:p-5">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-cyan-100 text-xl sm:h-12 sm:w-12 sm:rounded-2xl sm:text-2xl">{method.icon}</div>
              <div>
                <h4 className="font-black text-slate-900">{method.title}</h4>
                <p className="mt-1 text-sm font-black text-indigo-600">{method.text}</p>
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{method.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => setShowCoinGuide(false)} className="rounded-2xl border border-white/70 bg-white/80 px-5 py-3.5 text-sm font-black text-slate-700 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white sm:px-6 sm:py-4 sm:text-base">Back to checkout</button>
        <button onClick={onStartEarning || (() => setShowCoinGuide(false))} className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3.5 text-sm font-black text-white shadow-[0_12px_34px_rgba(79,70,229,0.22)] transition hover:-translate-y-0.5 sm:px-6 sm:py-4 sm:text-base">Open Profile & Start Earning</button>
      </div>
    </div>
  );

  const formatCheckoutMoney = (value: number) => `₹${Math.max(0, Number(value) || 0).toFixed(2)}`;
  const originalAmount = Math.max(0, Number(originalPrice) || 0);
  const saleAmount = salePrice !== null && salePrice !== undefined ? Math.max(0, Number(salePrice) || 0) : originalAmount;
  const couponSavings = Math.max(0, Number(couponDiscount) || 0);
  const coinSavings = Math.max(0, Number(eduCoinDiscount) || 0);
  const totalSavings = couponSavings + coinSavings;
  const finalPayable = Math.max(0, Number(finalPrice) || 0);
  const checkoutTypeLabel = checkoutType === 'subscription'
    ? `${billingCycle === 'yearly' ? 'Yearly' : 'Monthly'} subscription`
    : checkoutType === 'latest-update'
      ? 'Latest course update'
      : checkoutType === 'cart'
        ? 'Cart checkout'
        : 'Digital product';
  const paymentDetailSubtitle = itemDescription || (checkoutType === 'latest-update'
    ? 'This checkout unlocks only the new paid update, features, explanations, or additional content for a product you already own.'
    : checkoutType === 'subscription'
      ? 'Premium membership benefits unlock after verified payment.'
      : checkoutType === 'cart'
        ? 'Review every item, discount, and wallet adjustment before paying.'
        : 'Unlock the complete digital product with lifetime access from My Purchases.');
  const defaultUnlockDetails = checkoutType === 'subscription'
    ? ['Selected membership access and plan benefits', 'AI Mentor and Community access where included', 'EduCoin benefits linked to the selected plan', 'Access remains active for the selected billing cycle']
    : checkoutType === 'latest-update'
      ? ['Only the selected latest paid update', 'New features, files, explanations, or practice content', 'Update access attached to the product you already own', 'Instant access after verified payment']
      : checkoutType === 'cart'
        ? ['All selected products unlock after verification', 'Each item appears in My Purchases', 'Coupon and EduCoin discounts are preserved', 'Safe recovery if payment status needs checking']
        : ['Complete digital product access', 'Lifetime access from My Purchases', 'All included files and course content', 'Instant access after verified payment'];
  const unlockDetails = providedUnlockDetails?.length ? providedUnlockDetails : defaultUnlockDetails;
  const primaryItemTitle = productTitle || (isCartMode ? 'Selected cart items' : 'Digital Catalyst checkout');

  const priceBreakdownRows = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="text-base font-black text-slate-950">Price breakdown</h4>
      <div className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
        <div className="flex justify-between gap-4"><span>Original price</span><span className="font-bold text-slate-900">{formatCheckoutMoney(originalAmount)}</span></div>
        {saleAmount !== originalAmount && <div className="flex justify-between gap-4"><span>Sale price</span><span className="font-bold text-slate-900">{formatCheckoutMoney(saleAmount)}</span></div>}
        <div className="flex justify-between gap-4"><span>Coupon discount</span><span className="font-black text-emerald-700">- {formatCheckoutMoney(couponSavings)}</span></div>
        <div className="flex justify-between gap-4"><span>EduCoin discount</span><span className="font-black text-emerald-700">- {formatCheckoutMoney(coinSavings)}</span></div>
        {appliedEduCoins > 0 && <div className="flex justify-between gap-4 text-amber-700"><span>EduCoins applied</span><span className="font-black">{appliedEduCoins} coins</span></div>}
        {totalSavings > 0 && <div className="flex justify-between gap-4 text-emerald-700"><span>Total savings</span><span className="font-black">- {formatCheckoutMoney(totalSavings)}</span></div>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-4 border-t border-dashed border-slate-200 pt-3">
        <span className="text-lg font-black text-slate-950">Final payable</span>
        <span className="text-2xl font-black text-slate-950">{formatCheckoutMoney(finalPayable)}</span>
      </div>
    </div>
  );

  const summaryCard = (
    <div className="space-y-4 rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-[0_18px_55px_rgba(15,23,42,0.06)] sm:rounded-[1.75rem] sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-black text-slate-950">Order summary</h3>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Verified</span>
      </div>
      <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-500"><span>Item</span><span>Price</span></div>
      {isCartMode ? (
        <div className="max-h-36 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
          {cartItems.map(item => (
            <div key={item.productId} className="flex justify-between gap-4 text-sm">
              <div><span className="block font-bold text-slate-800">{item.product.title}</span><span className="text-xs text-slate-600">Qty: {item.quantity}</span></div>
              <span className="font-bold text-slate-700">{item.product.salePrice || item.product.price}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex justify-between gap-4 text-sm"><span className="font-bold text-slate-800">{primaryItemTitle}</span><span className="font-bold text-slate-700">{formatCheckoutMoney(saleAmount)}</span></div>
      )}
      <div className="border-t border-dashed border-slate-200 pt-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-base font-black text-slate-950">Total</span>
          <span className="text-2xl font-black text-slate-950">{formatCheckoutMoney(finalPayable)}</span>
        </div>
        {(couponSavings > 0 || coinSavings > 0) && <p className="mt-2 text-sm font-bold text-emerald-700">You saved {formatCheckoutMoney(totalSavings)} on this checkout.</p>}
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
        <span>🛡️ Secure payment processing by Razorpay</span>
        <span className="font-black text-blue-800">Razorpay</span>
      </div>
    </div>
  );

  const paymentDetailsAside = (
    <aside className="payment-detail-trust-panel relative overflow-hidden bg-white p-4 text-slate-900 sm:p-8 lg:p-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(37,99,235,0.08),transparent_28%),radial-gradient(circle_at_92%_92%,rgba(16,185,129,0.09),transparent_26%)]" />
      <div className="relative flex h-full min-h-0 flex-col gap-5">
        <header className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-2xl text-blue-700">📄</span>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl"><span className="sr-only">Payment details</span>{checkoutType === 'latest-update' ? 'Update purchase details' : checkoutType === 'subscription' ? 'Subscription payment details' : checkoutType === 'cart' ? 'Cart payment details' : 'Product payment details'}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">Review what you’re buying and what you’ll get.</p>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="flex gap-4">
            <span className="relative flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm sm:h-24 sm:w-28">
              {productImage ? (
                <img src={productImage} alt={primaryItemTitle} className="h-full w-full object-contain" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-600 to-cyan-500 text-center text-xs font-black uppercase leading-4 text-white">{checkoutType === 'subscription' ? 'PRO' : checkoutType === 'cart' ? 'CART' : checkoutType === 'latest-update' ? 'UPDATE' : 'PRODUCT'}</span>
              )}
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-black leading-tight text-slate-950">{primaryItemTitle}</h3>
              <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{checkoutTypeLabel}</span>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{paymentDetailSubtitle}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="flex gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xl">🎁</span>
            <div className="min-w-0">
              <h3 className="text-lg font-black text-slate-950">What you unlock</h3>
              <ul className="mt-3 space-y-2 text-sm font-semibold text-slate-700">
                {unlockDetails.map(item => <li key={item} className="flex gap-2"><span className="text-emerald-600">✓</span><span>{item}</span></li>)}
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="flex gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xl">🛡️</span>
            <div>
              <h3 className="text-lg font-black text-slate-950">Access information</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Access unlocks only after server-side payment verification. If the payment window closes, use “Check payment status” to recover a completed payment safely.</p>
            </div>
          </div>
        </section>

        {priceBreakdownRows}

        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">🔒 Your access unlocks only after verified payment.</div>
      </div>
    </aside>
  );


  const razorpayDemoPage = (
    <div className="space-y-5 p-4 text-slate-900 sm:space-y-6 sm:p-8">
      <div className="text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">🛡️ Secure checkout</div>
        <p className="mt-2 text-sm font-semibold text-slate-500">Powered by Razorpay • 256-bit SSL encrypted</p>
      </div>
      {summaryCard}
      <div className="grid gap-3">
        <button disabled={isCompleting} onClick={() => handlePayNow(false)} className="rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-600 px-5 py-4 text-base font-black text-white shadow-[0_16px_40px_rgba(37,99,235,0.28)] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70 sm:px-6 sm:py-5 sm:text-lg">
          🔒 Open verified Razorpay checkout
          <span className="mt-1 block text-xs font-bold text-white/80">Pay securely to get instant access</span>
        </button>
        <button disabled={isCompleting} onClick={() => { const pending = readPendingCheckout(); if (pending?.orderId) void reconcilePendingCheckout(pending.orderId, 'manual'); }} className="rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-black text-blue-900 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 disabled:cursor-wait disabled:opacity-70 sm:px-6 sm:py-4 sm:text-base">
          ↻ Check payment status
          <span className="mt-1 block text-xs font-bold text-slate-500">Already paid? Verify your payment</span>
        </button>
      </div>
      <button onClick={() => setCheckoutStep('checkout')} className="w-full rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-black text-slate-700 shadow-sm">← Return to checkout options</button>
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-bold text-slate-500 sm:grid-cols-3">
        <span>🛡️ Secure & trusted</span>
        <span>🔒 Data protected</span>
        <span>✅ Instant access</span>
      </div>
    </div>
  );

  const loadingContent = (
    <div className="flex min-h-[340px] flex-col items-center justify-center p-5 text-center sm:min-h-[420px] sm:p-8">
      <div className="relative h-24 w-24 sm:h-28 sm:w-28">
        <div className="absolute inset-0 rounded-full border-8 border-indigo-100" />
        <div className="absolute inset-0 animate-spin rounded-full border-8 border-transparent border-t-indigo-600 border-r-cyan-500" />
        <div className="absolute inset-5 flex items-center justify-center rounded-full bg-white/80 text-3xl shadow-inner backdrop-blur-xl">🔐</div>
      </div>
      <p className="mt-6 text-xs font-black uppercase tracking-[0.32em] text-indigo-500">Live verification</p>
      <h3 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Fetching payment status...</h3>
      <p className="mt-3 max-w-md text-sm font-semibold leading-6 text-slate-600">Razorpay signature verification is running on the server. Access unlocks only after verification succeeds.</p>
    </div>
  );

  const checkoutContent = showCoinGuide ? coinGuideContent : checkoutStep === 'razorpay' ? razorpayDemoPage : checkoutStep === 'loading' ? loadingContent : (
    <>
      <div className="bg-gradient-to-br from-slate-50 via-blue-50/50 to-emerald-50/35 p-4 text-slate-900 sm:p-8">
        <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[1.75rem] sm:p-5">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-500">Secure live checkout</p>
          <h3 className="mt-2 text-xl font-black sm:text-2xl">Review details, pay safely, unlock instantly</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Every discount, EduCoin adjustment, and final payable amount is shown before checkout. Access unlocks only after verified payment.</p>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:space-y-6 sm:p-8">
        {summaryCard}
        {coinStatus && <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm font-black text-amber-800">{coinStatus}</div>}

        <div className="space-y-3">
          <button disabled={isCompleting} onClick={finalPrice <= 0 ? handleFreeCheckout : () => handlePayNow()} className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 px-5 py-3.5 text-base font-black text-white shadow-[0_16px_45px_rgba(79,70,229,0.24)] transition hover:-translate-y-0.5 active:scale-95 disabled:cursor-wait disabled:opacity-70 sm:px-6 sm:py-4 sm:text-lg">{finalPrice <= 0 ? 'Complete ₹0 Checkout' : 'Pay with Razorpay'}</button>
          {isCoinCheckoutEnabled && appliedEduCoins <= 0 && (
            <button disabled={isCompleting} onClick={handleCoinCheckout} className={`w-full rounded-2xl border px-5 py-3.5 text-base font-black shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 active:scale-95 disabled:cursor-wait disabled:opacity-70 sm:px-6 sm:py-4 sm:text-lg ${canPayWithCoins ? 'border-amber-200/60 bg-white/80 text-amber-700' : 'border-amber-200 bg-amber-50/90 text-amber-800'}`}>
              <span className="block">
                {isCompleting ? 'Checking live DB balance...' : canPayWithCoins ? 'Pay with EduCoins' : `Need ${missingCoins} more EduCoins`}
              </span>
              <span className="mt-1 block text-[11px] font-bold text-slate-600">
                Required: {normalizedCoinPrice} EduCoins · Balance: {eduCoinBalance} EduCoins
              </span>
            </button>
          )}
        </div>

        <p className="text-center text-[11px] font-bold uppercase tracking-widest text-slate-500">Secured by Razorpay • EduCoin wallet checked before unlock</p>
      </div>
    </>
  );

  if (presentation === 'page') {
    return (
      <div ref={pageRef} className="fixed inset-0 z-[9999] overflow-y-auto bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-3 pb-10 pt-4 text-slate-900 sm:px-6 sm:pb-16 sm:pt-6 lg:px-8">
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-indigo-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-cyan-600/25 blur-3xl" />
        <div className="relative mx-auto w-full max-w-7xl">
          <div className="mb-4 flex items-center justify-between gap-3 sm:mb-5 sm:flex-wrap sm:gap-4">
            <button onClick={onClose} className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-black text-white shadow-sm backdrop-blur-xl transition hover:-translate-x-0.5 hover:bg-white/15 sm:px-5 sm:py-3 sm:text-sm">
              ← Back to product
            </button>
            <div className="hidden items-center gap-2 rounded-full border border-emerald-200/30 bg-emerald-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-100 shadow-sm backdrop-blur-xl sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Secure checkout
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.5rem] border border-white/20 bg-white/10 shadow-[0_28px_100px_rgba(0,0,0,0.30)] backdrop-blur-2xl sm:rounded-[2.5rem]">
            <div className="grid lg:grid-cols-[0.92fr_1.08fr]">
              {paymentDetailsAside}
              <section className="bg-white/95">
                {checkoutContent}
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MacWindowModal title="Secure Checkout" subtitle="Live Razorpay verification + EduCoin wallet" onClose={onClose} maxWidth="max-w-lg">
      {checkoutContent}
    </MacWindowModal>
  );
};

export default PaymentModal;
