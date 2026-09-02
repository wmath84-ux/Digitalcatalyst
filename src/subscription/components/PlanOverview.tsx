// src/subscription/components/PlanOverview.tsx
//
// Part 9 — Plan overview card. Server-driven: the plan list +
// feature list are loaded from Firestore and the page renders
// them with their cycle prices. The previous implementation
// took hard-coded `basePriceMonthly` / `basePriceYearly` props;
// those are gone.

import { BadgeCheck, Check, Crown, Lock, X as XIcon, ChevronDown, ChevronUp } from "lucide-react";
import { GlassCard } from "../../components/ui/glass-card";
import { GlassToggleGroup, GlassToggleItem } from "../../components/ui/glass-toggle-group";
import SubscriberOnlyPriceBadge from "../../components/subscription/SubscriberOnlyPriceBadge";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  BillingCycle,
  SubscriptionFeatureDoc,
  SubscriptionPlanDoc,
} from "../utils/subscriptionCatalog";

type FeatureWithResolvedPrice = SubscriptionFeatureDoc & {
  resolvedPricePaise?: number;
  resolvedIncluded?: boolean;
};

interface Props {
  plans: SubscriptionPlanDoc[];
  features: FeatureWithResolvedPrice[];
  selectedPlanId: string | null;
  onChangePlan: (planId: string) => void;
  cycle: BillingCycle;
  onChangeCycle: (cycle: BillingCycle) => void;
  selectedFeatureRecords: FeatureWithResolvedPrice[];
  includedFeatureRecords: FeatureWithResolvedPrice[];
  totalPaise: number;
  /** Plan id the buyer already owns (active membership), if any. */
  ownedPlanId?: string | null;
  /** Billing cycle of that owned membership. */
  ownedCycle?: BillingCycle | null;
  /**
   * Subscriber-only override price, in RUPEES, for the currently
   * selected plan + cycle. When the buyer IS a subscriber and the
   * admin has set an override, the card swaps the public price for
   * the override and adds a "Your subscriber price" badge above the
   * main price line.
   */
  subscriberPriceRupees?: number | null;
  /** True when the visitor has an active subscription. */
  isSubscriber?: boolean;
}

export default function PlanOverview({
  plans,
  selectedPlanId,
  onChangePlan,
  cycle,
  onChangeCycle,
  selectedFeatureRecords,
  includedFeatureRecords,
  totalPaise,
  ownedPlanId = null,
  ownedCycle = null,
  subscriberPriceRupees = null,
  isSubscriber = false,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const activePlan = plans.find((p) => p.id === selectedPlanId) || null;
  const supportedCycles: BillingCycle[] = activePlan
    ? activePlan.allowedCycles.filter((c): c is BillingCycle => c === "monthly" || c === "yearly")
    : ["monthly", "yearly"];
  const totalRupees = (totalPaise / 100).toFixed(2);

  return (
    <div className="px-5 pt-6" data-subscription-plan-overview>
      <GlassCard className="ring-1 ring-white/10">
        {/* glow effects */}
        <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-violet-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-fuchsia-500/20 blur-3xl" />

        {/* Plan picker */}
        {/* Wave 11: plan pills are the pack GlassToggleGroup (segment material);
            owned plan keeps its emerald ink because the colour carries meaning. */}
        <div className="relative mb-3 max-w-full overflow-x-auto [scrollbar-width:none]">
        <GlassToggleGroup
          className="dc-segment shrink-0"
          value={selectedPlanId ?? ""}
          onValueChange={(id) => {
            const plan = plans.find((candidate) => candidate.id === id);
            if (plan && plan.active) onChangePlan(id);
          }}
          aria-label="Choose a plan"
        >
          {plans.map((plan) => {
            // Owned plans are marked so the buyer can tell, before tapping,
            // which subscription type is already on their account.
            const isOwned = Boolean(ownedPlanId && plan.id === ownedPlanId);
            return (
              <GlassToggleItem
                key={plan.id}
                value={plan.id}
                disabled={!plan.active}
                data-subscription-plan-pill={plan.id}
                data-subscription-plan-owned={isOwned ? "true" : undefined}
                className={`whitespace-nowrap px-3 py-1.5 text-[11px] font-black uppercase tracking-wider ${
                  isOwned ? "text-emerald-200 hover:text-emerald-100" : ""
                } ${!plan.active ? "cursor-not-allowed opacity-50" : ""}`}
              >
                {isOwned ? <BadgeCheck className="mr-1 h-3 w-3" aria-hidden="true" /> : null}
                {plan.name}
                {isOwned ? <span className="ml-1 text-[9px] font-black">· ACTIVE</span> : null}
                {!isOwned && plan.badge ? <span className="ml-1 rounded bg-amber-500/80 px-1 text-[9px] text-white">{plan.badge}</span> : null}
              </GlassToggleItem>
            );
          })}
        </GlassToggleGroup>
        </div>

        {/* Plan + price */}
        <div className="relative flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200">
              {activePlan ? activePlan.name : "Choose a plan"}
            </p>
            {isSubscriber && subscriberPriceRupees != null && activePlan ? (
              <div className="mt-1.5">
                <SubscriberOnlyPriceBadge
                  price={subscriberPriceRupees}
                  basePrice={totalRupees === "FREE" ? 0 : Math.round(Number(totalRupees) || 0)}
                  cycleLabel={cycle === "monthly" ? "month" : "year"}
                />
              </div>
            ) : null}
            <p className="mt-0.5 truncate text-2xl font-black tracking-tight text-white sm:text-3xl" data-subscription-plan-price data-subscription-plan-free={activePlan && totalPaise <= 0 ? "true" : undefined}>
              {activePlan
                ? totalPaise <= 0
                  ? "FREE"
                  : `₹${totalRupees}`
                : "—"}
              <span className="ml-1 text-xs font-bold text-violet-200">
                /{cycle === "monthly" ? "mo" : "yr"}
              </span>
            </p>
            {activePlan ? (
              <p className="mt-1 line-clamp-2 text-[11px] text-violet-200">
                {activePlan.description}
              </p>
            ) : null}
          </div>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/40">
            <Crown className="h-6 w-6" />
          </span>
        </div>

        {/* Cycle toggle */}
        <GlassToggleGroup
          className="dc-segment relative mt-4 text-[11px] font-bold"
          value={cycle}
          onValueChange={(next) => {
            const c = next as BillingCycle;
            const isCycleDowngrade = Boolean(
              ownedPlanId && ownedCycle === "yearly" && selectedPlanId === ownedPlanId && c === "monthly",
            );
            if (supportedCycles.includes(c) && !isCycleDowngrade) onChangeCycle(c);
          }}
          aria-label="Billing cycle"
        >
          {(["monthly", "yearly"] as BillingCycle[]).map((c) => {
            // NO-DOWNGRADE rule: a yearly member cannot drop to the monthly
            // cycle of the SAME plan while that yearly membership is active.
            const isCycleDowngrade = Boolean(
              ownedPlanId &&
                ownedCycle === "yearly" &&
                selectedPlanId === ownedPlanId &&
                c === "monthly",
            );
            const enabled = supportedCycles.includes(c) && !isCycleDowngrade;
            // The owned cycle is only "owned" on the plan that was bought.
            const isOwnedCycle = Boolean(
              ownedPlanId && ownedCycle === c && selectedPlanId === ownedPlanId,
            );
            return (
              <GlassToggleItem
                key={c}
                value={c}
                disabled={!enabled}
                data-subscription-cycle={c}
                data-subscription-cycle-owned={isOwnedCycle ? "true" : undefined}
                data-subscription-cycle-downgrade={isCycleDowngrade ? "true" : undefined}
                title={isCycleDowngrade ? "Available after your yearly membership ends" : undefined}
                className={`px-3 py-1.5 text-[11px] font-bold ${
                  isOwnedCycle ? "text-emerald-200" : ""
                } ${!enabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                {c === "monthly" ? "Monthly" : "Yearly"}
                {isOwnedCycle ? (
                  <span className="ml-1 text-[9px] font-black">· ACTIVE</span>
                ) : isCycleDowngrade ? (
                  <Lock className="ml-1 h-3 w-3" aria-label="Locked until your yearly membership ends" />
                ) : c === "yearly" ? (
                  <span className="ml-1 text-[9px] text-emerald-300">Save</span>
                ) : null}
              </GlassToggleItem>
            );
          })}
        </GlassToggleGroup>
        {ownedPlanId && ownedCycle === "yearly" && selectedPlanId === ownedPlanId ? (
          <p
            data-subscription-cycle-downgrade-note
            className="relative mt-2 text-[10px] font-semibold text-violet-200"
          >
            Monthly unlocks after your yearly membership ends — until then you can renew yearly, add features, or move up a plan.
          </p>
        ) : null}

        {activePlan ? (
          <div
            data-revision-bank-benefit
            className="relative mt-4 flex items-center gap-2 rounded-2xl bg-indigo-400/10 px-3 py-2.5 text-[11px] font-semibold text-indigo-50 ring-1 ring-indigo-400/30"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-sm">🧠</span>
            <span>
              {activePlan.revisionTestBankLimits?.[cycle] === -1
                ? "With Revision Studio: unlimited cloud-saved tests"
                : `With Revision Studio: save up to ${activePlan.revisionTestBankLimits?.[cycle] ?? 20} tests in your cloud Test Bank`}
            </span>
          </div>
        ) : null}

        {activePlan ? (
          <div data-school-ai-benefit className="relative mt-2 flex items-center gap-2 rounded-2xl bg-violet-400/10 px-3 py-2.5 text-[11px] font-semibold text-violet-50 ring-1 ring-violet-400/30">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-sm">✨</span>
            <span>
              School AI: {activePlan.aiAllowances?.[cycle]?.dailyGenerationLimit === 0 ? "unlimited" : `${activePlan.aiAllowances?.[cycle]?.dailyGenerationLimit ?? 20} successful tests/day`}
              {(activePlan.aiAllowances?.[cycle]?.costBudgetMicros ?? -1) >= 0
                ? ` · $${((activePlan.aiAllowances?.[cycle]?.costBudgetMicros ?? 0) / 1_000_000).toFixed(2)} model-cost budget per term when hybrid metering is enabled`
                : ""}
            </span>
          </div>
        ) : null}

        {/* Included / selected features pill row */}
        {(includedFeatureRecords.length > 0 || selectedFeatureRecords.length > 0) ? (
          <div className="relative mt-4 flex flex-wrap gap-1.5">
            {includedFeatureRecords.map((f) => (
              <span
                key={f.id}
                data-subscription-included-feature={f.id}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-100 ring-1 ring-emerald-400/30"
              >
                <Check size={10} /> {f.name}
              </span>
            ))}
            {selectedFeatureRecords
              .filter((f) => !includedFeatureRecords.find((g) => g.id === f.id))
              .map((f) => (
                <span
                  key={f.id}
                  data-subscription-selected-feature={f.id}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-100 ring-1 ring-amber-400/30"
                >
                  + {f.name}
                </span>
              ))}
          </div>
        ) : null}
      </GlassCard>

      <button
        type="button"
        onClick={() => setDetailsOpen((v) => !v)}
        className="mt-2 flex w-full items-center justify-center gap-1 text-[11px] font-bold text-white/55 hover:text-white/85"
      >
        {detailsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {detailsOpen ? "Hide" : "View"} what you get
      </button>
      <AnimatePresence>
        {detailsOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <GlassCard className="mt-2 space-y-2 text-xs text-white/85">
              {includedFeatureRecords.length === 0 ? (
                <p className="italic text-white/55">No features included with this plan.</p>
              ) : null}
              {includedFeatureRecords.map((f) => (
                <div key={f.id} className="flex items-start gap-2">
                  <Check size={12} className="mt-0.5 shrink-0 text-emerald-300" />
                  <div>
                    <p className="font-bold text-white">{f.name}</p>
                    <p className="text-white/55">{f.description}</p>
                  </div>
                </div>
              ))}
              {selectedFeatureRecords.length > 0 ? (
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/55">
                  Selected add-ons
                </p>
              ) : null}
              {selectedFeatureRecords.map((f) => (
                <div key={`sel-${f.id}`} className="flex items-start gap-2">
                  <XIcon size={12} className="mt-0.5 shrink-0 text-amber-300" />
                  <div>
                    <p className="font-bold text-white">{f.name}</p>
                    <p className="text-white/55">
                      ₹{(((typeof f.resolvedPricePaise === "number" ? f.resolvedPricePaise : f.pricePaise) || 0) / 100).toFixed(2)} added.
                    </p>
                  </div>
                </div>
              ))}
            </GlassCard>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
