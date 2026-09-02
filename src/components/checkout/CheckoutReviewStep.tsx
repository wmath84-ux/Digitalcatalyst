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

import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "../ui/glass-card";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
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
import { useCatalog } from "../../context/CatalogContext";
import { apiFetch } from "../../utils/apiBase";
import type { CheckoutLineItem, ServerPriceQuote } from "../../types/commerce";
import CheckoutLineItemCard from "./CheckoutLineItemCard";
import { formatPaise } from "../../utils/money";
import { payableBeforeCouponPaise, shouldShowCouponInput } from "../../../utils/couponVisibility";

const formatRupee = formatPaise;

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
  const { products: catalogProducts } = useCatalog();
  const [showDetails, setShowDetails] = useState<boolean>(true);

  const kind = checkout.selection?.purchaseKind || "";
  const isSubscriptionPurchase = kind === "subscription" || kind === "subscription_features";
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

  // Coupon fields are only meaningful when money is actually charged.
  // A free product, a free entitlement grant, or a subscription whose
  // payable total is already ₹0 renders no coupon card at all.
  // `cashPayable` is post-coupon, so the pre-coupon payable is used
  // to keep an applied coupon removable when it zeroes the order.
  const showCouponCard = shouldShowCouponInput({
    purchaseKind: kind,
    payablePaise: payableBeforeCouponPaise(cashPayable, couponDiscount),
  });

  return (
    <div className="flex flex-col gap-3" data-checkout-review-step>
      {/* Purchase type chip */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-black text-indigo-200">
          <PurchaseTypeIcon size={12} />
          {purchaseTypeLabel}
        </span>
        <span className="text-[10px] font-mono text-white/55">quote {quote.quoteId}</span>
      </div>

      {/* Buyer card */}
      <BuyerCard buyer={checkout.buyer} authUid={user?.id} />

      {/* Subscription purchases get a plain-language "What you'll get"
          card. Everything in it is derived live from the verified quote
          (the exact plan / cycle / features / products the buyer selected
          on the subscription page) — nothing here is fixed copy. */}
      {isSubscriptionPurchase ? (
        <SubscriptionUnlocksCard quote={quote} products={catalogProducts} />
      ) : null}

      {/* Itemised line items — hidden for subscription purchases because the
          "What you'll get" card above already lists every feature + product the
          buyer unlocks, and the price section below shows the money. Rendering
          both repeated the same names on the review page. */}
      {isSubscriptionPurchase ? null : (
      <GlassCard data-checkout-line-items>
        <header className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-white/55">
            Items ({lineItemsForDisplay.length + ownedLineItems.length})
          </h2>
          {lineItemsForDisplay.length > 0 ? (
            <p className="text-[11px] text-white/55">
              {lineItemsForDisplay.length} new · {ownedLineItems.length} already owned
            </p>
          ) : null}
        </header>
        <div className="space-y-2">
          {lineItemsForDisplay.length === 0 && ownedLineItems.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-white/55">
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
      </GlassCard>
      )}

      {/* Part 7 — Coupon input card (server-validated, with verified savings).
          Hidden entirely for free / ₹0-payable orders. */}
      {showCouponCard ? (
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
      ) : null}

      {/* Price section */}
      <GlassCard data-checkout-price-section>
        <header className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-white/55">Price breakdown</h2>
          <p className="text-[10px] text-white/55">GST inclusive</p>
        </header>
        <dl className="space-y-1.5 text-sm">
          <PriceRow label="Regular subtotal" value={regularSubtotal} />
          {saleDiscount > 0 ? (
            <PriceRow label="Sale discount" value={-saleDiscount} negative />
          ) : null}
          {couponDiscount > 0 ? (
            <PriceRow
              label={`${quote.couponIsReferral ? "Referral discount" : "Coupon discount"}${quote.couponCode ? ` (${quote.couponCode})` : ""}`}
              value={-couponDiscount}
              negative
            />
          ) : null}
          {minimumPayable > 0 ? (
            <PriceRow label="Minimum payable" value={minimumPayable} muted />
          ) : null}
        </dl>
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-black text-white">Final total</span>
            <span className="text-2xl font-black text-white sm:text-3xl">{formatRupee(finalTotal)}</span>
          </div>
          <p className="mt-1 text-[11px] text-white/55">Payable amount is the maximum of cash-payable and minimum-payable floors.</p>
        </div>
      </GlassCard>

      {/* Selection details */}
      {showDetails ? (
        <GlassCard data-checkout-selection-details>
          <header className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-white/55">Selection details</h2>
            <button
              type="button"
              onClick={() => setShowDetails(false)}
              className="text-[11px] font-bold text-white/55 hover:text-white/85"
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
                <div className="rounded-2xl bg-violet-500/15 p-3 ring-1 ring-violet-400/30">
                  <p className="text-xs font-black uppercase tracking-wider text-violet-200">New content included</p>
                  <ul className="mt-2 space-y-1.5">{updateLines.flatMap((line) => line.detailItems || []).map((item) => <li key={item} className="flex items-center gap-2 text-xs font-semibold text-violet-200"><BadgeCheck size={12} className="shrink-0" />{item}</li>)}</ul>
                  <p className="mt-2 text-[10px] text-violet-300">Your existing course stays owned; this checkout adds only the listed upgrade content.</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {kind === "subscription" || kind === "subscription_features" ? (
            <div className="space-y-3">
              {quote.subscriptionAddOn ? (
                <div className="flex items-start gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 p-3 text-xs font-semibold leading-5 text-emerald-200">
                  <span aria-hidden="true">⬆️</span>
                  <span>
                    Upgrading your current membership — you are only charged for
                    the new add-ons below. Your plan, billing cycle and expiry
                    date stay exactly as they are.
                  </span>
                </div>
              ) : (
                <SelectionList title="Subscription plan" emptyLabel="Plan details unavailable." lines={subscriptionPlanLines} />
              )}
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
        </GlassCard>
      ) : (
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/75 hover:bg-white/[0.06]"
        >
          Show selection details
        </button>
      )}

      {/* Refresh banner */}
      {showError ? (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/15 p-3 text-xs text-amber-200 sm:text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-black">We couldn't refresh the price.</p>
            <p className="mt-0.5 text-amber-200">{checkout.errorMessage || "Please try again, or edit the selection."}</p>
          </div>
          <button
            type="button"
            onClick={() => void checkout.refresh()}
            className="text-amber-200 underline"
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
          disabled={showLoading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-4 text-base font-black text-white shadow-lg transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {showLoading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ShoppingBag className="h-5 w-5" />}
          {finalTotal === 0 ? "Get free access" : `Proceed to payment — ${formatRupee(finalTotal)}`}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={checkout.goBack}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-white/[0.06] py-3 text-sm font-bold text-white/85"
          >
            <ArrowLeft size={14} /> Back to source
          </button>
          <button
            type="button"
            onClick={() => void checkout.refresh()}
            disabled={showLoading}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-white/[0.06] py-3 text-sm font-bold text-white/85 disabled:opacity-60"
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
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-bold text-white/85"
        >
          Edit selection <ChevronRight size={14} />
        </button>
        <p className="px-1 text-center text-[10px] font-medium text-white/55">
          Quote expires at {new Date(quote.expiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · Prices are verified server-side before payment.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscription "What you'll get" card. Rendered ONLY for subscription /
// subscription_features checkouts. Every row is derived from the verified
// quote for the exact plan / cycle / features / products the buyer selected
// on the subscription page — there is no fixed copy. The optional catalog
// fetch only enriches names + descriptions; the server stays the authority
// for pricing and activation.
// ---------------------------------------------------------------------------
// Display-only fallbacks used when the live subscription catalog cannot be
// reached from the checkout page (names are otherwise resolved server-side
// in the quote line items or from the catalog endpoint).
const FALLBACK_PLAN_NAMES: Record<string, string> = {
  basic: "Basic",
  premium: "Premium",
  pro: "Pro",
};
const FALLBACK_FEATURE_NAMES: Record<string, string> = {
  "my-day": "My Day cloud saving",
  revision: "Revision Studio",
};

export function SubscriptionUnlocksCard({
  quote,
  products: catalogProducts = [],
}: {
  quote: ServerPriceQuote;
  products?: Array<{ id: string; documentId?: string; title: string }>;
}) {
  const [catalog, setCatalog] = useState<{
    plans: Array<{ id: string; name: string; description: string }>;
    features: Array<{ id: string; name: string; description: string }>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/subscription-catalog", { headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { ok?: boolean; catalog?: { plans?: unknown; features?: unknown } } | null) => {
        if (cancelled || !data || !data.ok || !data.catalog) return;
        setCatalog({
          plans: (Array.isArray(data.catalog.plans) ? data.catalog.plans : [])
            .map((plan) => {
              const raw = plan as { id?: unknown; name?: unknown; description?: unknown };
              return {
                id: String(raw.id || ""),
                name: String(raw.name || ""),
                description: String(raw.description || ""),
              };
            })
            .filter((plan) => plan.id),
          features: (Array.isArray(data.catalog.features) ? data.catalog.features : [])
            .map((feature) => {
              const raw = feature as { id?: unknown; name?: unknown; description?: unknown };
              return {
                id: String(raw.id || ""),
                name: String(raw.name || ""),
                description: String(raw.description || ""),
              };
            })
            .filter((feature) => feature.id),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const lineItems: CheckoutLineItem[] = Array.isArray(quote.verifiedLineItems)
    ? quote.verifiedLineItems
    : [];
  const planId = String(quote.subscriptionPlanId || "");
  const planLine = lineItems.find((line) => line.kind === "subscription") || null;
  const catalogPlan = catalog?.plans.find((plan) => plan.id === planId) || null;
  const planName =
    catalogPlan?.name ||
    planLine?.title ||
    FALLBACK_PLAN_NAMES[planId] ||
    planId ||
    "Subscription plan";
  const planDescription = catalogPlan?.description || planLine?.parentTitle || "";
  const cycleLabel = quote.subscriptionCycle === "yearly"
    ? "Yearly"
    : quote.subscriptionCycle === "monthly"
      ? "Monthly"
      : null;
  const expiresAt = Number(quote.subscriptionExpiresAt || 0);
  const expiryLabel = expiresAt > 0
    ? new Date(expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "";

  // Features. `subscriptionFeatureIds` is the authoritative selected list and
  // includes plan-included / free features that produce no priced line item —
  // exactly the features the buyer will unlock after payment.
  const pricedLineByFeature = new Map<string, CheckoutLineItem>();
  for (const line of lineItems) {
    if (line.featureId && !pricedLineByFeature.has(String(line.featureId))) {
      pricedLineByFeature.set(String(line.featureId), line);
    }
  }
  const featureIds = Array.isArray(quote.subscriptionFeatureIds)
    ? quote.subscriptionFeatureIds.map(String).filter(Boolean)
    : [];
  const featureRows = featureIds.map((id) => {
    const pricedLine = pricedLineByFeature.get(id) || null;
    const catalogFeature = catalog?.features.find((feature) => feature.id === id) || null;
    return {
      id,
      name: catalogFeature?.name || pricedLine?.title || FALLBACK_FEATURE_NAMES[id] || id,
      description: catalogFeature?.description || "",
      pricePaise: pricedLine ? pricedLine.effectivePrice : null,
      included: !pricedLine,
      // Feature already unlocked by the current membership — carried over at
      // ₹0, never billed again (renewal / plan change).
      alreadyOwned: Boolean(pricedLine && pricedLine.alreadyOwned),
    };
  });

  // Products. Selected bonus products and plan-included unlocks arrive as
  // verified line items with server-resolved titles, so the checkout page
  // always mirrors the exact products the buyer picked on the subscription
  // page (and how many).
  const productNameFor = (id: string, fallback: string): string => {
    const match = catalogProducts.find(
      (product) =>
        String(product.id) === id ||
        (product.documentId ? String(product.documentId) === id : false),
    );
    return match?.title || fallback;
  };
  const selectedProductLines = lineItems.filter(
    (line) =>
      line.kind === "subscription_features" &&
      Boolean(line.productId) &&
      !line.featureId &&
      !/^Plan unlock:/.test(line.title || ""),
  );
  const planUnlockLines = lineItems.filter(
    (line) =>
      line.kind === "subscription_features" &&
      Boolean(line.productId) &&
      !line.featureId &&
      /^Plan unlock:/.test(line.title || ""),
  );
  const selectedProductRows = selectedProductLines.map((line) => ({
    id: `product:${String(line.productId || line.id)}`,
    name: productNameFor(String(line.productId || ""), line.title || "Bonus product"),
    pricePaise: line.effectivePrice,
    alreadyOwned: Boolean(line.alreadyOwned),
  }));
  const planUnlockRows = planUnlockLines.map((line) => ({
    id: `unlock:${String(line.productId || line.id)}`,
    name: productNameFor(
      String(line.productId || ""),
      String(line.title || "").replace(/^Plan unlock:\s*/i, ""),
    ),
  }));

  const featureLabel = (row: { included: boolean; pricePaise: number | null; alreadyOwned?: boolean }): string => {
    if (row.alreadyOwned) return "Already purchased — no charge";
    if (!row.included && typeof row.pricePaise === "number") return formatRupee(row.pricePaise);
    return quote.subscriptionAddOn ? "Already in your membership" : "Included with plan";
  };

  return (
    <GlassCard data-checkout-subscription-unlocks>
      <header className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-600 text-white">
          <Unlock size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black text-white">What you&apos;ll get</h2>
          <p className="text-[11px] text-white/55">Unlocks after your payment is verified.</p>
        </div>
        <span className="shrink-0 rounded-full bg-violet-500/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-200">
          {cycleLabel ? `${cycleLabel} membership` : "Membership"}
        </span>
      </header>

      {/* Membership row */}
      <div className="mt-3 rounded-2xl border border-violet-400/30 bg-white/[0.08] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-white" data-checkout-subscription-plan-name>
              {planName}
            </p>
            {planDescription ? (
              <p className="mt-0.5 text-[11px] leading-relaxed text-white/55">{planDescription}</p>
            ) : null}
          </div>
          {quote.subscriptionAddOn ? (
            <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-200">
              Add-on
            </span>
          ) : null}
        </div>
        {expiryLabel ? (
          <p
            data-checkout-subscription-expiry
            className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-violet-200"
          >
            <CalendarDays size={12} />
            {quote.subscriptionAddOn
              ? `Your current expiry stays unchanged — ${expiryLabel}`
              : `Access until ${expiryLabel}`}
          </p>
        ) : null}
      </div>

      {/* Features unlocked */}
      <div className="mt-3">
        <h3
          className="text-[11px] font-black uppercase tracking-wider text-white/55"
          data-checkout-subscription-features-count={featureRows.length}
        >
          Features ({featureRows.length})
        </h3>
        {featureRows.length === 0 ? (
          <p className="mt-1.5 text-xs italic text-white/55">No features in this selection.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {featureRows.map((row) => (
              <li
                key={`feature:${row.id}`}
                data-checkout-subscription-feature={row.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-white">{row.name}</p>
                  {row.description ? (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-white/55">{row.description}</p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                    row.included || row.alreadyOwned ? "bg-emerald-500/20 text-emerald-200" : "bg-violet-500/20 text-violet-200"
                  }`}
                >
                  {featureLabel(row)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Products included */}
      <div className="mt-3">
        <h3
          className="text-[11px] font-black uppercase tracking-wider text-white/55"
          data-checkout-subscription-products-count={selectedProductRows.length}
        >
          Products ({selectedProductRows.length}{planUnlockRows.length > 0 ? ` + ${planUnlockRows.length} included` : ""})
        </h3>
        {selectedProductRows.length === 0 && planUnlockRows.length === 0 ? (
          <p className="mt-1.5 text-xs italic text-white/55">No products in this selection.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {selectedProductRows.map((row) => (
              <li
                key={row.id}
                data-checkout-subscription-product={row.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-2.5"
              >
                <span className="min-w-0 flex-1 text-xs font-bold text-white/85">{row.name}</span>
                {row.alreadyOwned ? (
                  <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-200">
                    Already purchased
                  </span>
                ) : (
                  <span className="shrink-0 text-xs font-black text-violet-200">{formatRupee(row.pricePaise)}</span>
                )}
              </li>
            ))}
            {planUnlockRows.map((row) => (
              <li
                key={row.id}
                data-checkout-subscription-plan-unlock={row.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 p-2.5"
              >
                <span className="min-w-0 flex-1 text-xs font-bold text-emerald-200">{row.name}</span>
                <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-200">
                  Included with plan
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-white/55">
        This list matches the plan, features and products you selected on the
        subscription page. Renewal always requires your confirmation.
      </p>
    </GlassCard>
  );
}

function BuyerCard({ buyer, authUid }: { buyer: ReturnType<typeof useCheckout>["buyer"]; authUid?: string }) {
  if (!buyer) {
    return (
      <GlassCard data-checkout-buyer className="text-sm text-amber-200">
        <p className="font-black">Buyer identity missing</p>
        <p className="mt-0.5 text-xs text-amber-200">Please sign in again to load the verified buyer details.</p>
      </GlassCard>
    );
  }
  const verified = buyer.tokenVerified && (!authUid || authUid === buyer.uid);
  return (
    <GlassCard data-checkout-buyer>
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-wider text-white/55">Buyer</h2>
        <span
          data-firebase-verified={verified ? "true" : "false"}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${
            verified ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30" : "bg-amber-500/15 text-amber-200 ring-amber-400/30"
          }`}
        >
          {verified ? <ShieldCheck size={10} /> : <Info size={10} />}
          {verified ? "Firebase verified" : "Verification pending"}
        </span>
      </header>
      <div className="space-y-1 text-sm">
        <p className="truncate text-base font-black text-white">{buyer.name || "Unnamed buyer"}</p>
        <p className="truncate text-xs text-white/55">{buyer.email || "No email on file"}</p>
        {buyer.mobile ? <p className="truncate text-xs text-white/55">📱 {buyer.mobile}</p> : null}
        <p className="truncate text-[11px] text-white/55">UID: {buyer.uid}</p>
      </div>
    </GlassCard>
  );
}

function PriceRow({ label, value, negative, muted, note }: { label: string; value: number; negative?: boolean; muted?: boolean; note?: string }) {
  const display = negative ? `− ${formatRupee(Math.abs(value))}` : formatRupee(value);
  return (
    <div className="flex items-baseline justify-between">
      <dt className={muted ? "text-xs text-white/55" : "text-sm text-white/55"}>
        {label}
        {note ? <span className="ml-1 text-[10px] text-white/55">{note}</span> : null}
      </dt>
      <dd className={`font-bold ${negative ? "text-emerald-300" : muted ? "text-white/55" : "text-white/85"}`}>{display}</dd>
    </div>
  );
}

function SelectionList({ title, emptyLabel, lines }: { title: string; emptyLabel: string; lines: CheckoutLineItem[] }) {
  if (lines.length === 0) {
    return (
      <div>
        <h3 className="text-xs font-bold text-white/55">{title}</h3>
        <p className="mt-1 text-xs italic text-white/55">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-xs font-bold text-white/55">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {lines.map((line) => (
          <li key={line.id} className="flex items-start gap-2 text-xs text-white/85">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
            <span className="min-w-0 flex-1">
              <span className="font-bold text-white line-clamp-1">{line.title}</span>
              {line.parentTitle ? <span className="ml-1 text-white/55">· {line.parentTitle}</span> : null}
            </span>
            <span className="shrink-0 font-bold text-white">{formatRupee(line.effectivePrice)}</span>
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
    <GlassCard data-checkout-recovery-ui className="text-sm text-amber-100">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
        <div className="flex-1">
          <h2 className="text-base font-black text-amber-200">{title}</h2>
          <p className="mt-1 text-xs text-amber-200 sm:text-sm">{detail}</p>
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
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white/[0.08] py-3 text-sm font-bold text-amber-200 ring-1 ring-amber-400/30 disabled:opacity-60"
          >
            {refreshPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw size={14} />}
            Try again
          </button>
        ) : null}
      </div>
    </GlassCard>
  );
}

function LoadingShell({ message }: { message: string }) {
  return (
    <GlassCard data-checkout-loading className="text-center text-sm text-white/70">
      <div className="flex flex-col items-center gap-3">
        <LoaderCircle className="h-6 w-6 animate-spin text-violet-300" />
        <p className="font-semibold">{message}</p>
      </div>
    </GlassCard>
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
    <GlassCard data-checkout-coupon data-applied={isApplied ? "true" : "false"}>
      <header className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-white/55">
          <TicketPercent size={12} /> Coupon
        </h2>
        {isApplied ? (
          <span
            data-checkout-coupon-applied
            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30"
          >
            <BadgeCheck size={10} /> Verified savings
          </span>
        ) : null}
      </header>

      {isApplied ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-emerald-500/15 p-2.5 ring-1 ring-emerald-400/30">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-emerald-200">
              {appliedCode}
              {appliedType === "percent" && appliedValue !== null
                ? ` (${appliedValue}% off)`
                : appliedType === "flat" && appliedValue !== null
                  ? ` (${formatRupee(appliedValue)} off)`
                  : ""}
            </p>
            <p className="text-[11px] text-emerald-200">
              You saved {formatRupee(appliedDiscount)} on this order.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRemove()}
            disabled={disabled || applying}
            className="shrink-0 rounded-xl bg-white/[0.08] px-3 py-2 text-xs font-bold text-emerald-200 ring-1 ring-emerald-400/30 transition active:scale-[0.98] disabled:opacity-60"
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
              className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-white placeholder:font-normal placeholder:tracking-normal placeholder:text-white/55 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={applying || disabled || !input.trim()}
              data-checkout-coupon-apply
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {applying ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Apply"}
            </button>
          </div>
          {errorMessage && status === "error" ? (
            <p
              data-checkout-coupon-error
              role="alert"
              className="flex items-start gap-1.5 rounded-xl bg-rose-500/15 px-3 py-2 text-[11px] font-semibold leading-5 text-rose-200"
            >
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              {errorMessage}
            </p>
          ) : (
            <p className="px-1 text-[10px] font-medium text-white/55">
              Coupons are validated server-side; the discount appears in your price breakdown once applied.
            </p>
          )}
        </form>
      )}
    </GlassCard>
  );
}

export { RESOURCE_TYPE_LABEL };
