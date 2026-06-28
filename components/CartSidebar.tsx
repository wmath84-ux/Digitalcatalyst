
import React, { useEffect, useRef, useState } from 'react';
import { CartItem, ProductWithRating, Coupon } from '../App';

interface CartSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    cartItems: ({ product: ProductWithRating } & CartItem)[];
    onUpdateQuantity: (productId: number, newQuantity: number) => void;
    onRemoveItem: (productId: number) => void;
    onViewProduct: (product: ProductWithRating) => void;
    onCheckout: () => void;
    onApplyCoupon: (code: string) => void;
    appliedCoupon: Coupon | null;
    couponError: string | null;
    onRemoveCoupon: () => void;
    coinBalance: number;
    coinRedeemRate: number;
    applyEduCoins: boolean;
    onToggleEduCoins: (enabled: boolean) => void;
    appliedEduCoins: number;
    eduCoinDiscount: number;
    finalPrice: number;
}

const CartSidebar: React.FC<CartSidebarProps> = ({ 
    isOpen, onClose, cartItems, onUpdateQuantity, onRemoveItem, onViewProduct, onCheckout,
    onApplyCoupon, appliedCoupon, couponError, onRemoveCoupon, coinBalance, coinRedeemRate,
    applyEduCoins, onToggleEduCoins, appliedEduCoins, eduCoinDiscount, finalPrice
}) => {
    const [flash, setFlash] = useState(false);
    const [couponInput, setCouponInput] = useState('');
    
    const subtotal = cartItems.reduce((acc, item) => {
        const priceStr = item.product.salePrice || item.product.price;
        const price = parseFloat(priceStr.replace('₹', ''));
        return acc + (price * item.quantity);
    }, 0);

    const safeCoinBalance = Math.max(0, Math.floor(Number(coinBalance) || 0));
    const safeRedeemRate = Math.max(1, Math.floor(Number(coinRedeemRate) || 1));
    const maxDiscountCoins = Math.min(safeCoinBalance, Math.floor(subtotal * safeRedeemRate));
    const canUseEduCoins = maxDiscountCoins > 0 && subtotal > 0;

    const prevSubtotalRef = useRef<number | undefined>(undefined);
    useEffect(() => {
        if (prevSubtotalRef.current !== undefined && subtotal !== prevSubtotalRef.current) {
            setFlash(true);
            const timer = setTimeout(() => setFlash(false), 700); // must match animation duration
            return () => clearTimeout(timer);
        }
        prevSubtotalRef.current = subtotal;
    }, [subtotal]);

    const handleViewProductClick = (product: ProductWithRating) => {
        onViewProduct(product);
        onClose();
    };
    
    const handleApplyClick = () => {
        if (couponInput.trim()) {
            onApplyCoupon(couponInput.trim());
        }
    };

    return (
        <>
            {/* FIX: Wrapped event handler in an arrow function to prevent passing implicit event arguments. */}
            <div className={`cart-overlay ${isOpen ? 'is-open' : ''}`} onClick={() => onClose()}></div>
            <aside className={`cart-sidebar bg-white/80 backdrop-blur-2xl border-l border-white/50 shadow-2xl ${isOpen ? 'is-open' : ''}`}>
                <div className="flex flex-col h-full">
                    <header className="p-6 border-b border-white/50 flex justify-between items-center bg-white/60 backdrop-blur-xl">
                        <h2 className="text-2xl font-bold text-slate-900">Your Cart</h2>
                        {/* FIX: Wrapped event handler in an arrow function to prevent passing implicit event arguments. */}
                        <button onClick={() => onClose()} className="p-2 text-slate-600 hover:text-gray-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </header>

                    <div className="flex-1 overflow-y-auto p-6">
                        {cartItems.length === 0 ? (
                            <div className="text-center text-text-muted pt-20">
                                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-16 w-16 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                <p className="mt-4 text-lg">Your cart is empty.</p>
                            </div>
                        ) : (
                            <ul className="space-y-6">
                                {cartItems.map(item => (
                                    <li key={item.productId} className="flex gap-4">
                                        <button onClick={() => handleViewProductClick(item.product)} className="flex-shrink-0">
                                            <div className="w-24 h-24 bg-white/70 rounded-2xl overflow-hidden border border-white/50 shadow-sm">
                                                <img src={(item.product.images || [])[0]} alt={item.product.title} className="w-full h-full object-cover"/>
                                            </div>
                                        </button>
                                        <div className="flex-1">
                                            <button onClick={() => handleViewProductClick(item.product)}>
                                                <h3 className="font-black text-slate-900 text-left hover:underline">{item.product.title}</h3>
                                            </button>
                                            <p className="text-sm text-primary font-bold mt-1">{item.product.salePrice || item.product.price}</p>
                                            <div className="mt-2 flex items-center justify-between">
                                                <div className="flex items-center rounded-full border border-white/50 bg-white/70 text-slate-900">
                                                    <button onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)} className="px-2 py-1 text-sm">-</button>
                                                    <span className="px-3 text-sm">{item.quantity}</span>
                                                    <button onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)} className="px-2 py-1 text-sm">+</button>
                                                </div>
                                                <button onClick={() => onRemoveItem(item.productId)} className="text-xs text-red-500 hover:underline">Remove</button>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    
                    {cartItems.length > 0 && (
                        <footer className="p-6 border-t bg-gray-50">
                             <div className="space-y-2 mb-4">
                                {appliedCoupon ? (
                                    <div className="flex justify-between items-center bg-green-100 text-green-800 p-2 rounded-md text-sm">
                                        <p>Coupon applied: <span className="font-bold">{appliedCoupon.code}</span></p>
                                        {/* FIX: Wrapped event handler in an arrow function to prevent passing implicit event arguments. */}
                                        <button onClick={() => onRemoveCoupon()} className="font-bold text-lg">&times;</button>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <input type="text" value={couponInput} onChange={e => setCouponInput(e.target.value)} placeholder="Coupon code" className="w-full px-3 py-2 border rounded-md text-sm"/>
                                        <button onClick={handleApplyClick} className="bg-gray-200 font-semibold px-4 rounded-md hover:bg-gray-300">Apply</button>
                                    </div>
                                )}
                                {couponError && <p className="text-xs text-red-500 mt-1">{couponError}</p>}
                            </div>
                            <div className="mb-4 rounded-2xl border border-amber-200/60 bg-white/80 p-4 shadow-sm backdrop-blur-xl">
                                <label className={`flex items-start gap-3 ${canUseEduCoins ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                                    <input
                                        type="checkbox"
                                        checked={applyEduCoins && canUseEduCoins}
                                        disabled={!canUseEduCoins}
                                        onChange={event => onToggleEduCoins(canUseEduCoins ? event.target.checked : false)}
                                        className="mt-1 h-4 w-4 rounded border-amber-300 text-indigo-600 disabled:cursor-not-allowed"
                                    />
                                    <span className="flex-1">
                                        <span className="block text-sm font-black text-slate-900">Apply EduCoins Balance</span>
                                        <span className="mt-1 block text-xs leading-5 text-slate-600">🪙 {safeCoinBalance} available • {safeRedeemRate} coins = ₹1 discount</span>
                                    </span>
                                </label>
                                {!canUseEduCoins && (
                                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                                        Earn EduCoins first to unlock cart discount.
                                    </div>
                                )}
                                {applyEduCoins && canUseEduCoins && (
                                    <div className="mt-3 rounded-xl border border-indigo-200/70 bg-indigo-50/80 px-3 py-2 text-xs font-bold text-indigo-700">
                                        Applying {appliedEduCoins} coins for ₹{eduCoinDiscount.toFixed(2)} off
                                    </div>
                                )}
                            </div>
                            <div className={`space-y-2 rounded-2xl bg-white/70 p-3 ${flash ? 'subtotal-flash' : ''}`}>
                                <div className="flex justify-between text-sm font-semibold"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
                                {eduCoinDiscount > 0 && <div className="flex justify-between text-sm font-bold text-emerald-700"><span>EduCoin discount</span><span>- ₹{eduCoinDiscount.toFixed(2)}</span></div>}
                                <div className="flex justify-between border-t border-white/70 pt-2 text-lg font-black"><span>Total</span><span>₹{finalPrice.toFixed(2)}</span></div>
                            </div>
                            {/* FIX: Wrapped event handler in an arrow function to prevent passing implicit event arguments. */}
                            <button onClick={() => onCheckout()} className="w-full mt-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black py-4 rounded-2xl hover:opacity-90 transition-all transform active:scale-95 shadow-sm">
                                Proceed to Checkout
                            </button>
                             <p className="text-xs text-text-muted text-center mt-2">Discounts are validated again at checkout.</p>
                        </footer>
                    )}
                </div>
            </aside>
        </>
    );
};

export default CartSidebar;
