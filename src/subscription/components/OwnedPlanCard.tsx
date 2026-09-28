// src/subscription/components/OwnedPlanCard.tsx
//
// Shown INSTEAD of the buy flow when the plan + cycle the user is currently
// looking at is the exact one they already own.
// Redesigned: flexible responsive grid for mobile/tablet/desktop — same
// system as ActiveMemberView, no single flat column.

import { BadgeCheck, CalendarClock, Check, Info, Package, PlusCircle, Sparkles } from "lucide-react";
import { GlassCard } from "../../components/ui/GlassCard";
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
    <div
      className="flex flex-col gap-4 px-4 pb-8 pt-4 sm:px-5 md:px-6 lg:grid lg:grid-cols-12 lg:gap-4 lg:px-0 xl:gap-5"
      data-subscription-owned-plan={summary.planId}
    >
      {/* Hero — full width on desktop, store-glass material */}
      <GlassCard
        tint={0.62}
        tintColor="173,216,255"
        blur={0}
        className="dc-store-glass dc-scene-ink lg:col-span-12"
      >
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30"
                data-subscription-owned-badge
              >
                <BadgeCheck className="h-3 w-3" /> Already subscribed
              </span>
              <h2 className="mt-2.5 text-2xl font-black leading-tight md:text-3xl lg:text-[1.7rem]" data-subscription-owned-plan-name>
                {summary.planName}
              </h2>
              <p className="mt-1 text-xs font-semibold text-white/70 md:text-sm" data-subscription-owned-cycle>
                {summary.cycleLabel} plan · active now
                {expiresAtLabel ? ` · ${summary.remainingLabel}` : ""}
              </p>
            </div>
            {/* Quick stats for tablet+ */}
            <div className="hidden items-center gap-2 md:flex lg:gap-2.5">
              <span className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold md:text-xs">
                {summary.featureCount} feature{summary.featureCount === 1 ? "" : "s"}
              </span>
              {summary.productTitles.length > 0 ? (
                <span className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold md:text-xs">
                  {summary.productTitles.length} course{summary.productTitles.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 md:hidden">
            <span className="rounded-xl border border-white/15 px-3 py-1.5 text-[11px] font-bold">
              {summary.featureCount} feature{summary.featureCount === 1 ? "" : "s"} unlocked
            </span>
            {summary.productTitles.length > 0 ? (
              <span className="rounded-xl border border-white/15 px-3 py-1.5 text-[11px] font-bold">
                {summary.productTitles.length} course{summary.productTitles.length === 1 ? "" : "s"} included
              </span>
            ) : null}
            {expiresAtLabel ? (
              <span className="rounded-xl border border-white/15 px-3 py-1.5 text-[11px] font-bold">{summary.remainingLabel}</span>
            ) : null}
          </div>
        </div>
      </GlassCard>

      {/* LEFT COLUMN — explainer + features + courses */}
      <div className="flex flex-col gap-4 lg:col-span-8 lg:gap-4 xl:col-span-8">
        {/* Why nothing is purchasable here */}
        <section
          className="flex items-start gap-3 rounded-3xl border border-emerald-400/30 bg-emerald-500/15 p-4 md:p-5 lg:rounded-[1.25rem]"
          data-subscription-owned-explainer
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300 md:h-11 md:w-11">
            <CalendarClock className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-white md:text-[15px]">This plan is already active on your account</p>
            <p className="mt-0.5 text-xs leading-5 text-emerald-200 md:text-sm md:leading-6">
              {expiresAtLabel ? `Everything below stays unlocked until ${expiresAtLabel}. ` : "Everything below is unlocked and ready to use. "}
              {summary.renewalEligible
                ? "You can renew it now to extend from that date."
                : renewalOpensAtLabel
                  ? `Renewal opens on ${renewalOpensAtLabel}, so you can't be charged twice for the same period.`
                  : "You can't be charged twice for the same period."}
            </p>
          </div>
        </section>

        {/* What the plan gives */}
        <GlassCard tint={0.62} tintColor="173,216,255" blur={0} className="dc-store-glass dc-scene-ink">
          <header className="mb-3 flex items-center justify-between gap-2 md:mb-4">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30 md:h-9 md:w-9">
                <Sparkles className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-bold text-white/85 md:text-[15px]">What your plan includes</h3>
            </div>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/60 md:text-[11px]">
              {summary.features.length} total
            </span>
          </header>
          {summary.features.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-white/55 md:p-5 md:text-sm">
              No optional features on this plan. Switch to another plan below to add more.
            </p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2 md:gap-2.5" data-subscription-owned-features>
              {summary.features.map((feature) => (
                <li key={feature.id} className="flex items-start gap-3 rounded-2xl bg-emerald-500/15 p-3 md:p-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 md:h-9 md:w-9">
                    <Check className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white md:text-[13px]">{feature.name}</span>
                    {feature.description ? (
                      <span className="mt-0.5 block text-[11px] leading-4 text-white/55 md:text-xs">{feature.description}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {summary.productTitles.length > 0 ? (
            <>
              <header className="mb-2 mt-4 flex items-center gap-2 md:mt-5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30 md:h-9 md:w-9">
                  <Package className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold text-white/85 md:text-[15px]">Courses included</h3>
                <span className="ml-auto rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/60">
                  {summary.productTitles.length}
                </span>
              </header>
              <ul className="grid gap-1.5 md:grid-cols-2 md:gap-2" data-subscription-owned-products>
                {summary.productTitles.map((title) => (
                  <li
                    key={title}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-white/85 md:text-sm md:px-3.5 md:py-3"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                    <span className="truncate">{title}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </GlassCard>
      </div>

      {/* RIGHT COLUMN — actions + trust */}
      <div className="flex flex-col gap-4 lg:col-span-4 lg:gap-4 xl:col-span-4">
        {/* Add more */}
        {onAddMore ? (
          <GlassCard tint={0.62} tintColor="173,216,255" blur={0} className="dc-store-glass dc-scene-ink">
            <GlassButton
              type="button"
              variant="capsule"
              onClick={onAddMore}
              data-subscription-owned-add-more
              className="w-full text-left ring-1 ring-violet-400/30 [&>span>div]:h-auto [&>span>div]:w-full [&>span>div]:rounded-2xl [&>span>div]:px-4 [&>span>div]:py-4 [&>span>div>span]:w-full"
            >
              <span className="flex w-full items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-300 md:h-10 md:w-10">
                  <PlusCircle className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 whitespace-normal">
                  <span className="block text-sm font-black text-white md:text-[14px]">Add features or courses</span>
                  <span className="mt-0.5 block text-[11px] font-normal leading-4 text-white/55 md:text-xs md:leading-5">
                    Unlock more without changing your plan — you only pay for the new items.
                  </span>
                </span>
              </span>
            </GlassButton>
          </GlassCard>
        ) : null}

        {/* Switch plan */}
        {otherPlanNames.length > 0 ? (
          <GlassCard tint={0.62} tintColor="173,216,255" blur={0} className="dc-store-glass dc-scene-ink">
            <GlassButton
              variant="capsule"
              type="button"
              onClick={onSeeOtherPlans}
              data-subscription-owned-switch
              className="w-full text-left [&>span>div]:h-auto [&>span>div]:w-full [&>span>div]:rounded-2xl [&>span>div]:p-4 [&>span>div>span]:w-full"
            >
              <span className="flex w-full items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300 md:h-10 md:w-10">
                  <Info className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-white md:text-[14px]">Want something different?</span>
                  <span className="mt-0.5 block text-[11px] font-normal leading-4 text-white/55 md:text-xs md:leading-5">
                    Pick {otherPlanNames.join(", ")} above, or switch between monthly and yearly, to see a purchasable plan.
                  </span>
                </span>
              </span>
            </GlassButton>
          </GlassCard>
        ) : null}

        {/* Trust / help */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-[11px] leading-5 text-white/55 md:p-4 md:text-xs md:leading-6">
          <p className="flex items-center gap-1.5 font-bold text-white/80">
            <BadgeCheck className="h-3.5 w-3.5 text-emerald-300" /> Secure & manual — no auto-charge
          </p>
          <p className="mt-2">
            Renewal needs your confirmation. Your current access stays active till expiry. Upgrade anytime to higher plans.
          </p>
          <p className="mt-2 text-white/40">
            Already purchased items are carried over — you never pay twice for the same feature or course.
          </p>
        </div>
      </div>
    </div>
  );
}
