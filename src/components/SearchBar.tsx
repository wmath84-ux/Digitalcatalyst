import { useEffect, useRef, useState } from "react";
import { GlassSurface } from "@/components/ui/glass";
import { GlassButton } from "@/components/ui/glass-button";
import {
  GlassSelect,
  GlassSelectContent,
  GlassSelectItem,
  GlassSelectTrigger,
} from "@/components/ui/glass-select";
import { SearchIcon, XIcon } from "./icons";
import StoreAdvancedFilters, { type AdvancedFilters, DEFAULT_ADVANCED_FILTERS } from "./StoreAdvancedFilters";

type ViewMode = "grid" | "list" | "mixed";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  sort: string;
  onSortChange: (value: string) => void;
  // Advanced filters — moved to top row left of Recommended per user request
  advancedFilters?: AdvancedFilters;
  onAdvancedFiltersChange?: (filters: AdvancedFilters) => void;
  resultCount?: number;
  // Layout switching — moved to top row right of Recommended per user request
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
};

const SORT_OPTIONS = ["Recommended", "Price: Low to High", "Price: High to Low", "Top Rated", "Newest"];

function GridIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={2} stroke="currentColor">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function ListIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={2} stroke="currentColor">
      <rect x="3" y="3" width="18" height="6" rx="1.5" />
      <rect x="3" y="15" width="18" height="6" rx="1.5" />
    </svg>
  );
}

function MixedIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={2} stroke="currentColor">
      <rect x="3" y="3" width="7" height="10" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="5" rx="1.5" />
      <rect x="3" y="17" width="7" height="4" rx="1.5" />
    </svg>
  );
}

function LayoutIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.8} stroke="currentColor">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="18" height="7" rx="1.5" />
    </svg>
  );
}

const VIEW_OPTIONS: { mode: ViewMode; label: string; Icon: typeof GridIcon }[] = [
  { mode: "grid", label: "Grid", Icon: GridIcon },
  { mode: "list", label: "Cards", Icon: ListIcon },
  { mode: "mixed", label: "Mixed", Icon: MixedIcon },
];

export default function SearchBar({
  value,
  onChange,
  sort,
  onSortChange,
  advancedFilters = DEFAULT_ADVANCED_FILTERS,
  onAdvancedFiltersChange,
  resultCount,
  viewMode = "grid",
  onViewModeChange,
}: SearchBarProps) {
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewDropdownOpen) return;
    const close = (e: Event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setViewDropdownOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [viewDropdownOpen]);

  const openSearchPage = () => {
    const trimmed = value.trim();
    window.location.hash = trimmed ? `#/search?q=${encodeURIComponent(trimmed)}` : "#/search";
  };

  return (
    <div data-store-gutter className="px-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        {/* Search capsule */}
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
            <GlassSurface tint={0.4} radius={18} className="dc-scene-plate pointer-events-none absolute inset-0 transition duration-200 group-hover:brightness-[1.02]" />
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
                <GlassButton type="button" aria-label="Clear search" onClick={(e) => { e.stopPropagation(); onChange(""); }} className="shrink-0 [&_.size-12]:size-7">
                  <XIcon className="h-4 w-4" />
                </GlassButton>
              ) : (
                <span className="hidden shrink-0 rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/85 sm:inline">Tap to search</span>
              )}
            </div>
          </div>
        </div>

        {/* Controls row: Filter (left) — Recommended (middle) — Layout (right) per user request */}
        <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end lg:justify-end">
          <div className="flex items-center gap-2">
            {/* Advanced Filter button — shifted from bottom to top, left of Recommended */}
            {onAdvancedFiltersChange && (
              <StoreAdvancedFilters filters={advancedFilters} onChange={onAdvancedFiltersChange} resultCount={resultCount} />
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Recommended / Sort */}
            <GlassSelect value={sort} onValueChange={onSortChange}>
              <GlassSelectTrigger aria-label="Sort products" className="dc-glass-select h-9 w-auto min-w-[11rem] text-xs font-bold" />
              <GlassSelectContent className="dc-glass-select-pop" aria-label="Sort options">
                {SORT_OPTIONS.map((option) => (
                  <GlassSelectItem key={option} value={option}>
                    {option}
                  </GlassSelectItem>
                ))}
              </GlassSelectContent>
            </GlassSelect>

            {/* Layout switching — moved to right side of Recommended per user request */}
            {onViewModeChange && (
              <div ref={dropdownRef} className="relative z-10 shrink-0">
                <GlassButton
                  type="button"
                  aria-label="Change view layout"
                  aria-expanded={viewDropdownOpen}
                  onClick={() => setViewDropdownOpen((o) => !o)}
                  className={`[&_.size-12]:size-9 ${viewDropdownOpen ? "text-indigo-200" : ""}`}
                >
                  <LayoutIcon className="h-[18px] w-[18px]" />
                </GlassButton>

                {viewDropdownOpen && (
                  <GlassSurface data-store-view-options className="dc-scene-plate absolute right-0 top-full z-30 mt-1.5 flex w-max text-white" radius={16} contentClassName="flex w-max gap-1 p-1.5">
                    {VIEW_OPTIONS.map(({ mode, label, Icon }) => (
                      <GlassButton
                        key={mode}
                        type="button"
                        onClick={() => {
                          onViewModeChange(mode);
                          setViewDropdownOpen(false);
                        }}
                        title={label}
                        aria-label={`${label} view`}
                        aria-pressed={viewMode === mode}
                        className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl transition [&_.size-12]:size-9 ${viewMode === mode ? "[&_svg]:text-violet-300" : "[&_svg]:text-white/70"}`}
                      >
                        <Icon className="h-4 w-4" />
                      </GlassButton>
                    ))}
                  </GlassSurface>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
