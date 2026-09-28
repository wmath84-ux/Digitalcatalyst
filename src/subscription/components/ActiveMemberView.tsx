// src/subscription/components/ActiveMemberView.tsx
//
// What an ACTIVE subscriber sees when they open the subscription page.
// Optimized for mobile, tablet, desktop — flexible responsive grid.

import { GlassCard } from "../../components/ui/GlassCard";
import { GlassButton } from "../../components/ui/glass-button";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  CreditCard,
  Package,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { RenewalView } from "../../../utils/renewalPresentation";
import type { SubscriptionFeatureDoc, SubscriptionPlanDoc } from "../utils/subscriptionCatalog";
import RenewalStatusCard from "../../components/subscription/RenewalStatusCard";

interface Props {
  planName: string;
  plan: SubscriptionPlanDoc | null;
  cycle: "monthly" | "yearly";
  unlockedFeatures: SubscriptionFeatureDoc[];
  unlockedProductTitles: string[];
  expiresAtLabel: string;
  renewalView: RenewalView | null;
  reminderOptOut: boolean;
  onRenew: () => void;
  onChangePlan: () => void;
  onToggleReminders: (next: boolean) => void;
  onOpenFeature: (featureId: string) => void;
}

export default function ActiveMemberView({
  planName,
  plan,
  cycle,
  unlockedFeatures,
  unlockedProductTitles,
  expiresAtLabel,
  renewalView,
  reminderOptOut,
  onRenew,
  onChangePlan,
  onToggleReminders,
  onOpenFeature,
}: Props) {
  return (
    <div
      className="flex flex-col gap-4 px-4 pb-8 pt-4 sm:px-5 md:px-6 lg:grid lg:grid-cols-12 lg:gap-4 lg:px-0 lg:pt-0 xl:gap-5"
      data-subscription-member-view
    >
      {/* Membership hero — full width on desktop */}
      <GlassCard
        tint={0.62}
        tintColor="173,216,255"
        blur={0}
        className="dc-store-glass dc-scene-ink lg:col-span-12"
      >
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30">
                <BadgeCheck className="h-3 w-3" /> Active membership
              </span>
              <h2 className="mt-2.5 text-2xl font-black leading-tight md:text-3xl lg:text-[1.7rem]" data-member-plan-name>
                {planName}
              </h2>
              <p className="mt-1 text-xs font-semibold text-white/70 md:text-sm">
                {cycle === "yearly" ? "Yearly" : "Monthly"} plan
                {expiresAtLabel ? ` · Renews ${expiresAtLabel}` : ""}
              </p>
            </div>
            {/* Quick stats in hero for tablet+ */}
            <div className="hidden items-center gap-2 md:flex lg:gap-2.5">
              <span className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold md:text-xs">
                {unlockedFeatures.length} feature{unlockedFeatures.length === 1 ? "" : "s"}
              </span>
              {unlockedProductTitles.length > 0 ? (
                <span className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold md:text-xs">
                  {unlockedProductTitles.length} course{unlockedProductTitles.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 md:hidden">
            <span className="rounded-xl border border-white/15 px-3 py-1.5 text-[11px] font-bold">
              {unlockedFeatures.length} feature{unlockedFeatures.length === 1 ? "" : "s"} unlocked
            </span>
            {unlockedProductTitles.length > 0 ? (
              <span className="rounded-xl border border-white/15 px-3 py-1.5 text-[11px] font-bold">
                {unlockedProductTitles.length} course{unlockedProductTitles.length === 1 ? "" : "s"} included
              </span>
            ) : null}
            {plan?.revisionTestBankLimits ? (
              <span
                data-member-test-bank-capacity
                className="rounded-xl border border-white/15 px-3 py-1.5 text-[11px] font-bold"
              >
                {plan.revisionTestBankLimits?.[cycle] === -1
                  ? "Unlimited Test Bank"
                  : `Test Bank: save up to ${plan.revisionTestBankLimits?.[cycle] ?? 20} tests`}
              </span>
            ) : null}
          </div>

          {/* Desktop extra row for test bank */}
          <div className="mt-4 hidden flex-wrap gap-2 md:flex">
            {plan?.revisionTestBankLimits ? (
              <span
                data-member-test-bank-capacity
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold md:text-xs"
              >
                {plan.revisionTestBankLimits?.[cycle] === -1
                  ? "Unlimited Test Bank"
                  : `Test Bank: save up to ${plan.revisionTestBankLimits?.[cycle] ?? 20} tests`}
              </span>
            ) : null}
          </div>
        </div>
      </GlassCard>

      {/* LEFT COLUMN — renewal + features + courses (main) */}
      <div className="flex flex-col gap-4 lg:col-span-8 lg:gap-4 xl:col-span-8">
        {/* Renewal status — reuses the shared renewal presentation layer. */}
        {renewalView ? (
          <RenewalStatusCard
            view={renewalView}
            cycle={cycle}
            reminderOptOut={reminderOptOut}
            onRenew={onRenew}
            onToggleReminders={onToggleReminders}
          />
        ) : (
          <section className="rounded-3xl border border-emerald-400/30 bg-emerald-500/15 p-4 md:p-5 lg:rounded-[1.25rem]">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300 md:h-11 md:w-11">
                <CalendarClock className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-black text-white md:text-[15px]">Your membership is active</p>
                <p className="mt-0.5 text-xs leading-5 text-emerald-200 md:text-sm md:leading-6">
                  {expiresAtLabel
                    ? `Everything stays unlocked until ${expiresAtLabel}. We'll remind you a week before renewal.`
                    : "Everything below is unlocked and ready to use."}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Unlocked features */}
        <GlassCard
          tint={0.62}
          tintColor="173,216,255"
          blur={0}
          className="dc-store-glass dc-scene-ink"
        >
          <header className="mb-3 flex items-center justify-between gap-2 md:mb-4">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30 md:h-9 md:w-9">
                <Sparkles className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-bold text-white/85 md:text-[15px]">Your unlocked features</h3>
            </div>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/60 md:text-[11px]">
              {unlockedFeatures.length} total
            </span>
          </header>

          {unlockedFeatures.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-white/55 md:p-5 md:text-sm">
              No optional features on this plan yet. Add some by changing your plan below.
            </p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2 md:gap-2.5" data-member-features>
              {unlockedFeatures.map((feature) => (
                <li key={feature.id}>
                  <GlassButton
                    variant="capsule"
                    type="button"
                    onClick={() => onOpenFeature(feature.id)}
                    className="w-full text-left [&>span>div]:h-auto [&>span>div]:w-full [&>span>div]:rounded-2xl [&>span>div]:px-3 [&>span>div]:py-3 [&>span>div>span]:w-full md:[&>span>div]:py-3.5"
                  >
                    <span className="flex w-full items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                        <Check className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-white md:text-[13px]">{feature.name}</span>
                        {feature.description ? (
                          <span className="mt-0.5 block truncate text-[11px] text-white/55 md:text-xs">{feature.description}</span>
                        ) : null}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-white/55" />
                    </span>
                  </GlassButton>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        {/* Included courses */}
        {unlockedProductTitles.length > 0 ? (
          <GlassCard
            tint={0.62}
            tintColor="173,216,255"
            blur={0}
            className="dc-store-glass dc-scene-ink"
          >
            <header className="mb-3 flex items-center gap-2 md:mb-4">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30 md:h-9 md:w-9">
                <Package className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-bold text-white/85 md:text-[15px]">Courses included with your plan</h3>
              <span className="ml-auto rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/60">
                {unlockedProductTitles.length}
              </span>
            </header>
            <ul className="grid gap-1.5 md:grid-cols-2 md:gap-2" data-member-products>
              {unlockedProductTitles.map((title) => (
                <li
                  key={title}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-white/85 md:text-sm md:px-3.5 md:py-3"
                >
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                  <span className="truncate">{title}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
        ) : null}
      </div>

      {/* RIGHT COLUMN — manage actions (sticky on desktop) */}
      <div className="flex flex-col gap-4 lg:col-span-4 lg:gap-4 xl:col-span-4">
        <GlassCard
          tint={0.62}
          tintColor="173,216,255"
          blur={0}
          className="dc-store-glass dc-scene-ink"
        >
          <header className="mb-3 flex items-center gap-2 md:mb-4">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-white/70 ring-1 ring-white/15 md:h-9 md:w-9">
              <Settings2 className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-bold text-white/85 md:text-[15px]">Manage membership</h3>
          </header>
          <div className="grid gap-2.5 md:gap-3">
            <button
              type="button"
              onClick={onRenew}
              data-member-renew
              className="flex w-full items-center gap-3 rounded-2xl bg-indigo-600 p-3.5 text-left text-white transition hover:bg-indigo-500 active:scale-[0.99] md:p-4"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 md:h-11 md:w-11">
                <CreditCard className="h-5 w-5 shrink-0" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black md:text-[14px]">Renew early</span>
                <span className="mt-0.5 block text-[11px] text-white/60 md:text-xs">Extend from your current expiry date</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </button>
            <GlassButton
              variant="capsule"
              type="button"
              onClick={onChangePlan}
              data-member-change-plan
              className="w-full text-left [&>span>div]:h-auto [&>span>div]:w-full [&>span>div]:rounded-2xl [&>span>div]:px-3 [&>span>div]:py-3.5 [&>span>div>span]:w-full md:[&>span>div]:py-4"
            >
              <span className="flex w-full items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white/70 ring-1 ring-white/15 md:h-11 md:w-11">
                  <Settings2 className="h-4 w-4 shrink-0" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-white md:text-[14px]">Change plan or features</span>
                  <span className="mt-0.5 block text-[11px] text-white/55 md:text-xs">Add features, courses, or switch cycle</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-white/55" />
              </span>
            </GlassButton>
          </div>
          {plan?.description ? (
            <p className="mt-3 text-[11px] leading-relaxed text-white/55 md:mt-4 md:text-xs md:leading-6">{plan.description}</p>
          ) : null}
          <div className="mt-4 rounded-xl bg-white/5 p-3 ring-1 ring-white/10 md:p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/60 md:text-xs">
              <BadgeCheck className="h-3.5 w-3.5 text-emerald-300" /> Secure & manual — no auto-charge
            </p>
            <p className="mt-1 text-[11px] leading-5 text-white/50 md:text-xs md:leading-5">
              Renewal needs your confirmation. Your current access stays active till expiry.
            </p>
          </div>
        </GlassCard>

        {/* Help / trust */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-[11px] leading-5 text-white/55 md:p-4 md:text-xs md:leading-6">
          <p className="font-bold text-white/80">Need help?</p>
          <p className="mt-1">
            Manage your plan anytime. Upgrade to higher plans keeps your current membership active until cycle ends.
          </p>
        </div>
      </div>
    </div>
  );
}
