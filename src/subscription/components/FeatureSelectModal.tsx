import { useMemo, useState } from "react";
import {
  GlassSheet,
  GlassSheetContent,
  GlassSheetTitle,
  GlassSheetDescription,
} from "../../components/ui/glass-sheet";
import type { SubscriptionFeatureDoc } from "../utils/subscriptionCatalog";
import { formatSubscriptionMoney } from "./PriceSummary";

type FeatureWithResolvedPrice = SubscriptionFeatureDoc & {
  resolvedPricePaise?: number;
  resolvedIncluded?: boolean;
};
const featurePrice = (feature: FeatureWithResolvedPrice) =>
  typeof feature.resolvedPricePaise === "number"
    ? feature.resolvedPricePaise
    : feature.pricePaise || 0;
interface Props {
  open: boolean;
  features: FeatureWithResolvedPrice[];
  selected: string[];
  onClose: () => void;
  onChangeSelected: (ids: string[]) => void;
  includedIds: string[];
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
  const filtered = useMemo(
    () =>
      features.filter((feature) =>
        `${feature.name} ${feature.description}`.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [features, query]
  );
  const selectableFeatures = filtered.filter(
    (feature) => !purchasedSet.has(feature.id) && !includedSet.has(feature.id)
  );
  const allFilteredSelected =
    selectableFeatures.length > 0 &&
    selectableFeatures.every((feature) => selected.includes(feature.id));
  const toggleFeature = (id: string) => {
    if (purchasedSet.has(id) || includedSet.has(id)) return;
    onChangeSelected(
      selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]
    );
  };
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const ids = new Set(selectableFeatures.map((feature) => feature.id));
      onChangeSelected(selected.filter((id) => !ids.has(id)));
    } else
      onChangeSelected(
        Array.from(new Set([...selected, ...selectableFeatures.map((feature) => feature.id)]))
      );
  };
  const selectedTotalPaise = features
    .filter(
      (feature) =>
        selected.includes(feature.id) &&
        !includedSet.has(feature.id) &&
        !purchasedSet.has(feature.id)
    )
    .reduce((sum, feature) => sum + featurePrice(feature), 0);
  return (
    <GlassSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <GlassSheetContent
        side="bottom"
        className="dc-subscription-picker flex max-h-[85vh] flex-col"
        aria-label="Select features"
        data-subscription-feature-sheet
      >
        <header>
          <div>
            <GlassSheetTitle>Select features</GlassSheetTitle>
            <GlassSheetDescription>
              New add-ons: {formatSubscriptionMoney(selectedTotalPaise)}
            </GlassSheetDescription>
          </div>
          <button
            type="button"
            className="dc-subscription-text-action"
            aria-label="Close feature picker"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <input
          type="search"
          aria-label="Search features"
          placeholder="Search features"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="dc-subscription-select-all">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            disabled={!selectableFeatures.length}
            onChange={toggleSelectAll}
          />
          <span>Select all {query ? "matching " : ""}add-ons</span>
        </label>
        <div className="dc-subscription-picker-list">
          {filtered.length ? (
            <ul>
              {filtered.map((feature) => {
                const isIncluded = includedSet.has(feature.id);
                const isPurchased = purchasedSet.has(feature.id) && !isIncluded;
                const locked = isIncluded || isPurchased;
                return (
                  <li key={feature.id}>
                    <label
                      className="dc-subscription-pick-row"
                      data-subscription-feature-pick={feature.id}
                      data-included={isIncluded ? "true" : "false"}
                      data-purchased={isPurchased ? "true" : "false"}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(feature.id) || locked}
                        disabled={locked}
                        onChange={() => toggleFeature(feature.id)}
                      />
                      <span>
                        <strong>{feature.name}</strong>
                        {feature.description ? <small>{feature.description}</small> : null}
                        {typeof feature.userLimit?.aiQuestionsPerDay === "number" ? (
                          <small>
                            Daily questions:{" "}
                            {feature.userLimit.aiQuestionsPerDay < 0
                              ? "Unlimited"
                              : feature.userLimit.aiQuestionsPerDay}
                          </small>
                        ) : null}
                      </span>
                      <span className="dc-subscription-pick-price">
                        <strong>
                          {formatSubscriptionMoney(locked ? 0 : featurePrice(feature))}
                        </strong>
                        {locked ? <small>{isIncluded ? "Included" : "Purchased"}</small> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dc-subscription-note">
              {query
                ? "No features match your search."
                : "No features are available for this plan and duration."}
            </p>
          )}
        </div>
        <button type="button" className="dc-subscription-primary" onClick={onClose}>
          Done
        </button>
      </GlassSheetContent>
    </GlassSheet>
  );
}
