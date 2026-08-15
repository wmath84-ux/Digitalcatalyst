// src/subscription/components/PlanOverview.tsx
//
// Part 9 — Plan overview card. Server-driven: the plan list +
// feature list are loaded from Firestore and the page renders
// them with their cycle prices. The previous implementation
// took hard-coded `basePriceMonthly` / `basePriceYearly` props;
// those are gone.

import { Check, Crown, X as XIcon, ChevronDown, ChevronUp } from "lucide-react";
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
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const activePlan = plans.find((p) => p.id === selectedPlanId) || null;
  const supportedCycles: BillingCycle[] = activePlan
    ? activePlan.allowedCycles.filter((c): c is BillingCycle => c === "monthly" || c === "yearly")
    : ["monthly", "yearly"];
  const totalRupees = (totalPaise / 100).toFixed(2);

  return (
    <div className="px-5 pt-6" data-subscription-plan-overview>
      <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-5 text-white shadow-xl shadow-slate-300/40 ring-1 ring-white/10">
        {/* glow effects */}
        <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-violet-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-fuchsia-500/20 blur-3xl" />

        {/* Plan picker */}
        <div className="relative mb-3 flex flex-wrap items-center gap-2">
          {plans.map((plan) => {
            const isActive = plan.id === selectedPlanId;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => onChangePlan(plan.id)}
                disabled={!plan.active}
                data-subscription-plan-pill={plan.id}
                className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition ${
                  isActive
                    ? "bg-white text-slate-900 shadow"
                    : "bg-white/10 text-white/80 ring-1 ring-white/20 hover:bg-white/20"
                } ${!plan.active ? "cursor-not-allowed opacity-50" : ""}`}
              >
                {plan.name}
                {plan.badge ? <span className="ml-1 rounded bg-amber-300/90 px-1 text-[9px] text-slate-900">{plan.badge}</span> : null}
              </button>
            );
          })}
        </div>

        {/* Plan + price */}
        <div className="relative flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200/80">
              {activePlan ? activePlan.name : "Choose a plan"}
            </p>
            <p className="mt-0.5 truncate text-2xl font-black tracking-tight text-white sm:text-3xl">
              {activePlan
                ? `₹${totalRupees}`
                : "—"}
              <span className="ml-1 text-xs font-bold text-violet-200/80">
                /{cycle === "monthly" ? "mo" : "yr"}
              </span>
            </p>
            {activePlan ? (
              <p className="mt-1 line-clamp-2 text-[11px] text-violet-200/80">
                {activePlan.description}
              </p>
            ) : null}
          </div>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-slate-900 shadow-lg shadow-amber-500/40">
            <Crown className="h-6 w-6" />
          </span>
        </div>

        {/* Cycle toggle */}
        <div className="relative mt-4 inline-flex rounded-full bg-white/10 p-1 text-[11px] font-bold ring-1 ring-white/15">
          {(["monthly", "yearly"] as BillingCycle[]).map((c) => {
            const enabled = supportedCycles.includes(c);
            return (
              <button
                key={c}
                type="button"
                disabled={!enabled}
                onClick={() => enabled && onChangeCycle(c)}
                data-subscription-cycle={c}
                className={`rounded-full px-3 py-1.5 transition ${
                  cycle === c ? "bg-white text-slate-900 shadow" : "text-white/80 hover:text-white"
                } ${!enabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                {c === "monthly" ? "Monthly" : "Yearly"}
                {c === "yearly" ? <span className="ml-1 text-[9px] text-emerald-600">Save</span> : null}
              </button>
            );
          })}
        </div>

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
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen((v) => !v)}
        className="mt-2 flex w-full items-center justify-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-700"
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
            <div className="mt-2 space-y-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
              {includedFeatureRecords.length === 0 ? (
                <p className="italic text-slate-400">No features included with this plan.</p>
              ) : null}
              {includedFeatureRecords.map((f) => (
                <div key={f.id} className="flex items-start gap-2">
                  <Check size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-bold text-slate-900">{f.name}</p>
                    <p className="text-slate-500">{f.description}</p>
                  </div>
                </div>
              ))}
              {selectedFeatureRecords.length > 0 ? (
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Selected add-ons
                </p>
              ) : null}
              {selectedFeatureRecords.map((f) => (
                <div key={`sel-${f.id}`} className="flex items-start gap-2">
                  <XIcon size={12} className="mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-bold text-slate-900">{f.name}</p>
                    <p className="text-slate-500">
                      ₹{(((typeof f.resolvedPricePaise === "number" ? f.resolvedPricePaise : f.pricePaise) || 0) / 100).toFixed(2)} added.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
