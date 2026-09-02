// src/subscription/components/FeatureSelectModal.tsx
//
// Part 9 — feature picker modal. Server-driven: features come
// from the Part 9 catalog (Firestore `subscriptionFeatures`).
// All amounts are in paise (integer); the component formats to
// rupees for display.

import { useMemo, useState } from "react";
import { GlassSheet, GlassSheetContent, GlassSheetTitle, GlassSheetDescription } from "../../components/ui/glass-sheet";
import { GlassButton } from "../../components/ui/glass-button";
import { GlassInput } from "../../components/ui/glass-input";
import { GlassTile } from "../../components/ui/glass-tile";
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
  download: "bg-blue-500/15 text-blue-300",
  award: "bg-amber-500/15 text-amber-300",
  users: "bg-violet-500/15 text-violet-300",
  headphones: "bg-emerald-500/15 text-emerald-300",
  code: "bg-rose-500/15 text-rose-300",
  "message-circle": "bg-indigo-500/15 text-indigo-300",
  "bar-chart-3": "bg-cyan-500/15 text-cyan-300",
  rocket: "bg-orange-500/15 text-orange-300",
  calendar: "bg-violet-500/15 text-violet-300",
  brain: "bg-indigo-500/15 text-indigo-300",
  "refresh-cw": "bg-sky-500/15 text-sky-300",
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

  // Phase A: bottom GlassSheet + GlassInput search + GlassTile rows — the
  // website-glass pack at its defaults, no hand-painted white sheet.
  return (
    <GlassSheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <GlassSheetContent side="bottom" className="flex max-h-[85vh] flex-col text-white" aria-label="Select features" data-subscription-feature-sheet>
        <div className="flex items-center justify-between pb-3">
          <div>
            <GlassSheetTitle>Select features</GlassSheetTitle>
            <GlassSheetDescription>
              {selected.length} of {features.length} selected · +{formatRupee(selectedTotalPaise)}
            </GlassSheetDescription>
          </div>
          <GlassButton onClick={onClose} aria-label="Close" className="[&_.size-12]:size-9">
            <X className="h-4 w-4" />
          </GlassButton>
        </div>

        {/* Search */}
        <div className="pb-3">
          <GlassInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search features..."
            icon={<Search className="h-4 w-4" />}
            aria-label="Search features"
          />
        </div>

        {/* Select all */}
        <GlassTile
          selected={allFilteredSelected}
          onClick={toggleSelectAll}
          className="mb-2 aspect-auto w-full justify-between px-4 py-3"
          aria-label={`Select all ${query ? "(filtered)" : ""} features`}
        >
          <span className="text-sm font-bold">Select all {query ? "(filtered)" : ""}</span>
          <span className="text-xs font-medium text-violet-300">{filtered.length} features</span>
        </GlassTile>

        {/* Feature list */}
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Sparkles className="mb-2 h-8 w-8 text-white/30" />
              <p className="text-sm font-medium text-white/55">
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
                    <GlassTile
                      selected={isChecked || isPurchased}
                      onClick={() => toggleFeature(feat.id)}
                      disabled={isPurchased}
                      data-subscription-feature-pick={feat.id}
                      data-included={isIncluded ? "true" : "false"}
                      data-purchased={isPurchased ? "true" : "false"}
                      aria-label={isPurchased ? `${feat.name} — Purchased` : feat.name}
                      className={`aspect-auto w-full justify-start gap-3 p-3 text-left ${isPurchased ? "cursor-not-allowed" : ""} ${isIncluded && !isPurchased ? "opacity-80" : ""}`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isPurchased
                            ? "bg-emerald-500/20 text-emerald-300"
                            : ICON_BG[feat.icon] || "bg-indigo-500/15 text-indigo-200"
                        }`}
                      >
                        {isPurchased
                          ? <BadgeCheck className="h-5 w-5" strokeWidth={2.5} />
                          : ICON_MAP[feat.icon] || <Sparkles className="h-4.5 w-4.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm font-bold ${isPurchased ? "text-emerald-200" : "text-white"}`}>{feat.name}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-white/55">
                          {feat.description}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        {isPurchased ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                            <BadgeCheck size={11} strokeWidth={3} /> Purchased
                          </span>
                        ) : (
                          <span className="text-sm font-extrabold text-white">
                            {isIncluded || featurePrice(feat) <= 0 ? "Free" : `+${formatRupee(featurePrice(feat))}`}
                          </span>
                        )}
                        {isChecked || isPurchased ? (
                          <Check className="h-4 w-4 text-sky-300" strokeWidth={3} aria-hidden="true" />
                        ) : null}
                      </span>
                    </GlassTile>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Bottom */}
        <div className="pt-3 pb-[env(safe-area-inset-bottom)]">
          <GlassButton variant="capsule" onClick={onClose} className="w-full [&>span>div]:w-full">
            Done · {selected.length} features · +{formatRupee(selectedTotalPaise)}
          </GlassButton>
        </div>
      </GlassSheetContent>
    </GlassSheet>
  );
}
