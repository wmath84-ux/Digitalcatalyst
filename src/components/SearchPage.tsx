// src/components/SearchPage.tsx
//
// Dedicated search experience, opened when the user taps the search bar
// on Home or the Store. Lives at `#/search` (and `#/search?q=…` to land
// with a pre-filled query from another page).
//
// Design intent:
//   - Mobile  : 1- or 2-column cards, top sticky search bar, bottom-nav
//               stays as the global footer (same chrome as the rest of
//               the app).
//   - Tablet  : 3-column grid, side filter rail collapsible behind a
//               drawer, sticky top bar inside the 720 px column.
//   - Desktop : 4-column grid inside a 1280 px frame, left filter rail
//               always visible, hover affordances on each card.
//
// The page is mounted from `main.tsx` like any other app screen — it
// picks up the standard `data-app-frame` rules in `index.css` so the
// desktop shell (left rail + top bar) takes over automatically on
// >= 1024 px viewports.

import { GlassSelect, GlassSelectContent, GlassSelectItem, GlassSelectTrigger } from "./ui/glass-select";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Search as SearchIcon, X } from "lucide-react";
import type { Product } from "../data/products";
import { useCatalog } from "../context/CatalogContext";
import StoreHeader from "./Header";
import BottomNav, { type TabKey } from "./BottomNav";
import ProductCard from "../components/ProductCard";
import {
  ALL_STORE_FILTER,
  derivedStoreFilters,
  productMatchesStoreFilter,
  type StoreFilter,
} from "../data/storeFilters";
import { BookOpenIcon, FilterIcon } from "./icons";

type SortKey = "relevance" | "price-asc" | "price-desc" | "rating" | "newest";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Most relevant" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "rating", label: "Top Rated" },
  { value: "newest", label: "Newest" },
];

interface SearchPageProps {
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  onNavigateToProduct: (product: Product) => void;
  onNavigateToStore: () => void;
  onNavigateToHome: () => void;
  onNavigateToMyDay: () => void;
  onNavigateToProfile: () => void;
  onNavigateToPurchases: () => void;
  onNavigateToCart: () => void;
  onNavigateToSubscription: () => void;
  onNavigateToNotifications: () => void;
}

/**
 * Extract the `q=…` value from the current hash so the page restores
 * its query when re-mounted (e.g. on hash changes inside the same
 * route or after a soft back-navigation).
 */
const readInitialQuery = (): string => {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash;
  if (!hash.startsWith("#/search")) return "";
  const queryPart = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  return new URLSearchParams(queryPart).get("q") || "";
};

export default function SearchPage({
  favoriteIds,
  onToggleFavorite,
  onNavigateToProduct,
  onNavigateToStore,
  onNavigateToHome,
  onNavigateToMyDay,
  onNavigateToProfile,
  onNavigateToPurchases,
  onNavigateToCart,
  onNavigateToSubscription,
  onNavigateToNotifications,
}: SearchPageProps) {
  const { products, loading, error } = useCatalog();
  const [query, setQuery] = useState<string>(() => readInitialQuery());
  const [activeFilterId, setActiveFilterId] = useState<string>(ALL_STORE_FILTER.id);
  const [sort, setSort] = useState<SortKey>("relevance");
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input on mount and on every remount (so when
  // the user lands from the Home or Store header the keyboard is
  // already waiting). The `setTimeout(..., 0)` lets the layout settle
  // first — otherwise the focus is stolen by a sibling reflow on
  // first paint.
  useEffect(() => {
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(id);
  }, []);

  // Keep the URL in sync with the live query so the back button
  // remembers what was being searched. Uses replaceState to avoid
  // spawning an entry per keystroke.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const trimmed = query.trim();
    const next = `#/search${trimmed ? `?q=${encodeURIComponent(trimmed)}` : ""}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
    }
  }, [query]);

  // Listen to hash changes so navigating to `#/search?q=foo` from
  // elsewhere updates the input. Without this, the initial value
  // would be stale on a re-entry from the back button.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onHashChange = () => {
      const fromHash = readInitialQuery();
      setQuery((current) => (current === fromHash ? current : fromHash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const chips: StoreFilter[] = useMemo(() => {
    const derived = derivedStoreFilters(products);
    return [ALL_STORE_FILTER, ...derived];
  }, [products]);

  const activeFilter = useMemo(
    () => chips.find((filter) => filter.id === activeFilterId) || ALL_STORE_FILTER,
    [chips, activeFilterId],
  );

  /**
   * Live filter. The query is matched against the same fields the
   * store / home pages use (title, subject, instructor, category,
   * tags, configured search keywords) so behaviour stays
   * consistent across the three surfaces.
   */
  const results: Product[] = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    let list = products.filter((product) => {
      if (!trimmed) return true;
      if (product.title.toLowerCase().includes(trimmed)) return true;
      if (product.subject.toLowerCase().includes(trimmed)) return true;
      if (product.instructor.toLowerCase().includes(trimmed)) return true;
      if (product.category.toLowerCase().includes(trimmed)) return true;
      if (product.tags.some((tag) => tag.toLowerCase().includes(trimmed))) return true;
      if ((product.searchKeywords || []).some((keyword) => keyword.toLowerCase().includes(trimmed))) return true;
      return false;
    });
    list = list.filter((product) => productMatchesStoreFilter(product, activeFilter));

    const sorted = [...list];
    if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    if (sort === "rating") sorted.sort((a, b) => b.rating - a.rating);
    if (sort === "newest") sorted.reverse();
    return sorted;
  }, [products, query, activeFilter, sort]);

  const queryIsLive = query.trim().length > 0;
  const showEmpty = !loading && results.length === 0;

  const handleClear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  const handleFooterChange = (tab: TabKey) => {
    if (tab === "home") onNavigateToHome();
    else if (tab === "store") onNavigateToStore();
    else if (tab === "myday") onNavigateToMyDay();
    else if (tab === "purchases") onNavigateToPurchases?.();
    else if (tab === "profile") onNavigateToProfile();
  };

  return (
    <div className="dc-app-shell min-h-screen sm:py-6">
      <div
        data-app-frame
        data-search-frame
        className="dc-app-frame relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-[calc(100vh-3rem)] sm:supports-[height:100dvh]:min-h-[calc(100dvh-3rem)] sm:overflow-hidden sm:rounded-[2rem] md:max-w-none md:rounded-none"
      >
        <StoreHeader
          cartCount={0}
          notifCount={0}
          onNavigateToSubscription={onNavigateToSubscription}
          onNavigateToCart={onNavigateToCart}
          onNavigateToNotifications={onNavigateToNotifications}
          title="Search"
          subtitle="Find courses, PDFs, e-books..."
          icon={SearchIcon}
        />

        <div
          data-search-bar
          className="sticky top-[68px] z-20 border-b border-white/10/60 bg-white/[0.08] px-4 pb-3 pt-3 shadow-[0_4px_18px_-12px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:top-[72px] sm:px-5 sm:pt-3 md:top-[80px] md:px-8 md:pt-4"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Go back"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  window.history.back();
                } else {
                  onNavigateToHome();
                }
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200/70 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.4} />
            </button>
            <label
              data-search-input
              className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-sm transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-200/60"
            >
              <SearchIcon className="h-4 w-4 shrink-0 text-white/55" strokeWidth={2.4} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="search"
                inputMode="search"
                autoComplete="off"
                spellCheck={false}
                placeholder="Search by title, subject, instructor..."
                aria-label="Search products"
                className="w-full min-w-0 bg-transparent text-sm font-medium text-white placeholder:text-white/55 focus:outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Clear search"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 transition active:scale-90"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.6} />
                </button>
              ) : null}
            </label>
            <button
              type="button"
              aria-label="Show filters"
              aria-expanded={showFilters}
              onClick={() => setShowFilters((current) => !current)}
              data-search-filter-toggle
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition active:scale-95 ${
                showFilters
                  ? "border-indigo-300 bg-indigo-50 text-indigo-600"
                  : "border-slate-200/70 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <FilterIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Wave 5: `#/search` and the store now share one sort control —
                the registry listbox from Wave 3 — instead of a native popup
                that no amount of CSS can match the app's material. */}
            <GlassSelect value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <GlassSelectTrigger
                aria-label="Sort by"
                className="dc-glass-select h-8 min-w-[9.5rem] text-[11px] font-bold uppercase tracking-wide"
              />
              <GlassSelectContent tint={0.9} className="dc-glass-select-pop" aria-label="Sort options">
                {SORT_OPTIONS.map((option) => (
                  <GlassSelectItem key={option.value} value={option.value}>
                    {option.label}
                  </GlassSelectItem>
                ))}
              </GlassSelectContent>
            </GlassSelect>
            <span
              data-search-result-count
              className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500"
            >
              {loading ? "Loading…" : `${results.length} result${results.length === 1 ? "" : "s"}`}
            </span>
            {queryIsLive ? (
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
                for “{query.trim().length > 18 ? `${query.trim().slice(0, 18)}…` : query.trim()}”
              </span>
            ) : null}
          </div>

          {showFilters ? (
            <div
              data-search-filters
              className="mt-3 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible"
            >
              {chips.map((chip) => {
                const active = chip.id === activeFilter.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setActiveFilterId(chip.id)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-indigo-500 bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md"
                        : "border-white/10/70 bg-white/[0.08] text-white/75 hover:border-indigo-300 hover:text-indigo-600"
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <main
          data-search-content
          className="flex-1 overflow-y-auto px-4 pb-4 pt-3 sm:px-5 md:px-8 md:pb-8"
        >
          {error ? (
            <div className="mt-6 rounded-3xl border border-rose-200/70 bg-rose-50/70 px-5 py-8 text-center text-sm font-semibold text-rose-700 shadow-lg shadow-rose-200/40 backdrop-blur-xl">
              {error}
            </div>
          ) : loading ? (
            <div
              data-search-grid
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4"
            >
              {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
                <div
                  key={index}
                  className="h-64 animate-pulse rounded-2xl border border-white/10/60 bg-white/[0.08]"
                />
              ))}
            </div>
          ) : showEmpty ? (
            <div className="mt-10 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-indigo-200/80 bg-white/55 px-6 py-14 text-center shadow-xl backdrop-blur-xl">
              <BookOpenIcon className="h-8 w-8 text-indigo-400" />
              <p className="text-sm font-bold text-white/85">No results</p>
              <p className="max-w-xs text-xs font-medium text-white/55">
                {queryIsLive
                  ? `We couldn't find anything for "${query.trim()}". Try a different keyword or clear the filter.`
                  : "Start typing to search the catalog. The list updates live as you type."}
              </p>
              {queryIsLive ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="mt-1 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-xs font-bold text-indigo-600 transition hover:bg-indigo-100"
                >
                  Clear search
                </button>
              ) : null}
            </div>
          ) : (
            <div
              data-search-grid
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4"
            >
              {results.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  wishlisted={favoriteIds.has(product.id)}
                  inCart={false}
                  purchased={false}
                  onToggleWishlist={onToggleFavorite}
                  onAddToCart={() => {
                    /* The search page surfaces browse actions only.
                       Add-to-cart intentionally lives on the PDP /
                       store product cards — the search card focuses on
                       "go look at it" so a tap takes the user to the
                       product detail page where purchase happens. */
                  }}
                  onView={onNavigateToProduct}
                />
              ))}
            </div>
          )}
        </main>

        <BottomNav
          active="store"
          onChange={handleFooterChange}
          purchasesBadge={0}
        />
      </div>
    </div>
  );
}
