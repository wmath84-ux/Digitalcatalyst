import type { Category } from "../types";
import { GlassToggleGroup, GlassToggleItem } from "../../components/ui/glass-toggle-group";
import { useDragScroll } from "../../hooks/useDragScroll";

interface CategoryNavProps {
  categories: Category[];
  activeCategory: string;
  onSelect: (id: string) => void;
}

export default function CategoryNav({ categories, activeCategory, onSelect }: CategoryNavProps) {
  // Mouse parity: the strip is a touch scroller with a hidden scrollbar, so a
  // desktop pointer gets the same left/right drag a thumb gets (and the drag
  // never fires a category — useDragScroll swallows the click it ends with).
  const strip = useDragScroll<HTMLDivElement>();

  return (
    /* `dc-filter-ui` — the category strip is the first half of Home's filtering
       (the Filters control sits directly below it), so it takes the same
       controlled corner radius as the store's chip rail rather than the pack's
       capsule. The hook rides on a wrapper because the scroller's own class
       list is a pinned contract (drag-scroll + gutter). */
    <div className="dc-filter-ui">
      <div
        ref={strip.ref}
        onPointerDown={strip.onPointerDown}
        className="mt-5 flex overflow-x-auto px-5 pb-1 no-scrollbar"
      >
        {/* Wave 12: the category strip is the pack GlassToggleGroup (segment
            material, sliding indicator) instead of hand-frosted pills.
            `dc-scene-plate` gives the pill the same dark contrast backing the
            review cards wear (glass.css) so the unselected labels survive the
            bright snow band they scroll through; the indigo droplet and the
            selected white label are untouched. */}
        <GlassToggleGroup
          className="dc-segment dc-scene-plate shrink-0"
          value={activeCategory}
          onValueChange={onSelect}
          aria-label="Browse by category"
        >
          {categories.map((category) => (
            <GlassToggleItem
              key={category.id}
              value={category.id}
              className="whitespace-nowrap px-4 py-2 text-sm font-semibold"
            >
              <span>{category.icon}</span>
              <span>{category.label}</span>
            </GlassToggleItem>
          ))}
        </GlassToggleGroup>
      </div>
    </div>
  );
}
