import React, { useState } from 'react';
import { WebsiteSettings, ProductWithRating, CartItem } from '../App';
import MacWindowModal from './ui/MacWindowModal';

interface PaymentModalProps {
  settings: WebsiteSettings;
  originalPrice: number;
  salePrice?: number | null;
  couponDiscount: number;
  finalPrice: number;
  onClose: () => void;
  onConfirm: () => void;
  productTitle?: string;
  cartItems?: ({ product: ProductWithRating } & CartItem)[];
  paymentLink?: string;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ productTitle, originalPrice, salePrice, couponDiscount, finalPrice, onClose, cartItems, paymentLink }) => {
  const [paymentOpened, setPaymentOpened] = useState(false);
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);
  const razorpayUrl = paymentLink || 'https://pages.razorpay.com/pl_RIfTCxnYj73xqE/view';
  const isCartMode = !!cartItems && cartItems.length > 0;

  const handlePayNow = () => {
    window.open(razorpayUrl, '_blank', 'noopener,noreferrer');
    setPaymentOpened(true);
  };

  return (
    <MacWindowModal title="Secure Checkout" subtitle="Delivery unlocks only after payment verification" onClose={onClose} maxWidth="max-w-lg">
      <div className="bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-6 text-white">
        <div className="rounded-[1.5rem] border border-white/15 bg-white/10 p-5 backdrop-blur-xl">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-200">Razorpay payment</p>
          <h3 className="mt-2 text-2xl font-black">Pay securely, then wait for admin verification</h3>
          <p className="mt-2 text-sm text-slate-300">Opening the payment page does not deliver the product. Your purchase remains locked until payment is verified.</p>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <div className="space-y-3 rounded-3xl border border-slate-100 bg-slate-50 p-5">
          <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-500"><span>Item</span><span>Price</span></div>
          {isCartMode ? (
            <div className="max-h-36 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
              {cartItems.map(item => (
                <div key={item.productId} className="flex justify-between gap-4 text-sm">
                  <div><span className="block font-bold text-slate-800">{item.product.title}</span><span className="text-xs text-slate-500">Qty: {item.quantity}</span></div>
                  <span className="font-bold text-slate-700">{item.product.salePrice || item.product.price}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-between gap-4"><span className="font-bold text-slate-800">{productTitle}</span><span className="font-bold text-slate-700">₹{originalPrice.toFixed(2)}</span></div>
          )}
          <div className="border-t border-dashed pt-3 text-sm">
            {!isCartMode && salePrice !== null && salePrice !== undefined && <div className="flex justify-between"><span className="text-slate-500">Sale discount</span><span className="font-bold text-emerald-600">- ₹{(originalPrice - salePrice).toFixed(2)}</span></div>}
            {couponDiscount > 0 && <div className="flex justify-between"><span className="text-slate-500">Coupon savings</span><span className="font-bold text-emerald-600">- ₹{couponDiscount.toFixed(2)}</span></div>}
            <div className="mt-3 flex items-center justify-between"><span className="text-lg font-black text-slate-900">Total</span><span className="text-3xl font-black text-primary">₹{finalPrice.toFixed(2)}</span></div>
          </div>
        </div>

        {!paymentOpened ? (
          <button onClick={handlePayNow} className="w-full rounded-2xl bg-slate-950 px-6 py-4 text-lg font-black text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-primary">Open payment page</button>
        ) : verificationSubmitted ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-center text-amber-900">
            <p className="text-lg font-black">Verification request submitted</p>
            <p className="mt-2 text-sm">Demo mode: admin must confirm payment before this product is delivered. No product was unlocked automatically.</p>
            <button onClick={onClose} className="mt-4 rounded-2xl bg-amber-600 px-5 py-3 font-bold text-white">Close</button>
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-sm text-slate-600">If you completed the payment, submit it for admin verification. This will not unlock content instantly in demo mode.</p>
            <button onClick={() => setVerificationSubmitted(true)} className="w-full rounded-2xl bg-amber-500 px-6 py-4 text-lg font-black text-white shadow-xl transition hover:bg-amber-600">I paid — submit for verification</button>
            <button onClick={handlePayNow} className="text-sm font-bold text-primary underline">Open payment page again</button>
          </div>
        )}

        <p className="text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">Secured by Razorpay • Manual delivery verification enabled</p>
      </div>
    </MacWindowModal>
  );
};

export default PaymentModal;
