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

import { BadgeCheck, Check, Gift, Sparkles } from "lucide-react";
import type { FeaturePriceTier } from "../../../utils/featurePricing";
import { GlassCard } from "../../components/ui/GlassCard";
import { GlassCheckbox } from "../../components/ui/glass-checkbox";

const formatRupee = (paise: number): string =>
  `₹${Math.max(0, Math.round(paise / 100)).toLocaleString("en-IN")}`;

interface Props {
  tiers: FeaturePriceTier[];
  cycle: "monthly" | "yearly";
  selectedIds: string[];
  onToggleTier: (featureIds: string[], allSelected: boolean) => void;
  /** Feature ids the subscriber already owns — rendered as "Purchased". */
  purchasedIds?: string[];
}

export default function FeaturePricingTiers({ tiers, cycle, selectedIds, onToggleTier, purchasedIds }: Props) {
  const activeTiers = tiers.filter((tier) => tier.features.length > 0);
  if (activeTiers.length === 0) return null;

  const selected = new Set(selectedIds.map(String));
  const purchased = new Set((purchasedIds || []).map(String));
  const cycleLabel = cycle === "yearly" ? "/yr" : "/mo";

  return (
    <div className="px-5 pt-5" data-feature-pricing-tiers>
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-bold text-white/85">Features by price</h3>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-white/55">
        Prices below reflect your selected plan and billing cycle. Tap a tier to add everything in it.
      </p>

      <div className="space-y-2">
        {activeTiers.map((tier) => {
          const ids = tier.features.map((feature) => String(feature.id));
          // Already-purchased features stay locked into the membership: they
          // read "Purchased" (emerald) and are excluded from the tap-to-toggle
          // selection math.
          const purchasableIds = ids.filter((id) => !purchased.has(id));
          const allSelected = purchasableIds.length > 0 && purchasableIds.every((id) => selected.has(id));
          const someSelected = !allSelected && purchasableIds.some((id) => selected.has(id));
          const allPurchased = purchasableIds.length === 0;

          return (
            <GlassCard
              key={tier.pricePaise}
              role="checkbox"
              aria-checked={allSelected ? true : someSelected ? "mixed" : false}
              aria-disabled={allPurchased || undefined}
              tabIndex={allPurchased ? -1 : 0}
              onClick={() => { if (!allPurchased) onToggleTier(purchasableIds, allSelected); }}
              onKeyDown={(event) => {
                if (allPurchased) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onToggleTier(purchasableIds, allSelected);
                }
              }}
              data-tier-price={tier.pricePaise}
              data-tier-selected={allSelected ? "true" : someSelected ? "partial" : "false"}
              className={`w-full cursor-pointer text-left transition active:scale-[0.99] ${
                allPurchased
                  ? "cursor-default ring-1 ring-emerald-400/40"
                  : allSelected
                    ? "ring-2 ring-violet-400/50"
                    : someSelected
                      ? "ring-1 ring-violet-400/40"
                      : ""
              }`}
              contentClassName="p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {allPurchased ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                      <BadgeCheck className="h-3 w-3" /> Purchased
                    </span>
                  ) : tier.free ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-200">
                      <Gift className="h-3 w-3" /> Included
                    </span>
                  ) : (
                    <span className="text-base font-black text-white">
                      {formatRupee(tier.pricePaise)}
                      <span className="text-[11px] font-bold text-white/55">{cycleLabel}</span>
                    </span>
                  )}
                  <span className="text-[11px] font-bold text-white/55">
                    {tier.features.length} feature{tier.features.length === 1 ? "" : "s"}
                  </span>
                </div>

                {allPurchased ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                ) : (
                  <GlassCheckbox
                    checked={allSelected}
                    tabIndex={-1}
                    aria-hidden
                    className={`pointer-events-none shrink-0 ${someSelected ? "border-violet-400/70" : ""}`}
                  />
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {tier.features.map((feature) => {
                  const isPurchased = purchased.has(String(feature.id));
                  return (
                    <span
                      key={feature.id}
                      data-feature-purchased={isPurchased ? "true" : undefined}
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
                        isPurchased
                          ? "bg-emerald-500/20 font-bold text-emerald-200"
                          : selected.has(String(feature.id))
                            ? "bg-violet-500/20 text-violet-200"
                            : "border border-white/15 text-white/75"
                      }`}
                    >
                      {isPurchased ? <BadgeCheck className="h-3 w-3" /> : null}
                      {feature.name}
                    </span>
                  );
                })}
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
