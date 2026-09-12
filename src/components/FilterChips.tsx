import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDragScroll } from "@/hooks/useDragScroll";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, SlidersIcon, XIcon } from "./icons";
import type { StoreFilter } from "../data/storeFilters";
import { GlassSurface } from "./ui/glass";
import { GlassButton } from "./ui/glass-button";
import { GlassToggleGroup, GlassToggleItem } from "./ui/glass-toggle-group";
import { GlassTag, glassTagColor } from "./ui/glass-tags";
import { LiquidMetalButton } from "./ui/LiquidMetalButton";
import { cn } from "@/utils/cn";

type FilterChipsProps = {
  /** Chips to render — admin-managed, already ordered and active-filtered. */
  filters: StoreFilter[];
  activeId: string;
  onSelect: (id: string) => void;
  /**
   * `full` (default, the Store bar) — the Filters trigger plus the scrolling
   * chip rail. `trigger` — the same trigger plus an active-filter pill, for a
   * section header that already owns a category strip (Home, My Purchases).
   * Both open the identical overlay, so the filter experience is one thing
   * wherever it is mounted; only how much of the rail the page shows changes.
   */
  variant?: "full" | "trigger";
  /** Page-specific gutter. Merged with `cn`, so `px-0` really does zero the row. */
  className?: string;
};

/**
 * Store filter row. The chips come from the admin panel
 * (`settings/storeFilters`), so a filter added in Products → Store filters
 * appears here for everyone without a deploy.
 *
 * The "Filters" button opens a full-screen glass overlay (portalled to
 * <body>, so no ancestor's overflow can clip it) where EVERY filter renders
 * as an AI Canvas Glass Tag (https://aicanvas.me/components/glass-tags):
 * frosted pills with per-tag colour accents, staggered spring entrance, and
 * a colour dot that swaps for a spring-drawn check mark on selection.
 */
export default function FilterChips({
  filters,
  activeId,
  onSelect,
  variant = "full",
  className,
}: FilterChipsProps) {
  const [showFilters, setShowFilters] = useState(false);
  const closeTimer = useRef<number | null>(null);
  // Mouse parity: the chip row is a touch scroller with its scrollbar hidden,
  // so a desktop pointer drags it left/right like a thumb — and a drag that
  // ends on a chip does not fire that filter.
  const chipRow = useDragScroll<HTMLDivElement>();

  const grouped = useMemo(() => {
    const map = new Map<string, StoreFilter[]>();
    filters.forEach((filter) => {
      if (filter.id === "all") return;
      const group = filter.group || "Filters";
      map.set(group, [...(map.get(group) || []), filter]);
    });
    return Array.from(map.entries());
  }, [filters]);

  const allFilter = useMemo(() => filters.find((filter) => filter.id === "all") ?? null, [filters]);

  /* A page that mounts only the trigger still has to say what is filtering it:
     this is the chip the rail would have highlighted, shown as its own small
     box with a one-tap clear (Home, My Purchases). */
  const activeChip = useMemo(
    () => filters.find((filter) => filter.id === activeId && filter.id !== "all") ?? null,
    [filters, activeId],
  );

  // Escape closes the overlay; the page behind must not scroll while open.
  useEffect(() => {
    if (!showFilters) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowFilters(false);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [showFilters]);

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  // Pick a tag, let its check mark draw, then close the overlay.
  const pickFilter = (id: string) => {
    onSelect(id);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setShowFilters(false), 450);
  };

  // A single running index across "All" + every group keeps the entrance
  // stagger and the colour cycle continuous, exactly like the source demo.
  let tagIndex = 0;

  const overlay = (
    <AnimatePresence>
      {showFilters && (
        <motion.div
          key="store-filter-overlay"
          data-store-filter-overlay
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm"
            onClick={() => setShowFilters(false)}
          />

          <motion.div
            className="relative w-full max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:px-0 sm:pb-0"
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 24, scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 22 }}
            role="dialog"
            aria-modal="true"
            aria-label="Store filters"
          >
            <GlassSurface
              radius={24}
              className="dc-scene-plate w-full overflow-hidden text-sm text-white/85"
              contentClassName="p-5"
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

              <div className="mt-4 max-h-[55vh] space-y-4 overflow-y-auto pr-1">
                {allFilter && (
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                    <GlassTag
                      label={allFilter.label}
                      title={allFilter.description || allFilter.label}
                      color={glassTagColor(tagIndex)}
                      selected={activeId === allFilter.id}
                      index={tagIndex++}
                      onClick={() => pickFilter(allFilter.id)}
                    />
                  </div>
                )}

                {grouped.length === 0 && !allFilter ? (
                  <p className="text-xs text-white/55">No filters configured yet.</p>
                ) : (
                  grouped.map(([group, items]) => (
                    <div key={group}>
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">{group}</p>
                      <div className="mt-2 flex flex-wrap gap-2 sm:gap-3">
                        {items.map((filter) => {
                          const i = tagIndex++;
                          return (
                            <GlassTag
                              key={filter.id}
                              label={filter.label}
                              title={filter.description || filter.label}
                              color={glassTagColor(i)}
                              selected={activeId === filter.id}
                              index={i}
                              onClick={() => pickFilter(filter.id)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 flex gap-2">
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  /* The Filters button is one node shared by both variants, so the trigger a
     user learns on the Store is literally the same trigger on Home and on My
     Purchases — same capsule, same overlay, same `aria-expanded` contract. */
  const trigger = (
    <GlassButton
      variant="capsule"
      type="button"
      onClick={() => setShowFilters((prev) => !prev)}
      aria-expanded={showFilters}
      className={`dc-filter-trigger shrink-0 [&>span>div]:h-10 [&>span>div]:gap-1.5 [&>span>div]:px-3.5 [&>span>div]:text-sm [&>span>div]:font-semibold ${showFilters ? "text-indigo-200" : ""}`}
    >
      <SlidersIcon className="h-4 w-4" />
      <span>Filters</span>
    </GlassButton>
  );

  const rail = (
    /* Wave 3 (commerce): the chip row is `glass-toggle-group`, so the selected
       filter is a droplet that *slides* between chips instead of a repaint —
       one moving lens rather than N pills. The row still scrolls sideways, and
       the indicator rides inside the group, so it stays glued to its chip while
       scrolling. `dc-segment` is the shared light-theme recipe in src/glass.css
       (the PDP tab strip and Home's category rail use it too).

       Store legibility (same pass as Home): `dc-scene-plate` puts the shared
       dark contrast backing under the pill so an unselected chip label no
       longer washes out against the bright snow, and `useDragScroll` lets a
       mouse drag the row left/right exactly like a thumb — with the drag never
       firing the chip it happens to end on. */
    <div
      ref={chipRow.ref}
      onPointerDown={chipRow.onPointerDown}
      className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:[scrollbar-width:thin] lg:[scrollbar-color:rgba(255,255,255,0.16)_transparent] lg:[&::-webkit-scrollbar]:block lg:[&::-webkit-scrollbar]:h-1 lg:[&::-webkit-scrollbar-track]:bg-transparent lg:[&::-webkit-scrollbar-thumb]:rounded-full lg:[&::-webkit-scrollbar-thumb]:bg-white/15"
    >
      {trigger}

      <GlassToggleGroup
        className="dc-segment dc-scene-plate shrink-0"
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
  );

  return (
    /* `data-store-gutter` is the desktop-alignment hook (index.css): the
       mobile px-4 is zeroed inside the desktop shell so the chips sit on the
       same gutter as the hero, search and cards. `className` lets a page that
       already owns a gutter (Home's section, My Purchases' list) drop it. */
    <div data-store-gutter className={cn("relative px-4", className)}>
      {variant === "trigger" ? (
        <div className="flex flex-wrap items-center gap-2">
          {trigger}
          {activeChip ? (
            <button
              type="button"
              onClick={() => onSelect("all")}
              aria-label={`Clear the ${activeChip.label} filter`}
              className="dc-filter-active dc-focusable"
            >
              <span className="truncate">{activeChip.label}</span>
              <XIcon className="h-3 w-3 shrink-0" />
            </button>
          ) : null}
        </div>
      ) : rail}

      {/* Portalled to <body>: the sticky filter bar's `overflow-hidden`
          ancestors can never clip the overlay again. */}
      {typeof document !== "undefined" ? createPortal(overlay, document.body) : null}
    </div>
  );
}
