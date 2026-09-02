// src/subscription/components/OwnedPlanCard.tsx
//
// Shown INSTEAD of the buy flow when the plan + cycle the user is currently
// looking at is the exact one they already own.
//
// Before this existed the page kept rendering "Select product" / "Select
// features" / coupon / price summary for a plan the member had already paid
// for, and the bottom bar still said "Subscribe via Razorpay" — so the same
// subscription could be bought twice. This card replaces all of that with a
// single, unambiguous statement of what is already active, what it unlocks,
// and when it can next be renewed.

import { BadgeCheck, CalendarClock, Check, Info, Package, PlusCircle, Sparkles } from "lucide-react";
import { GlassCard } from "../../components/ui/glass-card";
import { GlassButton } from "../../components/ui/glass-button";
import type { OwnedPlanSummary } from "../../../utils/subscriptionOwnership";
import type { SubscriptionFeatureDoc } from "../utils/subscriptionCatalog";

interface Props {
  summary: OwnedPlanSummary<SubscriptionFeatureDoc>;
  expiresAtLabel: string;
  renewalOpensAtLabel: string;
  /** Plans the member does NOT own yet — offered as the way forward. */
  otherPlanNames: string[];
  onSeeOtherPlans: () => void;
  /** Open the pickers so the member can add features / courses to THIS plan. */
  onAddMore?: () => void;
}

export default function OwnedPlanCard({
  summary,
  expiresAtLabel,
  renewalOpensAtLabel,
  otherPlanNames,
  onSeeOtherPlans,
  onAddMore,
}: Props) {
  return (
    <div className="flex flex-col gap-4 px-5 pt-5" data-subscription-owned-plan={summary.planId}>
      {/* Hero — the plan they already own. Emerald throughout so the colour
          alone signals "already yours", never "buy me". */}
      <GlassCard>
        <div className="relative">
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30"
            data-subscription-owned-badge
          >
            <BadgeCheck className="h-3 w-3" /> Already subscribed
          </span>
          <h2 className="mt-2.5 text-2xl font-black leading-tight" data-subscription-owned-plan-name>
            {summary.planName}
          </h2>
          <p className="mt-1 text-xs font-semibold text-white/80" data-subscription-owned-cycle>
            {summary.cycleLabel} plan · active now
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-xl border border-white/15 px-3 py-1.5 text-[11px] font-bold">
              {summary.featureCount} feature{summary.featureCount === 1 ? "" : "s"} unlocked
            </span>
            {summary.productTitles.length > 0 ? (
              <span className="rounded-xl border border-white/15 px-3 py-1.5 text-[11px] font-bold">
                {summary.productTitles.length} course{summary.productTitles.length === 1 ? "" : "s"} included
              </span>
            ) : null}
            {expiresAtLabel ? (
              <span className="rounded-xl border border-white/15 px-3 py-1.5 text-[11px] font-bold">
                {summary.remainingLabel}
              </span>
            ) : null}
          </div>
        </div>
      </GlassCard>

      {/* Why nothing is purchasable here. */}
      <section
        className="flex items-start gap-3 rounded-3xl border border-emerald-400/30 bg-emerald-500/15 p-4"
        data-subscription-owned-explainer
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
          <CalendarClock className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-emerald-950">
            This plan is already active on your account
          </p>
          <p className="mt-0.5 text-xs leading-5 text-emerald-200">
            {expiresAtLabel
              ? `Everything below stays unlocked until ${expiresAtLabel}. `
              : "Everything below is unlocked and ready to use. "}
            {summary.renewalEligible
              ? "You can renew it now to extend from that date."
              : renewalOpensAtLabel
                ? `Renewal opens on ${renewalOpensAtLabel}, so you can't be charged twice for the same period.`
                : "You can't be charged twice for the same period."}
          </p>
        </div>
      </section>

      {/* Exactly what the active plan gives them. */}
      <GlassCard>
        <header className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-bold text-white/85">What your plan includes</h3>
        </header>
        {summary.features.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-white/55">
            No optional features on this plan. Switch to another plan below to add more.
          </p>
        ) : (
          <ul className="space-y-2" data-subscription-owned-features>
            {summary.features.map((feature) => (
              <li key={feature.id} className="flex items-start gap-3 rounded-2xl bg-emerald-500/15 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                  <Check className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-white">{feature.name}</span>
                  {feature.description ? (
                    <span className="mt-0.5 block text-[11px] leading-4 text-white/55">
                      {feature.description}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}

        {summary.productTitles.length > 0 ? (
          <>
            <header className="mb-2 mt-4 flex items-center gap-2">
              <Package className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-bold text-white/85">Courses included</h3>
            </header>
            <ul className="space-y-1.5" data-subscription-owned-products>
              {summary.productTitles.map((title) => (
                <li key={title} className="flex items-center gap-2 text-xs font-semibold text-white/85">
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  {title}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </GlassCard>

      {/* Forward path 1: add features / courses to THIS plan (add-on upgrade).
          Only the new items are ever charged — the plan price is not charged
          again and the expiry does not move. */}
      {onAddMore ? (
        <button
          type="button"
          onClick={onAddMore}
          data-subscription-owned-add-more
          className="flex items-start gap-3 rounded-3xl border border-violet-400/30 bg-violet-500/15 p-4 text-left transition active:scale-[0.99] hover:bg-violet-500/15"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-300">
            <PlusCircle className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-white">Add features or courses to this plan</span>
            <span className="mt-0.5 block text-[11px] leading-4 text-white/55">
              Unlock more without changing your plan — you only pay for the new items, at the
              price set for this plan.
            </span>
          </span>
        </button>
      ) : null}

      {/* Forward path 2: a different plan or a different cycle. */}
      {otherPlanNames.length > 0 ? (
        <GlassButton
          variant="capsule"
          type="button"
          onClick={onSeeOtherPlans}
          data-subscription-owned-switch
          className="w-full text-left [&>span>div]:h-auto [&>span>div]:w-full [&>span>div]:rounded-3xl [&>span>div]:p-4 [&>span>div>span]:w-full"
        >
          <span className="flex w-full items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
              <Info className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-white">Want something different?</span>
              <span className="mt-0.5 block text-[11px] font-normal leading-4 text-white/55">
                Pick {otherPlanNames.join(", ")} above, or switch between monthly and yearly, to see a
                purchasable plan.
              </span>
            </span>
          </span>
        </GlassButton>
      ) : null}
    </div>
  );
}
