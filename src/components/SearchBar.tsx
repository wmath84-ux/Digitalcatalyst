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
  // The store's search bar is now a tap target: opening it launches the
  // dedicated `#/search` page so the user gets a proper full-bleed
  // search experience with live filtering, sort, and category chips.
  // The current `value` is passed across as a `?q=` deep link so the
  // search page opens with the same query already typed.
  // Owner (post Wave 14): a tap on the store's search box always opens the
  // dedicated `#/search` page (the full glass search experience), carrying
  // any draft across as `?q=`. The ⌘K palette stays reachable from the
  // keyboard shortcut and the home header.
  const openSearchPage = () => {
    const trimmed = value.trim();
    window.location.hash = trimmed ? `#/search?q=${encodeURIComponent(trimmed)}` : "#/search";
  };

  return (
    <div className="space-y-2 px-4">
      {/* Wave 2 (global chrome): the capsule used to be an ad-hoc
          `bg-white/[0.08] border-white/10 backdrop-blur-xl` div. It is
          now a `GlassSurface` lens, i.e. the same refraction layer the header
          discs and the desktop top bar use, so the store's search reads as one
          material with the rest of the chrome. The interaction contract is
          untouched: still a `role="button"` tap target (`data-store-search-trigger`)
          that hands its draft query to `#/search?q=`, still keyboard-operable,
          still clearable. */}
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
        {/* `dc-scene-plate` (src/glass.css): the capsule asked for tint 0.4,
            which the pack renders as ~17% dark — no visible material over the
            scene's snow, so the white query and its placeholder floated on
            nothing. The plate is the same backing the review cards wear; it also
            cancels this surface's live blur, which the app-wide blur-0 override
            already asks for and which costs a full-frame filter while the store
            scrolls. The ink (placeholder + magnifier) is lifted by the
            `[data-search-launcher]` rules, because the input is this surface's
            SIBLING, not its child. */}
        <GlassSurface
          tint={0.4}
          radius={18}
          className="dc-scene-plate pointer-events-none absolute inset-0 transition duration-200 group-hover:brightness-[1.02]"
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

      {/* Wave 3 (commerce): the sort control is `glass-select`. It is a listbox,
          not a native select, so the ink for the trigger and the portaled panel
          comes from `.dc-glass-select*` in src/glass.css; the option list keeps
          the pack's own keyboard behaviour (Enter selects, Escape closes) and
          `aria-haspopup="listbox"` / `role="option"` come from the item itself. */}
      <div className="flex justify-end">
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
  );
}
