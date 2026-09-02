import type { Category } from "../types";

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
                ? "border border-indigo-300/70 bg-indigo-500/15 text-indigo-700 shadow-[0_14px_30px_-18px_rgba(79,70,229,0.65)] backdrop-blur-xl"
                : "border border-white/70 bg-white/[0.08] text-white/75 shadow-[0_12px_26px_-18px_rgba(15,23,42,0.3)] backdrop-blur-xl hover:bg-white/[0.08]"
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
