import type { Category } from "./types";

interface CategoryNavProps {
  categories: Category[];
  activeCategory: string;
  onSelect: (id: string) => void;
}

export default function CategoryNav({ categories, activeCategory, onSelect }: CategoryNavProps) {
  return (
    <div className="mt-5 flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar">
      {categories.map((category) => {
        const isActive = category.id === activeCategory;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-95 ${
              isActive
                ? "bg-slate-900 text-white shadow-md shadow-slate-400/30"
                : "bg-white text-slate-600 shadow-sm shadow-slate-200 hover:bg-slate-50"
            }`}
          >
            <span>{category.icon}</span>
            <span>{category.label}</span>
          </button>
        );
      })}
    </div>
  );
}
