import { useMemo, useState } from "react";
import { CheckIcon, SlidersIcon, XIcon } from "./icons";
import type { StoreFilter } from "../data/storeFilters";
import { GlassSurface } from "./ui/glass";
import { GlassButton } from "./ui/glass-button";
import { GlassToggleGroup, GlassToggleItem } from "./ui/glass-toggle-group";
import { LiquidMetalButton } from "./ui/LiquidMetalButton";

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
      {/* Wave 3 (commerce): the chip row is `glass-toggle-group`, so the selected
          filter is a droplet that *slides* between chips instead of a repaint —
          one moving lens rather than N pills. `dc-chip-group` re-inks the pack's
          white-on-dark labels for this light strip (see src/glass.css). The row
          still scrolls sideways, and the indicator rides inside the group, so it
          stays glued to its chip while scrolling. `dc-segment` is the shared
          light-theme recipe in src/glass.css (the PDP tab strip uses it too). */}
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <GlassButton
          variant="capsule"
          type="button"
          onClick={() => setShowFilters((prev) => !prev)}
          aria-expanded={showFilters}
          className={`shrink-0 [&>span>div]:h-10 [&>span>div]:gap-1.5 [&>span>div]:px-3.5 [&>span>div]:text-sm [&>span>div]:font-semibold ${showFilters ? "text-indigo-200" : ""}`}
        >
          <SlidersIcon className="h-4 w-4" />
          <span>Filters</span>
        </GlassButton>

        <GlassToggleGroup
          className="dc-segment shrink-0"
          value={activeId}
          onValueChange={onSelect}
          aria-label="Filter the catalogue"
        >
          {filters.map((filter) => (
            <GlassToggleItem
              key={filter.id}
              value={filter.id}
              title={filter.description || filter.label}
              className="shrink-0 whitespace-nowrap px-3.5 py-1.5 text-[13px] font-semibold"
            >
              {activeId === filter.id && <CheckIcon className="h-3.5 w-3.5" />}
              {filter.label}
            </GlassToggleItem>
          ))}
        </GlassToggleGroup>
      </div>

      {showFilters && (
        <GlassSurface
          radius={24}
          className="absolute left-4 right-4 top-full z-30 mt-2 overflow-hidden text-sm text-white/85"
          contentClassName="p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-extrabold text-white">Refine your search</p>
              <p className="mt-0.5 text-xs text-white/75">Pick a filter to narrow the catalog.</p>
            </div>
            <GlassButton
              type="button"
              aria-label="Close filters"
              onClick={() => setShowFilters(false)}
              className="shrink-0 [&_.size-12]:size-8"
            >
              <XIcon className="h-4 w-4" />
            </GlassButton>
          </div>

          <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
            {grouped.length === 0 ? (
              <p className="text-xs text-white/55">No filters configured yet.</p>
            ) : (
              grouped.map(([group, items]) => (
                <div key={group}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">{group}</p>
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
                              ? "border-transparent bg-indigo-600 text-white"
                              : "border-white/10 bg-white/[0.08] text-white/85 hover:border-indigo-400/50 hover:text-indigo-200"
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
            <LiquidMetalButton
              tone="silver"
              className="flex-1"
              onClick={() => { onSelect("all"); setShowFilters(false); }}
            >
              <span className="text-xs font-bold">Clear filters</span>
            </LiquidMetalButton>
            <LiquidMetalButton tone="primary" className="flex-1" onClick={() => setShowFilters(false)}>
              <span className="text-xs font-bold">Done</span>
            </LiquidMetalButton>
          </div>
        </GlassSurface>
      )}
    </div>
  );
}
