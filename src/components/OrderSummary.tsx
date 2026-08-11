import { useState } from 'react';
import type { Product, UserProfile } from '../data/checkoutData';

interface OrderSummaryProps {
  product: Product;
  user: UserProfile;
  onProceed: (finalPrice: number, eduCoinsUsed: number) => void;
}

export default function OrderSummary({ product, user, onProceed }: OrderSummaryProps) {
  const maxCoinsAllowed = Math.floor((product.price * user.maxEduCoinsUsable) / 100);
  const coinsAvailable = Math.min(user.eduCoins, maxCoinsAllowed);

  const [useEduCoins, setUseEduCoins] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const discount = useEduCoins ? coinsAvailable : 0;
  const finalPrice = product.price - discount;

  const handleToggleEduCoins = () => {
    const newState = !useEduCoins;
    setUseEduCoins(newState);
    console.log(
      `[EduCoins] Toggle: ${newState ? 'ON' : 'OFF'} | Coins Applied: ${newState ? coinsAvailable : 0} | Discount: ₹${newState ? coinsAvailable : 0}`
    );
  };

  const handleProceed = () => {
    console.log('[Step 1 → Step 2] Proceeding to Payment', {
      product: product.name,
      originalPrice: product.price,
      eduCoinsUsed: discount,
      finalPrice,
      user: user.name,
    });
    onProceed(finalPrice, discount);
  };

  // Star rating renderer
  const renderStars = (rating: number) => {
    const full = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    return (
      <span className="text-sm tracking-tight">
        {'★'.repeat(full)}
        {hasHalf && '½'}
        {'☆'.repeat(5 - full - (hasHalf ? 1 : 0))}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-4 animate-fadeIn">
      {/* Product Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Product Header */}
        <div className="p-4 flex gap-3.5">
          <div className="w-16 h-16 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-3xl flex-shrink-0">
            {product.thumbnail}
          </div>
          <div className="flex-1 min-w-0">
            <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 rounded-full mb-1">
              {product.type}
            </span>
            <h2 className="text-[15px] font-bold text-gray-900 leading-snug line-clamp-2">
              {product.name}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">by {product.instructor}</p>
          </div>
        </div>

        {/* Expandable Details */}
        <button
          onClick={() => setDetailsExpanded(!detailsExpanded)}
          className="w-full px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 active:bg-gray-100 transition-colors"
        >
          <span>{detailsExpanded ? 'Hide Details' : 'View Details'}</span>
          <span className={`transition-transform duration-200 ${detailsExpanded ? 'rotate-180' : ''}`}>▼</span>
        </button>

        {detailsExpanded && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 space-y-2 text-sm text-gray-600">
            <p>{product.description}</p>
            <div className="flex items-center gap-3 text-xs text-gray-500 pt-1">
              <span className="flex items-center gap-1">
                <span className="text-amber-500">{renderStars(product.rating)}</span>
                <span className="font-semibold text-gray-700">{product.rating}</span>
                <span>({product.totalRatings.toLocaleString('en-IN')})</span>
              </span>
              <span>•</span>
              <span>⏱ {product.duration}</span>
            </div>
          </div>
        )}

        {/* Price Row */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-500">Price</span>
          <span className="text-lg font-bold text-gray-900">
            {product.currency}{product.price.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* EduCoins Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center text-lg">
              🪙
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-800">Use EduCoins</p>
              <p className="text-[11px] text-gray-400">
                {user.eduCoins} coins available (max {user.maxEduCoinsUsable}% usable)
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <button
            onClick={handleToggleEduCoins}
            className={`
              relative w-12 h-7 rounded-full transition-colors duration-200 flex-shrink-0
              ${useEduCoins ? 'bg-emerald-500' : 'bg-gray-300'}
            `}
            role="switch"
            aria-checked={useEduCoins}
            aria-label="Toggle EduCoins discount"
          >
            <span
              className={`
                absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-200
                ${useEduCoins ? 'translate-x-5.5 left-0.5' : 'left-0.5'}
              `}
              style={{ transform: useEduCoins ? 'translateX(20px)' : 'translateX(0)' }}
            />
          </button>
        </div>

        {useEduCoins && (
          <div className="mt-3 pt-3 border-t border-dashed border-gray-200 flex items-center justify-between text-sm animate-fadeIn">
            <span className="text-emerald-600 font-medium">
              🎉 {coinsAvailable} coins applied!
            </span>
            <span className="text-emerald-600 font-bold">
              − {product.currency}{coinsAvailable.toLocaleString('en-IN')}
            </span>
          </div>
        )}
      </div>

      {/* User Verification Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Buyer Details
        </h3>
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 bg-blue-50 border border-blue-100 rounded-full flex items-center justify-center text-2xl">
            {user.avatarEmoji}
          </span>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-sm font-semibold text-gray-800 truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
            <p className="text-xs text-gray-500">{user.phone}</p>
          </div>
          <span className="text-emerald-500 text-xs font-semibold bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">
            ✓ Verified
          </span>
        </div>
      </div>

      {/* Final Price Breakdown */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-2">
        <div className="flex justify-between text-sm text-gray-500">
          <span>Subtotal</span>
          <span>{product.currency}{product.price.toLocaleString('en-IN')}</span>
        </div>
        {useEduCoins && (
          <div className="flex justify-between text-sm text-emerald-600">
            <span>EduCoins Discount</span>
            <span>− {product.currency}{discount.toLocaleString('en-IN')}</span>
          </div>
        )}
        <div className="flex justify-between text-sm text-gray-500">
          <span>GST (18%)</span>
          <span>Inclusive</span>
        </div>
        <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
          <span className="text-sm font-bold text-gray-700">Total Payable</span>
          <span className="text-xl font-extrabold text-gray-900">
            {product.currency}{finalPrice.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Proceed Button */}
      <button
        onClick={handleProceed}
        className="w-full py-4 bg-indigo-600 text-white font-bold text-base rounded-2xl
          active:scale-[0.98] transition-all duration-150 shadow-lg shadow-indigo-200
          flex items-center justify-center gap-2"
      >
        Proceed to Payment
        <span className="text-lg">→</span>
      </button>

      <p className="text-center text-[11px] text-gray-400 pb-2">
        🔒 Your payment is secured with 256-bit SSL encryption
      </p>
    </div>
  );
}
