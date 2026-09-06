import type { Category } from "../types";
import { GlassToggleGroup, GlassToggleItem } from "../../components/ui/glass-toggle-group";

interface CategoryNavProps {
  categories: Category[];
  activeCategory: string;
  onSelect: (id: string) => void;
}

export default function CategoryNav({ categories, activeCategory, onSelect }: CategoryNavProps) {
  return (
    <div className="mt-5 flex overflow-x-auto px-5 pb-1 no-scrollbar">
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
  );
}
