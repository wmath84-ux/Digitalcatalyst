import { SlidersHorizontal } from "lucide-react";
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
  onOpenFilters?: () => void;
};

const SORT_OPTIONS = ["Recommended", "Price: Low to High", "Price: High to Low", "Top Rated", "Newest"];

export default function SearchBar({ value, onChange, sort, onSortChange, onOpenFilters }: SearchBarProps) {
  const openSearchPage = () => {
    const trimmed = value.trim();
    window.location.hash = trimmed ? `#/search?q=${encodeURIComponent(trimmed)}` : "#/search";
  };

  return (
    <div data-store-gutter className="px-4">
      <div className="flex items-center gap-3">
        <div className="w-full flex-1 lg:max-w-none">
          <div
            data-search-launcher
            className="group relative block w-full cursor-pointer overflow-hidden rounded-[24px] text-left outline-none transition active:scale-[0.99]"
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
              radius={20}
              className="dc-scene-plate pointer-events-none absolute inset-0"
            />
            <div className="relative flex min-h-[66px] items-center gap-3 px-5 py-4 lg:min-h-[56px] lg:pr-4">
              <SearchIcon className="h-6 w-6 shrink-0 text-white/55 lg:h-5 lg:w-5" />
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
              ) : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenFilters?.()}
          aria-label="Open store filters"
          className="grid h-[66px] w-[66px] shrink-0 place-items-center rounded-[22px] border border-[#2b4381] bg-[#08183c]/95 text-white shadow-[0_18px_44px_-28px_rgba(71,106,255,0.82)] transition hover:brightness-110 lg:hidden"
        >
          <SlidersHorizontal className="h-6 w-6" />
        </button>

        <button
          type="button"
          onClick={openSearchPage}
          className="hidden h-[56px] min-w-[10.5rem] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#7448ff_0%,#5d40ff_60%,#4f36ff_100%)] px-8 text-sm font-black text-white shadow-[0_18px_34px_-22px_rgba(116,72,255,0.95)] transition hover:brightness-110 lg:inline-flex"
        >
          Search
        </button>

        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <span className="text-sm font-medium text-white/72">Browse by</span>
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
