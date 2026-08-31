import { useMemo, useState } from "react";
import { BadgeCheck, Check, Search, Sparkles, X } from "lucide-react";
import type { CanonicalCourseModule } from "../../types/commerce";
import { getModuleEffectivePrice } from "../../../utils/pdpSelection";

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        data-pdp-module-select-modal
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex justify-center pb-1 pt-3 sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-center justify-between px-5 pb-3 pt-1">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900">Select modules</h2>
            <p className="text-xs text-slate-400">
              {selectedIds.length} of {modules.length} selected · {formatPrice(selectedTotal)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {modules.length > 0 ? <div className="px-5 pb-3">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3.5 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search modules..."
              className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} className="text-slate-400" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div> : null}

        {modules.length > 0 ? <button
          type="button"
          role="checkbox"
          aria-checked={allFilteredSelected}
          onClick={toggleSelectAll}
          className="mx-5 mb-2 flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
        >
          <div className="flex items-center gap-2.5">
            <span className={`flex h-5 w-5 items-center justify-center rounded-md border-2 ${allFilteredSelected ? "border-violet-600 bg-violet-600" : "border-slate-300 bg-white"}`}>
              {allFilteredSelected ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : null}
            </span>
            <span className="text-sm font-bold text-slate-700">Select all {query ? "(filtered)" : ""}</span>
          </div>
          <span className="text-xs font-medium text-violet-600">{filtered.length} modules</span>
        </button> : null}

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {modules.length === 0 ? (
            <div data-pdp-no-modules className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
              <PackageOpenIcon />
              <p className="mt-3 text-base font-black text-slate-900">No modules</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">This course has no modules yet. Check back when the instructor publishes them.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Sparkles className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-400">No modules match “{query}”</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {filtered.map((module) => {
                const checked = selectedIds.includes(module.id);
                const owned = ownedIds.has(module.id);
                const price = getModuleEffectivePrice(module, fallbackPrice);
                return (
        <li key={module.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={owned ? true : checked}
              aria-label={`${module.title} — ${owned ? "already owned" : `${formatPrice(price)}`}`}
              disabled={owned}
              onClick={() => toggleModule(module.id)}
                      data-pdp-module-pick={module.id}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                        owned ? "border-emerald-100 bg-emerald-50/70 opacity-80" : checked ? "border-violet-200 bg-violet-50" : "border-slate-100 bg-white"
                      }`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                        <LayoutIcon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-800">{module.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-400">
                          {module.description || `${module.resources?.length || 0} resource${(module.resources?.length || 0) === 1 ? "" : "s"} included.`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-sm font-extrabold ${owned ? "text-emerald-700" : "text-slate-800"}`}>{owned ? "Purchased" : `+${formatPrice(price)}`}</span>
                        <span aria-label={owned ? "Purchased" : undefined} className={`flex h-5 w-5 items-center justify-center rounded-md border-2 ${
                          owned ? "border-emerald-500 bg-emerald-500 text-white" : checked ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white"
                        }`}>
                          {owned ? <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.5} /> : checked ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-sm font-bold text-white"
          >
            Done · {selectedIds.length} modules · {formatPrice(selectedTotal)}
          </button>
        </div>
      </div>
    </div>
  );
}

function PackageOpenIcon() {
  return (
    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-200/70 text-slate-400">
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 9.5 12 4l9 5.5" />
        <path d="M3 9.5v6L12 21l9-5.5v-6" />
        <path d="M12 21v-6.5" />
        <path d="M7.5 12.2 12 14.8l4.5-2.6" />
      </svg>
    </span>
  );
}

function LayoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
