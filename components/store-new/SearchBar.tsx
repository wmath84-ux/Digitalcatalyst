import { SearchIcon, XIcon } from "./icons";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  sort: string;
  onSortChange: (value: string) => void;
};

const SORT_OPTIONS = [
  "Recommended",
  "Price: Low to High",
  "Price: High to Low",
  "Top Rated",
  "Newest",
];

export default function SearchBar({
  value,
  onChange,
  sort,
  onSortChange,
}: SearchBarProps) {
  return (
    <div className="space-y-2 px-4">
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 shadow-sm focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
        <SearchIcon className="h-5 w-5 shrink-0 text-slate-400" />

        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search courses, notes, class, subject..."
          className="w-full min-w-0 bg-transparent text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />

        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange("")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
          >
            <XIcon className="h-4 w-4" />
          </button>
        ) : (
          <span className="hidden shrink-0 rounded-md bg-slate-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:inline">
            Enter
          </span>
        )}
      </div>

      <div className="flex justify-end">
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
