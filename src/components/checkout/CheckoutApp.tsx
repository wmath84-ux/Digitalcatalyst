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
//
// The page uses the same Eduvora header + BottomNav footer as the store,
// PDP, notifications and leaderboard. Razorpay Standard Checkout opens
// full-screen over this chrome so mobile users can pay (or close the
// sheet without paying) without clipped controls.

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import StepIndicator from "../StepIndicator";
import PaymentGateway, { type VerifiedPayment } from "../PaymentGateway";
import Header from "../Header";
import BottomNav, { type TabKey } from "../BottomNav";
import { useCheckout } from "../../checkout/CheckoutContext";
import { useCatalog } from "../../context/CatalogContext";
import { useCommerce } from "../../context/CommerceContext";
import { useBranding } from "../../context/BrandingContext";
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
  const { cartIds } = useCommerce();
  const { purchasedIds } = useCatalog();
  const { appName } = useBranding();
  const [step, setStep] = useState<StepId>(1);
  const [transaction, setTransaction] = useState<VerifiedPayment | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // Keep a fresh reference to the most recent `goBack` so the popstate handler
  // below (registered once) always returns to the latest return route.
  const goBackRef = useRef(checkout.goBack);
  goBackRef.current = checkout.goBack;

  // System-Back handling for the whole checkout, registered once at mount —
  // BEFORE PaymentGateway mounts and registers its own popstate handler at
  // step 2. That ordering matters: on a Back press this handler runs FIRST,
  // so it can still see Razorpay open (the `eduvora-razorpay-open` body class)
  // and leave the close to PaymentGateway — the first Back while paying only
  // dismisses the full-screen checkout and stays on the payment step. When
  // Razorpay is closed, Back returns to the recent page (the source the user
  // came from) instead of leaving them stuck on the payment step, which
  // previously let the browser walk off the end of its history and close the
  // installed PWA.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onPopState = () => {
      if (typeof document !== "undefined" && document.body.classList.contains("eduvora-razorpay-open")) {
        return;
      }
      goBackRef.current();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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

  const handleFooterChange = useCallback((tab: TabKey) => {
    if (tab === "home") window.location.hash = "#/home";
    else if (tab === "myday") window.location.hash = "#/my-day";
    else if (tab === "store") window.location.hash = "#/store";
    else if (tab === "purchases") window.location.hash = "#/store/purchases";
    else if (tab === "profile") window.location.hash = "#/profile";
  }, []);

  // Derive the PaymentGateway inputs from the canonical context.
  // Part 6: the only thing the server needs is the `quoteId` —
  // prices, kinds, line items, and entitlements are all derived
  // server-side from the persisted `ServerPriceQuote`.
  const quote = checkout.quote;
  const selection = checkout.selection;
  const productName = selection && quote
    ? quote.verifiedLineItems[0]?.title || selection.productIds[0] || appName
    : appName;
  const finalPrice = quote?.cashPayable || 0;
  const quoteId = quote?.quoteId || "";

  return (
    <div className="min-h-screen sm:py-6" data-checkout-app>
      <div
        data-checkout-shell
        data-app-frame
        className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-[calc(100vh-3rem)] sm:supports-[height:100dvh]:min-h-[calc(100dvh-3rem)] sm:overflow-hidden sm:rounded-[2rem]"
      >
        <Header
          cartCount={cartIds.size}
          notifCount={1}
          onNavigateToSubscription={() => {
            window.location.hash = "#/subscription";
          }}
          onNavigateToCart={() => {
            window.location.hash = "#/cart";
          }}
          onNavigateToNotifications={() => {
            window.location.hash = "#/notifications";
          }}
        />

        <div data-checkout-toolbar className="border-b border-white/10">
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <button
              type="button"
              onClick={checkout.goBack}
              className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.06] text-white/75"
              aria-label="Back to source"
            >
              <ArrowLeft size={16} />
            </button>
            <h1 className="text-base font-extrabold tracking-tight text-white">Checkout</h1>
            <span className="text-[10px] font-mono text-white/55">Step {step}/3</span>
          </div>
          <div className="px-4 pb-2">
            <StepIndicator currentStep={step} steps={STEPS} />
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-8">
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

        <BottomNav active={null} onChange={handleFooterChange} purchasesBadge={purchasedIds.size} />
      </div>
    </div>
  );
}
