import { SearchIcon, XIcon } from "./icons";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  sort: string;
  onSortChange: (value: string) => void;
};

const SORT_OPTIONS = ["Recommended", "Price: Low to High", "Price: High to Low", "Top Rated", "Newest"];

export default function SearchBar({ value, onChange, sort, onSortChange }: SearchBarProps) {
  return (
    <div className="space-y-2 px-4">
      <div className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/60 px-4 py-3.5 shadow-lg shadow-indigo-200/40 backdrop-blur-xl transition focus-within:border-indigo-400/70 focus-within:bg-white/80 focus-within:ring-2 focus-within:ring-indigo-300/50">
        <SearchIcon className="h-5 w-5 shrink-0 text-slate-500" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search courses, notes, class, subject..."
          className="w-full min-w-0 bg-transparent text-[15px] font-medium text-slate-900 placeholder:text-slate-500 focus:outline-none"
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange("")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
          >
            <XIcon className="h-4 w-4" />
          </button>
        ) : (
          <span className="hidden shrink-0 rounded-md bg-slate-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:inline">
            Enter
          </span>
        )}
      </div>

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
