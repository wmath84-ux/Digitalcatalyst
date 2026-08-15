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
}

const formatRupee = (paise: number): string =>
  `₹${Math.max(0, Math.round(paise / 100)).toLocaleString("en-IN")}`;

export default function FeatureSelectTrigger({ features, selectedIds, onOpen }: Props) {
  const selectedFeatures = features.filter((f) => selectedIds.includes(f.id));
  // Plan/cycle-resolved rate when available (the page resolves the list
  // via `resolveFeaturesForPlan`); flat rate as a safety fallback.
  const totalPaise = selectedFeatures.reduce(
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
        className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/60 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50">
            <Sparkles className="h-5 w-5 text-amber-500" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-800">Select features</p>
            {selectedFeatures.length === 0 ? (
              <p className="text-xs text-slate-400">Add premium features to your plan</p>
            ) : (
              <p className="text-xs font-medium text-amber-600">
                {selectedFeatures.length} feature
                {selectedFeatures.length !== 1 ? "s" : ""} · +{formatRupee(totalPaise)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedFeatures.length > 0 ? (
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-500 px-2 text-[11px] font-bold text-white">
              {selectedFeatures.length}
            </span>
          ) : null}
          <ChevronRight className="h-4.5 w-4.5 text-slate-300" />
        </div>
      </button>
    </div>
  );
}
