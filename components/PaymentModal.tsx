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
  const [isRazorpayLaunching, setIsRazorpayLaunching] = useState(false);
  const [coinStatus, setCoinStatus] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
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
    if (presentation === 'page' && showCoinGuide) {
      pageRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
  }, [presentation, showCoinGuide]);

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
    setPaymentNotice(null);
    setIsRazorpayLaunching(true);
    setIsCompleting(true);
    setCoinStatus('Preparing the secure Razorpay window...');

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
        name: 'Eduvora',
        description: primaryItemTitle || productTitle || 'Secure checkout',
        prefill: {
          name: currentUser?.name || '',
          email: currentUser?.email || '',
          ...(normalizedMobile ? { contact: `+91${normalizedMobile}` } : {}),
        },
        handler: async (response: Record<string, string>) => {
          try {
            setIsRazorpayLaunching(false);
            setPaymentNotice(null);
            setCheckoutStep('loading');
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
            setIsRazorpayLaunching(false);
            void reconcilePendingCheckout(String(orderData.orderId), 'dismiss').then((unlocked) => {
              if (!unlocked) {
                setCheckoutStep('checkout');
                setPaymentNotice('Payment wasn’t completed. No access was unlocked—retry when you’re ready.');
                setCoinStatus('Payment window was closed/cancelled or the payment app was not available. If money was deducted, use “Check payment status” before paying again.');
                setIsCompleting(false);
              }
            });
          },
        },
        retry: { enabled: true },
        theme: { color: '#1769ff' },
      });

      if (typeof razorpay.on === 'function') {
        razorpay.on('payment.failed', (response: any) => {
          const description = response?.error?.description || response?.error?.reason || 'Payment did not go through.';
          setIsRazorpayLaunching(false);
          setCheckoutStep('checkout');
          setPaymentNotice('Payment wasn’t completed. No access was unlocked—please try again.');
          setCoinStatus(description);
          setIsCompleting(false);
        });
      }

      try {
        razorpay.open();
        window.setTimeout(() => setIsRazorpayLaunching(false), 120);
        setCoinStatus('Razorpay checkout is open. Complete the payment in the secure window.');
      } catch (openError) {
        throw new Error(openError instanceof Error ? openError.message : 'Payment app/window could not open. Please check that a payment app/browser is available and retry.');
      }
    } catch (error) {
      setIsRazorpayLaunching(false);
      setCheckoutStep('checkout');
      setPaymentNotice('The secure payment window could not open. Please retry.');
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
      <div className="relative overflow-hidden rounded-[1.5rem] border border-white/60 bg-white/75 p-4 text-center shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:rounded-[2rem] sm:p-6">
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
          <div key={method.title} className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.06)] sm:rounded-[1.5rem] sm:p-5">
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
        <button onClick={() => setShowCoinGuide(false)} className="rounded-2xl border border-white/70 bg-white/80 px-5 py-3.5 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-white sm:px-6 sm:py-4 sm:text-base">Back to checkout</button>
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
  const primaryItemTitle = productTitle || (isCartMode ? 'Selected cart items' : 'Eduvora checkout');
  const primaryPaymentLabel = finalPrice <= 0
    ? 'Complete ₹0 Checkout'
    : checkoutType === 'latest-update'
      ? `Pay ${formatCheckoutMoney(finalPayable)} & unlock update`
      : checkoutType === 'subscription'
        ? `Pay ${formatCheckoutMoney(finalPayable)} & activate plan`
        : checkoutType === 'cart'
          ? `Pay ${formatCheckoutMoney(finalPayable)} for cart`
          : `Pay ${formatCheckoutMoney(finalPayable)} with Razorpay`;
  const primaryPaymentHint = checkoutType === 'latest-update'
    ? 'Open verified Razorpay checkout to unlock this paid module/update only'
    : checkoutType === 'subscription'
      ? 'Open verified Razorpay checkout to activate the selected membership cycle'
      : 'Open verified Razorpay checkout to unlock access instantly';

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
    <div className="payment-item-summary space-y-4 rounded-[22px] border border-blue-100 bg-white p-4 shadow-[0_10px_28px_rgba(37,99,235,0.08)] sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-black text-slate-950">Price summary</h3>
        <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Verified</span>
      </div>
      <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-500"><span>Selected item</span><span>Price</span></div>
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
          <span className="text-base font-black text-slate-950">Final payable</span>
          <span className="text-2xl font-black text-blue-700">{formatCheckoutMoney(finalPayable)}</span>
        </div>
        {(couponSavings > 0 || coinSavings > 0) && <p className="mt-2 text-sm font-bold text-emerald-700">You saved {formatCheckoutMoney(totalSavings)} on this checkout.</p>}
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-white/85 px-4 py-3 text-sm font-bold text-emerald-800">
        <div className="flex min-w-0 flex-col">
          <span>🛡️ Secure payment processing by Razorpay</span>
          <span className="text-xs font-black uppercase tracking-[0.12em] text-emerald-700">Verified Razorpay payment before unlock</span>
        </div>
        <span className="font-black text-blue-800">Safe</span>
      </div>
    </div>
  );

  const paymentDetailsAside = (
    <aside className="payment-detail-trust-panel bg-white p-4 text-slate-900 sm:p-8 lg:p-10">
      <div className="flex h-full min-h-0 flex-col gap-5">
        <header className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-blue-100 bg-blue-600 text-2xl text-white shadow-[0_14px_34px_rgba(37,99,235,0.22)]">📄</span>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl"><span className="sr-only">Payment details</span>{checkoutType === 'latest-update' ? 'Update purchase details' : checkoutType === 'subscription' ? 'Subscription payment details' : checkoutType === 'cart' ? 'Cart payment details' : 'Product payment details'}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">A simple view of the product, unlocks, final price, and payment safety.</p>
            {checkoutType === 'latest-update' && <span className="mt-3 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700">Paid module update checkout</span>}
          </div>
        </header>

        <section className="rounded-[22px] border border-blue-100 bg-white/90 p-4 shadow-[0_14px_42px_rgba(37,99,235,0.08)]">
          <div className="flex gap-4">
            <span className="relative flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[22px] border border-blue-100 bg-blue-50 shadow-sm sm:h-24 sm:w-28">
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

        <section className="rounded-[22px] border border-emerald-100 bg-white/90 p-4 shadow-[0_14px_42px_rgba(16,185,129,0.08)]">
          <div className="flex gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-xl text-white shadow-[0_10px_28px_rgba(16,185,129,0.22)]">🎁</span>
            <div className="min-w-0">
              <h3 className="text-lg font-black text-slate-950">What you unlock</h3>
              <ul className="mt-3 space-y-2 text-sm font-semibold text-slate-700">
                {unlockDetails.map(item => <li key={item} className="flex gap-2"><span className="text-emerald-600">✓</span><span>{item}</span></li>)}
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-amber-100 bg-white/90 p-4 shadow-[0_14px_42px_rgba(245,158,11,0.08)]">
          <div className="flex gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-xl text-white shadow-[0_10px_28px_rgba(245,158,11,0.20)]">🛡️</span>
            <div>
              <h3 className="text-lg font-black text-slate-950">Access information</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Access unlocks only after server-side payment verification. If the payment window closes, use “Check payment status” to recover a completed payment safely.</p>
            </div>
          </div>
        </section>

        {priceBreakdownRows}

        <div className="rounded-[22px] border border-blue-100 bg-white/90 px-4 py-3 text-sm font-bold text-blue-700 shadow-sm">🔒 Access unlocks only after verified payment. If payment is interrupted, status recovery is available.</div>
      </div>
    </aside>
  );


  const paymentNoticeCard = paymentNotice ? (
    <div className="payment-not-completed-notice rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900 shadow-sm" role="status">
      <span className="block">{paymentNotice}</span>
      {coinStatus && <span className="mt-1 block text-xs font-bold leading-5 text-amber-800/80">{coinStatus}</span>}
    </div>
  ) : null;

  const razorpayLaunchOverlay = isRazorpayLaunching ? (
    <div className="payment-razorpay-launch-overlay fixed inset-0 z-[10020] flex items-center justify-center bg-slate-950/55 px-5" role="status" aria-live="polite">
      <div className="w-full max-w-sm rounded-[22px] border border-blue-200 bg-white p-6 text-center shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
        <div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-blue-100 border-t-[#1769ff]" />
        <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-blue-600">Opening secure payment</p>
        <h3 className="mt-2 text-xl font-black text-slate-950">Connecting to Razorpay…</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Please wait. The secure payment window will open automatically.</p>
      </div>
    </div>
  ) : null;

  const razorpayDemoPage = (
    <div className="space-y-5 p-4 text-slate-900 sm:space-y-6 sm:p-8">
      <div className="text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">🛡️ Secure checkout</div>
        <p className="mt-2 text-sm font-semibold text-slate-500">Powered by Razorpay • 256-bit SSL encrypted</p>
      </div>
      {summaryCard}
      {paymentNoticeCard}
      <div className="grid gap-3">
        <button disabled={isCompleting} onClick={() => handlePayNow(false)} className={`payment-primary-action eduvora-primary-action ${checkoutType === 'latest-update' ? 'latest-update-payment-action' : ''} rounded-[18px] px-5 py-4 text-base font-black disabled:cursor-wait disabled:opacity-70 sm:px-6 sm:py-5 sm:text-lg`}>
          <span className="block">{primaryPaymentLabel}</span>
          <span className="mt-1 block text-xs font-bold opacity-90">{primaryPaymentHint}</span>
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
        <div className="absolute inset-5 flex items-center justify-center rounded-full bg-white/80 text-3xl shadow-inner">🔐</div>
      </div>
      <p className="mt-6 text-xs font-black uppercase tracking-[0.32em] text-indigo-500">Live verification</p>
      <h3 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Fetching payment status...</h3>
      <p className="mt-3 max-w-md text-sm font-semibold leading-6 text-slate-600">Razorpay signature verification is running on the server. Access unlocks only after verification succeeds.</p>
    </div>
  );

  const checkoutContent = showCoinGuide ? coinGuideContent : checkoutStep === 'razorpay' ? razorpayDemoPage : checkoutStep === 'loading' ? loadingContent : (
    <>
      <div className="payment-action-section space-y-4 border-t border-blue-100 bg-[#f8fbff] p-4 sm:space-y-6 sm:p-8">
        <div className="rounded-[22px] border border-blue-100 bg-white p-4 sm:p-5">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600">Payment action</p>
          <h3 className="mt-2 text-xl font-black sm:text-2xl">Understand details, pay safely, unlock instantly</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Every discount, EduCoin adjustment, final payable amount, and unlock rule is shown before checkout.</p>
        </div>
        {summaryCard}
        {paymentNoticeCard}
        {!paymentNotice && coinStatus && <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800">{coinStatus}</div>}

        <div className="space-y-3">
          <button disabled={isCompleting} onClick={finalPrice <= 0 ? handleFreeCheckout : () => handlePayNow()} className={`payment-primary-action eduvora-primary-action ${checkoutType === 'latest-update' ? 'latest-update-payment-action' : ''} w-full rounded-[18px] px-5 py-4 text-base font-black disabled:cursor-wait disabled:opacity-70 sm:px-6 sm:py-4 sm:text-lg`}>
            <span className="block">{primaryPaymentLabel}</span>
            <span className="mt-1 block text-xs font-bold opacity-90">{primaryPaymentHint}</span>
          </button>
          {isCoinCheckoutEnabled && appliedEduCoins <= 0 && (
            <button disabled={isCompleting} onClick={handleCoinCheckout} className={`w-full rounded-2xl border px-5 py-3.5 text-base font-black shadow-sm transition hover:-translate-y-0.5 active:scale-95 disabled:cursor-wait disabled:opacity-70 sm:px-6 sm:py-4 sm:text-lg ${canPayWithCoins ? 'border-amber-200/60 bg-white/80 text-amber-700' : 'border-amber-200 bg-amber-50/90 text-amber-800'}`}>
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
      <div ref={pageRef} className="payment-checkout-page fixed inset-0 z-[9999] overflow-y-auto bg-[#eaf1fb] px-3 pb-10 pt-4 text-slate-900 sm:px-6 sm:pb-16 sm:pt-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <button onClick={onClose} className="mb-4 inline-flex items-center gap-2 rounded-[16px] border border-blue-200 bg-white px-4 py-2.5 text-xs font-black text-blue-800 shadow-sm transition hover:border-blue-300 sm:px-5 sm:py-3 sm:text-sm">
            ← Back to product
          </button>

          <main className="payment-checkout-long-page overflow-hidden rounded-[22px] border border-blue-100 bg-white shadow-[0_22px_64px_rgba(20,70,150,0.16)]">
            <header className="payment-checkout-blue-hero bg-gradient-to-br from-[#0b4bd8] via-[#1769ff] to-[#4f7cff] px-5 py-7 text-white sm:px-8 sm:py-10">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-100">Eduvora secure payment</p>
                  <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Complete your checkout</h1>
                  <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-blue-50 sm:text-base">Review the product, item summary, savings, and access rules on one clear page before paying.</p>
                </div>
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-white/30 bg-white/15 text-2xl" aria-hidden="true">▣</span>
              </div>
              <div className="mt-7 flex items-end justify-between gap-4 border-t border-white/20 pt-5">
                <span className="text-sm font-bold text-blue-100">Amount payable</span>
                <span className="text-3xl font-black">{formatCheckoutMoney(finalPayable)}</span>
              </div>
            </header>

            {paymentDetailsAside}
            <section className="bg-white">{checkoutContent}</section>

            <footer className="border-t border-blue-100 bg-[#f8fbff] px-5 py-6 text-center sm:px-8">
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-black text-slate-600">
                <span>🔒 Razorpay protected</span>
                <span>✓ Server verified access</span>
                <span>↻ Payment recovery available</span>
              </div>
              <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">Eduvora unlocks access only after verified payment. A completed payment can be recovered safely through payment-status checking.</p>
            </footer>
          </main>
        </div>
        {razorpayLaunchOverlay}
      </div>
    );
  }

  return (
    <>
      <MacWindowModal title="Secure Checkout" subtitle="Live Razorpay verification + EduCoin wallet" onClose={onClose} maxWidth="max-w-lg">
        {checkoutContent}
      </MacWindowModal>
      {razorpayLaunchOverlay}
    </>
  );
};

export default PaymentModal;
