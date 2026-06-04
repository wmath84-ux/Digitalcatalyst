import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WebsiteSettings, ProductWithRating, CartItem, User } from '../App';
import { DEFAULT_ECONOMY_SETTINGS, EconomySettings } from '../utils/economy';
import MacWindowModal from './ui/MacWindowModal';

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
  onConfirm: () => void | Promise<void>;
  productTitle?: string;
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
}

type CheckoutStep = 'checkout' | 'razorpay' | 'loading';

const PaymentModal: React.FC<PaymentModalProps> = ({
  economySettings = DEFAULT_ECONOMY_SETTINGS,
  productTitle,
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
  paymentLink,
  currentUser,
  coinPrice = 0,
  onConfirmWithCoins,
  onStartEarning,
  onInsufficientCoins,
  initialShowCoinGuide = false,
  initialCheckoutStep = 'checkout',
  presentation = 'modal',
  razorpayAlreadyOpened = false,
}) => {
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>(initialCheckoutStep);
  const [isCompleting, setIsCompleting] = useState(false);
  const [coinStatus, setCoinStatus] = useState<string | null>(null);
  const [showCoinGuide, setShowCoinGuide] = useState(initialShowCoinGuide);
  const pageRef = useRef<HTMLDivElement>(null);
  const autoStartedRazorpayRef = useRef(false);
  const razorpayUrl = paymentLink || 'https://pages.razorpay.com/pl_RIfTCxnYj73xqE/view';
  const isCartMode = !!cartItems && cartItems.length > 0;
  const eduCoinBalance = (currentUser as (User & { coinBalance?: number }) | null | undefined)?.coinBalance ?? currentUser?.eduCoins ?? 0;
  const canPayWithCoins = !!onConfirmWithCoins && coinPrice > 0 && eduCoinBalance >= coinPrice;
  const missingCoins = Math.max(0, coinPrice - eduCoinBalance);

  const earnMethods = useMemo(() => [
    { icon: '🎬', title: 'Watch purchased video lessons', text: `${economySettings.coinPerVideoMinute} EduCoin${economySettings.coinPerVideoMinute === 1 ? '' : 's'} per focused video minute`, detail: 'Open an unlocked course/video from My Purchases. Coins are credited only while the video is playing and the tab is focused.' },
    { icon: '📖', title: 'Read Study Blog / News articles', text: `${economySettings.coinPerArticleRead} EduCoins after ${Math.ceil(economySettings.articleReadTimeRequiredSec / 60)} min`, detail: 'Open the reading drawer from the dock and keep reading/scrolling until the timer completes. Each article can be rewarded once.' },
    { icon: '🎯', title: 'Complete course quizzes', text: `${economySettings.coinPerQuizCorrect} EduCoins per correct answer`, detail: 'Quiz files inside unlocked products credit coins after submission. Re-attempt rewards are protected by quiz reward history.' },
    { icon: '🛒', title: 'Purchase reward', text: `${economySettings.coinPerPurchase} EduCoins after Razorpay/demo unlock`, detail: 'Regular checkout credits the configured purchase reward after the product unlock completes.' },
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

  const completeVerifiedCheckout = async (verificationDelay = 1600) => {
    setCheckoutStep('loading');
    await new Promise(resolve => window.setTimeout(resolve, verificationDelay));
    await onConfirm();
    closeAfterStateSettles();
  };

  const completeDemoRazorpayUnlock = () => {
    void completeVerifiedCheckout();
  };

  const handlePayNow = (openRazorpayWindow = true) => {
    if (isCompleting || checkoutStep === 'loading') return;
    setShowCoinGuide(false);
    if (openRazorpayWindow && razorpayUrl) {
      window.open(razorpayUrl, '_blank');
    }
    // Trigger the demo completion to prevent infinite loading
    completeDemoRazorpayUnlock();
  };

  useEffect(() => {
    if (initialCheckoutStep !== 'razorpay' || autoStartedRazorpayRef.current) return;
    autoStartedRazorpayRef.current = true;
    window.setTimeout(() => handlePayNow(!razorpayAlreadyOpened), 0);
  }, [initialCheckoutStep, razorpayAlreadyOpened]);

  const handleFreeCheckout = async () => {
    await completeVerifiedCheckout(900);
  };

  const handleCoinCheckout = async () => {
    const user = currentUser as (User & { coinBalance?: number }) | null | undefined;
    const userCoinBalance = user?.coinBalance ?? user?.eduCoins ?? 0;
    if (userCoinBalance < coinPrice || !onConfirmWithCoins) {
      const shortfall = Math.max(0, coinPrice - userCoinBalance);
      setCoinStatus(`You have ${userCoinBalance} EduCoins and need ${coinPrice}. Earn ${shortfall} more.`);
      if (onInsufficientCoins) {
        onClose();
        window.setTimeout(() => onInsufficientCoins({ requiredCoins: coinPrice, balance: userCoinBalance, missingCoins: shortfall }), 0);
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
      const shortfall = Math.max(0, coinPrice - latestBalance);
      setCoinStatus('Your wallet balance could not complete this EduCoin checkout. Follow the earning guide below.');
      setIsCompleting(false);
      if (onInsufficientCoins) {
        onClose();
        window.setTimeout(() => onInsufficientCoins({ requiredCoins: coinPrice, balance: latestBalance, missingCoins: shortfall }), 0);
      } else {
        setShowCoinGuide(true);
      }
      return;
    }
    setCoinStatus('EduCoins deducted. Unlocking your product...');
    closeAfterStateSettles();
  };

  const coinGuideContent = (
    <div className="space-y-6 p-6 text-slate-900 sm:p-8">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/75 p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(251,191,36,0.22),transparent_28%),radial-gradient(circle_at_86%_12%,rgba(99,102,241,0.18),transparent_24%)]" />
        <div className="relative">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-200 bg-amber-100/80 text-3xl shadow-inner">🪙</div>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.28em] text-amber-600">EduCoin balance low</p>
          <h3 className="mt-2 text-3xl font-black text-slate-950">Earn more EduCoins</h3>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600">Your live wallet shows {eduCoinBalance} EduCoins. This checkout needs {coinPrice} EduCoins, so you need {missingCoins} more. These are the exact earning routes already connected in Digital Catalyst.</p>
        </div>
      </div>

      {coinStatus && <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm font-black text-amber-800">{coinStatus}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        {earnMethods.map(method => (
          <div key={method.title} className="rounded-[1.5rem] border border-white/70 bg-white/75 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-cyan-100 text-2xl">{method.icon}</div>
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
        <button onClick={() => setShowCoinGuide(false)} className="rounded-2xl border border-white/70 bg-white/80 px-6 py-4 text-base font-black text-slate-700 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white">Back to checkout</button>
        <button onClick={onStartEarning || (() => setShowCoinGuide(false))} className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-base font-black text-white shadow-[0_12px_34px_rgba(79,70,229,0.22)] transition hover:-translate-y-0.5">Open Profile & Start Earning</button>
      </div>
    </div>
  );

  const summaryCard = (
    <div className="space-y-3 rounded-[1.75rem] border border-white/70 bg-white/75 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.06)] backdrop-blur-xl">
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
        <div className="flex justify-between gap-4"><span className="font-bold text-slate-800">{productTitle}</span><span className="font-bold text-slate-700">₹{originalPrice.toFixed(2)}</span></div>
      )}
      <div className="border-t border-dashed border-slate-200 pt-3 text-sm">
        {!isCartMode && salePrice !== null && salePrice !== undefined && <div className="flex justify-between"><span className="text-slate-600">Sale discount</span><span className="font-bold text-emerald-600">- ₹{(originalPrice - salePrice).toFixed(2)}</span></div>}
        {couponDiscount > 0 && <div className="flex justify-between"><span className="text-slate-600">Coupon savings</span><span className="font-bold text-emerald-600">- ₹{couponDiscount.toFixed(2)}</span></div>}
        {eduCoinDiscount > 0 && <div className="flex justify-between"><span className="text-slate-600">EduCoins applied ({appliedEduCoins} @ {coinRedeemRate}:1)</span><span className="font-bold text-emerald-600">- ₹{eduCoinDiscount.toFixed(2)}</span></div>}
        <div className="mt-3 flex items-center justify-between"><span className="text-lg font-black text-slate-900">Total</span><span className="text-3xl font-black text-primary">₹{finalPrice.toFixed(2)}</span></div>
        {coinPrice > 0 && <div className="mt-3 rounded-2xl bg-amber-50/90 px-4 py-3 text-sm font-black text-amber-700">EduCoin price: 🪙 {coinPrice} • Your balance: 🪙 {eduCoinBalance}</div>}
      </div>
    </div>
  );

  const razorpayDemoPage = (
    <div className="space-y-6 p-6 sm:p-8">
      <div className="relative overflow-hidden rounded-[2rem] border border-sky-200/60 bg-gradient-to-br from-[#0b72e7] via-[#146ef5] to-[#7c3aed] p-6 text-white shadow-[0_24px_80px_rgba(37,99,235,0.26)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.28),transparent_24%),radial-gradient(circle_at_90%_80%,rgba(255,255,255,0.16),transparent_24%)]" />
        <div className="relative">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-white/70">Razorpay payment page</p>
          <h3 className="mt-3 text-3xl font-black">Complete payment in the Razorpay tab</h3>
          <p className="mt-3 text-sm font-semibold leading-6 text-white/80">The real Razorpay payment page has been opened in a new tab. After completing payment there, return here and confirm so Digital Catalyst can show verification loading and unlock the product.</p>
        </div>
      </div>
      {summaryCard}
      <div className="grid gap-3 sm:grid-cols-2">
        <a href={razorpayUrl} target="_blank" rel="noreferrer" className="rounded-2xl border border-sky-200 bg-white/85 px-6 py-4 text-center text-base font-black text-sky-700 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5">Open real Razorpay tab</a>
        <button onClick={completeDemoRazorpayUnlock} className="rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-4 text-base font-black text-white shadow-[0_14px_40px_rgba(245,158,11,0.28)] transition hover:-translate-y-0.5">I've completed payment — unlock product</button>
      </div>
      <button onClick={() => setCheckoutStep('checkout')} className="w-full rounded-2xl border border-white/70 bg-white/75 px-6 py-3 text-sm font-black text-slate-600 backdrop-blur-xl">Return to checkout options</button>
    </div>
  );

  const loadingContent = (
    <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
      <div className="relative h-28 w-28">
        <div className="absolute inset-0 rounded-full border-8 border-indigo-100" />
        <div className="absolute inset-0 animate-spin rounded-full border-8 border-transparent border-t-indigo-600 border-r-cyan-500" />
        <div className="absolute inset-5 flex items-center justify-center rounded-full bg-white/80 text-3xl shadow-inner backdrop-blur-xl">🔐</div>
      </div>
      <p className="mt-6 text-xs font-black uppercase tracking-[0.32em] text-indigo-500">Demo verification</p>
      <h3 className="mt-2 text-3xl font-black text-slate-950">Fetching payment status...</h3>
      <p className="mt-3 max-w-md text-sm font-semibold leading-6 text-slate-600">In live mode this is where Razorpay API verification will run. For now, demo mode safely unlocks after this loading animation.</p>
    </div>
  );

  const checkoutContent = showCoinGuide ? coinGuideContent : checkoutStep === 'razorpay' ? razorpayDemoPage : checkoutStep === 'loading' ? loadingContent : (
    <>
      <div className="bg-gradient-to-br from-slate-50 via-indigo-50/40 to-cyan-50/40 p-6 text-slate-900 sm:p-8">
        <div className="rounded-[1.75rem] border border-white/60 bg-white/75 p-5 shadow-sm backdrop-blur-xl">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-400">Secure demo checkout</p>
          <h3 className="mt-2 text-2xl font-black">Choose Razorpay or instant EduCoin unlock</h3>
          <p className="mt-2 text-sm text-slate-600">Razorpay opens a nested demo payment page. EduCoins check your latest wallet balance before product access is unlocked.</p>
        </div>
      </div>

      <div className="space-y-6 p-6 sm:p-8">
        {summaryCard}
        {coinStatus && <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm font-black text-amber-800">{coinStatus}</div>}

        <div className="space-y-3">
          <button disabled={isCompleting} onClick={finalPrice <= 0 ? handleFreeCheckout : () => handlePayNow()} className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 px-6 py-4 text-lg font-black text-white shadow-[0_16px_45px_rgba(79,70,229,0.24)] transition hover:-translate-y-0.5 active:scale-95 disabled:cursor-wait disabled:opacity-70">{finalPrice <= 0 ? 'Complete ₹0 Checkout' : 'Pay with Razorpay'}</button>
          {onConfirmWithCoins && coinPrice > 0 && (
            <button disabled={isCompleting} onClick={handleCoinCheckout} className={`w-full rounded-2xl border px-6 py-4 text-lg font-black shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 active:scale-95 disabled:cursor-wait disabled:opacity-70 ${canPayWithCoins ? 'border-amber-200/60 bg-white/80 text-amber-700' : 'border-amber-200 bg-amber-50/90 text-amber-800'}`}>
              {isCompleting ? 'Checking live DB balance...' : canPayWithCoins ? `Pay with ${coinPrice} EduCoins` : `Need ${missingCoins} more EduCoins`}
            </button>
          )}
        </div>

        <p className="text-center text-[11px] font-bold uppercase tracking-widest text-slate-500">Secured by Razorpay • EduCoin wallet checked before unlock</p>
      </div>
    </>
  );

  if (presentation === 'page') {
    return (
      <div ref={pageRef} className="fixed inset-0 z-[90] overflow-y-auto bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-4 pb-16 pt-6 text-slate-900 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-indigo-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl" />
        <div className="relative mx-auto w-full max-w-6xl">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <button onClick={onClose} className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white shadow-sm backdrop-blur-xl transition hover:-translate-x-0.5 hover:bg-white/15">
              ← Back to product
            </button>
            <div className="flex items-center gap-2 rounded-full border border-emerald-200/30 bg-emerald-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-100 shadow-sm backdrop-blur-xl">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Secure checkout
            </div>
          </div>

          <div className="overflow-hidden rounded-[2.5rem] border border-white/20 bg-white/10 shadow-[0_28px_100px_rgba(0,0,0,0.30)] backdrop-blur-2xl">
            <div className="grid lg:grid-cols-[0.95fr_1.05fr]">
              <aside className="relative overflow-hidden bg-gradient-to-br from-indigo-700/95 via-purple-600/95 to-cyan-500/95 p-8 text-white sm:p-10">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.28),transparent_24%),radial-gradient(circle_at_82%_75%,rgba(255,255,255,0.18),transparent_24%)]" />
                <div className="relative flex h-full min-h-[360px] flex-col justify-between gap-10">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.32em] text-white/70">Digital Catalyst checkout</p>
                    <h2 className="mt-5 text-4xl font-black leading-tight sm:text-5xl">Review. Pay. Unlock.</h2>
                    <p className="mt-4 max-w-md text-sm font-semibold leading-6 text-white/80">Use the glossy Razorpay demo page or spend EduCoins after a live wallet check.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    <div className="rounded-3xl border border-white/20 bg-white/15 p-4 backdrop-blur-xl"><span className="font-black">🔒 Secure</span><p className="mt-1 text-sm text-white/75">Payment verification loader is ready for live API integration.</p></div>
                    <div className="rounded-3xl border border-white/20 bg-white/15 p-4 backdrop-blur-xl"><span className="font-black">🪙 EduCoins</span><p className="mt-1 text-sm text-white/75">Wallet balance is checked before spending.</p></div>
                    <div className="rounded-3xl border border-white/20 bg-white/15 p-4 backdrop-blur-xl"><span className="font-black">📚 Access</span><p className="mt-1 text-sm text-white/75">Unlocked products appear in My Purchases.</p></div>
                  </div>
                </div>
              </aside>
              <section className="bg-white/90">
                {checkoutContent}
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MacWindowModal title="Secure Checkout" subtitle="Razorpay demo + EduCoin wallet verification" onClose={onClose} maxWidth="max-w-lg">
      {checkoutContent}
    </MacWindowModal>
  );
};

export default PaymentModal;
