import { useMemo, useState } from "react";
import type { CanonicalCourseModule } from "../../types/commerce";
import { getModuleEffectivePrice } from "../../../utils/pdpSelection";
import ContentDialog from "../ui/ContentDialog";
import "./module-picker.css";
const formatPrice = (value: number | null) =>
  value === null || !Number.isFinite(value)
    ? "Included"
    : `₹${Math.max(0, value).toLocaleString("en-IN", {
        maximumFractionDigits: 2,
      })}`;
interface Props {
  open: boolean;
  modules: CanonicalCourseModule[];
  selectedIds: string[];
  ownedIds: Set<string>;
  fallbackPrice: number;
  onClose: () => void;
  onChangeSelected: (ids: string[]) => void;
}
export default function ModuleSelectModal({
  open,
  modules,
  selectedIds,
  ownedIds,
  fallbackPrice,
  onClose,
  onChangeSelected,
}: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      modules.filter((module) =>
        `${module.title} ${module.description || ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      ),
    [modules, query]
  );
  const selectable = filtered.filter((module) => !ownedIds.has(module.id));
  const allFilteredSelected =
    selectable.length > 0 &&
    selectable.every((module) => selectedIds.includes(module.id));
  const toggleModule = (id: string) => {
    if (ownedIds.has(id)) return;
    onChangeSelected(
      selectedIds.includes(id)
        ? selectedIds.filter((value) => value !== id)
        : [...selectedIds, id]
    );
  };
  const toggleSelectAll = () => {
    const ids = new Set(selectable.map((module) => module.id));
    onChangeSelected(
      allFilteredSelected
        ? selectedIds.filter((id) => !ids.has(id))
        : Array.from(new Set([...selectedIds, ...ids]))
    );
  };
  const selected = modules.filter(
    (module) => selectedIds.includes(module.id) && !ownedIds.has(module.id)
  );
  const selectedTotal = selected.reduce(
    (sum, module) =>
      sum + (getModuleEffectivePrice(module, fallbackPrice) || 0),
    0
  );
  return (
    <ContentDialog
      open={open}
      onClose={onClose}
      title="Select modules"
      description={`${selected.length} selected · Estimate ${formatPrice(
        selectedTotal
      )}`}
      data-pdp-module-select-overlay
      data-pdp-module-select-modal
      footer={
        <button
          type="button"
          className="dc-content-primary"
          data-pdp-module-select-confirm
          onClick={onClose}
        >
          Done
        </button>
      }
    >
      {modules.length ? (
        <>
          <label className="dc-module-search" data-pdp-module-search>
            <span className="sr-only">Search modules</span>
            <input
              type="search"
              placeholder="Search modules"
              aria-label="Search modules"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="dc-module-select-all" data-pdp-select-all>
            <input
              type="checkbox"
              checked={allFilteredSelected}
              disabled={!selectable.length}
              onChange={toggleSelectAll}
            />
            <span>Select all{query ? " matching" : ""} modules</span>
          </label>
        </>
      ) : null}
      {!modules.length ? (
        <div data-pdp-no-modules>
          <h3>No modules</h3>
          <p className="dc-content-note">
            No individually purchasable modules have been published for this
            product.
          </p>
        </div>
      ) : !filtered.length ? (
        <div data-pdp-no-search-results>
          <h3>No matching modules</h3>
          <p className="dc-content-note">Try a different search.</p>
        </div>
      ) : (
        <ul
          data-pdp-module-scroll
          data-pdp-module-list
          className="dc-module-choices"
        >
          {filtered.map((module) => {
            const owned = ownedIds.has(module.id);
            const price = getModuleEffectivePrice(module, fallbackPrice);
            const original =
              typeof module.cashPrice === "number" &&
              Number.isFinite(module.cashPrice)
                ? module.cashPrice
                : 0;
            const requirements = (module.requiredPreviousModuleIds || []).map(
              (id) =>
                modules.find((item) => item.id === id)?.title ||
                `Module ID: ${id}`
            );
            return (
              <li
                key={module.id}
                data-pdp-module-pick={module.id}
                data-selected={
                  selectedIds.includes(module.id) ? "true" : "false"
                }
                data-owned={owned ? "true" : "false"}
              >
                <label className="dc-module-choice">
                  <input
                    type="checkbox"
                    checked={owned || selectedIds.includes(module.id)}
                    disabled={owned}
                    onChange={() => toggleModule(module.id)}
                    aria-label={`${module.title} — ${
                      owned ? "already purchased" : formatPrice(price)
                    }`}
                  />
                  <span className="dc-module-choice-copy">
                    <strong data-pdp-module-title>{module.title}</strong>
                    {module.description ? (
                      <span data-pdp-module-summary>{module.description}</span>
                    ) : null}
                    <span>
                      {module.resources?.length || 0} resource
                      {module.resources?.length === 1 ? "" : "s"}
                    </span>
                    {requirements.length ? (
                      <span>Requires: {requirements.join(", ")}</span>
                    ) : null}
                    {owned ? <span>Already purchased · No charge</span> : null}
                  </span>
                  <span className="dc-module-choice-price">
                    {!owned && price !== null && original > price ? (
                      <del>{formatPrice(original)}</del>
                    ) : null}
                    <strong data-pdp-module-price>
                      {owned ? "₹0" : formatPrice(price)}
                    </strong>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <p className="dc-content-note dc-module-rules">
        Required modules are added automatically unless already owned. Checkout
        verifies the exact items, discounts and payable; already-purchased
        modules are not charged again.
      </p>
    </ContentDialog>
  );
}
