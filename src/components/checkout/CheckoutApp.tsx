// src/components/checkout/CheckoutApp.tsx
//
// Replacement for the old `src/CheckoutApp.tsx`. Consumes the new
// `CheckoutContext` instead of importing a mutable singleton from
// `src/data/checkoutData.ts`. The review step uses the canonical
// `ServerPriceQuote` (Part 4) to render the price section + line items;
// the payment step continues to use the existing `PaymentGateway` for
// the Razorpay integration (untouched); the success step is the new
// itemised `CheckoutSuccessStep`.
//
// The 3-step state machine is intentionally simple: "review" → "payment"
// → "success". The user can back out of any step except success (where
// the buttons navigate to library / source instead).

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import StepIndicator from "../StepIndicator";
import PaymentGateway, { type VerifiedPayment } from "../PaymentGateway";
import { useCheckout } from "../../checkout/CheckoutContext";
import CheckoutReviewStep from "./CheckoutReviewStep";
import CheckoutSuccessStep from "./CheckoutSuccessStep";

const STEPS = [
  { label: "Review", icon: "📋" },
  { label: "Payment", icon: "💳" },
  { label: "Done", icon: "✅" },
];

type StepId = 1 | 2 | 3;

export interface CheckoutAppProps {
  /**
   * Optional override for the edit-selection navigation. Defaults to
   * the return route stored in the CheckoutContext.
   */
  onEditSelection?: () => void;
}

export default function CheckoutApp({ onEditSelection }: CheckoutAppProps) {
  const checkout = useCheckout();
  const [step, setStep] = useState<StepId>(1);
  const [transaction, setTransaction] = useState<VerifiedPayment | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const handleProceedToPayment = useCallback(() => {
    if (!checkout.quote) return;
    setStep(2);
  }, [checkout.quote]);

  const handlePaymentSuccess = useCallback((payment: VerifiedPayment) => {
    setTransaction(payment);
    setStep(3);
  }, []);

  const handleBackToReview = useCallback(() => {
    setStep(1);
  }, []);

  const handleEditSelection = useCallback(() => {
    if (onEditSelection) {
      onEditSelection();
      return;
    }
    checkout.goBack();
  }, [checkout, onEditSelection]);

  const handleGoToLibrary = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.hash = "#/store/purchases";
  }, []);

  // Derive the PaymentGateway inputs from the canonical context.
  // Part 6: the only thing the server needs is the `quoteId` —
  // prices, kinds, line items, and entitlements are all derived
  // server-side from the persisted `ServerPriceQuote`.
  const quote = checkout.quote;
  const selection = checkout.selection;
  const productName = selection && quote
    ? quote.verifiedLineItems[0]?.title || selection.productIds[0] || "Digital Catalyst"
    : "Digital Catalyst";
  const finalPrice = quote?.cashPayable || 0;
  const quoteId = quote?.quoteId || "";

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center" data-checkout-app>
      <div className="w-full max-w-md min-h-screen bg-slate-50 flex flex-col">
        <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md shadow-sm">
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <button
              type="button"
              onClick={checkout.goBack}
              className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600"
              aria-label="Back to source"
            >
              <ArrowLeft size={16} />
            </button>
            <h1 className="text-base font-extrabold tracking-tight text-slate-900">Checkout</h1>
            <span className="text-[10px] font-mono text-slate-400">Step {step}/3</span>
          </div>
          <div className="px-4 pb-2">
            <StepIndicator currentStep={step} steps={STEPS} />
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-8">
          {step === 1 ? (
            <CheckoutReviewStep onProceed={handleProceedToPayment} onEdit={handleEditSelection} />
          ) : null}

          {step === 2 && quote ? (
            <PaymentGateway
              quoteId={quoteId}
              finalPrice={finalPrice}
              currency="₹"
              productName={productName}
              onPaymentSuccess={handlePaymentSuccess}
              onGoBack={handleBackToReview}
            />
          ) : null}

          {step === 3 ? (
            <CheckoutSuccessStep
              orderId={transaction?.orderId || quote?.quoteId}
              paymentId={transaction?.paymentId || null}
              paymentMethod={transaction?.paymentMethod || "Razorpay"}
              grantedEntitlementIds={transaction?.grantedEntitlementIds || []}
              purchaseKind={quote?.purchaseKind || selection?.purchaseKind || null}
              cashPaid={quote?.cashPayable || 0}
              minimumPayable={quote?.minimumPayable || 0}
              currency={quote?.currency || "INR"}
              onGoToLibrary={handleGoToLibrary}
              onBackToSource={checkout.goBack}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
