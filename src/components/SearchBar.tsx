import { GlassSurface } from "@/components/ui/glass";
import { SearchIcon, XIcon } from "./icons";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  sort: string;
  onSortChange: (value: string) => void;
};

const SORT_OPTIONS = ["Recommended", "Price: Low to High", "Price: High to Low", "Top Rated", "Newest"];

export default function SearchBar({ value, onChange, sort, onSortChange }: SearchBarProps) {
  // The store's search bar is now a tap target: opening it launches the
  // dedicated `#/search` page so the user gets a proper full-bleed
  // search experience with live filtering, sort, and category chips.
  // The current `value` is passed across as a `?q=` deep link so the
  // search page opens with the same query already typed.
  const openSearchPage = () => {
    const trimmed = value.trim();
    window.location.hash = trimmed ? `#/search?q=${encodeURIComponent(trimmed)}` : "#/search";
  };

  return (
    <div className="space-y-2 px-4">
      {/* Wave 2 (global chrome): the capsule used to be an ad-hoc
          `bg-white/60 border-white/70 shadow-lg backdrop-blur-xl` div. It is
          now a `GlassSurface` lens, i.e. the same refraction layer the header
          discs and the desktop top bar use, so the store's search reads as one
          material with the rest of the chrome. The interaction contract is
          untouched: still a `role="button"` tap target (`data-store-search-trigger`)
          that hands its draft query to `#/search?q=`, still keyboard-operable,
          still clearable. */}
      <div
        className="group relative block w-full cursor-pointer overflow-hidden rounded-2xl text-left outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-400/70 active:scale-[0.99]"
        onClick={openSearchPage}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openSearchPage();
          }
        }}
        data-store-search-trigger
      >
        <GlassSurface
          tint={0.62}
          tintColor="255,255,255"
          blur={18}
          saturation={1.4}
          radius={18}
          className="pointer-events-none absolute inset-0 transition duration-200 group-hover:brightness-[1.02]"
        />
        <div className="relative flex items-center gap-2 px-4 py-3.5">
          <SearchIcon className="h-5 w-5 shrink-0 text-slate-500" />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={openSearchPage}
            placeholder="Search courses, notes, class, subject..."
            aria-label="Search the catalogue"
            className="w-full min-w-0 cursor-pointer bg-transparent text-[15px] font-medium text-slate-900 placeholder:text-slate-500 focus:outline-none"
            readOnly
          />
          {value ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
            >
              <XIcon className="h-4 w-4" />
            </button>
          ) : (
            <span className="hidden shrink-0 rounded-md bg-slate-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:inline">
              Tap to search
            </span>
          )}
        </div>
      </div>

      {/* The sort control is a native <select>: it becomes `glass-select` in
          Wave 3, when the store screens are converted. */}
      <div className="flex justify-end">
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          className="rounded-xl border border-white/70 bg-white/65 px-3 py-2 text-xs font-semibold text-slate-700 shadow-md shadow-indigo-200/40 backdrop-blur-md transition focus:outline-none focus:ring-2 focus:ring-indigo-300/50"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
