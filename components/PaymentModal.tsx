import React, { useState } from 'react';
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

const PaymentModal: React.FC<PaymentModalProps> = ({ productTitle, originalPrice, salePrice, couponDiscount, finalPrice, eduCoinDiscount = 0, appliedEduCoins = 0, coinRedeemRate = 10, onClose, onConfirm, cartItems, paymentLink, currentUser, coinPrice = 0, onConfirmWithCoins, presentation = 'modal' }) => {
  const [paymentOpened, setPaymentOpened] = useState(false);
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);
  const razorpayUrl = paymentLink || 'https://pages.razorpay.com/pl_RIfTCxnYj73xqE/view';
  const isCartMode = !!cartItems && cartItems.length > 0;
  const eduCoinBalance = currentUser?.eduCoins || 0;
  const canPayWithCoins = !!onConfirmWithCoins && coinPrice > 0 && eduCoinBalance >= coinPrice;
  const missingCoins = Math.max(0, coinPrice - eduCoinBalance);

  const handlePayNow = () => {
    window.open(razorpayUrl, '_blank', 'noopener,noreferrer');
    setPaymentOpened(true);
  };

  const checkoutContent = (
    <>
      <div className="bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 p-6 text-slate-900">
        <div className="rounded-[1.5rem] border border-white/50 bg-white/70 p-5 backdrop-blur-xl">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-200">Razorpay payment</p>
          <h3 className="mt-2 text-2xl font-black">Pay securely, then wait for admin verification</h3>
          <p className="mt-2 text-sm text-slate-600">Opening the payment page does not deliver the product. Your purchase remains locked until payment is verified.</p>
        </div>
      </div>

      <div className="space-y-6 p-6">
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
            <button onClick={finalPrice <= 0 ? () => { setVerificationSubmitted(true); onConfirm(); } : handlePayNow} className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-lg font-black text-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition hover:-translate-y-0.5 active:scale-95">{finalPrice <= 0 ? 'Complete ₹0 EduCoin Checkout' : 'Pay with Razorpay'}</button>
            {onConfirmWithCoins && coinPrice > 0 && (
              <button onClick={onConfirmWithCoins} disabled={!canPayWithCoins} className="w-full rounded-2xl border border-amber-200/60 bg-white/80 px-6 py-4 text-lg font-black text-amber-700 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
                {canPayWithCoins ? `Pay with ${coinPrice} EduCoins` : `Need ${missingCoins} more coins`}
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
            <p className="text-sm text-slate-600">If you completed the payment, submit it for admin verification. This will not unlock content instantly in demo mode.</p>
            <button onClick={() => { setVerificationSubmitted(true); onConfirm(); }} className="w-full rounded-2xl bg-amber-500 px-6 py-4 text-lg font-black text-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition hover:bg-amber-600">I have paid — unlock in demo</button>
            <button onClick={handlePayNow} className="text-sm font-bold text-primary underline">Open payment page again</button>
          </div>
        )}

        <p className="text-center text-[11px] font-bold uppercase tracking-widest text-slate-600">Secured by Razorpay • Manual delivery verification enabled</p>
      </div>
    </>
  );

  if (presentation === 'page') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/40 to-slate-100 px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 pb-5">
          <button onClick={onClose} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-black text-slate-800 shadow-sm backdrop-blur-xl transition hover:-translate-x-0.5 hover:bg-white">
            ← Back to product
          </button>
          <span className="hidden rounded-full border border-emerald-200/70 bg-emerald-50/80 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-700 sm:inline-flex">Secure checkout</span>
        </div>
        <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/60 bg-white/75 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-2xl lg:grid-cols-[0.9fr_1.1fr]">
          <div className="hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-cyan-500 p-8 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-white/70">Digital Catalyst</p>
              <h2 className="mt-6 text-4xl font-black leading-tight">Complete your purchase on a focused checkout page.</h2>
              <p className="mt-4 text-sm font-semibold leading-6 text-white/80">No floating window, no cramped modal—review your total, open Razorpay, and return for verification from one clean layout.</p>
            </div>
            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 backdrop-blur-xl">
              <p className="text-sm font-black">Manual verification enabled</p>
              <p className="mt-2 text-sm text-white/75">Your content unlocks after payment confirmation or demo verification.</p>
            </div>
          </div>
          <div className="bg-white/80">
            {checkoutContent}
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
