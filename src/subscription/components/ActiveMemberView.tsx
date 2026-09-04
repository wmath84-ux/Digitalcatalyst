// src/subscription/components/ActiveMemberView.tsx
//
// What an ACTIVE subscriber sees when they open the subscription page.
//
// Before this existed the page always rendered the buy flow, so a paying
// member was asked to purchase the plan they already owned. This view
// replaces that with a membership dashboard: what is unlocked, when it
// renews, and the deliberate entry points to renew or change the plan.

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
    <div className="flex flex-col gap-4 px-5 pb-8 pt-4" data-subscription-member-view>
      {/* Membership hero */}
      <GlassCard>
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30">
            <BadgeCheck className="h-3 w-3" /> Active membership
          </span>
          <h2 className="mt-2.5 text-2xl font-black leading-tight" data-member-plan-name>
            {planName}
          </h2>
          <p className="mt-1 text-xs font-semibold text-white/70">
            {cycle === "yearly" ? "Yearly" : "Monthly"} plan
            {expiresAtLabel ? ` · Renews ${expiresAtLabel}` : ""}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
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
        </div>
      </GlassCard>

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
        <section className="rounded-3xl border border-emerald-400/30 bg-emerald-500/15 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
              <CalendarClock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-black text-emerald-950">Your membership is active</p>
              <p className="mt-0.5 text-xs leading-5 text-emerald-200">
                {expiresAtLabel
                  ? `Everything stays unlocked until ${expiresAtLabel}. We'll remind you a week before renewal.`
                  : "Everything below is unlocked and ready to use."}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Unlocked features */}
      <GlassCard>
        <header className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-bold text-white/85">Your unlocked features</h3>
        </header>

        {unlockedFeatures.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-white/55">
            No optional features on this plan yet. Add some by changing your plan below.
          </p>
        ) : (
          <ul className="space-y-2" data-member-features>
            {unlockedFeatures.map((feature) => (
              <li key={feature.id}>
                <GlassButton
                  variant="capsule"
                  type="button"
                  onClick={() => onOpenFeature(feature.id)}
                  className="w-full text-left [&>span>div]:h-auto [&>span>div]:w-full [&>span>div]:rounded-2xl [&>span>div]:px-3 [&>span>div]:py-3 [&>span>div>span]:w-full"
                >
                  <span className="flex w-full items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                    <Check className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white">{feature.name}</span>
                    {feature.description ? (
                      <span className="mt-0.5 block truncate text-[11px] text-white/55">{feature.description}</span>
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
        <GlassCard>
          <header className="mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-indigo-300" />
            <h3 className="text-sm font-bold text-white/85">Courses included with your plan</h3>
          </header>
          <ul className="space-y-1.5" data-member-products>
            {unlockedProductTitles.map((title) => (
              <li key={title} className="flex items-center gap-2 text-xs font-semibold text-white/85">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                {title}
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}

      {/* Manage actions — the ONLY way back into the purchase flow. */}
      <GlassCard>
        <header className="mb-3 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-white/55" />
          <h3 className="text-sm font-bold text-white/85">Manage membership</h3>
        </header>
        <div className="space-y-2">
          <button
            type="button"
            onClick={onRenew}
            data-member-renew
            className="flex w-full items-center gap-3 rounded-2xl bg-indigo-600 p-3.5 text-left text-white transition hover:bg-indigo-500 active:scale-[0.99]"
          >
            <CreditCard className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black">Renew early</span>
              <span className="mt-0.5 block text-[11px] text-white/60">Extend from your current expiry date</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </button>
          <GlassButton
            variant="capsule"
            type="button"
            onClick={onChangePlan}
            data-member-change-plan
            className="w-full text-left [&>span>div]:h-auto [&>span>div]:w-full [&>span>div]:rounded-2xl [&>span>div]:px-3 [&>span>div]:py-3 [&>span>div>span]:w-full"
          >
            <span className="flex w-full items-center gap-3">
              <Settings2 className="h-4 w-4 shrink-0 text-white/55" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-white">Change plan or features</span>
                <span className="mt-0.5 block text-[11px] text-white/55">Add features, courses, or switch cycle</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-white/55" />
            </span>
          </GlassButton>
        </div>
        {plan?.description ? (
          <p className="mt-3 text-[11px] leading-relaxed text-white/55">{plan.description}</p>
        ) : null}
      </GlassCard>
    </div>
  );
}
