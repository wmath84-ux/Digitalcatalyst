// src/components/checkout/CheckoutSuccessStep.tsx
//
// Part 6 — itemised success page. Displays the verified
// `ServerPriceQuote`'s line items + totals as a clean receipt,
// alongside the Razorpay orderId / paymentId returned by the
// verify-payment step and the list of granted entitlement ids
// written by the Part 6 entitlement writer.
//
// The component is read-only by design: it never mutates the quote,
// never calls the server, and never reaches for `window.confirm`. All
// destructive actions (cancel / back to source) live in the parent
// `CheckoutApp`.

import { ArrowLeft, BadgeCheck, CircleCheck, Package, ShoppingBag } from "lucide-react";
import { useCheckout } from "../../checkout/CheckoutContext";
import CheckoutLineItemCard from "./CheckoutLineItemCard";
import type { CheckoutLineItem, PurchaseKind } from "../../types/commerce";
import { formatPaise } from "../../utils/money";

const formatRupee = formatPaise;

const formatTimestamp = (value: number): string => {
  if (!Number.isFinite(value)) return "";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const PURCHASE_KIND_LABEL: Record<string, string> = {
  full_product: "Course / product",
  selected_modules: "Modules",
  selected_resources: "Resources",
  cart_bundle: "Cart bundle",
  paid_update: "Paid update",
  free_entitlement: "Free entitlement",
  subscription: "Subscription",
  subscription_features: "Subscription add-on",
};

export interface CheckoutSuccessStepProps {
  /** The Razorpay order id returned by `verify-payment`. */
  orderId?: string | null;
  /** The Razorpay payment id returned by `verify-payment`. May be null for free paths. */
  paymentId?: string | null;
  /** Display label for the payment method. */
  paymentMethod?: string | null;
  /** Entitlement ids the server wrote to `entitlements/{uid}__{entitlementId}`. */
  grantedEntitlementIds?: string[];
  /** The Part 1 purchase kind from the verified quote. */
  purchaseKind?: PurchaseKind | string | null;
  /** The cash the user paid in paise (Razorpay amount). */
  cashPaid?: number;
  /** The minimum payable from the quote (used for the "min" label). */
  minimumPayable?: number;
  currency?: string;
  onGoToLibrary?: () => void;
  onBackToSource?: () => void;
}

export default function CheckoutSuccessStep({
  orderId,
  paymentId,
  paymentMethod,
  grantedEntitlementIds,
  purchaseKind,
  cashPaid,
  minimumPayable,
  currency,
  onGoToLibrary,
  onBackToSource,
}: CheckoutSuccessStepProps) {
  const checkout = useCheckout();
  const quote = checkout.quote;
  const lineItems: CheckoutLineItem[] = quote?.verifiedLineItems || [];
  const displayItems = lineItems.filter((line) => !line.alreadyOwned);

  if (!quote) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-black">No verified quote found.</p>
        <p className="mt-1 text-xs text-amber-800/80">Please return to the source page to start a new checkout.</p>
      </div>
    );
  }

  const regularSubtotal = quote.regularSubtotal || 0;
  const saleDiscount = quote.saleDiscount || 0;
  const couponDiscount = quote.couponDiscount || 0;
  const eduCoinDiscount = quote.eduCoinDiscount || 0;
  const quoteCashPayable = quote.cashPayable || 0;
  const quoteMinimumPayable = quote.minimumPayable || 0;
  // Prefer the verified-payment `cashPaid` (the actual Razorpay
  // amount the user paid). Fall back to the quote's cashPayable,
  // then to max(cashPayable, minimumPayable).
  const resolvedCashPaid =
    typeof cashPaid === "number" && cashPaid > 0
      ? cashPaid
      : Math.max(quoteCashPayable, quoteMinimumPayable);
  const resolvedMinPayable =
    typeof minimumPayable === "number" && minimumPayable > 0 ? minimumPayable : quoteMinimumPayable;
  const finalTotal = Math.max(resolvedCashPaid, resolvedMinPayable);
  const purchaseKindLabel = purchaseKind ? PURCHASE_KIND_LABEL[purchaseKind] || String(purchaseKind) : "—";
  const effectiveCurrency = currency || quote.currency || "INR";

  return (
    <div className="flex flex-col gap-3" data-checkout-success-step>
      <div className="flex flex-col items-center gap-2 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-center shadow-sm">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-200">
          <CircleCheck size={28} />
        </span>
        <h2 className="text-xl font-black text-emerald-900">Payment verified</h2>
        <p className="text-xs text-emerald-800/80">Access is unlocked and entitlements are saved to your account.</p>
        <p className="text-[10px] font-mono text-emerald-700/80">quote {quote.quoteId}</p>
      </div>

      {/* Receipt header — real order + payment id from verify-payment */}
      <section data-checkout-success-receipt className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">Receipt</h2>
          <span className="text-[11px] text-slate-400">Issued {formatTimestamp(Date.now())}</span>
        </header>
        <dl className="space-y-1.5 text-sm">
          <ReceiptRow label="Order ID" value={orderId || quote.quoteId} mono />
          <ReceiptRow label="Payment ID" value={paymentId || "—"} mono />
          <ReceiptRow label="Payment method" value={paymentMethod || "Razorpay"} />
          {quote.couponCode ? (
            <ReceiptRow
              label="Coupon"
              value={`${quote.couponCode}${
                quote.couponType === "percent" && typeof quote.couponValue === "number"
                  ? ` (${quote.couponValue}% off)`
                  : quote.couponType === "flat" && typeof quote.couponValue === "number"
                    ? ` (${formatRupee(quote.couponValue)} off)`
                    : ""
              }`}
              highlight
            />
          ) : null}
          <ReceiptRow label="Purchase kind" value={purchaseKindLabel} />
          <ReceiptRow label="Buyer" value={checkout.buyer?.email || checkout.buyer?.uid || "Unknown"} />
          <ReceiptRow label="Status" value="Verified" badge />
        </dl>
      </section>

      {/* Granted entitlements */}
      {Array.isArray(grantedEntitlementIds) && grantedEntitlementIds.length > 0 ? (
        <section data-checkout-success-entitlements className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <header className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Granted entitlements ({grantedEntitlementIds.length})
            </h2>
          </header>
          <ul className="space-y-1">
            {grantedEntitlementIds.map((id) => (
              <li
                key={id}
                data-granted-entitlement-id={id}
                className="flex items-center gap-2 truncate rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-mono text-slate-700"
              >
                <BadgeCheck size={12} className="shrink-0 text-emerald-600" />
                <span className="truncate">{id}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Line items */}
      <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <header className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">Items ({lineItems.length})</h2>
          <p className="text-[11px] text-slate-400">{displayItems.length} new · {lineItems.length - displayItems.length} already owned</p>
        </header>
        <div className="space-y-2">
          {lineItems.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
              Nothing to charge for.
            </p>
          ) : (
            lineItems.map((line) => <CheckoutLineItemCard key={line.id} line={line} readOnly />)
          )}
        </div>
      </section>

      {/* Price summary */}
      <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <header className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">Totals</h2>
          <p className="text-[10px] text-slate-400">GST inclusive · {effectiveCurrency}</p>
        </header>
        <dl className="space-y-1.5 text-sm">
          <ReceiptRow label="Regular subtotal" value={formatRupee(regularSubtotal)} />
          {saleDiscount > 0 ? <ReceiptRow label="Sale discount" value={`− ${formatRupee(saleDiscount)}`} highlight /> : null}
          {couponDiscount > 0 ? <ReceiptRow label="Coupon discount" value={`− ${formatRupee(couponDiscount)}`} highlight /> : null}
          {eduCoinDiscount > 0 ? <ReceiptRow label="EduCoin discount" value={`− ${formatRupee(eduCoinDiscount)}`} highlight /> : null}
          {resolvedMinPayable > 0 ? <ReceiptRow label="Minimum payable" value={formatRupee(resolvedMinPayable)} /> : null}
        </dl>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-base font-black text-slate-900">Cash paid</span>
          <span data-checkout-success-cash-paid className="text-2xl font-black text-slate-900 sm:text-3xl">
            {formatRupee(finalTotal)}
          </span>
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
        <Package className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Entitlements were written to the canonical <code>entitlements</code> collection in a single transaction. The receipt above is the authoritative record for this purchase.
        </p>
      </div>

      {/* CTAs */}
      <div className="space-y-2 pb-2">
        <button
          type="button"
          onClick={onGoToLibrary}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-4 text-base font-black text-white shadow-lg shadow-emerald-200 transition hover:brightness-110 active:scale-[0.99]"
        >
          <ShoppingBag size={18} /> Go to my library
        </button>
        <button
          type="button"
          onClick={onBackToSource}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-700"
        >
          <ArrowLeft size={14} /> Back to source
        </button>
      </div>
    </div>
  );
}

function ReceiptRow({ label, value, mono, highlight, badge }: { label: string; value: string; mono?: boolean; highlight?: boolean; badge?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-slate-400 shrink-0">{label}</dt>
      <dd
        className={`text-right text-xs min-w-0 truncate ${mono ? "font-mono" : ""} ${highlight ? "font-bold text-emerald-600" : "text-slate-700"} ${
          badge ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-200" : ""
        }`}
      >
        {badge ? <BadgeCheck size={10} /> : null}
        {value}
      </dd>
    </div>
  );
}
