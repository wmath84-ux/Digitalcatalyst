import { GlassSurface } from "@/components/ui/glass";
import { GlassButton } from "@/components/ui/glass-button";
import {
  GlassSelect,
  GlassSelectContent,
  GlassSelectItem,
  GlassSelectTrigger,
} from "@/components/ui/glass-select";
import { SearchIcon, XIcon } from "./icons";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  sort: string;
  onSortChange: (value: string) => void;
};

const SORT_OPTIONS = ["Recommended", "Price: Low to High", "Price: High to Low", "Top Rated", "Newest"];

export default function SearchBar({ value, onChange, sort, onSortChange }: SearchBarProps) {
  const openSearchPage = () => {
    const trimmed = value.trim();
    window.location.hash = trimmed ? `#/search?q=${encodeURIComponent(trimmed)}` : "#/search";
  };

  return (
    <div data-store-gutter className="px-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="w-full lg:max-w-2xl">
          <div
            data-search-launcher
            className="group relative block w-full cursor-pointer overflow-hidden rounded-2xl text-left outline-none transition active:scale-[0.99]"
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
              tint={0.4}
              radius={18}
              className="dc-scene-plate pointer-events-none absolute inset-0"
            />
            <div className="relative flex items-center gap-2 px-4 py-3.5">
              <SearchIcon className="h-5 w-5 shrink-0 text-white/55" />
              <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={openSearchPage}
                placeholder="Search courses, notes, class, subject..."
                aria-label="Search the catalogue"
                className="w-full min-w-0 cursor-pointer bg-transparent text-[15px] font-medium text-white placeholder:text-white/55 focus:outline-none"
                readOnly
              />
              {value ? (
                <GlassButton
                  type="button"
                  aria-label="Clear search"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange("");
                  }}
                  className="shrink-0 [&_.size-12]:size-7"
                >
                  <XIcon className="h-4 w-4" />
                </GlassButton>
              ) : (
                <span className="hidden shrink-0 rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/85 sm:inline">
                  Tap to search
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end">
          <GlassSelect value={sort} onValueChange={onSortChange}>
            <GlassSelectTrigger
              aria-label="Sort products"
              className="dc-glass-select h-9 w-auto min-w-[11rem] text-xs font-bold"
            />
            <GlassSelectContent className="dc-glass-select-pop" aria-label="Sort options">
              {SORT_OPTIONS.map((option) => (
                <GlassSelectItem key={option} value={option}>
                  {option}
                </GlassSelectItem>
              ))}
            </GlassSelectContent>
          </GlassSelect>
        </div>
      </div>
    </div>
  );
}
