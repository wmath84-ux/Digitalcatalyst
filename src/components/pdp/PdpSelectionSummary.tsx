import type { CheckoutLineItem, CheckoutSelection, ServerPriceQuote } from "../../types/commerce";
import type { SummaryResult } from "../../../utils/pdpSelection";
import { paiseToRupees } from "../../utils/money";
const formatPaise = (value: number) => `₹${paiseToRupees(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export type PdpSelectionSnapshot = {
  selection: CheckoutSelection;
  summary: SummaryResult;
  valid: boolean;
  rules: string[];
};

export type PdpPricingView = {
  selectionKey: string;
  quote: ServerPriceQuote | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  applying: boolean;
  couponIntent: string | null;
  refresh: () => void;
};

/** A plain, itemised decision summary. Never computes a coupon on the client. */
export default function PdpSelectionSummary({ snapshot, pricing, showOriginal = true }: {
  snapshot: PdpSelectionSnapshot;
  pricing?: PdpPricingView;
  showOriginal?: boolean;
}) {
  const { summary, selection, rules } = snapshot;
  const quote = pricing?.quote || null;
  const isPartial = selection.purchaseKind !== "full_product";
  const lines: CheckoutLineItem[] = quote ? quote.verifiedLineItems : summary.lineItems.map((line) => ({
    ...line,
    regularPrice: Math.round(line.regularPrice * 100),
    salePrice: line.salePrice === null ? null : Math.round(line.salePrice * 100),
    effectivePrice: Math.round(line.effectivePrice * 100),
  }));
  const regular = quote ? quote.regularSubtotal : Math.round(summary.regularSubtotal * 100);
  const sale = quote ? quote.saleDiscount : Math.round(summary.saleSavings * 100);
  const coupon = quote?.couponDiscount || 0;
  const subtotal = Math.max(0, regular - sale);
  const total = quote ? quote.cashPayable : Math.round(summary.effectiveSubtotal * 100);
  const adjustment = quote ? total - Math.max(0, subtotal - coupon) : 0;
  const minimumApplied = Boolean(quote?.minimumPayable && total === quote.minimumPayable);
  const chosen = lines.filter((line) => !line.alreadyOwned);
  if (!summary.selectedCount && !quote) return null;
  const detailed = isPartial || sale > 0 || Boolean(quote?.couponCode) || adjustment !== 0;

  return (
    <section data-pdp-order-summary data-pricing-status={quote ? "verified" : pricing?.status || "estimate"} className="dc-pdp-order-summary" aria-live="polite" aria-busy={pricing?.status === "loading" || pricing?.applying || undefined}>
      {detailed ? <h2 className="dc-pdp-section-heading">{isPartial ? "Selection summary" : "Price details"}</h2> : null}
      {isPartial && lines.length > 0 ? (
        <ul data-pdp-summary-items className="dc-pdp-summary-items">
          {lines.map((line) => (
            <li key={line.id} data-pdp-summary-item={line.moduleId || line.resourceId || line.updateId || line.id}>
              <span className="dc-pdp-summary-item-copy">
                <span>{line.title}{line.quantity > 1 ? ` × ${line.quantity}` : ""}</span>
                {line.parentTitle && line.parentTitle !== line.title ? <small>{line.parentTitle}</small> : null}
                {line.alreadyOwned ? <small>Already owned · no charge</small> : null}
              </span>
              <span className="dc-pdp-summary-item-price">
                {!line.alreadyOwned && line.regularPrice > line.effectivePrice ? <del className="dc-pdp-line-original">{formatPaise(line.regularPrice)}</del> : null}
                <strong>{formatPaise(line.alreadyOwned ? 0 : line.effectivePrice)}</strong>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {detailed ? (
        <dl data-pdp-summary-breakdown className="dc-pdp-summary-breakdown">
          <div><dt>Items subtotal</dt><dd>{formatPaise(regular)}</dd></div>
          {sale > 0 ? <div><dt>Price discount</dt><dd>−{formatPaise(sale)}</dd></div> : null}
          {sale > 0 ? <div><dt>Subtotal after discount</dt><dd>{formatPaise(subtotal)}</dd></div> : null}
          {quote?.couponCode ? <div data-pdp-coupon-discount><dt>{quote.couponIsReferral ? "Referral" : "Coupon"} <strong>{quote.couponCode}</strong></dt><dd>{coupon > 0 ? "−" : ""}{formatPaise(coupon)}</dd></div> : null}
          {adjustment !== 0 ? <div data-pdp-price-adjustment><dt>{adjustment > 0 && quote?.minimumPayable ? "Minimum charge adjustment" : "Pricing adjustment"}</dt><dd>{adjustment > 0 ? "+" : "−"}{formatPaise(Math.abs(adjustment))}</dd></div> : null}
        </dl>
      ) : null}
      <div className="dc-pdp-summary-total" data-pdp-summary-total>
        <span>{quote ? "Final total" : pricing ? "Estimated total" : "Total"}</span>
        <span className="dc-pdp-price-line">
          {showOriginal && regular > total && regular > 0 ? <del className="dc-pdp-original-price" title="Original price">{formatPaise(regular)}</del> : null}
          <strong className="dc-pdp-current-price" title="Final price">{formatPaise(total)}</strong>
        </span>
      </div>
      {pricing?.applying ? <p className="dc-pdp-selection-note" role="status">Applying coupon to these items…</p>
        : pricing?.status === "loading" ? <p className="dc-pdp-selection-note" role="status">Verifying {pricing.couponIntent ? `coupon ${pricing.couponIntent} and pricing` : "pricing"}…</p>
        : pricing?.error ? <div className="dc-pdp-pricing-error" role="alert"><p>{pricing.error}</p><button type="button" className="dc-pdp-text-action" onClick={pricing.refresh}>Retry pricing</button></div>
        : quote ? <p className="dc-pdp-selection-note">Server-verified for this selection.</p>
        : pricing ? <p className="dc-pdp-selection-note">Sign in to verify the final price. Checkout confirms it before payment.</p> : null}
      {(isPartial || rules.length > 0 || minimumApplied || quote?.couponIsReferral) ? (
        <ul data-pdp-selection-rules className="dc-pdp-selection-rules">
          {selection.purchaseKind === "selected_modules" ? <li>Only the listed modules are included, not the full product.</li> : null}
          {selection.purchaseKind === "selected_resources" ? <li>Only the listed resources are included.</li> : null}
          {selection.purchaseKind === "paid_update" ? <li>Base product access is required for this update.</li> : null}
          {quote?.couponIsReferral && quote.couponCode ? <li>Single-use referral. It is redeemed only after successful payment.</li> : null}
          {rules.map((rule) => <li key={rule}>{rule}</li>)}
          {minimumApplied && quote?.minimumPayable ? <li>Minimum payable for this paid order: {formatPaise(quote.minimumPayable)}.</li> : null}
        </ul>
      ) : null}
      {isPartial && chosen.length === 0 ? <p className="dc-pdp-selection-note">These items are already in your library.</p> : null}
    </section>
  );
}
