// src/subscription/components/SubscribeBar.tsx
//
// Part 9 — sticky bottom subscribe bar. Uses paise throughout
// (server is the only authority on price math). The previous
// implementation used dollar amounts from a `setTimeout` simulation;
// both are gone.
//
// Duplicate-purchase state: when the selected plan + cycle is the one the
// buyer already owns, the CTA is rendered in emerald and reads "Subscribed"
// instead of "Subscribe via Razorpay", and it is disabled outside the renewal
// window. The label / colour / disabled decision comes from the shared pure
// helper `resolveSubscribeCta`, so the bar can never disagree with the server
// guard that refuses the same order.

import { BadgeCheck, BellRing, Lock, ShieldCheck, XCircle } from "lucide-react";
import { PaymentButton } from "../../components/ui/PaymentButton";
import { resolveSubscribeCta, type SubscriptionSelectionState } from "../../../utils/subscriptionOwnership";

interface Props {
  totalPaise: number;
  subtotalPaise: number;
  couponDiscountPaise: number;
  loading: boolean;
  disabled?: boolean;
  onSubscribe: () => void;
  totalRupees: string;
  /** Ownership verdict for the current plan + cycle selection. */
  ownershipState?: SubscriptionSelectionState | null;
}

/**
 * The reference button carries one colour (`--clr`): the icon plate and the
 * colour that wipes in behind the label. The bar only re-points it where the
 * app already used colour as MEANING — an already-owned plan keeps the
 * emerald-600 identity, a downgrade-blocked selection goes neutral slate so
 * it never reads as purchasable. A purchasable selection passes nothing and
 * gets the Uiverse component's own green, identical to every other pay CTA.
 */
const OWNED_CLAIM_COLOR = "#059669"; /* emerald-600 — "this is active for you" */
const BLOCKED_CLAIM_COLOR = "#64748b"; /* slate — disabled-looking, not buyable */

const formatRupee = (paise: number): string =>
  `₹${Math.max(0, Math.round(paise / 100)).toLocaleString("en-IN")}`;

export default function SubscribeBar({
  totalPaise,
  subtotalPaise,
  couponDiscountPaise,
  loading,
  disabled,
  onSubscribe,
  totalRupees,
  ownershipState = null,
}: Props) {
  const hasDiscount = couponDiscountPaise > 0;
  // "Zero means free": when the admin priced the whole selection at ₹0 the
  // bar shows FREE and the CTA stops advertising a Razorpay payment. The
  // server still re-verifies the ₹0 total before granting anything.
  const isFreeSelection = totalPaise <= 0;
  const cta = resolveSubscribeCta({
    state: ownershipState,
    loading,
    hasPlan: !disabled,
    freeSelection: isFreeSelection,
  });
  const isOwned = cta.owned;
  // A downgrade-blocked selection is neither owned nor purchasable: the bar
  // explains the no-downgrade rule and keeps the CTA firmly disabled.
  const isDowngradeBlocked = cta.tone === "blocked";
  const isDisabled = Boolean(loading || disabled || cta.disabled);

  return (
    <div
      className="sticky bottom-0 z-30 border-t border-white/10 bg-[#0a0c12]/60 px-5 pb-[calc(0.9rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-lg"
      data-subscription-subscribe-bar
      data-subscription-owned={isOwned ? "true" : "false"}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          {isOwned ? (
            <span
              data-subscription-owned-note
              className="text-[13px] font-extrabold text-emerald-200"
            >
              Active on your account
            </span>
          ) : (
            <>
              <span
                data-subscription-total
                data-subscription-free={isFreeSelection ? "true" : undefined}
                className={`text-xl font-extrabold ${isFreeSelection ? "text-emerald-300" : "text-white"}`}
              >
                {isFreeSelection ? "FREE" : totalRupees || formatRupee(totalPaise)}
              </span>
              {hasDiscount ? (
                <>
                  {/* Anchoring: the pre-coupon price is set as the quiet
                      reference next to the loud payable total, and the saving
                      is spelled out in rupees (loss aversion beats "-20%"). */}
                  <span className="text-xs font-semibold dc-anchor-price">
                    {formatRupee(subtotalPaise)}
                  </span>
                  <span className="dc-save-pill">Save {formatRupee(couponDiscountPaise)}</span>
                </>
              ) : null}
            </>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] font-medium text-white/55">
          {isOwned ? (
            <>
              <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" /> Already subscribed
            </>
          ) : (
            <>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> {isFreeSelection ? "No payment needed" : "Secure checkout"}
            </>
          )}
        </div>
      </div>
      {isDowngradeBlocked ? (
        <p
          data-subscription-downgrade-note
          className="mb-2 rounded-xl bg-amber-500/15 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-200 ring-1 ring-amber-400/30"
        >
          {ownershipState?.reason ||
            "This change isn't available while your current membership is active."}
        </p>
      ) : null}
      {/* Transparency bias: before the commitment we state exactly what will
          and will not happen. Removing the "hidden charge" fear is the single
          highest-leverage change on a paywall. */}
      {!isOwned && !isDowngradeBlocked ? (
        <ul data-subscription-transparency className="mb-2.5 flex flex-col gap-1.5" aria-label="What happens next">
          <li className="flex items-center gap-2 text-[11.5px] font-semibold dc-ink-2">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
            {isFreeSelection ? "Access unlocks instantly — nothing to pay." : "Pay once for this cycle — no silent auto-charges."}
          </li>
          <li className="flex items-center gap-2 text-[11.5px] font-semibold dc-ink-2">
            <BellRing className="h-3.5 w-3.5 shrink-0 text-indigo-300" aria-hidden="true" />
            We remind you before the cycle ends, never after.
          </li>
          <li className="flex items-center gap-2 text-[11.5px] font-semibold dc-ink-3">
            <XCircle className="h-3.5 w-3.5 shrink-0 dc-ink-3" aria-hidden="true" />
            Cancel any time from Profile — access stays till the last day.
          </li>
        </ul>
      ) : null}
      {/* The plan CTA is the app-wide payment button (Uiverse
          pretty-grasshopper-57), so it can never drift from the checkout,
          cart or product-page pay button. Business logic is untouched: same
          `onSubscribe`, same `isDisabled`, same `resolveSubscribeCta`
          verdict (label + tone + disabled all still come from the shared
          helper), same ownership data-attributes the server guard is paired
          with. Meaning colour moves onto the reference's own --clr: an
          owned plan paints the plate emerald, a blocked one neutral slate,
          a purchasable one keeps the reference green. */}
      <PaymentButton
        block
        size="md"
        type="button"
        onClick={onSubscribe}
        disabled={isDisabled}
        loading={loading}
        color={
          isOwned
            ? OWNED_CLAIM_COLOR
            : isDowngradeBlocked
              ? BLOCKED_CLAIM_COLOR
              : undefined
        }
        icon={isOwned ? <BadgeCheck size={20} /> : isDowngradeBlocked ? <Lock size={20} /> : undefined}
        label={loading ? "Processing…" : cta.label}
        data-subscription-subscribe=""
        data-subscription-cta-tone={cta.tone}
      />
    </div>
  );
}
