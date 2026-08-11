import { useState, useEffect } from 'react';
import type { TransactionResult, Product } from '../data/checkoutData';

interface VerificationSuccessProps {
  transaction: TransactionResult;
  product: Product;
  finalPrice: number;
  eduCoinsUsed: number;
}

export default function VerificationSuccess({
  transaction,
  product,
  finalPrice,
  eduCoinsUsed,
}: VerificationSuccessProps) {
  const [showConfetti, setShowConfetti] = useState(true);
  const [receiptExpanded, setReceiptExpanded] = useState(false);

  useEffect(() => {
    // Hide confetti after a few seconds
    const timer = setTimeout(() => setShowConfetti(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  const handleDashboard = () => {
    console.log('[CTA] Navigate to Dashboard', {
      product: product.name,
      transaction: transaction.transactionId,
    });
    window.location.hash = '#/profile';
  };

  const handleStartLearning = () => {
    console.log('[CTA] Start Learning Now', {
      productId: product.id,
      productName: product.name,
    });
    sessionStorage.setItem('selectedCourse', JSON.stringify({ courseId: product.id, title: product.name }));
    window.location.hash = '#/store/purchases';
  };

  const handleDownloadReceipt = () => {
    console.log('[Action] Download Receipt', { transactionId: transaction.transactionId });
    alert('📄 Receipt for ' + transaction.transactionId + ' will be sent to your email.');
  };

  return (
    <div className="flex flex-col gap-4 animate-fadeIn relative">
      {/* Confetti Overlay */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-start justify-center overflow-hidden">
          <div className="text-4xl animate-bounce mt-20 space-x-2">
            🎉 🎊 ✨ 🎉
          </div>
        </div>
      )}

      {/* Success Hero */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
        <div className="w-20 h-20 mx-auto bg-emerald-50 border-2 border-emerald-200 rounded-full flex items-center justify-center text-4xl mb-4 animate-successPop">
          ✅
        </div>
        <h2 className="text-xl font-extrabold text-gray-900 mb-1">Payment Verified!</h2>
        <p className="text-sm text-gray-500">
          Your product has been activated successfully
        </p>

        {/* Status Badge */}
        <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Active</span>
        </div>
      </div>

      {/* Activated Product Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Your Product
        </h3>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-2xl flex-shrink-0">
            {product.thumbnail}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800 line-clamp-2">{product.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{product.type} • {product.duration}</p>
            <p className="text-xs text-gray-400">by {product.instructor}</p>
          </div>
        </div>
      </div>

      {/* Transaction Receipt */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setReceiptExpanded(!receiptExpanded)}
          className="w-full p-4 flex items-center justify-between active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🧾</span>
            <span className="text-sm font-semibold text-gray-700">Transaction Receipt</span>
          </div>
          <span className={`text-gray-400 transition-transform duration-200 ${receiptExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>

        {receiptExpanded && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-2.5 animate-fadeIn">
            <ReceiptRow label="Transaction ID" value={transaction.transactionId} mono />
            <ReceiptRow label="Order ID" value={transaction.orderId} mono />
            <ReceiptRow label="Payment Method" value={transaction.paymentMethod} />
            <ReceiptRow label="Date & Time" value={transaction.timestamp} />
            <ReceiptRow label="Product" value={product.name} />
            <ReceiptRow label="Original Price" value={`${product.currency}${product.price.toLocaleString('en-IN')}`} />
            {eduCoinsUsed > 0 && (
              <ReceiptRow
                label="EduCoins Discount"
                value={`− ${product.currency}${eduCoinsUsed.toLocaleString('en-IN')}`}
                highlight
              />
            )}
            <div className="border-t border-dashed border-gray-200 pt-2">
              <ReceiptRow
                label="Amount Paid"
                value={`${product.currency}${finalPrice.toLocaleString('en-IN')}`}
                bold
              />
            </div>
            <ReceiptRow label="Status" value="✅ Verified & Completed" />

            <button
              onClick={handleDownloadReceipt}
              className="w-full mt-2 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-xs font-semibold text-gray-500 active:bg-gray-50 transition-colors flex items-center justify-center gap-1"
            >
              📄 Download / Email Receipt
            </button>
          </div>
        )}
      </div>

      {/* What's Next */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          What's Next?
        </h3>
        <div className="space-y-2.5">
          <NextStep emoji="📧" text="Confirmation email sent to your registered email" />
          <NextStep emoji="🔓" text="Full course access unlocked immediately" />
          <NextStep emoji="📜" text="Certificate will be available upon completion" />
          <NextStep emoji="💬" text="Join the community discussion forum" />
        </div>
      </div>

      {/* CTA Buttons */}
      <div className="space-y-3 pb-4">
        <button
          onClick={handleStartLearning}
          className="w-full py-4 bg-emerald-600 text-white font-bold text-base rounded-2xl
            active:scale-[0.98] transition-all duration-150 shadow-lg shadow-emerald-200
            flex items-center justify-center gap-2"
        >
          🚀 Start Learning Now
        </button>

        <button
          onClick={handleDashboard}
          className="w-full py-3.5 bg-indigo-600 text-white font-bold text-sm rounded-2xl
            active:scale-[0.98] transition-all duration-150 shadow-lg shadow-indigo-100
            flex items-center justify-center gap-2"
        >
          📊 Go to Dashboard
        </button>
      </div>
    </div>
  );
}

// Helper components
function ReceiptRow({
  label,
  value,
  mono,
  highlight,
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between items-start gap-3">
      <span className={`text-xs ${bold ? 'font-bold text-gray-700' : 'text-gray-400'} flex-shrink-0`}>
        {label}
      </span>
      <span
        className={`
          text-xs text-right
          ${mono ? 'font-mono' : ''}
          ${highlight ? 'text-emerald-600 font-semibold' : ''}
          ${bold ? 'font-extrabold text-gray-900 text-sm' : 'text-gray-700 font-medium'}
        `}
      >
        {value}
      </span>
    </div>
  );
}

function NextStep({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-base flex-shrink-0 mt-0.5">{emoji}</span>
      <p className="text-sm text-gray-600">{text}</p>
    </div>
  );
}
