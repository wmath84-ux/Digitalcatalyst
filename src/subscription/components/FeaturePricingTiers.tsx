// src/subscription/components/FeaturePricingTiers.tsx
//
// Price-tier strip for the subscription page. Instead of a flat list of
// features with prices scattered across it, this groups the catalog by
// resolved price so the buyer can read "what do I get at each price
// point" at a glance — free inclusions first, then ascending tiers.
//
// The grouping is done by `utils/featurePricing.js` against the ACTIVE
// plan and billing cycle, so switching plan or cycle re-prices the whole
// strip. Tapping a tier selects every feature inside it.

import { Check, Gift, Sparkles } from "lucide-react";
import type { FeaturePriceTier } from "../../../utils/featurePricing";

const formatRupee = (paise: number): string =>
  `₹${Math.max(0, Math.round(paise / 100)).toLocaleString("en-IN")}`;

interface Props {
  tiers: FeaturePriceTier[];
  cycle: "monthly" | "yearly";
  selectedIds: string[];
  onToggleTier: (featureIds: string[], allSelected: boolean) => void;
}

export default function FeaturePricingTiers({ tiers, cycle, selectedIds, onToggleTier }: Props) {
  const activeTiers = tiers.filter((tier) => tier.features.length > 0);
  if (activeTiers.length === 0) return null;

  const selected = new Set(selectedIds.map(String));
  const cycleLabel = cycle === "yearly" ? "/yr" : "/mo";

  return (
    <div className="px-5 pt-5" data-feature-pricing-tiers>
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-bold text-slate-800">Features by price</h3>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
        Prices below reflect your selected plan and billing cycle. Tap a tier to add everything in it.
      </p>

      <div className="space-y-2">
        {activeTiers.map((tier) => {
          const ids = tier.features.map((feature) => String(feature.id));
          const allSelected = ids.every((id) => selected.has(id));
          const someSelected = !allSelected && ids.some((id) => selected.has(id));

          return (
            <button
              key={tier.pricePaise}
              type="button"
              onClick={() => onToggleTier(ids, allSelected)}
              data-tier-price={tier.pricePaise}
              data-tier-selected={allSelected ? "true" : someSelected ? "partial" : "false"}
              className={`w-full rounded-2xl border p-3 text-left transition active:scale-[0.99] ${
                allSelected
                  ? "border-violet-300 bg-violet-50"
                  : someSelected
                    ? "border-violet-200 bg-white"
                    : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {tier.free ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                      <Gift className="h-3 w-3" /> Included
                    </span>
                  ) : (
                    <span className="text-base font-black text-slate-900">
                      {formatRupee(tier.pricePaise)}
                      <span className="text-[11px] font-bold text-slate-400">{cycleLabel}</span>
                    </span>
                  )}
                  <span className="text-[11px] font-bold text-slate-400">
                    {tier.features.length} feature{tier.features.length === 1 ? "" : "s"}
                  </span>
                </div>

                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                    allSelected
                      ? "border-violet-600 bg-violet-600 text-white"
                      : someSelected
                        ? "border-violet-400 bg-white"
                        : "border-slate-300 bg-white"
                  }`}
                >
                  {allSelected ? <Check className="h-3 w-3" /> : someSelected ? <span className="h-2 w-2 rounded-full bg-violet-500" /> : null}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {tier.features.map((feature) => (
                  <span
                    key={feature.id}
                    className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                      selected.has(String(feature.id))
                        ? "bg-violet-100 text-violet-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {feature.name}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
