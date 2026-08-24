import { useMemo, useState } from "react";
import { CheckIcon, SlidersIcon, XIcon } from "./icons";
import type { StoreFilter } from "../data/storeFilters";

type FilterChipsProps = {
  /** Chips to render — admin-managed, already ordered and active-filtered. */
  filters: StoreFilter[];
  activeId: string;
  onSelect: (id: string) => void;
};

/**
 * Store filter row. The chips come from the admin panel
 * (`settings/storeFilters`), so a filter added in Products → Store filters
 * appears here for everyone without a deploy. The "Filters" button opens a
 * grouped sheet listing every chip, which keeps long lists usable on mobile.
 */
export default function FilterChips({ filters, activeId, onSelect }: FilterChipsProps) {
  const [showFilters, setShowFilters] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, StoreFilter[]>();
    filters.forEach((filter) => {
      if (filter.id === "all") return;
      const group = filter.group || "Filters";
      map.set(group, [...(map.get(group) || []), filter]);
    });
    return Array.from(map.entries());
  }, [filters]);

  return (
    <div className="relative px-4">
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setShowFilters((prev) => !prev)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold shadow-sm backdrop-blur-md transition ${
            showFilters
              ? "border-indigo-400/70 bg-indigo-500/15 text-indigo-700 shadow-indigo-200/60"
              : "border-white/70 bg-white/60 text-slate-700 shadow-slate-300/40 hover:bg-white/90"
          }`}
        >
          <SlidersIcon className="h-4 w-4" />
          Filters
        </button>

        {filters.map((filter) => {
          const isActive = activeId === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => onSelect(filter.id)}
              title={filter.description || filter.label}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold backdrop-blur-md transition ${
                isActive
                  ? "border-transparent bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-lg shadow-indigo-500/30"
                  : "border-white/70 bg-white/60 text-slate-700 shadow-sm shadow-slate-300/40 hover:-translate-y-px hover:bg-white/90 hover:shadow-md"
              }`}
            >
              {isActive && <CheckIcon className="h-4 w-4" />}
              {filter.label}
            </button>
          );
        })}
      </div>

      {showFilters && (
        <div className="absolute left-4 right-4 top-full z-30 mt-2 overflow-hidden rounded-3xl border border-white/70 bg-white/80 p-4 text-sm text-slate-700 shadow-2xl shadow-indigo-900/15 backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-extrabold text-slate-900">Refine your search</p>
              <p className="mt-0.5 text-xs text-slate-600">Pick a filter to narrow the catalog.</p>
            </div>
            <button
              type="button"
              aria-label="Close filters"
              onClick={() => setShowFilters(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900/5 text-slate-500 transition hover:bg-slate-900/10 hover:text-slate-800"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
            {grouped.length === 0 ? (
              <p className="text-xs text-slate-500">No filters configured yet.</p>
            ) : (
              grouped.map(([group, items]) => (
                <div key={group}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">{group}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {items.map((filter) => {
                      const isActive = activeId === filter.id;
                      return (
                        <button
                          key={filter.id}
                          type="button"
                          onClick={() => { onSelect(filter.id); setShowFilters(false); }}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            isActive
                              ? "border-transparent bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-300"
                              : "border-slate-200 bg-white/70 text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                          }`}
                        >
                          {filter.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => { onSelect("all"); setShowFilters(false); }}
              className="flex-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-white"
            >
              Clear filters
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(false)}
              className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-indigo-300/50"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
