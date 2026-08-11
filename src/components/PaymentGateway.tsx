import { useState, useEffect, useRef } from 'react';

interface PaymentGatewayProps {
  finalPrice: number;
  currency: string;
  productName: string;
  onPaymentSuccess: () => void;
  onGoBack: () => void;
}

type PaymentState = 'idle' | 'processing' | 'verifying' | 'success';

export default function PaymentGateway({
  finalPrice,
  currency,
  productName,
  onPaymentSuccess,
  onGoBack,
}: PaymentGatewayProps) {
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [progressPercent, setProgressPercent] = useState(0);
  const [selectedMethod, setSelectedMethod] = useState<string>('upi');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const paymentMethods = [
    { id: 'upi', label: 'UPI', icon: '📱', sub: 'GPay / PhonePe / Paytm' },
    { id: 'card', label: 'Card', icon: '💳', sub: 'Credit / Debit Card' },
    { id: 'netbanking', label: 'Net Banking', icon: '🏦', sub: 'All Indian Banks' },
    { id: 'wallet', label: 'Wallet', icon: '👛', sub: 'Paytm / Mobikwik' },
  ];

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const simulatePayment = () => {
    console.log('[Step 2] Payment initiated', {
      method: selectedMethod,
      amount: finalPrice,
      product: productName,
    });

    setPaymentState('processing');
    setProgressPercent(0);

    // Simulate Razorpay overlay with progress
    let progress = 0;
    intervalRef.current = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 100) {
        progress = 100;
        if (intervalRef.current) clearInterval(intervalRef.current);

        setProgressPercent(100);
        setPaymentState('verifying');

        console.log('[Step 2] Payment received, verifying...');

        // Verification phase
        setTimeout(() => {
          console.log('[Step 2 → Step 3] Payment verified successfully!');
          setPaymentState('success');

          // Auto-advance to Step 3
          setTimeout(() => {
            onPaymentSuccess();
          }, 800);
        }, 1500);
      } else {
        setProgressPercent(Math.round(progress));
      }
    }, 400);
  };

  const handlePayClick = () => {
    if (paymentState !== 'idle') return;
    simulatePayment();
  };

  return (
    <div className="flex flex-col gap-4 animate-fadeIn">
      {/* Secure Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="text-green-600 text-sm">🔒</span>
          <span className="text-sm font-bold text-gray-700">Secure Payment Gateway</span>
        </div>
        <p className="text-xs text-gray-400">Powered by Razorpay • PCI DSS Compliant</p>
      </div>

      {/* Amount Card */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg shadow-indigo-200">
        <p className="text-xs text-indigo-200 uppercase tracking-wider font-medium mb-1">Amount to Pay</p>
        <p className="text-3xl font-extrabold">
          {currency}{finalPrice.toLocaleString('en-IN')}
        </p>
        <p className="text-xs text-indigo-200 mt-1 truncate">for {productName}</p>
      </div>

      {/* Payment Methods - only show when idle */}
      {paymentState === 'idle' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Select Payment Method
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {paymentMethods.map((method) => (
              <button
                key={method.id}
                onClick={() => {
                  setSelectedMethod(method.id);
                  console.log(`[Payment Method] Selected: ${method.label}`);
                }}
                className={`
                  p-3 rounded-xl border-2 text-left transition-all duration-150 active:scale-[0.97]
                  ${selectedMethod === method.id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 bg-white'
                  }
                `}
              >
                <span className="text-xl">{method.icon}</span>
                <p className={`text-sm font-semibold mt-1 ${selectedMethod === method.id ? 'text-indigo-700' : 'text-gray-700'}`}>
                  {method.label}
                </p>
                <p className="text-[10px] text-gray-400 leading-tight">{method.sub}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Processing / Verifying State */}
      {(paymentState === 'processing' || paymentState === 'verifying' || paymentState === 'success') && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center space-y-4">
          {/* Animated Loader */}
          <div className="flex justify-center">
            <div
              className={`
                w-16 h-16 rounded-full flex items-center justify-center text-3xl
                ${paymentState === 'success'
                  ? 'bg-emerald-100 border-2 border-emerald-300'
                  : 'bg-indigo-50 border-2 border-indigo-200 animate-pulse'
                }
              `}
            >
              {paymentState === 'processing' && '⏳'}
              {paymentState === 'verifying' && '🔍'}
              {paymentState === 'success' && '✅'}
            </div>
          </div>

          <div>
            <p className="text-sm font-bold text-gray-800">
              {paymentState === 'processing' && 'Processing Payment...'}
              {paymentState === 'verifying' && 'Verifying Transaction...'}
              {paymentState === 'success' && 'Payment Successful!'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {paymentState === 'processing' && 'Connecting to Razorpay securely'}
              {paymentState === 'verifying' && 'Confirming with your bank'}
              {paymentState === 'success' && 'Redirecting you shortly...'}
            </p>
          </div>

          {/* Progress Bar */}
          {paymentState === 'processing' && (
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
          {paymentState === 'verifying' && (
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full animate-pulse" style={{ width: '100%' }} />
            </div>
          )}

          {/* Simulated transaction logs */}
          <div className="text-[10px] text-gray-300 space-y-0.5 font-mono">
            {paymentState !== 'processing' && <p>✓ Payment gateway connected</p>}
            {paymentState !== 'processing' && <p>✓ Amount debited: {currency}{finalPrice}</p>}
            {(paymentState === 'verifying' || paymentState === 'success') && (
              <p>✓ Bank verification in progress</p>
            )}
            {paymentState === 'success' && <p>✓ Transaction confirmed</p>}
          </div>
        </div>
      )}

      {/* Trust Signals */}
      <div className="flex items-center justify-center gap-4 py-2">
        <span className="text-[10px] text-gray-400 flex items-center gap-1">🔒 SSL Secured</span>
        <span className="text-[10px] text-gray-400 flex items-center gap-1">🛡️ Razorpay</span>
        <span className="text-[10px] text-gray-400 flex items-center gap-1">✅ PCI DSS</span>
      </div>

      {/* Pay Button or Back */}
      {paymentState === 'idle' ? (
        <div className="space-y-3">
          <button
            onClick={handlePayClick}
            className="w-full py-4 bg-emerald-600 text-white font-bold text-base rounded-2xl
              active:scale-[0.98] transition-all duration-150 shadow-lg shadow-emerald-200
              flex items-center justify-center gap-2"
          >
            🔐 Pay Securely — {currency}{finalPrice.toLocaleString('en-IN')}
          </button>

          <button
            onClick={() => {
              console.log('[Step 2] Going back to Order Summary');
              onGoBack();
            }}
            className="w-full py-3 bg-gray-100 text-gray-600 font-medium text-sm rounded-2xl
              active:scale-[0.98] transition-all duration-150
              flex items-center justify-center gap-1"
          >
            ← Back to Order Summary
          </button>
        </div>
      ) : (
        <p className="text-center text-xs text-gray-400 animate-pulse pb-2">
          Please do not close this page...
        </p>
      )}
    </div>
  );
}
