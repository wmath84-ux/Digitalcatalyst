// src/components/checkout/CheckoutReviewStep.tsx
//
// Plain, quote-driven review: buyer identity, individually named items, real
// price / coupon reductions, payable and minimum rules, selection details,
// membership scope / expiry, and safe refresh / failure recovery. Financial
// amounts and access claims come from the verified server quote.

import { useEffect, useId, useMemo, useState } from "react";
import CheckoutSection, { CheckoutAction, formatCheckoutMoney } from "./CheckoutSection";
import { PaymentButton } from "../ui/PaymentButton";
import { AlertCircle, ArrowLeft, ChevronRight, LoaderCircle, RefreshCw } from "lucide-react";
import { useCheckout } from "../../checkout/CheckoutContext";
import { useAuth } from "../../context/AuthContext";
import { useCatalog } from "../../context/CatalogContext";
import { apiFetch } from "../../utils/apiBase";
import type { CheckoutLineItem, ServerPriceQuote } from "../../types/commerce";
import CheckoutLineItemCard from "./CheckoutLineItemCard";
import {
  subscriptionProductFor,
  subscriptionUnlockName,
  type SubscriptionDisplayProduct,
} from "../../subscription/utils/unlockPresentation";
import { payableBeforeCouponPaise, shouldShowCouponInput } from "../../../utils/couponVisibility";

const formatRupee = formatCheckoutMoney;

export const PURCHASE_TYPE_LABEL: Record<string, string> = {
  full_product: "Full course",
  selected_modules: "Selected modules",
  selected_resources: "Selected resources",
  cart_bundle: "Cart bundle",
  paid_update: "Paid update",
  free_entitlement: "Free entitlement",
  subscription: "Subscription plan",
  subscription_features: "Subscription add-on",
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

export default function CheckoutReviewStep({
  onProceed,
  onEdit,
}: {
  onProceed: () => void;
  onEdit: () => void;
}) {
  const checkout = useCheckout();
  const { user } = useAuth();
  const { products: catalogProducts } = useCatalog();
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [expiryClock, setExpiryClock] = useState(() => Date.now());
  useEffect(() => {
    const expiresAt = checkout.quote?.expiresAt;
    if (!expiresAt || expiresAt <= Date.now()) return;
    const timer = window.setTimeout(
      () => setExpiryClock(Date.now()),
      Math.min(2147483647, expiresAt - Date.now() + 20)
    );
    return () => window.clearTimeout(timer);
  }, [checkout.quote?.expiresAt]);

  const kind = checkout.selection?.purchaseKind || "";
  const isSubscriptionPurchase = kind === "subscription" || kind === "subscription_features";
  const purchaseTypeLabel = PURCHASE_TYPE_LABEL[kind] || "Checkout";

  const lineItems: CheckoutLineItem[] = checkout.quote?.verifiedLineItems || [];
  const lineItemsForDisplay = useMemo(
    () => lineItems.filter((line) => !line.alreadyOwned),
    [lineItems]
  );
  const ownedLineItems = useMemo(() => lineItems.filter((line) => line.alreadyOwned), [lineItems]);

  const showLoading =
    checkout.status === "loading" ||
    checkout.quoteStatus === "loading" ||
    checkout.quoteStatus === "refreshing";
  const showInvalid = checkout.status === "invalid";
  const showError = checkout.status === "needs_refresh" || checkout.status === "error";
  const showEmpty = checkout.status === "empty" && !showLoading;

  if (showEmpty) {
    return (
      <SafeRecoveryUI
        kind="empty"
        onGoBack={checkout.goBack}
        onRefresh={checkout.refresh}
        refreshPending={false}
      />
    );
  }
  if (showInvalid) {
    return (
      <SafeRecoveryUI
        kind="invalid"
        reason={checkout.errorMessage}
        onGoBack={checkout.goBack}
        onRefresh={checkout.refresh}
        refreshPending={false}
      />
    );
  }
  if (showError && !checkout.quote) {
    return (
      <SafeRecoveryUI
        kind="error"
        reason={checkout.errorMessage}
        onGoBack={checkout.goBack}
        onRefresh={checkout.refresh}
        refreshPending={false}
      />
    );
  }
  if (showLoading && !checkout.quote) {
    return <LoadingShell message="Loading server-verified price quote…" />;
  }

  const quote = checkout.quote;
  if (!quote || !checkout.selection) {
    return (
      <SafeRecoveryUI
        kind="error"
        reason={checkout.errorMessage}
        onGoBack={checkout.goBack}
        onRefresh={checkout.refresh}
        refreshPending={false}
      />
    );
  }

  const regularSubtotal = quote.regularSubtotal || 0;
  const saleDiscount = quote.saleDiscount || 0;
  const couponDiscount = quote.couponDiscount || 0;
  const cashPayable = quote.cashPayable || 0;
  const minimumPayable = quote.minimumPayable || 0;
  const finalTotal = cashPayable;
  const quoteExpired =
    quote.expiresAt <= Math.max(expiryClock, Date.now()) ||
    (quote.status && quote.status !== "active");
  const paymentBlocked =
    showLoading || showError || Boolean(quoteExpired) || checkout.status !== "ready";

  // Selection details: derive from the verified line items (which carry the
  // canonical product/module/resource/update hierarchy via `parentTitle`).
  const moduleLines = lineItemsForDisplay.filter((line) => line.kind === "selected_modules");
  const resourceLines = lineItemsForDisplay.filter((line) => line.kind === "selected_resources");
  const updateLines = lineItemsForDisplay.filter((line) => line.kind === "paid_update");
  const subscriptionPlanLines = lineItemsForDisplay.filter((line) => line.kind === "subscription");
  const subscriptionAddonLines = lineItemsForDisplay.filter(
    (line) => line.kind === "subscription_features"
  );
  const productLines = lineItemsForDisplay.filter(
    (line) =>
      line.kind === "full_product" ||
      line.kind === "cart_bundle" ||
      line.kind === "free_entitlement"
  );

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
      <div className="flex flex-wrap items-center gap-2" data-checkout-review-head>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-black text-indigo-200">
          {purchaseTypeLabel}
        </span>
        <span className="dc-checkout-note">Server-verified pricing</span>
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
        <CheckoutSection data-checkout-line-items>
          <header className="mb-2 flex items-center justify-between">
            <h2 className="dc-section-label">
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
              <CheckoutLineItemCard minimal key={line.id} line={line} />
            ))}
            {ownedLineItems.map((line) => (
              <CheckoutLineItemCard minimal key={line.id} line={line} />
            ))}
          </div>
        </CheckoutSection>
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
      <CheckoutSection data-checkout-price-section>
        <header className="mb-2 flex items-center justify-between">
          <h2 className="dc-section-label">Price breakdown</h2>
          <p className="text-[10px] dc-ink-3">GST inclusive</p>
        </header>
        <dl className="space-y-1.5 text-sm">
          {/* Anchoring: the pre-discount subtotal is the quiet reference the
              final total is judged against. */}
          <PriceRow label="Regular subtotal" value={regularSubtotal} />
          {saleDiscount > 0 ? (
            <PriceRow label="Sale discount" value={-saleDiscount} negative />
          ) : null}
          {couponDiscount > 0 ? (
            <PriceRow
              label={`${quote.couponIsReferral ? "Referral discount" : "Coupon discount"}${
                quote.couponCode ? ` (${quote.couponCode})` : ""
              }`}
              value={-couponDiscount}
              negative
            />
          ) : null}
          {minimumPayable > 0 ? (
            <PriceRow label="Minimum payable" value={minimumPayable} muted />
          ) : null}
        </dl>
        <div className="dc-checkout-total">
          <span>Final total</span>
          <strong data-checkout-final-total>{formatRupee(finalTotal)}</strong>
        </div>
        {regularSubtotal - finalTotal > 0 ? (
          <p className="dc-checkout-note">You save {formatRupee(regularSubtotal - finalTotal)}.</p>
        ) : null}
        <p className="dc-checkout-note">
          The payable is verified server-side. Any change requires a fresh quote.
        </p>
      </CheckoutSection>

      {/* Selection details */}
      {showDetails ? (
        <CheckoutSection data-checkout-selection-details>
          <header className="mb-2 flex items-center justify-between">
            <h2 className="dc-section-label">Selection details</h2>
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
                  <p className="text-xs font-black uppercase tracking-wider text-violet-200">
                    New content included
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {updateLines
                      .flatMap((line) => line.detailItems || [])
                      .map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-2 text-xs font-semibold text-violet-200"
                        >
                          {item}
                        </li>
                      ))}
                  </ul>
                  <p className="mt-2 text-[10px] text-violet-300">
                    Your existing course stays owned; this checkout adds only the listed upgrade
                    content.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
          {kind === "subscription" || kind === "subscription_features" ? (
            <div className="space-y-3">
              {quote.subscriptionAddOn ? (
                <div className="flex items-start gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 p-3 text-xs font-semibold leading-5 text-emerald-200">
                  <span>
                    Upgrading your current membership — you are only charged for the new add-ons
                    below. Your plan, billing cycle and expiry date stay exactly as they are.
                  </span>
                </div>
              ) : (
                <SelectionList
                  title="Subscription plan"
                  emptyLabel="Plan details unavailable."
                  lines={subscriptionPlanLines}
                />
              )}
              <SelectionList
                title={`Included add-ons & products (${subscriptionAddonLines.length})`}
                emptyLabel="No optional add-ons selected."
                lines={subscriptionAddonLines}
              />
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
        </CheckoutSection>
      ) : (
        <CheckoutAction
          variant="capsule"
          type="button"
          onClick={() => setShowDetails(true)}
          className="[&>span>div]:h-9 [&>span>div]:px-4 [&>span>div]:text-xs [&>span>div]:font-bold"
          data-checkout-selection-toggle
        >
          Show selection details
        </CheckoutAction>
      )}

      {/* Refresh banner */}
      {showError || quoteExpired ? (
        <div
          className="flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/15 p-3 text-xs text-amber-200 sm:text-sm"
          data-checkout-review-notice
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-black">
              {quoteExpired ? "Price quote expired" : "Price could not be refreshed"}
            </p>
            <p className="mt-0.5 text-amber-200">
              {checkout.errorMessage || "Please try again, or edit the selection."}
            </p>
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
        {/* The checkout CTA is the app's one payment button (Uiverse
            pretty-grasshopper-57 port) — same handler, same quote, same
            disabled-until-the-quote-settles rule. The label stays
            contextual: a ₹0 order still says "Get free access". */}
        <PaymentButton
          block
          size="lg"
          loading={showLoading}
          disabled={paymentBlocked}
          icon={null}
          className="dc-checkout-primary"
          onClick={onProceed}
          data-checkout-proceed=""
          label={finalTotal === 0 ? "Continue to free access" : "Continue to payment"}
        />
        {/* Transparency bias, placed at the exact point of commitment. */}
        <p className="dc-checkout-note">
          {finalTotal === 0
            ? "No card needed. Access unlocks after the server confirms this order."
            : "Razorpay secure checkout · nothing is charged until you confirm."}
        </p>
        {!showError && !quoteExpired ? (
          <div>
            <CheckoutAction
              variant="capsule"
              type="button"
              onClick={() => void checkout.refresh()}
              disabled={showLoading}
              className="w-full [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:px-3 [&>span>div]:font-bold disabled:opacity-60"
            >
              <span className="flex items-center gap-1.5">
                {showLoading && checkout.quoteStatus === "refreshing" ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Refresh quote
              </span>
            </CheckoutAction>
          </div>
        ) : null}
        <CheckoutAction
          variant="capsule"
          type="button"
          onClick={onEdit}
          className="w-full [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:font-bold"
        >
          <span className="flex items-center gap-1.5">
            Edit selection <ChevronRight size={14} />
          </span>
        </CheckoutAction>
        <p className="dc-checkout-note">
          Quote expires at{" "}
          {new Date(quote.expiresAt).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · Prices are verified server-side before payment.
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
  revision: "Roman AI Pro",
};

export function SubscriptionUnlocksCard({
  quote,
  products: catalogProducts = [],
  receipt = false,
}: {
  quote: ServerPriceQuote;
  products?: readonly SubscriptionDisplayProduct[];
  receipt?: boolean;
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
    planLine?.title?.replace(/\s*\((Monthly|Yearly)\)$/i, "") ||
    catalogPlan?.name ||
    FALLBACK_PLAN_NAMES[planId] ||
    planId ||
    "Subscription plan";
  const planDescription = planLine?.parentTitle || catalogPlan?.description || "";
  const cycleLabel =
    quote.subscriptionCycle === "yearly"
      ? "Yearly"
      : quote.subscriptionCycle === "monthly"
      ? "Monthly"
      : null;
  const expiresAt = Number(quote.subscriptionExpiresAt || 0);
  const expiryLabel =
    expiresAt > 0
      ? new Date(expiresAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
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
      name: pricedLine?.title || catalogFeature?.name || FALLBACK_FEATURE_NAMES[id] || id,
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
  const isPlanUnlock = (line: CheckoutLineItem) =>
    /^subscription_unlock:/.test(line.id) ||
    /^subscription_(product|module)_unlock:/.test(line.entitlementId || "") ||
    /^Plan unlock:/.test(line.title || "");
  const productLines = lineItems.filter(
    (line) =>
      line.kind === "subscription_features" &&
      Boolean(line.productId) &&
      !line.featureId &&
      !line.moduleId
  );
  const selectedProductRows = productLines
    .filter((line) => !isPlanUnlock(line))
    .map((line) => ({
      id: `product:${line.id}`,
      name: subscriptionUnlockName(catalogProducts, String(line.productId || ""), null, line.title),
      pricePaise: line.effectivePrice,
      alreadyOwned: Boolean(line.alreadyOwned),
    }));
  const planUnlockRows = productLines.filter(isPlanUnlock).map((line) => ({
    id: `unlock:${line.id}`,
    name: subscriptionUnlockName(catalogProducts, String(line.productId || ""), null, line.title),
  }));
  // A module grant is partial access, not an unlock of the whole parent course.
  const moduleRows = lineItems
    .filter(
      (line) =>
        line.kind === "subscription_features" && Boolean(line.productId) && Boolean(line.moduleId)
    )
    .map((line) => ({
      id: line.id,
      name: subscriptionUnlockName(
        catalogProducts,
        String(line.productId),
        line.moduleId,
        line.title
      ),
      productTitle:
        line.parentTitle && line.parentTitle !== planName && line.parentTitle !== catalogPlan?.name
          ? line.parentTitle
          : subscriptionProductFor(catalogProducts, String(line.productId))?.title ||
            String(line.productId),
      pricePaise: line.effectivePrice,
      alreadyOwned: Boolean(line.alreadyOwned),
    }));

  return (
    <CheckoutSection data-checkout-subscription-unlocks>
      <h2>{receipt ? "Membership" : "What you'll get"}</h2>
      <div className="dc-checkout-item" data-checkout-subscription-plan-name>
        <div className="dc-checkout-item-copy">
          <h3>{planName}</h3>
          {planDescription ? <p className="dc-checkout-note">{planDescription}</p> : null}
          <p className="dc-checkout-note">
            {cycleLabel ? `${cycleLabel} membership` : "Membership"}
            {quote.subscriptionAddOn ? " · Plan already paid" : ""}
          </p>
        </div>
        <strong className="dc-checkout-item-price">
          {quote.subscriptionAddOn
            ? "₹0"
            : planLine
            ? formatRupee(planLine.effectivePrice)
            : "Included in total"}
        </strong>
      </div>
      {expiryLabel ? (
        <p data-checkout-subscription-expiry className="dc-checkout-note">
          {quote.subscriptionAddOn
            ? `Your current expiry stays unchanged — ${expiryLabel}`
            : `Access until ${expiryLabel}`}
        </p>
      ) : null}
      <h3 className="mt-4" data-checkout-subscription-features-count={featureRows.length}>
        Features ({featureRows.length})
      </h3>
      {featureRows.length ? (
        <ul>
          {featureRows.map((row) => (
            <li
              key={row.id}
              data-checkout-subscription-feature={row.id}
              className="dc-checkout-item"
            >
              <div className="dc-checkout-item-copy">
                <h3>{row.name}</h3>
                {row.description ? <p className="dc-checkout-note">{row.description}</p> : null}
                {row.alreadyOwned ? (
                  <p className="dc-checkout-note">Already purchased · No charge</p>
                ) : row.included ? (
                  <p className="dc-checkout-note">
                    {quote.subscriptionAddOn ? "Already in your membership" : "Included with plan"}
                  </p>
                ) : null}
              </div>
              <strong className="dc-checkout-item-price">
                {formatRupee(row.alreadyOwned ? 0 : row.pricePaise || 0)}
              </strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dc-checkout-note">No features in this selection.</p>
      )}
      <h3 className="mt-4" data-checkout-subscription-products-count={selectedProductRows.length}>
        Products ({selectedProductRows.length}
        {planUnlockRows.length ? ` + ${planUnlockRows.length} included` : ""})
      </h3>
      {selectedProductRows.length || planUnlockRows.length ? (
        <ul>
          {selectedProductRows.map((row) => (
            <li
              key={row.id}
              data-checkout-subscription-product={row.id}
              className="dc-checkout-item"
            >
              <div className="dc-checkout-item-copy">
                <h3>{row.name}</h3>
                {row.alreadyOwned ? (
                  <p className="dc-checkout-note">Already purchased · No charge</p>
                ) : null}
              </div>
              <strong className="dc-checkout-item-price">
                {formatRupee(row.alreadyOwned ? 0 : row.pricePaise)}
              </strong>
            </li>
          ))}
          {planUnlockRows.map((row) => (
            <li
              key={row.id}
              data-checkout-subscription-plan-unlock={row.id}
              className="dc-checkout-item"
            >
              <div className="dc-checkout-item-copy">
                <h3>{row.name}</h3>
                <p className="dc-checkout-note">Included with plan</p>
              </div>
              <strong className="dc-checkout-item-price">₹0</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dc-checkout-note">No products in this selection.</p>
      )}
      {moduleRows.length ? (
        <>
          <h3 className="mt-4" data-checkout-subscription-modules-count={moduleRows.length}>
            Modules ({moduleRows.length})
          </h3>
          <ul>
            {moduleRows.map((row) => (
              <li
                key={row.id}
                data-checkout-subscription-module={row.id}
                className="dc-checkout-item"
              >
                <div className="dc-checkout-item-copy">
                  <h3>{row.name}</h3>
                  <p className="dc-checkout-note">Module · {row.productTitle}</p>
                  {row.alreadyOwned ? (
                    <p className="dc-checkout-note">Already purchased · No charge</p>
                  ) : row.pricePaise === 0 ? (
                    <p className="dc-checkout-note">Included with plan</p>
                  ) : null}
                </div>
                <strong className="dc-checkout-item-price">
                  {formatRupee(row.alreadyOwned ? 0 : row.pricePaise)}
                </strong>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="dc-checkout-note">
        {quote.subscriptionAddOn
          ? "Only the new add-ons are charged; your plan, cycle and expiry are unchanged. "
          : ""}
        {receipt
          ? "Access has been confirmed. "
          : "Access unlocks after the server verifies your order. "}
        Renewal always requires your confirmation.
      </p>
    </CheckoutSection>
  );
}

function BuyerCard({
  buyer,
  authUid,
}: {
  buyer: ReturnType<typeof useCheckout>["buyer"];
  authUid?: string;
}) {
  if (!buyer) {
    return (
      <CheckoutSection data-checkout-buyer className="text-sm text-amber-200">
        <p className="font-black">Buyer identity missing</p>
        <p className="mt-0.5 text-xs text-amber-200">
          Please sign in again to load the verified buyer details.
        </p>
      </CheckoutSection>
    );
  }
  const verified = buyer.tokenVerified && (!authUid || authUid === buyer.uid);
  return (
    <CheckoutSection data-checkout-buyer>
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-wider text-white/55">Buyer</h2>
        <span
          data-firebase-verified={verified ? "true" : "false"}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${
            verified
              ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
              : "bg-amber-500/15 text-amber-200 ring-amber-400/30"
          }`}
        >
          {verified ? "Verified buyer" : "Verification pending"}
        </span>
      </header>
      <div className="space-y-1 text-sm">
        <p className="dc-checkout-buyer-name">{buyer.name || "Buyer"}</p>
        <p className="dc-checkout-note">{buyer.email || "No email on file"}</p>
        {buyer.mobile ? <p className="dc-checkout-note">{buyer.mobile}</p> : null}
        <details className="dc-checkout-reference">
          <summary>Buyer reference</summary>
          <p>{buyer.uid}</p>
        </details>
      </div>
    </CheckoutSection>
  );
}

function PriceRow({
  label,
  value,
  negative,
  muted,
  note,
}: {
  label: string;
  value: number;
  negative?: boolean;
  muted?: boolean;
  note?: string;
}) {
  const display = negative ? `− ${formatRupee(Math.abs(value))}` : formatRupee(value);
  return (
    <div className="flex items-baseline justify-between">
      <dt className={muted ? "text-xs text-white/55" : "text-sm text-white/55"}>
        {label}
        {note ? <span className="ml-1 text-[10px] text-white/55">{note}</span> : null}
      </dt>
      <dd
        className={`font-bold ${
          negative ? "text-emerald-300" : muted ? "text-white/55" : "text-white/85"
        }`}
      >
        {display}
      </dd>
    </div>
  );
}

function SelectionList({
  title,
  emptyLabel,
  lines,
}: {
  title: string;
  emptyLabel: string;
  lines: CheckoutLineItem[];
}) {
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
              {line.parentTitle ? (
                <span className="ml-1 text-white/55">· {line.parentTitle}</span>
              ) : null}
            </span>
            <span className="shrink-0 font-bold text-white">
              {formatRupee(line.effectivePrice)}
            </span>
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
  const title =
    kind === "empty"
      ? "No active checkout"
      : kind === "invalid"
      ? "This checkout is no longer available"
      : "We couldn't load the price";
  const detail =
    kind === "empty"
      ? "Start a new checkout from a product or paid update."
      : kind === "invalid"
      ? reason ||
        "The selection was rejected by the server. Please return to the product page and try again."
      : reason || "Network or server error. Please refresh, or return to the product page.";
  return (
    <CheckoutSection data-checkout-recovery-ui className="text-sm text-amber-100">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
        <div className="flex-1">
          <h2 className="text-base font-black text-amber-200">{title}</h2>
          <p className="mt-1 text-xs text-amber-200 sm:text-sm">{detail}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <CheckoutAction
          type="button"
          variant="capsule"
          onClick={onGoBack}
          className="flex-1 [&>span]:w-full [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:rounded-full [&>span>div]:px-4"
        >
          <span className="flex items-center justify-center gap-1.5 text-sm font-bold">
            <ArrowLeft size={14} /> Return to source
          </span>
        </CheckoutAction>
        {kind !== "empty" ? (
          <CheckoutAction
            variant="capsule"
            type="button"
            onClick={onRefresh}
            disabled={refreshPending}
            className="flex-1 [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:font-bold [&>span>div]:text-amber-200 disabled:opacity-60"
          >
            <span className="flex items-center gap-1.5">
              {refreshPending ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Try again
            </span>
          </CheckoutAction>
        ) : null}
      </div>
    </CheckoutSection>
  );
}

function LoadingShell({ message }: { message: string }) {
  return (
    <CheckoutSection data-checkout-loading className="text-center text-sm text-white/70">
      <div className="flex flex-col items-center gap-3">
        <LoaderCircle className="h-6 w-6 animate-spin text-violet-300" />
        <p className="font-semibold">{message}</p>
      </div>
    </CheckoutSection>
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
  const inputId = useId();
  const isApplied = Boolean(appliedCode);
  const applying = status === "applying";
  return (
    <CheckoutSection data-checkout-coupon data-applied={isApplied ? "true" : "false"}>
      <h2>Coupon</h2>
      {isApplied ? (
        <div className="dc-checkout-code-applied">
          <div>
            <strong data-checkout-coupon-applied>{appliedCode}</strong>
            <p className="dc-checkout-note">
              {appliedType === "percent" && appliedValue !== null
                ? `${appliedValue}% code · `
                : appliedType === "flat" && appliedValue !== null
                ? `${formatRupee(appliedValue)} code · `
                : ""}
              Verified reduction: {formatRupee(appliedDiscount)}.
            </p>
          </div>
          <CheckoutAction
            onClick={() => void onRemove()}
            disabled={disabled || applying}
            data-checkout-coupon-remove
          >
            {applying ? "Removing…" : "Remove"}
          </CheckoutAction>
        </div>
      ) : (
        <form
          className="dc-checkout-code-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (input.trim() && !applying && !disabled) void onApply(input.trim());
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Coupon code
          </label>
          <div>
            <input
              id={inputId}
              type="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              value={input}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Enter coupon code"
              disabled={applying || disabled}
              data-checkout-coupon-input
              aria-invalid={status === "error"}
              aria-describedby={errorMessage && status === "error" ? `${inputId}-error` : undefined}
            />
            <CheckoutAction
              type="submit"
              disabled={applying || disabled || !input.trim()}
              data-checkout-coupon-apply
            >
              {applying ? "Applying…" : "Apply"}
            </CheckoutAction>
          </div>
          {errorMessage && status === "error" ? (
            <p
              id={`${inputId}-error`}
              data-checkout-coupon-error
              role="alert"
              className="dc-checkout-error"
            >
              {errorMessage}
            </p>
          ) : (
            <p className="dc-checkout-note">
              Checkout verifies the code for these items. Any reduction appears in the price
              breakdown.
            </p>
          )}
        </form>
      )}
    </CheckoutSection>
  );
}

export { RESOURCE_TYPE_LABEL };
