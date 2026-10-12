// Read-only receipt. Payment verification and entitlement activation remain
// server-controlled in PaymentGateway; this screen only presents that result.
//
// The screen plays in two strictly separate beats:
//   1. the success animation card (CheckoutSuccessAnimation — Uiverse
//      "nasty-firefox-13") confirming the transaction/access, then
//   2. the itemised receipt below it.
// The receipt remains hidden until the animation's exit has completed, so the
// two never crossfade over each other. Both are the SAME verified quote; free
// claims use the access variant and never invent a payment transaction.

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCheckout } from "../../checkout/CheckoutContext";
import type { PurchaseKind } from "../../types/commerce";
import CheckoutSection, { formatCheckoutMoney } from "./CheckoutSection";
import CheckoutLineItemCard from "./CheckoutLineItemCard";
import CheckoutSuccessAnimation from "./CheckoutSuccessAnimation";
import { SubscriptionUnlocksCard, PURCHASE_TYPE_LABEL } from "./CheckoutReviewStep";
import { useCatalog } from "../../context/CatalogContext";

export interface CheckoutSuccessStepProps {
  orderId?: string | null;
  paymentId?: string | null;
  paymentMethod?: string | null;
  grantedEntitlementIds?: string[];
  purchaseKind?: PurchaseKind | string | null;
  cashPaid?: number;
  minimumPayable?: number;
  currency?: string;
  onGoToLibrary?: () => void;
  onBackToSource?: () => void;
}

/** How long the animation card holds before its exit begins. */
const CELEBRATION_HOLD_MS = 2600;
const REDUCED_MOTION_HOLD_MS = 1400;
type SuccessPhase = "animation" | "transition" | "receipt";

export default function CheckoutSuccessStep({
  orderId,
  paymentId,
  paymentMethod,
  grantedEntitlementIds = [],
  purchaseKind,
  cashPaid,
  minimumPayable,
  currency,
  onGoToLibrary,
  onBackToSource,
}: CheckoutSuccessStepProps) {
  const checkout = useCheckout();
  const { products } = useCatalog();
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<SuccessPhase>("animation");

  // Beat 2 starts only after the animated card has had time to land. Entering
  // "transition" removes the card; AnimatePresence reveals the receipt only
  // from onExitComplete, so no frame ever paints both cards together.
  useEffect(() => {
    if (!checkout.quote || phase !== "animation") return undefined;
    const timer = window.setTimeout(
      () => setPhase("transition"),
      reduceMotion ? REDUCED_MOTION_HOLD_MS : CELEBRATION_HOLD_MS
    );
    return () => window.clearTimeout(timer);
  }, [checkout.quote, phase, reduceMotion]);

  const quote = checkout.quote;
  if (!quote)
    return (
      <div data-checkout-success-step role="alert" className="dc-checkout-recovery">
        <h2>Receipt unavailable</h2>
        <p>No verified quote was found. Return to the source to check this purchase.</p>
      </div>
    );
  const kind = purchaseKind || quote.purchaseKind;
  const isSubscription = kind === "subscription" || kind === "subscription_features";
  const finalTotal =
    typeof cashPaid === "number" && Number.isFinite(cashPaid) && cashPaid >= 0
      ? cashPaid
      : quote.cashPayable;
  const floor = minimumPayable ?? quote.minimumPayable;
  const isFreeOrder = finalTotal === 0 && floor <= 0;
  const couponRule =
    quote.couponType === "percent" && quote.couponValue != null
      ? `${quote.couponValue}% code`
      : quote.couponType === "flat" && quote.couponValue != null
      ? `${formatCheckoutMoney(quote.couponValue)} code`
      : "";

  const headline = isFreeOrder
    ? "Access unlocked"
    : isSubscription
    ? "Membership activated"
    : "Payment successful";
  const message = isFreeOrder
    ? "No payment or payment transaction is needed — your access is now part of your library."
    : isSubscription
    ? "Your payment is verified and your membership is live."
    : "Your payment is verified and the content has been added to your account.";

  return (
    <div
      data-checkout-success-step
      data-success-phase={phase}
      className="dc-checkout-success"
    >
      <AnimatePresence
        onExitComplete={() => {
          setPhase((current) => current === "transition" ? "receipt" : current);
        }}
      >
        {phase === "animation" ? (
          <motion.div
            key="celebrate"
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <CheckoutSuccessAnimation
              variant={isFreeOrder ? "free" : "paid"}
              title={headline}
              message={message}
              footnote={
                isFreeOrder
                  ? "₹0 · free access"
                  : `Paid ${formatCheckoutMoney(finalTotal)} · ${paymentMethod || "Razorpay"}`
              }
              primaryLabel={isFreeOrder ? "View access record" : "View receipt"}
              onPrimary={() => setPhase("transition")}
              onDismiss={() => setPhase("transition")}
              dismissLabel={isFreeOrder ? "Dismiss and view access record" : "Dismiss and view receipt"}
              secondaryLabel="Back to source"
              onSecondary={() => onBackToSource?.()}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Keep receipt content and data hooks mounted, but hide it from both
          sight and the accessibility tree until AnimatePresence confirms the
          success card has completely exited. */}
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={phase === "receipt" ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={{ duration: reduceMotion ? 0.15 : 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ display: phase === "receipt" ? undefined : "none" }}
        className="flex flex-col gap-3"
      >
        <header className="dc-checkout-success-head">
          <h2>{finalTotal === 0 ? "Access confirmed" : "Payment verified"}</h2>
          <p className="dc-checkout-note">
            {isSubscription
              ? "Membership access has been updated."
              : isFreeOrder
              ? "Your free access is active in My Purchases."
              : "Your purchased content is available in My Purchases."}
          </p>
        </header>
        {isSubscription ? (
          <div data-checkout-success-membership-info>
            <SubscriptionUnlocksCard receipt quote={quote} products={products} />
          </div>
        ) : null}
        <CheckoutSection data-checkout-success-receipt>
          <h2>{isFreeOrder ? "Access record" : "Receipt"}</h2>
          <dl className="dc-checkout-facts">
            <ReceiptRow
              label={isFreeOrder ? "Access reference" : "Order ID"}
              value={isFreeOrder ? quote.quoteId : orderId || quote.quoteId}
            />
            <ReceiptRow
              label="Payment ID"
              value={paymentId || (finalTotal === 0 ? "No payment required" : "Not available")}
            />
            <ReceiptRow label="Purchase" value={PURCHASE_TYPE_LABEL[kind] || String(kind)} />
            <ReceiptRow
              label="Method"
              value={finalTotal === 0 ? "Free access" : paymentMethod || "Razorpay"}
            />
            <ReceiptRow label="Buyer" value={checkout.buyer?.email || "Not available"} />
            <ReceiptRow label="Status" value="Verified" />
          </dl>
        </CheckoutSection>
        {!isSubscription ? (
          <CheckoutSection data-checkout-success-items>
            <h2>Purchased items</h2>
            {quote.verifiedLineItems.length ? (
              quote.verifiedLineItems.map((line) => (
                <CheckoutLineItemCard minimal readOnly key={line.id} line={line} />
              ))
            ) : (
              <p className="dc-checkout-note">No new chargeable items.</p>
            )}
          </CheckoutSection>
        ) : null}
        <CheckoutSection data-checkout-success-totals>
          <h2>Price breakdown</h2>
          <dl className="dc-checkout-facts">
            <ReceiptRow label="Items subtotal" value={formatCheckoutMoney(quote.regularSubtotal)} />
            {quote.saleDiscount > 0 ? (
              <ReceiptRow
                label="Price discount"
                value={`−${formatCheckoutMoney(quote.saleDiscount)}`}
              />
            ) : null}
            {quote.couponCode ? (
              <ReceiptRow
                label={`${quote.couponIsReferral ? "Referral" : "Coupon"} (${quote.couponCode})`}
                value={`−${formatCheckoutMoney(quote.couponDiscount)}${
                  couponRule ? ` · ${couponRule}` : ""
                }`}
              />
            ) : null}
            {floor > 0 ? (
              <ReceiptRow label="Minimum payable" value={formatCheckoutMoney(floor)} />
            ) : null}
          </dl>
          <div className="dc-checkout-total">
            <span>Cash paid</span>
            <strong data-checkout-success-cash-paid>{formatCheckoutMoney(finalTotal)}</strong>
          </div>
          <p className="dc-checkout-note">{currency || quote.currency} · verified payment record</p>
        </CheckoutSection>
        {grantedEntitlementIds.length ? (
          <details data-checkout-success-entitlements className="dc-checkout-reference">
            <summary>Access references ({grantedEntitlementIds.length})</summary>
            <ul>
              {grantedEntitlementIds.map((id) => (
                <li data-granted-entitlement-id={id} key={id}>
                  {id}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="dc-checkout-actions">
          {isSubscription ? (
            <button
              type="button"
              data-checkout-success-membership
              className="dc-checkout-primary"
              onClick={() => {
                window.location.hash = "#/profile";
              }}
            >
              Open membership
            </button>
          ) : (
            <button
              type="button"
              data-checkout-success-library
              className="dc-checkout-primary"
              onClick={onGoToLibrary}
            >
              Open My Purchases
            </button>
          )}
          <button type="button" className="dc-checkout-text-action" onClick={onBackToSource}>
            Back to source
          </button>
        </div>
      </motion.div>
    </div>
  );
}
function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
