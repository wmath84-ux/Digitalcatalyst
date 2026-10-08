import type { Category } from "../types";
import { GlassToggleGroup, GlassToggleItem } from "../../components/ui/glass-toggle-group";
import { useDragScroll } from "../../hooks/useDragScroll";

interface CategoryNavProps {
  categories: Category[];
  activeCategory: string;
  onSelect: (id: string) => void;
}

export default function CategoryNav({ categories, activeCategory, onSelect }: CategoryNavProps) {
  // Keep touch scrolling and give desktop pointers the same drag behaviour.
  const strip = useDragScroll<HTMLDivElement>();

  if (categories.length === 0) return null;

  return (
    <div
      ref={strip.ref}
      onPointerDown={strip.onPointerDown}
      className="dc-home-category-scroll no-scrollbar"
    >
      <GlassToggleGroup
        className="dc-segment dc-scene-plate shrink-0 dc-home-category-group"
        value={activeCategory}
        onValueChange={onSelect}
        aria-label="Browse learning content by category"
      >
        {categories.map((category) => (
          <GlassToggleItem
            key={category.id}
            value={category.id}
            className="dc-home-category-item whitespace-nowrap"
          >
            {category.icon ? <span aria-hidden="true" className="dc-home-category-icon">{category.icon}</span> : null}
            <span>{category.label}</span>
          </GlassToggleItem>
        ))}
      </GlassToggleGroup>
    </div>
  );
}
