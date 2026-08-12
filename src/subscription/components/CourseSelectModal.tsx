// src/subscription/components/CourseSelectModal.tsx
//
// Part 9 — "Pick bonus products" modal. Reads the catalog's
// productUnlocks and lets the buyer pick products to attach
// to the subscription. The previous version consumed a
// hard-coded `COURSES` list; the new version is server-driven.

import { Check, X } from "lucide-react";
import { useMemo } from "react";
import type { SubscriptionCatalog } from "../utils/subscriptionCatalog";

interface Props {
  open: boolean;
  selected: string[];
  onClose: () => void;
  onChangeSelected: (ids: string[]) => void;
  catalog: SubscriptionCatalog | null;
}

export default function CourseSelectModal({
  open,
  selected,
  onClose,
  onChangeSelected,
  catalog,
}: Props) {
  const items = useMemo(() => {
    if (!catalog) return [];
    return catalog.productUnlocks
      .filter((u) => u.active)
      .map((u) => ({ id: u.productId, planId: u.planId }));
  }, [catalog]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="text-base font-black text-slate-900">Pick bonus products</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
              No bonus products are available for this plan.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((item) => {
                const isSelected = selected.includes(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChangeSelected(
                          isSelected
                            ? selected.filter((id) => id !== item.id)
                            : [...selected, item.id],
                        );
                      }}
                      data-subscription-product-pick={item.id}
                      className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-xs font-bold transition ${
                        isSelected
                          ? "border-violet-300 bg-violet-50 text-violet-800"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <span className="min-w-0 truncate">{item.id}</span>
                      {isSelected ? <Check size={14} /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-black text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
