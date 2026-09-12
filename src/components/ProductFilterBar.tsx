import FilterChips from "./FilterChips";
import { GlassSurface } from "./ui/glass";
import type { StoreFilter } from "../data/storeFilters";
import { cn } from "@/utils/cn";

/**
 * One filter bar, three pages.
 *
 * The Store page owns a sticky plate and renders `<FilterChips/>` inside it
 * directly; Home and My Purchases mount the SAME component through this wrapper,
 * which adds two things and nothing else:
 *
 *   · `dc-filter-ui` — the hook that gives every filter box on every page the
 *     same controlled corner radius, ink and spacing ("THE FILTER HIERARCHY"
 *     in src/glass.css), so the container, the trigger, the chips and the
 *     overlay's option tags read as one family;
 *   · the pack `GlassSurface` shell — the identical dark contrast plate the
 *     store's bar wears, so a filter row on Home or My Purchases is the same
 *     object a user already knows, not a page-specific copy.
 *
 * Page-specific data (which chips, which products) stays with the page via
 * `useProductFilters`, so no filtering logic is duplicated anywhere.
 */
type ProductFilterBarProps = {
  chips: StoreFilter[];
  activeId: string;
  onSelect: (id: string) => void;
  /**
   * `full`    — trigger + the scrolling chip rail (what the Store bar shows).
   * `trigger` — the trigger alone plus an active-filter pill, for a section
   *             header that already carries its own category strip.
   */
  variant?: "full" | "trigger";
  /** Page rhythm. The row itself is un-padded: the section's gutter owns it. */
  className?: string;
};

export default function ProductFilterBar({
  chips,
  activeId,
  onSelect,
  variant = "full",
  className,
}: ProductFilterBarProps) {
  return (
    <div data-product-filter-bar className={cn("dc-filter-ui relative", className)}>
      {/* `radius={10}` mirrors `--dc-filter-radius` in src/glass.css — the pack
          surface takes the number as a prop, the CSS only re-points the radii
          the vendored components hard-code inline. */}
      <GlassSurface
        tint={0.25}
        blur={0}
        radius={10}
        className="dc-scene-plate"
        contentClassName="px-1.5 py-1.5"
      >
        <FilterChips filters={chips} activeId={activeId} onSelect={onSelect} variant={variant} className="px-0" />
      </GlassSurface>
    </div>
  );
}
