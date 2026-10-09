// Read-only receipt. Payment verification and entitlement activation remain
// server-controlled in PaymentGateway; this screen only presents that result.
import { useCheckout } from "../../checkout/CheckoutContext";
import type { PurchaseKind } from "../../types/commerce";
import CheckoutSection, { formatCheckoutMoney } from "./CheckoutSection";
import CheckoutLineItemCard from "./CheckoutLineItemCard";
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
  const couponRule =
    quote.couponType === "percent" && quote.couponValue != null
      ? `${quote.couponValue}% code`
      : quote.couponType === "flat" && quote.couponValue != null
      ? `${formatCheckoutMoney(quote.couponValue)} code`
      : "";
  return (
    <div data-checkout-success-step className="dc-checkout-success">
      <header className="dc-checkout-success-head">
        <h2>{finalTotal === 0 ? "Access confirmed" : "Payment verified"}</h2>
        <p className="dc-checkout-note">
          {isSubscription
            ? "Membership access has been updated."
            : "Your purchased content is available in My Purchases."}
        </p>
      </header>
      {isSubscription ? (
        <div data-checkout-success-membership-info>
          <SubscriptionUnlocksCard receipt quote={quote} products={products} />
        </div>
      ) : null}
      <CheckoutSection data-checkout-success-receipt>
        <h2>Receipt</h2>
        <dl className="dc-checkout-facts">
          <ReceiptRow label="Order ID" value={orderId || quote.quoteId} />
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
