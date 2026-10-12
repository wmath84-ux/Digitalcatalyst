import { useId } from "react";
import { BookOpen, FileText, Grid2X2, Radio, Video } from "lucide-react";
import type { Category } from "../types";
import useDragScroll from "../../hooks/useDragScroll";
import "./category-radio.css";

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
const categoryIcons = { all: Grid2X2, video: Video, pdf: FileText, ebook: BookOpen, live: Radio };

export default function CategoryNav({ categories, activeCategory, onSelect }: CategoryNavProps) {
  const name = useId();
  const rail = useDragScroll<HTMLDivElement>();
  if (categories.length === 0) return null;

  return (
    <div className="dc-home-category-scroll dc-home-radio-rail" ref={rail.ref} onPointerDown={rail.onPointerDown}>
      <div className="dc-home-radio-inputs" role="radiogroup" aria-label="Browse learning content by category">
        {categories.map((category) => {
          const Icon = categoryIcons[category.id as keyof typeof categoryIcons] || BookOpen;
          return (
            <label key={category.id} className="dc-home-radio-option" title={categoryNames[category.id] || category.label}>
              <input
                className="dc-home-radio-input"
                type="radio"
                name={name}
                value={category.id}
                checked={activeCategory === category.id}
                onChange={() => onSelect(category.id)}
                aria-label={categoryNames[category.id] || category.label}
              />
              <span className="dc-home-radio-tile">
                <span className="dc-home-radio-icon" aria-hidden="true"><Icon size={24} /></span>
                <span className="dc-home-radio-label">{category.label}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
