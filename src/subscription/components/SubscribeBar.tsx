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

import { BadgeCheck, Lock, ShieldCheck, Loader2 } from "lucide-react";
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
                <span className="text-xs font-semibold text-white/55 line-through">
                  {formatRupee(subtotalPaise)}
                </span>
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
      <button
        type="button"
        onClick={onSubscribe}
        disabled={isDisabled}
        data-subscription-subscribe
        data-subscription-cta-tone={cta.tone}
        className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-extrabold transition-transform active:scale-[0.98] disabled:cursor-not-allowed ${
          isOwned
            ? "bg-emerald-600 text-white shadow-lg  disabled:opacity-100"
            : isDowngradeBlocked
              ? "bg-white/[0.12] text-white/55 disabled:opacity-100"
              : "bg-indigo-600 text-white shadow-lg  disabled:opacity-70"
        }`}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Processing…
          </>
        ) : isOwned ? (
          <>
            <BadgeCheck className="h-4 w-4" /> {cta.label}
          </>
        ) : isDowngradeBlocked ? (
          <>
            <Lock className="h-4 w-4" /> {cta.label}
          </>
        ) : (
          cta.label
        )}
      </button>
    </div>
  );
}
