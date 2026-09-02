// src/subscription/components/FeatureSelectTrigger.tsx
//
// Part 9 — feature picker trigger. Server-driven: features come
// from the Part 9 catalog. Shows the count + total price in
// paise → rupee format.

import { ChevronRight, Sparkles } from "lucide-react";
import type { SubscriptionFeatureDoc } from "../utils/subscriptionCatalog";

type FeatureWithResolvedPrice = SubscriptionFeatureDoc & {
  resolvedPricePaise?: number;
  resolvedIncluded?: boolean;
};

interface Props {
  features: FeatureWithResolvedPrice[];
  selectedIds: string[];
  onOpen: () => void;
  /** Feature ids the subscriber already owns — shown as "Purchased". */
  purchasedIds?: string[];
}

const formatRupee = (paise: number): string =>
  `₹${Math.max(0, Math.round(paise / 100)).toLocaleString("en-IN")}`;

export default function FeatureSelectTrigger({ features, selectedIds, onOpen, purchasedIds }: Props) {
  const purchasedSet = new Set(purchasedIds || []);
  const selectedFeatures = features.filter((f) => selectedIds.includes(f.id));
  const purchasedCount = selectedFeatures.filter((f) => purchasedSet.has(f.id)).length;
  const addableFeatures = selectedFeatures.filter((f) => !purchasedSet.has(f.id));
  // Plan/cycle-resolved rate when available (the page resolves the list
  // via `resolveFeaturesForPlan`); flat rate as a safety fallback. Already
  // purchased features are never added to the payable total.
  const totalPaise = addableFeatures.reduce(
    (sum, f) =>
      sum + (f.resolvedIncluded ? 0 : typeof f.resolvedPricePaise === "number" ? f.resolvedPricePaise : f.pricePaise || 0),
    0,
  );
  return (
    <div className="px-5 pt-3">
      <button
        type="button"
        onClick={onOpen}
        data-subscription-features-trigger
        className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] p-4 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15">
            <Sparkles className="h-5 w-5 text-amber-500" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-white/85">Select features</p>
            {selectedFeatures.length === 0 ? (
              <p className="text-xs text-white/55">Add premium features to your plan</p>
            ) : (
              <p className="text-xs font-medium text-amber-300">
                {addableFeatures.length} feature
                {addableFeatures.length !== 1 ? "s" : ""} · +{formatRupee(totalPaise)}
                {purchasedCount > 0 ? (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-200">
                    {purchasedCount} purchased
                  </span>
                ) : null}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {purchasedCount > 0 ? (
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-emerald-600 px-2 text-[11px] font-bold text-white">
              {purchasedCount}
            </span>
          ) : null}
          {addableFeatures.length > 0 ? (
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-500 px-2 text-[11px] font-bold text-white">
              {addableFeatures.length}
            </span>
          ) : null}
          <ChevronRight className="h-4.5 w-4.5 text-white/40" />
        </div>
      </button>
    </div>
  );
}
