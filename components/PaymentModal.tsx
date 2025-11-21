
import React, { useState } from 'react';
import { WebsiteSettings, ProductWithRating, CartItem } from '../App';

interface PaymentModalProps {
  settings: WebsiteSettings;
  originalPrice: number;
  salePrice?: number | null; // Only for single item
  couponDiscount: number;
  finalPrice: number;
  onClose: () => void;
  onConfirm: () => void;
  productTitle?: string; // For single item
  cartItems?: ({ product: ProductWithRating } & CartItem)[]; // For cart checkout
  paymentLink?: string; // Specific Razorpay URL
}

const PaymentModal: React.FC<PaymentModalProps> = ({ 
    settings, productTitle, originalPrice, salePrice, couponDiscount, finalPrice, onClose, onConfirm, cartItems, paymentLink 
}) => {
  const [hasClickedPay, setHasClickedPay] = useState(false);
  
  // Use specific link if available, else fallback (though admin validation should prevent missing links)
  const razorpayUrl = paymentLink || "https://pages.razorpay.com/pl_RIfTCxnYj73xqE/view";
  
  const isCartMode = !!cartItems && cartItems.length > 0;

  const handlePayNow = () => {
      window.open(razorpayUrl, '_blank');
      setHasClickedPay(true);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4 animate-fade-in" role="dialog" aria-modal="true">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden flex flex-col animate-scale-in-up">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-6 text-white relative">
            <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors p-2" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="flex flex-col items-center text-center">
                <div className="bg-white/10 p-3 rounded-full mb-3 backdrop-blur-sm shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Secure Checkout</h2>
                <p className="text-gray-400 text-sm mt-1">Complete your purchase via Razorpay</p>
            </div>
        </div>

        <div className="p-8 space-y-8">
            
            {/* Order Summary */}
            <div className="space-y-4">
                <div className="flex justify-between items-center text-gray-500 text-sm font-medium uppercase tracking-wide border-b pb-2">
                    <span>Item</span>
                    <span>Price</span>
                </div>
                
                {isCartMode ? (
                    <div className="max-h-32 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                        {cartItems.map(item => (
                            <div key={item.productId} className="flex justify-between items-start">
                                <div>
                                    <span className="text-gray-800 font-semibold block">{item.product.title}</span>
                                    <span className="text-xs text-gray-500">Qty: {item.quantity}</span>
                                </div>
                                <span className="text-gray-700 font-medium">{item.product.salePrice || item.product.price}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex justify-between items-center">
                        <span className="text-gray-800 font-bold text-lg line-clamp-1">{productTitle}</span>
                        <span className="text-gray-700 font-medium">₹{originalPrice.toFixed(2)}</span>
                    </div>
                )}

                {/* Totals */}
                <div className="pt-4 border-t border-dashed space-y-2">
                    {!isCartMode && salePrice !== null && (
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Discount</span>
                            <span className="text-green-600 font-medium">- ₹{(originalPrice - salePrice).toFixed(2)}</span>
                        </div>
                    )}
                    {couponDiscount > 0 && (
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Coupon Savings</span>
                            <span className="text-green-600 font-medium">- ₹{couponDiscount.toFixed(2)}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center pt-2">
                        <span className="text-gray-900 font-bold text-lg">Total Amount</span>
                        <span className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                            ₹{finalPrice.toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Action Area */}
            {!hasClickedPay ? (
                <button 
                    onClick={handlePayNow}
                    className="group w-full bg-gray-900 text-white font-bold text-lg py-4 rounded-xl shadow-lg hover:shadow-2xl hover:bg-black hover:scale-[1.02] transition-all duration-300 flex items-center justify-center gap-3"
                >
                    <span>Pay Now</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </button>
            ) : (
                <div className="text-center animate-fade-in space-y-4">
                    <p className="text-gray-600 text-sm">
                        Payment page opened in a new tab. Please complete the payment there.
                    </p>
                    <button 
                        onClick={onConfirm}
                        className="w-full bg-green-600 text-white font-bold text-lg py-4 rounded-xl shadow-lg hover:bg-green-700 transition-all duration-300 animate-pulse"
                    >
                        Confirm I've Paid
                    </button>
                    <button 
                        onClick={() => setHasClickedPay(false)}
                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                        Link didn't open? Click to retry.
                    </button>
                </div>
            )}

            {/* Trust Footer */}
            <div className="text-center pt-2 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest flex items-center justify-center gap-2">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
                    Secured by Razorpay
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
