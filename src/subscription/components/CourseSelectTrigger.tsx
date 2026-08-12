// src/subscription/components/CourseSelectTrigger.tsx
//
// Part 9 — "Pick products" trigger. The product list is loaded
// server-side and passed in via the catalog; this component is
// display-only and delegates the selection to the parent.

import { ChevronRight, LayoutGrid } from "lucide-react";
import type { SubscriptionCatalog } from "../utils/subscriptionCatalog";

interface Props {
  selectedIds: string[];
  onOpen: () => void;
  catalog: SubscriptionCatalog | null;
}

export default function CourseSelectTrigger({ selectedIds, onOpen, catalog }: Props) {
  // Products the buyer can attach to the subscription. The
  // Part 9 catalog exposes these via the `productUnlocks` map;
  // for a richer UI, the parent can pass the full `siteProducts`
  // list. We surface the count + ids as a stable summary.
  const unlockCount = catalog?.productUnlocks.length || 0;
  const selectedCount = selectedIds.length;
  return (
    <div className="px-5 pt-5">
      <button
        type="button"
        onClick={onOpen}
        data-subscription-products-trigger
        className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/60 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50">
            <LayoutGrid className="h-5 w-5 text-violet-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-800">Pick bonus products</p>
            {selectedCount === 0 ? (
              <p className="text-xs text-slate-400">
                Add a la carte products to your subscription
              </p>
            ) : (
              <p className="text-xs font-medium text-violet-600">
                {selectedCount} product{selectedCount !== 1 ? "s" : ""} selected
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <span>{unlockCount} available</span>
          <ChevronRight className="h-4 w-4" />
        </div>
      </button>
    </div>
  );
}
