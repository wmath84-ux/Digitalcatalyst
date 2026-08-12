import { useState, useRef, useEffect } from 'react';
import StepIndicator from './components/StepIndicator';
import OrderSummary from './components/OrderSummary';
import PaymentGateway, { type VerifiedPayment } from './components/PaymentGateway';
import VerificationSuccess from './components/VerificationSuccess';
import { product, user } from './data/checkoutData';
import type { TransactionResult } from './data/checkoutData';

const STEPS = [
  { label: 'Review', icon: '📋' },
  { label: 'Payment', icon: '💳' },
  { label: 'Done', icon: '✅' },
];

export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [finalPrice, setFinalPrice] = useState(product.price);
  const [eduCoinsUsed, setEduCoinsUsed] = useState(0);
  const [transaction, setTransaction] = useState<TransactionResult | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to top when step changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  const handleProceedToPayment = (price: number, coins: number) => {
    setFinalPrice(price);
    setEduCoinsUsed(coins);
    setCurrentStep(2);
    console.log('[App] Step changed: 1 → 2');
  };

  const handlePaymentSuccess = (payment: VerifiedPayment) => {
    const txn: TransactionResult = {
      transactionId: payment.paymentId,
      orderId: payment.orderId,
      paymentMethod: payment.paymentMethod,
      timestamp: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
      status: 'success',
    };
    sessionStorage.removeItem('checkoutContext');
    setTransaction(txn);
    setCurrentStep(3);
  };

  const handleGoBack = () => {
    setCurrentStep(1);
    console.log('[App] Step changed: 2 → 1');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center">
      {/* Mobile container - max-width capped for mobile feel */}
      <div className="w-full max-w-md min-h-screen bg-gray-50 flex flex-col">
        {/* Fixed Header */}
        <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-base font-extrabold text-gray-800 tracking-tight">
                Checkout
              </h1>
              <span className="text-[10px] text-gray-400 font-mono">
                Step {currentStep}/3
              </span>
            </div>
            <StepIndicator currentStep={currentStep} steps={STEPS} />
          </div>
        </div>

        {/* Scrollable Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-8">
          {currentStep === 1 && (
            <OrderSummary
              product={product}
              user={user}
              onProceed={handleProceedToPayment}
            />
          )}

          {currentStep === 2 && (
            <PaymentGateway
              productId={product.id}
              finalPrice={finalPrice}
              currency={product.currency}
              productName={product.name}
              onPaymentSuccess={handlePaymentSuccess}
              onGoBack={handleGoBack}
            />
          )}

          {currentStep === 3 && transaction && (
            <VerificationSuccess
              transaction={transaction}
              product={product}
              finalPrice={finalPrice}
              eduCoinsUsed={eduCoinsUsed}
            />
          )}
        </div>
      </div>
    </div>
  );
}
