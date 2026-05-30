import React, { useEffect, useRef, useState } from 'react';
import { WebsiteSettings, ProductWithRating, CartItem, User } from '../App';
import MacWindowModal from './ui/MacWindowModal';

interface PaymentModalProps {
  settings: WebsiteSettings;
  originalPrice: number;
  salePrice?: number | null;
  couponDiscount: number;
  finalPrice: number;
  eduCoinDiscount?: number;
  appliedEduCoins?: number;
  coinRedeemRate?: number;
  onClose: () => void;
  onConfirm: () => void;
  productTitle?: string;
  cartItems?: ({ product: ProductWithRating } & CartItem)[];
  paymentLink?: string;
  currentUser?: User | null;
  coinPrice?: number;
  onConfirmWithCoins?: () => void;
  presentation?: 'modal' | 'page';
}

const coinEarnMethods = [
  { icon: '▶️', title: 'Watch course videos', text: 'Play lessons in a focused tab to earn video watch-time EduCoins.' },
  { icon: '🧠', title: 'Complete quizzes', text: 'Attempt course quizzes and claim rewards for correct progress.' },
  { icon: '📰', title: 'Read learning updates', text: 'Use the reading/news hub when reading rewards are available.' },
  { icon: '🎁', title: 'Claim profile rewards', text: 'Check profile milestones, purchase rewards, and limited coin offers.' },
];

const PaymentModal: React.FC<PaymentModalProps> = ({ productTitle, originalPrice, salePrice, couponDiscount, finalPrice, eduCoinDiscount = 0, appliedEduCoins = 0, coinRedeemRate = 10, onClose, onConfirm, cartItems, paymentLink, currentUser, coinPrice = 0, onConfirmWithCoins, presentation = 'modal' }) => {
  const [paymentOpened, setPaymentOpened] = useState(false);
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);
  const [showCoinGuide, setShowCoinGuide] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const razorpayUrl = paymentLink || 'https://pages.razorpay.com/pl_RIfTCxnYj73xqE/view';
  const isCartMode = !!cartItems && cartItems.length > 0;
  const eduCoinBalance = currentUser?.eduCoins || 0;
  const canPayWithCoins = !!onConfirmWithCoins && coinPrice > 0 && eduCoinBalance >= coinPrice;
  const missingCoins = Math.max(0, coinPrice - eduCoinBalance);

  useEffect(() => {
    if (presentation === 'page') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      pageRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [presentation]);

  useEffect(() => {
    if (presentation === 'page') {
      pageRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
  }, [paymentOpened, presentation, showCoinGuide]);

  const handlePayNow = () => {
    window.open(razorpayUrl, '_blank', 'noopener,noreferrer');
    setPaymentOpened(true);
    setShowCoinGuide(false);
    if (presentation === 'page') {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      pageRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
  };

  const handleFreeCheckout = () => {
    if (presentation === 'modal') setVerificationSubmitted(true);
    onConfirm();
  };

  const handlePaidVerification = () => {
    if (presentation === 'modal') setVerificationSubmitted(true);
    onConfirm();
  };

  const handleCoinCheckout = () => {
    if (!canPayWithCoins) {
      setShowCoinGuide(true);
      if (presentation === 'page') {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        pageRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      }
      return;
    }
    onConfirmWithCoins?.();
  };

  const coinGuideContent = (
    <div className="space-y-6 p-6 text-slate-900 sm:p-8">
      <div className="rounded-[1.75rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-6 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">🪙</div>
        <p className="mt-4 text-xs font-black uppercase tracking-[0.28em] text-amber-600">EduCoin balance low</p>
        <h3 className="mt-2 text-3xl font-black text-slate-950">Need {missingCoins} more EduCoins</h3>
        <p className="mx-auto mt-3 max-w-lg text-sm font-semibold leading-6 text-slate-600">Your current balance is {eduCoinBalance} EduCoins, and this checkout needs {coinPrice} EduCoins. Earn more coins or use Razorpay to unlock now.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {coinEarnMethods.map(method => (
          <div key={method.title} className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
            <div className="text-2xl">{method.icon}</div>
            <h4 className="mt-2 font-black text-slate-900">{method.title}</h4>
            <p className="mt-1 text-sm font-semibold leading-5 text-slate-600">{method.text}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => setShowCoinGuide(false)} className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-base font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50">Back to checkout</button>
        <button onClick={handlePayNow} className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-base font-black text-white shadow-[0_12px_34px_rgba(79,70,229,0.22)] transition hover:-translate-y-0.5">Pay with Razorpay instead</button>
      </div>
    </div>
  );

  const checkoutContent = showCoinGuide ? coinGuideContent : (
    <>
      <div className="bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 p-6 text-slate-900 sm:p-8">
        <div className="rounded-[1.5rem] border border-white/50 bg-white/75 p-5 shadow-sm backdrop-blur-xl">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-400">Payment verification</p>
          <h3 className="mt-2 text-2xl font-black">Pay securely, then confirm your demo unlock</h3>
          <p className="mt-2 text-sm text-slate-600">Razorpay opens in a separate payment page. After completing payment, return here and click the confirmation button to open the congratulations page.</p>
        </div>
      </div>

      <div className="space-y-6 p-6 sm:p-8">
        <div className="space-y-3 rounded-3xl border border-slate-100 bg-slate-50 p-5">
          <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-600"><span>Item</span><span>Price</span></div>
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
          <div className="border-t border-dashed pt-3 text-sm">
            {!isCartMode && salePrice !== null && salePrice !== undefined && <div className="flex justify-between"><span className="text-slate-600">Sale discount</span><span className="font-bold text-emerald-600">- ₹{(originalPrice - salePrice).toFixed(2)}</span></div>}
            {couponDiscount > 0 && <div className="flex justify-between"><span className="text-slate-600">Coupon savings</span><span className="font-bold text-emerald-600">- ₹{couponDiscount.toFixed(2)}</span></div>}
            {eduCoinDiscount > 0 && <div className="flex justify-between"><span className="text-slate-600">EduCoins applied ({appliedEduCoins} @ {coinRedeemRate}:1)</span><span className="font-bold text-emerald-600">- ₹{eduCoinDiscount.toFixed(2)}</span></div>}
            <div className="mt-3 flex items-center justify-between"><span className="text-lg font-black text-slate-900">Total</span><span className="text-3xl font-black text-primary">₹{finalPrice.toFixed(2)}</span></div>
          </div>
        </div>

        {!paymentOpened ? (
          <div className="space-y-3">
            <button onClick={finalPrice <= 0 ? handleFreeCheckout : handlePayNow} className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-lg font-black text-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition hover:-translate-y-0.5 active:scale-95">{finalPrice <= 0 ? 'Complete ₹0 EduCoin Checkout' : 'Pay with Razorpay'}</button>
            {onConfirmWithCoins && coinPrice > 0 && (
              <button onClick={handleCoinCheckout} className={`w-full rounded-2xl border px-6 py-4 text-lg font-black shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 active:scale-95 ${canPayWithCoins ? 'border-amber-200/60 bg-white/80 text-amber-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                {canPayWithCoins ? `Pay with ${coinPrice} EduCoins` : `Need ${missingCoins} more EduCoins`}
              </button>
            )}
          </div>
        ) : verificationSubmitted ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-center text-amber-900">
            <p className="text-lg font-black">Verification request submitted</p>
            <p className="mt-2 text-sm">Demo mode: product has been unlocked for your local testing.</p>
            <button onClick={onClose} className="mt-4 rounded-2xl bg-amber-600 px-5 py-3 font-bold text-white">Close</button>
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-sm text-slate-600">If you completed the payment, submit it for admin verification. This opens the congratulations page in demo mode.</p>
            <button onClick={handlePaidVerification} className="w-full rounded-2xl bg-amber-500 px-6 py-4 text-lg font-black text-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition hover:bg-amber-600">I have paid — unlock in demo</button>
            <button onClick={handlePayNow} className="text-sm font-bold text-primary underline">Open payment page again</button>
          </div>
        )}

        <p className="text-center text-[11px] font-bold uppercase tracking-widest text-slate-600">Secured by Razorpay • Manual delivery verification enabled</p>
      </div>
    </>
  );

  if (presentation === 'page') {
    return (
      <div ref={pageRef} className="fixed inset-0 z-[90] overflow-y-auto bg-gradient-to-br from-slate-50 via-indigo-50/50 to-cyan-50 px-4 pb-16 pt-6 text-slate-900 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative mx-auto w-full max-w-6xl">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <button onClick={onClose} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-5 py-3 text-sm font-black text-slate-800 shadow-sm backdrop-blur-xl transition hover:-translate-x-0.5 hover:bg-white">
              ← Back to product
            </button>
            <div className="flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/85 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Secure checkout
            </div>
          </div>

          <div className="overflow-hidden rounded-[2.5rem] border border-white/70 bg-white/80 shadow-[0_28px_90px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
            <div className="grid lg:grid-cols-[0.95fr_1.05fr]">
              <aside className="relative overflow-hidden bg-gradient-to-br from-indigo-700 via-purple-600 to-cyan-500 p-8 text-white sm:p-10">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.28),transparent_24%),radial-gradient(circle_at_82%_75%,rgba(255,255,255,0.18),transparent_24%)]" />
                <div className="relative flex h-full min-h-[360px] flex-col justify-between gap-10">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.32em] text-white/70">Digital Catalyst checkout</p>
                    <h2 className="mt-5 text-4xl font-black leading-tight sm:text-5xl">Review. Pay. Unlock.</h2>
                    <p className="mt-4 max-w-md text-sm font-semibold leading-6 text-white/80">Use Razorpay for secure payment or EduCoins for instant wallet unlock when you have enough balance.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    <div className="rounded-3xl border border-white/20 bg-white/15 p-4 backdrop-blur-xl"><span className="font-black">🔒 Secure</span><p className="mt-1 text-sm text-white/75">Razorpay opens in a safe external page.</p></div>
                    <div className="rounded-3xl border border-white/20 bg-white/15 p-4 backdrop-blur-xl"><span className="font-black">🪙 EduCoins</span><p className="mt-1 text-sm text-white/75">Use coins when your balance is enough.</p></div>
                    <div className="rounded-3xl border border-white/20 bg-white/15 p-4 backdrop-blur-xl"><span className="font-black">📚 Access</span><p className="mt-1 text-sm text-white/75">Go to My Purchases after unlock.</p></div>
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
    <MacWindowModal title="Secure Checkout" subtitle="Delivery unlocks only after payment verification" onClose={onClose} maxWidth="max-w-lg">
      {checkoutContent}
    </MacWindowModal>
  );
};

export default PaymentModal;
