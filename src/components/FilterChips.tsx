import { useState } from "react";
import { CheckIcon, SlidersIcon } from "./icons";

type FilterChipsProps = {
  chips: string[];
  active: string;
  onSelect: (chip: string) => void;
};

export default function FilterChips({ chips, active, onSelect }: FilterChipsProps) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="relative px-4">
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setShowFilters((prev) => !prev)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
            showFilters
              ? "border-indigo-400 bg-indigo-100 text-indigo-800"
              : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
          }`}
        >
          <SlidersIcon className="h-4 w-4" />
          Filters
        </button>

        {chips.map((chip) => {
          const isActive = active === chip;
          return (
            <button
              key={chip}
              type="button"
              onClick={() => onSelect(chip)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                isActive
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                  : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
              }`}
            >
              {isActive && chip === "All" && <CheckIcon className="h-4 w-4" />}
              {chip}
            </button>
          );
        })}
      </div>

      {showFilters && (
        <div className="absolute left-4 right-4 top-full z-20 mt-2 rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-700 shadow-lg">
          <p className="font-bold text-slate-900">Refine your search</p>
          <p className="mt-1 text-slate-600">
            Tap a chip above to filter by category, class, or subject. More advanced filters coming soon.
          </p>
          <button
            type="button"
            onClick={() => setShowFilters(false)}
            className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
