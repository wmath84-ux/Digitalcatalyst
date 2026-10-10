import type { Category } from "../types";
import { GlassToggleGroup, GlassToggleItem } from "../../components/ui/glass-toggle-group";

interface CategoryNavProps {
  categories: Category[];
  activeCategory: string;
  onSelect: (id: string) => void;
}

const categoryNames: Record<string, string> = {
  all: "All products",
  video: "Video courses",
  pdf: "PDFs and notes",
  ebook: "E-books",
  live: "Live classes",
};

export default function CategoryNav({ categories, activeCategory, onSelect }: CategoryNavProps) {
  if (categories.length === 0) return null;

  return (
    <div className="dc-home-category-scroll">
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
            title={categoryNames[category.id] || category.label}
            aria-label={categoryNames[category.id] || category.label}
            className="dc-home-category-item whitespace-nowrap"
          >
            <span>{category.label}</span>
          </GlassToggleItem>
        ))}
      </GlassToggleGroup>
    </div>
  );
}
