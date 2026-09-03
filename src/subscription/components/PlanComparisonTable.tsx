// src/subscription/components/PlanComparisonTable.tsx
//
// The subscription page used to scatter plan information across a pill row, a
// price header, a tier strip and two pickers, so a buyer could never answer the
// only question that matters — "what is the difference between these plans?" —
// without tapping through everything.
//
// This is that answer in one place: a real comparison table, plans across the
// columns, features down the rows, resolved for the currently selected billing
// cycle. Everything is derived from the live catalog (`resolveFeaturePrice`),
// so it can never drift from what checkout charges.
//
// Interaction rules applied here:
//   · The whole column is the selection target (Fitts's law), not a small radio.
//   · The selected column is marked with colour AND a check AND a border — never
//     colour alone (accessibility + scannability).
//   · Each cell states the real outcome for that plan: "Included", the exact
//     add-on price, or a clear "—" when the feature is not offered.
//   · The cheapest-per-month plan carries a derived "Best value" flag; nothing
//     is hardcoded marketing.

import { BadgeCheck, Check, Crown, Minus } from "lucide-react";
import { resolveFeaturePrice } from "../../../utils/featurePricing";
import type {
  BillingCycle,
  SubscriptionFeatureDoc,
  SubscriptionPlanDoc,
} from "../utils/subscriptionCatalog";

interface Props {
  plans: SubscriptionPlanDoc[];
  features: SubscriptionFeatureDoc[];
  cycle: BillingCycle;
  selectedPlanId: string | null;
  ownedPlanId?: string | null;
  onSelectPlan: (planId: string) => void;
}

const rupees = (paise: number) => `₹${Math.max(0, Math.round(paise / 100)).toLocaleString("en-IN")}`;

const planPricePaise = (plan: SubscriptionPlanDoc, cycle: BillingCycle) =>
  cycle === "yearly" ? plan.yearlyPricePaise : plan.monthlyPricePaise;

export default function PlanComparisonTable({
  plans,
  features,
  cycle,
  selectedPlanId,
  ownedPlanId = null,
  onSelectPlan,
}: Props) {
  const sellablePlans = plans.filter((plan) => plan.active);
  if (sellablePlans.length === 0) return null;

  // Only compare features that at least one plan actually offers, and keep the
  // catalog's own ordering so the table matches the pickers below it.
  const comparableFeatures = features
    .filter((feature) => feature.active)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // "Best value" = lowest effective cost per month across the visible plans,
  // computed rather than declared.
  const perMonth = (plan: SubscriptionPlanDoc) => {
    const paise = planPricePaise(plan, cycle);
    return cycle === "yearly" ? paise / 12 : paise;
  };
  const paidPlans = sellablePlans.filter((plan) => planPricePaise(plan, cycle) > 0);
  const bestValuePlanId = paidPlans.length > 1
    ? paidPlans.reduce((best, plan) => (perMonth(plan) < perMonth(best) ? plan : best), paidPlans[0]).id
    : null;

  return (
    <section data-subscription-comparison className="px-5 pt-6">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-black dc-ink-1">Compare plans</h2>
        <span className="dc-section-label">{cycle === "yearly" ? "Yearly prices" : "Monthly prices"}</span>
      </div>
      <p className="mb-3 text-[11.5px] leading-relaxed dc-ink-3">
        Tap a column to choose that plan. Prices below are what this plan costs
        for the {cycle === "yearly" ? "yearly" : "monthly"} cycle — add-ons you
        pick later are listed separately in the summary.
      </p>

      <div className="dc-compare-scroll overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="dc-compare-table w-full min-w-max border-collapse text-left">
          <thead>
            <tr>
              <th scope="col" className="dc-compare-rowhead sticky left-0 z-10 px-3 py-3">
                <span className="dc-section-label">Feature</span>
              </th>
              {sellablePlans.map((plan) => {
                const selected = plan.id === selectedPlanId;
                const owned = Boolean(ownedPlanId && plan.id === ownedPlanId);
                const price = planPricePaise(plan, cycle);
                return (
                  <th key={plan.id} scope="col" className="p-1.5 align-top">
                    <button
                      type="button"
                      onClick={() => onSelectPlan(plan.id)}
                      aria-pressed={selected}
                      data-subscription-compare-plan={plan.id}
                      className={`dc-focusable flex w-full min-w-[7.5rem] flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition ${
                        selected
                          ? "border-indigo-400/60 bg-indigo-500/20 shadow-[var(--dc-elev-accent)]"
                          : "border-white/10 bg-white/[0.04] hover:border-white/25"
                      }`}
                    >
                      <span className="flex w-full items-center justify-between gap-1">
                        <span className="text-[12.5px] font-black dc-ink-1">{plan.name}</span>
                        {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-indigo-200" aria-hidden="true" /> : null}
                      </span>
                      <span className="text-[15px] dc-hero-price">
                        {price <= 0 ? "FREE" : rupees(price)}
                        <span className="ml-0.5 text-[10px] font-bold dc-ink-3">
                          /{cycle === "monthly" ? "mo" : "yr"}
                        </span>
                      </span>
                      {cycle === "yearly" && price > 0 ? (
                        <span className="text-[10px] font-semibold dc-ink-3">
                          ≈ {rupees(price / 12)}/mo
                        </span>
                      ) : null}
                      <span className="flex flex-wrap gap-1 pt-0.5">
                        {owned ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-200">
                            <BadgeCheck className="h-2.5 w-2.5" aria-hidden="true" /> Active
                          </span>
                        ) : null}
                        {!owned && plan.id === bestValuePlanId ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-200">
                            <Crown className="h-2.5 w-2.5" aria-hidden="true" /> Best value
                          </span>
                        ) : null}
                        {plan.trialDays > 0 ? (
                          <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-indigo-200">
                            {plan.trialDays}-day trial
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {comparableFeatures.map((feature) => (
              <tr key={feature.id} className="border-t border-white/[0.07]">
                <th scope="row" className="dc-compare-rowhead sticky left-0 z-10 px-3 py-2.5 align-top">
                  <span className="block max-w-[10rem] text-[12px] font-bold leading-snug dc-ink-2">
                    {feature.name}
                  </span>
                </th>
                {sellablePlans.map((plan) => {
                  const resolved = resolveFeaturePrice(feature, plan.id, cycle);
                  const includedByPlan = plan.includedFeatureIds.includes(feature.id) || resolved.included;
                  const selected = plan.id === selectedPlanId;
                  return (
                    <td
                      key={plan.id}
                      className={`px-3 py-2.5 text-center align-middle ${selected ? "bg-indigo-500/[0.10]" : ""}`}
                    >
                      {includedByPlan ? (
                        <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-emerald-300">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Included
                        </span>
                      ) : resolved.pricePaise > 0 ? (
                        <span className="text-[11.5px] font-bold dc-ink-2">
                          + {rupees(resolved.pricePaise)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center dc-ink-3" aria-label="Not available">
                          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Bundled courses row — the other thing plans actually differ on. */}
            <tr className="border-t border-white/[0.07]">
              <th scope="row" className="dc-compare-rowhead sticky left-0 z-10 px-3 py-2.5 align-top">
                <span className="block max-w-[10rem] text-[12px] font-bold leading-snug dc-ink-2">
                  Courses bundled
                </span>
              </th>
              {sellablePlans.map((plan) => {
                const selected = plan.id === selectedPlanId;
                const count = plan.includedProductIds.length;
                return (
                  <td
                    key={plan.id}
                    className={`px-3 py-2.5 text-center align-middle ${selected ? "bg-indigo-500/[0.10]" : ""}`}
                  >
                    {count > 0 ? (
                      <span className="text-[11.5px] font-bold text-emerald-300">{count} included</span>
                    ) : (
                      <span className="inline-flex items-center justify-center dc-ink-3" aria-label="None">
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
