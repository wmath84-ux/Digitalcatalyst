// src/subscription/components/FeatureSelectModal.tsx
//
// Part 9 — feature picker modal. Server-driven: features come
// from the Part 9 catalog (Firestore `subscriptionFeatures`).
// All amounts are in paise (integer); the component formats to
// rupees for display.

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Search,
  Check,
  BadgeCheck,
  Download,
  Award,
  Users,
  Headphones,
  Code,
  MessageCircle,
  BarChart3,
  Rocket,
  Sparkles,
  CalendarDays,
  Brain,
  RefreshCw,
} from "lucide-react";
import type { SubscriptionFeatureDoc } from "../utils/subscriptionCatalog";

const ICON_MAP: Record<string, React.ReactNode> = {
  download: <Download className="h-4.5 w-4.5" />,
  award: <Award className="h-4.5 w-4.5" />,
  users: <Users className="h-4.5 w-4.5" />,
  headphones: <Headphones className="h-4.5 w-4.5" />,
  code: <Code className="h-4.5 w-4.5" />,
  "message-circle": <MessageCircle className="h-4.5 w-4.5" />,
  "bar-chart-3": <BarChart3 className="h-4.5 w-4.5" />,
  rocket: <Rocket className="h-4.5 w-4.5" />,
  calendar: <CalendarDays className="h-4.5 w-4.5" />,
  brain: <Brain className="h-4.5 w-4.5" />,
  "refresh-cw": <RefreshCw className="h-4.5 w-4.5" />,
};

const ICON_BG: Record<string, string> = {
  download: "bg-blue-50 text-blue-500",
  award: "bg-amber-50 text-amber-500",
  users: "bg-violet-50 text-violet-500",
  headphones: "bg-emerald-50 text-emerald-500",
  code: "bg-rose-50 text-rose-500",
  "message-circle": "bg-indigo-50 text-indigo-500",
  "bar-chart-3": "bg-cyan-50 text-cyan-600",
  rocket: "bg-orange-50 text-orange-500",
  calendar: "bg-violet-50 text-violet-600",
  brain: "bg-indigo-50 text-indigo-600",
  "refresh-cw": "bg-sky-50 text-sky-600",
};

const formatRupee = (paise: number): string =>
  `₹${Math.max(0, Math.round(paise / 100)).toLocaleString("en-IN")}`;

/**
 * The page passes features through `resolveFeaturesForPlan`, so each
 * record carries the plan + cycle resolved price. Falling back to the
 * flat `pricePaise` keeps the component safe if a caller ever passes
 * an unresolved list.
 */
type FeatureWithResolvedPrice = SubscriptionFeatureDoc & {
  resolvedPricePaise?: number;
  resolvedIncluded?: boolean;
};

const featurePrice = (feature: FeatureWithResolvedPrice): number =>
  typeof feature.resolvedPricePaise === "number" ? feature.resolvedPricePaise : feature.pricePaise || 0;

interface Props {
  open: boolean;
  features: FeatureWithResolvedPrice[];
  selected: string[];
  onClose: () => void;
  onChangeSelected: (ids: string[]) => void;
  /** Feature ids that are already included for free with the plan. */
  includedIds: string[];
  /**
   * Feature ids the subscriber already owns (bought with their active
   * membership). These render with a "Purchased" badge and can never be
   * toggled off (or re-purchased) — exactly like already-purchased products
   * in the product picker.
   */
  purchasedIds?: string[];
}

export default function FeatureSelectModal({
  open,
  features,
  selected,
  onClose,
  onChangeSelected,
  includedIds,
  purchasedIds,
}: Props) {
  const [query, setQuery] = useState("");

  const includedSet = useMemo(() => new Set(includedIds), [includedIds]);
  const purchasedSet = useMemo(() => new Set(purchasedIds || []), [purchasedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return features;
    return features.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q),
    );
  }, [features, query]);

  // Owned (purchased) features can never be toggled. Select-all only counts
  // features the buyer can actually add or remove.
  const selectableFeatures = useMemo(
    () => filtered.filter((f) => !purchasedSet.has(f.id)),
    [filtered, purchasedSet],
  );
  const allFilteredSelected =
    selectableFeatures.length > 0 && selectableFeatures.every((f) => selected.includes(f.id));

  const toggleFeature = (id: string) => {
    if (purchasedSet.has(id)) return;
    if (selected.includes(id)) {
      onChangeSelected(selected.filter((s) => s !== id));
    } else {
      onChangeSelected([...selected, id]);
    }
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const selectableIds = new Set(selectableFeatures.map((f) => f.id));
      onChangeSelected(selected.filter((id) => !selectableIds.has(id)));
    } else {
      const merged = new Set([...selected, ...selectableFeatures.map((f) => f.id)]);
      onChangeSelected(Array.from(merged));
    }
  };

  const selectedTotalPaise = features
    .filter((f) => selected.includes(f.id) && !includedSet.has(f.id) && !purchasedSet.has(f.id))
    .reduce((sum, f) => sum + featurePrice(f), 0);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-[28px] bg-white shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 120) onClose();
            }}
          >
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1.5 w-12 rounded-full bg-slate-200" />
            </div>

            <div className="flex items-center justify-between px-5 pb-3 pt-1">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Select features</h2>
                <p className="text-xs text-slate-400">
                  {selected.length} of {features.length} selected · +{formatRupee(selectedTotalPaise)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition-transform"
                aria-label="Close"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 pb-3">
              <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3.5 py-2.5 ring-1 ring-transparent focus-within:ring-2 focus-within:ring-violet-400">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search features..."
                  className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="text-slate-400 active:text-slate-600"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            {/* Select all */}
            <button
              type="button"
              onClick={toggleSelectAll}
              className="mx-5 mb-2 flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 active:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
                    allFilteredSelected
                      ? "border-violet-600 bg-violet-600"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {allFilteredSelected ? (
                    <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                  ) : null}
                </span>
                <span className="text-sm font-bold text-slate-700">
                  Select all {query ? "(filtered)" : ""}
                </span>
              </div>
              <span className="text-xs font-medium text-violet-600">
                {filtered.length} features
              </span>
            </button>

            {/* Feature list */}
            <div className="flex-1 overflow-y-auto px-5 pb-6">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <Sparkles className="mb-2 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-medium text-slate-400">
                    No features match &ldquo;{query}&rdquo;
                  </p>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {filtered.map((feat) => {
                    const isChecked = selected.includes(feat.id);
                    const isIncluded = includedSet.has(feat.id);
                    // Already purchased with the subscriber's active
                    // membership: never selectable again, shown as Purchased.
                    const isPurchased = purchasedSet.has(feat.id);
                    return (
                      <li key={feat.id}>
                        <button
                          type="button"
                          onClick={() => toggleFeature(feat.id)}
                          disabled={isPurchased}
                          data-subscription-feature-pick={feat.id}
                          data-included={isIncluded ? "true" : "false"}
                          data-purchased={isPurchased ? "true" : "false"}
                          aria-label={isPurchased ? `${feat.name} — Purchased` : feat.name}
                          className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                            isPurchased
                              ? "cursor-not-allowed border-emerald-200 bg-emerald-50/70"
                              : isChecked
                                ? "border-violet-200 bg-violet-50"
                                : "border-slate-100 bg-white"
                          } ${isIncluded && !isPurchased ? "opacity-80" : ""}`}
                        >
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              isPurchased
                                ? "bg-emerald-100 text-emerald-600"
                                : ICON_BG[feat.icon] || "bg-slate-50 text-slate-500"
                            }`}
                          >
                            {isPurchased
                              ? <BadgeCheck className="h-5 w-5" strokeWidth={2.5} />
                              : ICON_MAP[feat.icon] || <Sparkles className="h-4.5 w-4.5" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-bold ${isPurchased ? "text-emerald-900" : "text-slate-800"}`}>{feat.name}</p>
                            <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                              {feat.description}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {isPurchased ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                                <BadgeCheck size={11} strokeWidth={3} /> Purchased
                              </span>
                            ) : (
                              <span className="text-sm font-extrabold text-slate-800">
                                {isIncluded || featurePrice(feat) <= 0 ? "Free" : `+${formatRupee(featurePrice(feat))}`}
                              </span>
                            )}
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                                isPurchased
                                  ? "border-emerald-600 bg-emerald-600 text-white"
                                  : isChecked
                                    ? "border-violet-600 bg-violet-600"
                                    : "border-slate-300 bg-white"
                              }`}
                            >
                              {isPurchased ? (
                                <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                              ) : isChecked ? (
                                <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                              ) : null}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Bottom */}
            <div className="border-t border-slate-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={onClose}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-center text-sm font-bold text-white active:scale-[0.98] transition-transform"
              >
                Done · {selected.length} features · +{formatRupee(selectedTotalPaise)}
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
