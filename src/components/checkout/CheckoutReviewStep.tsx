// src/components/checkout/CheckoutReviewStep.tsx
//
// Mobile-first checkout review page. Reads the canonical CheckoutContext
// (selection + verified ServerPriceQuote + buyer) and renders:
//
//   - purchase type chip
//   - buyer card (name, email, mobile, Firebase verified state)
//   - itemised line items (already-owned exclusion visible)
//   - price section: regular subtotal, sale discount, coupon discount = ₹0,
//     EduCoin discount = ₹0, cash payable, minimum payable, GST inclusive,
//     final total
//   - selection details (modules / resources / update contents /
//     cart products) — read from the verified line items
//   - navigation: back to source, edit selection, refresh quote, proceed
//   - safe recovery UI when the quote is invalid / expired / failed

import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  ChevronRight,
  Info,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  TicketPercent,
  Unlock,
  Wallet,
} from "lucide-react";
import { useCheckout } from "../../checkout/CheckoutContext";
import { useAuth } from "../../context/AuthContext";
import type { CheckoutLineItem } from "../../types/commerce";
import CheckoutLineItemCard from "./CheckoutLineItemCard";

const formatRupee = (value: number): string => {
  if (!Number.isFinite(value)) return "₹0";
  if (value === 0) return "Free";
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
};

const PURCHASE_TYPE_LABEL: Record<string, string> = {
  full_product: "Full course",
  selected_modules: "Selected modules",
  selected_resources: "Selected resources",
  cart_bundle: "Cart bundle",
  paid_update: "Paid update",
  free_entitlement: "Free entitlement",
  subscription: "Subscription plan",
  subscription_features: "Subscription add-on",
};

const PURCHASE_TYPE_ICON: Record<string, typeof ShoppingBag> = {
  full_product: ShoppingBag,
  selected_modules: PackageOpen,
  selected_resources: Unlock,
  cart_bundle: ShoppingBag,
  paid_update: BadgeCheck,
  free_entitlement: Sparkles,
  subscription: Wallet,
  subscription_features: Tag,
};

const RESOURCE_TYPE_LABEL: Record<string, string> = {
  youtube: "YouTube",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  doc: "Google Doc",
  sheet: "Google Sheet",
  slides: "Google Slides",
  image: "Image",
  google_form: "Google Form",
  ebook: "E-book",
  embed: "Embed",
  mindmap: "Mind map",
};

export default function CheckoutReviewStep({ onProceed, onEdit }: { onProceed: () => void; onEdit: () => void }) {
  const checkout = useCheckout();
  const { user } = useAuth();
  const [showDetails, setShowDetails] = useState<boolean>(true);

  const kind = checkout.selection?.purchaseKind || "";
  const purchaseTypeLabel = PURCHASE_TYPE_LABEL[kind] || "Checkout";
  const PurchaseTypeIcon = PURCHASE_TYPE_ICON[kind] || ShoppingBag;

  const lineItems: CheckoutLineItem[] = checkout.quote?.verifiedLineItems || [];
  const lineItemsForDisplay = useMemo(
    () => lineItems.filter((line) => !line.alreadyOwned),
    [lineItems],
  );
  const ownedLineItems = useMemo(() => lineItems.filter((line) => line.alreadyOwned), [lineItems]);

  const showLoading = checkout.status === "loading" || checkout.quoteStatus === "loading" || checkout.quoteStatus === "refreshing";
  const showInvalid = checkout.status === "invalid";
  const showError = checkout.status === "needs_refresh" || checkout.status === "error";
  const showEmpty = checkout.status === "empty" && !showLoading;

  if (showEmpty) {
    return <SafeRecoveryUI kind="empty" onGoBack={checkout.goBack} onRefresh={checkout.refresh} refreshPending={false} />;
  }
  if (showInvalid) {
    return <SafeRecoveryUI kind="invalid" reason={checkout.errorMessage} onGoBack={checkout.goBack} onRefresh={checkout.refresh} refreshPending={false} />;
  }
  if (showError && !checkout.quote) {
    return <SafeRecoveryUI kind="error" reason={checkout.errorMessage} onGoBack={checkout.goBack} onRefresh={checkout.refresh} refreshPending={false} />;
  }
  if (showLoading && !checkout.quote) {
    return <LoadingShell message="Loading server-verified price quote…" />;
  }

  const quote = checkout.quote;
  if (!quote || !checkout.selection) {
    return <SafeRecoveryUI kind="error" reason={checkout.errorMessage} onGoBack={checkout.goBack} onRefresh={checkout.refresh} refreshPending={false} />;
  }

  const regularSubtotal = quote.regularSubtotal || 0;
  const saleDiscount = quote.saleDiscount || 0;
  const couponDiscount = quote.couponDiscount || 0;
  const cashPayable = quote.cashPayable || 0;
  const minimumPayable = quote.minimumPayable || 0;
  const finalTotal = Math.max(cashPayable, minimumPayable);

  // Selection details: derive from the verified line items (which carry the
  // canonical product/module/resource/update hierarchy via `parentTitle`).
  const moduleLines = lineItemsForDisplay.filter((line) => line.kind === "selected_modules");
  const resourceLines = lineItemsForDisplay.filter((line) => line.kind === "selected_resources");
  const updateLines = lineItemsForDisplay.filter((line) => line.kind === "paid_update");
  const subscriptionPlanLines = lineItemsForDisplay.filter((line) => line.kind === "subscription");
  const subscriptionAddonLines = lineItemsForDisplay.filter((line) => line.kind === "subscription_features");
  const productLines = lineItemsForDisplay.filter((line) => line.kind === "full_product" || line.kind === "cart_bundle" || line.kind === "free_entitlement");

  return (
    <div className="flex flex-col gap-3" data-checkout-review-step>
      {/* Purchase type chip */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-black text-indigo-700">
          <PurchaseTypeIcon size={12} />
          {purchaseTypeLabel}
        </span>
        <span className="text-[10px] font-mono text-slate-400">quote {quote.quoteId}</span>
      </div>

      {/* Buyer card */}
      <BuyerCard buyer={checkout.buyer} authUid={user?.id} />

      {/* Itemised line items */}
      <section data-checkout-line-items className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <header className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
            Items ({lineItemsForDisplay.length + ownedLineItems.length})
          </h2>
          {lineItemsForDisplay.length > 0 ? (
            <p className="text-[11px] text-slate-400">
              {lineItemsForDisplay.length} new · {ownedLineItems.length} already owned
            </p>
          ) : null}
        </header>
        <div className="space-y-2">
          {lineItemsForDisplay.length === 0 && ownedLineItems.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
              No items to charge for. This quote is fully covered by your existing library.
            </p>
          ) : null}
          {lineItemsForDisplay.map((line) => (
            <CheckoutLineItemCard key={line.id} line={line} />
          ))}
          {ownedLineItems.map((line) => (
            <CheckoutLineItemCard key={line.id} line={line} />
          ))}
        </div>
      </section>

      {/* Part 7 — Coupon input card (server-validated, with verified savings). */}
      <CouponCard
        appliedCode={quote.couponCode || null}
        appliedType={quote.couponType || null}
        appliedValue={typeof quote.couponValue === "number" ? quote.couponValue : null}
        appliedDiscount={couponDiscount}
        status={checkout.couponStatus}
        errorMessage={checkout.couponErrorMessage}
        input={checkout.couponInput}
        onChange={checkout.setCouponInput}
        onApply={(code) => checkout.applyCoupon(code)}
        onRemove={() => checkout.removeCoupon()}
        disabled={showLoading}
      />

      {/* Price section */}
      <section data-checkout-price-section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <header className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">Price breakdown</h2>
          <p className="text-[10px] text-slate-400">GST inclusive</p>
        </header>
        <dl className="space-y-1.5 text-sm">
          <PriceRow label="Regular subtotal" value={regularSubtotal} />
          {saleDiscount > 0 ? (
            <PriceRow label="Sale discount" value={-saleDiscount} negative />
          ) : null}
          {couponDiscount > 0 ? (
            <PriceRow
              label={`Coupon discount${quote.couponCode ? ` (${quote.couponCode})` : ""}`}
              value={-couponDiscount}
              negative
            />
          ) : null}
          {minimumPayable > 0 ? (
            <PriceRow label="Minimum payable" value={minimumPayable} muted />
          ) : null}
        </dl>
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-black text-slate-900">Final total</span>
            <span className="text-2xl font-black text-slate-900 sm:text-3xl">{formatRupee(finalTotal)}</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Payable amount is the maximum of cash-payable and minimum-payable floors.</p>
        </div>
      </section>

      {/* Selection details */}
      {showDetails ? (
        <section data-checkout-selection-details className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <header className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">Selection details</h2>
            <button
              type="button"
              onClick={() => setShowDetails(false)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-700"
            >
              Hide
            </button>
          </header>
          {kind === "selected_modules" ? (
            <SelectionList
              title={`Modules (${moduleLines.length})`}
              emptyLabel="No modules selected."
              lines={moduleLines}
            />
          ) : null}
          {kind === "selected_resources" ? (
            <SelectionList
              title={`Resources (${resourceLines.length})`}
              emptyLabel="No resources selected."
              lines={resourceLines}
            />
          ) : null}
          {kind === "paid_update" ? (
            <div className="space-y-3">
              <SelectionList
                title="Upgrade package"
                emptyLabel="No update package recorded."
                lines={updateLines}
              />
              {updateLines.flatMap((line) => line.detailItems || []).length > 0 ? (
                <div className="rounded-2xl bg-violet-50 p-3 ring-1 ring-violet-100">
                  <p className="text-xs font-black uppercase tracking-wider text-violet-700">New content included</p>
                  <ul className="mt-2 space-y-1.5">{updateLines.flatMap((line) => line.detailItems || []).map((item) => <li key={item} className="flex items-center gap-2 text-xs font-semibold text-violet-900"><BadgeCheck size={12} className="shrink-0" />{item}</li>)}</ul>
                  <p className="mt-2 text-[10px] text-violet-600">Your existing course stays owned; this checkout adds only the listed upgrade content.</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {kind === "subscription" || kind === "subscription_features" ? (
            <div className="space-y-3">
              <SelectionList title="Subscription plan" emptyLabel="Plan details unavailable." lines={subscriptionPlanLines} />
              <SelectionList title={`Included add-ons & products (${subscriptionAddonLines.length})`} emptyLabel="No optional add-ons selected." lines={subscriptionAddonLines} />
            </div>
          ) : null}
          {kind === "cart_bundle" ? (
            <SelectionList
              title={`Cart products (${productLines.length})`}
              emptyLabel="Cart is empty."
              lines={productLines}
            />
          ) : null}
          {kind === "full_product" ? (
            <SelectionList
              title="Full course"
              emptyLabel="Course not available."
              lines={productLines}
            />
          ) : null}
          {kind === "free_entitlement" ? (
            <SelectionList
              title="Free entitlement"
              emptyLabel="No free items recorded."
              lines={productLines}
            />
          ) : null}
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          Show selection details
        </button>
      )}

      {/* Refresh banner */}
      {showError ? (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 sm:text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-black">We couldn't refresh the price.</p>
            <p className="mt-0.5 text-amber-700/80">{checkout.errorMessage || "Please try again, or edit the selection."}</p>
          </div>
          <button
            type="button"
            onClick={() => void checkout.refresh()}
            className="text-amber-700 underline"
            disabled={showLoading}
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* Navigation */}
      <div className="space-y-2 pb-2" data-checkout-actions>
        <button
          type="button"
          onClick={onProceed}
          disabled={showLoading || finalTotal > 0 /* free quotes can still go through */}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-4 text-base font-black text-white shadow-lg shadow-violet-200 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {showLoading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ShoppingBag className="h-5 w-5" />}
          {finalTotal === 0 ? "Get free access" : `Proceed to payment — ${formatRupee(finalTotal)}`}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={checkout.goBack}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-700"
          >
            <ArrowLeft size={14} /> Back to source
          </button>
          <button
            type="button"
            onClick={() => void checkout.refresh()}
            disabled={showLoading}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-700 disabled:opacity-60"
          >
            {showLoading && checkout.quoteStatus === "refreshing" ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Refresh quote
          </button>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700"
        >
          Edit selection <ChevronRight size={14} />
        </button>
        <p className="px-1 text-center text-[10px] font-medium text-slate-400">
          Quote expires at {new Date(quote.expiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · Payment wiring is coming soon.
        </p>
      </div>
    </div>
  );
}

function BuyerCard({ buyer, authUid }: { buyer: ReturnType<typeof useCheckout>["buyer"]; authUid?: string }) {
  if (!buyer) {
    return (
      <section data-checkout-buyer className="rounded-3xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <p className="font-black">Buyer identity missing</p>
        <p className="mt-0.5 text-xs text-amber-700/80">Please sign in again to load the verified buyer details.</p>
      </section>
    );
  }
  const verified = buyer.tokenVerified && (!authUid || authUid === buyer.uid);
  return (
    <section data-checkout-buyer className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">Buyer</h2>
        <span
          data-firebase-verified={verified ? "true" : "false"}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${
            verified ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"
          }`}
        >
          {verified ? <ShieldCheck size={10} /> : <Info size={10} />}
          {verified ? "Firebase verified" : "Verification pending"}
        </span>
      </header>
      <div className="space-y-1 text-sm">
        <p className="truncate text-base font-black text-slate-900">{buyer.name || "Unnamed buyer"}</p>
        <p className="truncate text-xs text-slate-500">{buyer.email || "No email on file"}</p>
        {buyer.mobile ? <p className="truncate text-xs text-slate-500">📱 {buyer.mobile}</p> : null}
        <p className="truncate text-[11px] text-slate-400">UID: {buyer.uid}</p>
      </div>
    </section>
  );
}

function PriceRow({ label, value, negative, muted, note }: { label: string; value: number; negative?: boolean; muted?: boolean; note?: string }) {
  const display = negative ? `− ${formatRupee(Math.abs(value))}` : formatRupee(value);
  return (
    <div className="flex items-baseline justify-between">
      <dt className={muted ? "text-xs text-slate-400" : "text-sm text-slate-500"}>
        {label}
        {note ? <span className="ml-1 text-[10px] text-slate-400">{note}</span> : null}
      </dt>
      <dd className={`font-bold ${negative ? "text-emerald-600" : muted ? "text-slate-500" : "text-slate-700"}`}>{display}</dd>
    </div>
  );
}

function SelectionList({ title, emptyLabel, lines }: { title: string; emptyLabel: string; lines: CheckoutLineItem[] }) {
  if (lines.length === 0) {
    return (
      <div>
        <h3 className="text-xs font-bold text-slate-500">{title}</h3>
        <p className="mt-1 text-xs italic text-slate-400">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-xs font-bold text-slate-500">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {lines.map((line) => (
          <li key={line.id} className="flex items-start gap-2 text-xs text-slate-700">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span className="min-w-0 flex-1">
              <span className="font-bold text-slate-900 line-clamp-1">{line.title}</span>
              {line.parentTitle ? <span className="ml-1 text-slate-400">· {line.parentTitle}</span> : null}
            </span>
            <span className="shrink-0 font-bold text-slate-900">{formatRupee(line.effectivePrice)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SafeRecoveryUI({
  kind,
  reason,
  onGoBack,
  onRefresh,
  refreshPending,
}: {
  kind: "empty" | "invalid" | "error";
  reason?: string | null;
  onGoBack: () => void;
  onRefresh: () => void;
  refreshPending: boolean;
}) {
  const title = kind === "empty" ? "No active checkout" : kind === "invalid" ? "This checkout is no longer available" : "We couldn't load the price";
  const detail =
    kind === "empty"
      ? "Start a new checkout from a product or paid update."
      : kind === "invalid"
        ? reason || "The selection was rejected by the server. Please return to the product page and try again."
        : reason || "Network or server error. Please refresh, or return to the product page.";
  return (
    <div data-checkout-recovery-ui className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="flex-1">
          <h2 className="text-base font-black text-amber-900">{title}</h2>
          <p className="mt-1 text-xs text-amber-800/90 sm:text-sm">{detail}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onGoBack}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-amber-600 py-3 text-sm font-bold text-white hover:bg-amber-700"
        >
          <ArrowLeft size={14} /> Return to source
        </button>
        {kind !== "empty" ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshPending}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white py-3 text-sm font-bold text-amber-700 ring-1 ring-amber-300 disabled:opacity-60"
          >
            {refreshPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw size={14} />}
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LoadingShell({ message }: { message: string }) {
  return (
    <div data-checkout-loading className="flex flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
      <LoaderCircle className="h-6 w-6 animate-spin text-violet-600" />
      <p className="font-semibold">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Part 7 — Coupon input card. Server-validated: the input is sent to
// `/api/quotes/create` (via the CheckoutContext) and the server
// decides whether the coupon applies. The UI shows loading / error
// / applied savings state without trusting any client-side math.
// ---------------------------------------------------------------------------
function CouponCard({
  appliedCode,
  appliedType,
  appliedValue,
  appliedDiscount,
  status,
  errorMessage,
  input,
  onChange,
  onApply,
  onRemove,
  disabled,
}: {
  appliedCode: string | null;
  appliedType: "percent" | "flat" | null;
  appliedValue: number | null;
  appliedDiscount: number;
  status: "idle" | "applying" | "error";
  errorMessage: string | null;
  input: string;
  onChange: (value: string) => void;
  onApply: (code: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  onRemove: () => Promise<void>;
  disabled: boolean;
}) {
  const isApplied = Boolean(appliedCode) && appliedDiscount > 0;
  const applying = status === "applying";
  return (
    <section
      data-checkout-coupon
      data-applied={isApplied ? "true" : "false"}
      className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
    >
      <header className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
          <TicketPercent size={12} /> Coupon
        </h2>
        {isApplied ? (
          <span
            data-checkout-coupon-applied
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200"
          >
            <BadgeCheck size={10} /> Verified savings
          </span>
        ) : null}
      </header>

      {isApplied ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-emerald-50/60 p-2.5 ring-1 ring-emerald-200">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-emerald-900">
              {appliedCode}
              {appliedType === "percent" && appliedValue !== null
                ? ` (${appliedValue}% off)`
                : appliedType === "flat" && appliedValue !== null
                  ? ` (${formatRupee(appliedValue)} off)`
                  : ""}
            </p>
            <p className="text-[11px] text-emerald-800/80">
              You saved {formatRupee(appliedDiscount)} on this order.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRemove()}
            disabled={disabled || applying}
            className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-bold text-emerald-700 ring-1 ring-emerald-300 transition active:scale-[0.98] disabled:opacity-60"
            data-checkout-coupon-remove
          >
            {applying ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : "Remove"}
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!input.trim() || applying || disabled) return;
            void onApply(input.trim());
          }}
          className="space-y-2"
        >
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              value={input}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Enter coupon code"
              disabled={applying || disabled}
              data-checkout-coupon-input
              className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-slate-900 placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={applying || disabled || !input.trim()}
              data-checkout-coupon-apply
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {applying ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Apply"}
            </button>
          </div>
          {errorMessage && status === "error" ? (
            <p
              data-checkout-coupon-error
              role="alert"
              className="flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-semibold leading-5 text-rose-700"
            >
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              {errorMessage}
            </p>
          ) : (
            <p className="px-1 text-[10px] font-medium text-slate-400">
              Coupons are validated server-side; the discount appears in your price breakdown once applied.
            </p>
          )}
        </form>
      )}
    </section>
  );
}

export { RESOURCE_TYPE_LABEL };
