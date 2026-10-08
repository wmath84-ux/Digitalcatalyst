import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import type { CanonicalCourseModule } from "../../types/commerce";
import { getModuleEffectivePrice } from "../../../utils/pdpSelection";
import { lockBodyScroll, unlockBodyScroll } from "../ui/overlayBounds";
import { GlassSurface } from "../ui/glass";
import { GlassButton } from "../ui/glass-button";
import { GlassInput } from "../ui/glass-input";
import { GlassCheckbox } from "../ui/glass-checkbox";

const formatPrice = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "Included";
  if (value === 0) return "Free";
  return `₹${value.toLocaleString("en-IN")}`;
};

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return modules;
    return modules.filter((module) =>
      module.title.toLowerCase().includes(q)
      || String(module.description || "").toLowerCase().includes(q),
    );
  }, [modules, query]);

  const selectable = filtered.filter((module) => !ownedIds.has(module.id));
  const allFilteredSelected = selectable.length > 0 && selectable.every((module) => selectedIds.includes(module.id));

  const toggleModule = (id: string) => {
    if (ownedIds.has(id)) return;
    if (selectedIds.includes(id)) onChangeSelected(selectedIds.filter((value) => value !== id));
    else onChangeSelected([...selectedIds, id]);
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(selectable.map((module) => module.id));
      onChangeSelected(selectedIds.filter((id) => !filteredIds.has(id)));
      return;
    }
    onChangeSelected(Array.from(new Set([...selectedIds, ...selectable.map((module) => module.id)])));
  };

  const selectedTotal = modules
    .filter((module) => selectedIds.includes(module.id))
    .reduce((sum, module) => sum + (getModuleEffectivePrice(module, fallbackPrice) || 0), 0);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);

  if (!open) return null;

  // Portal to document.body so parent clipping cannot cut off the picker.
  // The modal keeps one glass frame; module options are intentionally plain rows.
  const overlay = (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
      data-pdp-module-select-overlay
      onClick={onClose}
    >
      <GlassSurface
        onClick={(event) => event.stopPropagation()}
        data-pdp-module-select-modal
        role="dialog"
        aria-modal="true"
        aria-label="Purchase individually"
        radius={0}
        style={{ borderRadius: "var(--glass-sheet-radius)" }}
        className="flex min-h-0 w-full max-w-md flex-col overflow-hidden text-white"
        contentClassName="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex justify-center pb-1 pt-3 sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-white/30" />
        </div>
        <div data-pdp-module-select-header className="flex items-center justify-between px-5 pb-3 pt-1">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-white">Select modules</h2>
            <p className="text-xs text-white/60">
              {selectedIds.length} of {modules.length} selected · {formatPrice(selectedTotal)}
            </p>
          </div>
          <GlassButton type="button" onClick={onClose} className="[&_.size-12]:size-9" aria-label="Close">
            <X className="h-4 w-4" />
          </GlassButton>
        </div>

        {modules.length > 0 ? (
          <div data-pdp-module-search className="px-5 pb-3">
            <div className="flex items-center gap-2">
              <GlassInput
                type="search"
                className="w-full"
                icon={<Search className="h-4 w-4" aria-hidden="true" />}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search modules..."
              />
              {query ? (
                <GlassButton type="button" onClick={() => setQuery("")} className="shrink-0 [&_.size-12]:size-9" aria-label="Clear search">
                  <X className="h-4 w-4" />
                </GlassButton>
              ) : null}
            </div>
          </div>
        ) : null}

        {modules.length > 0 ? (
          <div
            data-pdp-select-all
            role="checkbox"
            aria-checked={allFilteredSelected}
            tabIndex={0}
            onClick={toggleSelectAll}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleSelectAll();
              }
            }}
            className="mx-5 mb-2 flex cursor-pointer items-center justify-between border-b border-white/10 pb-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <GlassCheckbox checked={allFilteredSelected} tabIndex={-1} aria-hidden="true" onCheckedChange={toggleSelectAll} onClick={(event) => event.stopPropagation()} className="shrink-0" />
              <span className="text-sm font-bold text-white">Select all{query ? " (filtered)" : ""}</span>
            </span>
            <span className="shrink-0 pl-3 text-xs font-medium text-white/55">{filtered.length} modules</span>
          </div>
        ) : null}

        <div data-pdp-module-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3">
          {modules.length === 0 ? (
            <div data-pdp-no-modules className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <PackageOpenIcon />
              <p className="mt-3 text-base font-bold text-white">No modules</p>
              <p className="mt-1 max-w-sm text-sm leading-relaxed text-white/60">No modules have been published for this product yet.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div data-pdp-no-search-results className="py-14 text-center">
              <p className="text-sm font-semibold text-white/75">No modules match “{query}”</p>
              <p className="mt-1 text-xs text-white/50">Try a different search.</p>
            </div>
          ) : (
            <ul data-pdp-module-list className="m-0 list-none divide-y divide-white/10 p-0">
              {filtered.map((module) => {
                const checked = selectedIds.includes(module.id);
                const owned = ownedIds.has(module.id);
                const price = getModuleEffectivePrice(module, fallbackPrice);
                const resourceCount = module.resources?.length || 0;
                const description = String(module.description || "").trim();
                return (
                  <li
                    key={module.id}
                    role="checkbox"
                    aria-checked={owned || checked}
                    aria-label={`${module.title} — ${owned ? "already purchased" : formatPrice(price)}`}
                    aria-disabled={owned || undefined}
                    tabIndex={owned ? -1 : 0}
                    data-pdp-module-pick={module.id}
                    data-selected={checked ? "true" : "false"}
                    data-owned={owned ? "true" : "false"}
                    onClick={() => { if (!owned) toggleModule(module.id); }}
                    onKeyDown={(event) => {
                      if (owned) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleModule(module.id);
                      }
                    }}
                    className="dc-pdp-module-row"
                  >
                    <span className="dc-pdp-module-copy">
                      <span data-pdp-module-title className="dc-pdp-module-title">{module.title}</span>
                      {description ? (
                        <span data-pdp-module-summary className="dc-pdp-module-summary">{description}</span>
                      ) : resourceCount > 0 ? (
                        <span data-pdp-module-summary className="dc-pdp-module-summary">
                          {resourceCount} resource{resourceCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </span>
                    <span className="dc-pdp-module-option">
                      <span data-pdp-module-price className={owned ? "dc-pdp-module-price dc-pdp-module-price--owned" : "dc-pdp-module-price"}>
                        {owned ? "Purchased" : formatPrice(price)}
                      </span>
                      <GlassCheckbox
                        checked={owned || checked}
                        disabled={owned}
                        tabIndex={-1}
                        aria-hidden="true"
                        onCheckedChange={() => toggleModule(module.id)}
                        onClick={(event) => event.stopPropagation()}
                        className="shrink-0"
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div data-pdp-module-select-footer className="border-t border-white/10 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <GlassButton
            variant="capsule"
            type="button"
            data-pdp-module-select-confirm
            onClick={onClose}
            className="w-full [&>span>div]:h-12 [&>span>div]:w-full [&>span>div]:gap-2 [&>span>div]:px-4 [&>span>div]:text-sm [&>span>div]:font-bold"
          >
            {selectedIds.length > 0
              ? `Select ${selectedIds.length} module${selectedIds.length === 1 ? "" : "s"} · ${formatPrice(selectedTotal)}`
              : "Select modules"}
          </GlassButton>
        </div>
      </GlassSurface>
    </div>
  );

  if (typeof document === "undefined" || !document.body) return overlay;
  return createPortal(overlay, document.body);
}

function PackageOpenIcon() {
  return (
    <span aria-hidden="true" className="mb-1 text-indigo-200/70">
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 9.5 12 4l9 5.5" />
        <path d="M3 9.5v6L12 21l9-5.5v-6" />
        <path d="M12 21v-6.5" />
        <path d="M7.5 12.2 12 14.8l4.5-2.6" />
      </svg>
    </span>
  );
}
