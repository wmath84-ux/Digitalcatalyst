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
import { GlassInput } from "./ui/glass-input";
import { GlassToggleGroup, GlassToggleItem } from "./ui/glass-toggle-group";
import { GlassButton } from "./ui/glass-button";
import { GlassCard } from "./ui/GlassCard";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock, Search as SearchIcon, Sparkles, TrendingUp, X } from "lucide-react";
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

/* Smarter search: a blank query must never be a dead end. Recent searches are
   persisted locally, popular/for-you terms are derived from the live catalog,
   so the "zero state" always carries three ways forward. */
const RECENT_KEY = "dc.search.recent";
const RECENT_MAX = 6;

const readRecent = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
};

const writeRecent = (list: string[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    /* storage disabled — recents degrade to session-only, never a crash */
  }
};

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
  const [recent, setRecent] = useState<string[]>(() => readRecent());
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

  // Remember what was actually searched (debounced, so a term is only stored
  // once the user stops typing — not once per keystroke).
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) return undefined;
    const id = window.setTimeout(() => {
      setRecent((current) => {
        const next = [trimmed, ...current.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(0, RECENT_MAX);
        writeRecent(next);
        return next;
      });
    }, 900);
    return () => window.clearTimeout(id);
  }, [query]);

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

  // Popular = the highest-reviewed subjects in the catalog. For-you = the
  // categories the catalog leads with. Both are derived, never hardcoded, so
  // the zero state stays true as the catalog grows.
  const popularTerms = useMemo(() => {
    const byReviews = [...products].sort((a, b) => b.reviews - a.reviews);
    const seen = new Set<string>();
    const terms: string[] = [];
    for (const product of byReviews) {
      const term = (product.subject || product.category || "").trim();
      if (!term || seen.has(term.toLowerCase())) continue;
      seen.add(term.toLowerCase());
      terms.push(term);
      if (terms.length === 6) break;
    }
    return terms;
  }, [products]);

  const suggestedForYou = useMemo(() => {
    const seen = new Set<string>();
    const terms: string[] = [];
    for (const product of products) {
      const term = (product.category || "").trim();
      if (!term || seen.has(term.toLowerCase())) continue;
      seen.add(term.toLowerCase());
      terms.push(term);
      if (terms.length === 5) break;
    }
    return terms;
  }, [products]);

  const runSearch = (term: string) => {
    setQuery(term);
    inputRef.current?.focus();
  };

  const clearRecent = () => {
    setRecent([]);
    writeRecent([]);
  };

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
          className="sticky top-[68px] z-20 border-b border-white/10 bg-[var(--dc-chrome-glass)] px-4 pb-3 pt-3 [backdrop-filter:var(--dc-chrome-glass-blur)] sm:top-[72px] sm:px-5 sm:pt-3 md:top-[80px] md:px-8 md:pt-4"
        >
          <div className="flex items-center gap-2">
            <GlassButton
              type="button"
              aria-label="Go back"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  window.history.back();
                } else {
                  onNavigateToHome();
                }
              }}
              className="shrink-0 [&_.size-12]:size-10"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.4} />
            </GlassButton>
            <GlassInput
              data-search-input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              inputMode="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search by title, subject, instructor..."
              aria-label="Search products"
              icon={<SearchIcon className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />}
              className="min-w-0 flex-1"
            />
            {query ? (
              <GlassButton
                type="button"
                onClick={handleClear}
                aria-label="Clear search"
                className="shrink-0 [&_.size-12]:size-10"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.6} />
              </GlassButton>
            ) : null}
            <GlassButton
              type="button"
              aria-label="Show filters"
              aria-expanded={showFilters}
              onClick={() => setShowFilters((current) => !current)}
              data-search-filter-toggle
              className={`shrink-0 [&_.size-12]:size-10 ${showFilters ? "text-indigo-300" : ""}`}
            >
              <FilterIcon className="h-4 w-4" />
            </GlassButton>
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
              <GlassSelectContent className="dc-glass-select-pop" aria-label="Sort options">
                {SORT_OPTIONS.map((option) => (
                  <GlassSelectItem key={option.value} value={option.value}>
                    {option.label}
                  </GlassSelectItem>
                ))}
              </GlassSelectContent>
            </GlassSelect>
            <span
              data-search-result-count
              className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white/55"
            >
              {loading ? "Loading…" : `${results.length} result${results.length === 1 ? "" : "s"}`}
            </span>
            {queryIsLive ? (
              <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-300">
                for “{query.trim().length > 18 ? `${query.trim().slice(0, 18)}…` : query.trim()}”
              </span>
            ) : null}
          </div>

          {showFilters ? (
            <div
              data-search-filters
              className="mt-3 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible"
            >
              <GlassToggleGroup
                className="dc-segment shrink-0"
                value={activeFilter.id}
                onValueChange={setActiveFilterId}
                aria-label="Filter results"
              >
                {chips.map((chip) => (
                  <GlassToggleItem key={chip.id} value={chip.id} className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold">
                    {chip.label}
                  </GlassToggleItem>
                ))}
              </GlassToggleGroup>
            </div>
          ) : null}
        </div>

        <main
          data-search-content
          data-footer-nav-space
          className="flex-1 overflow-y-auto px-4 pb-4 pt-3 sm:px-5 md:px-8 md:pb-8"
        >
          {error ? (
            <div className="mt-6 rounded-3xl border border-rose-400/30 bg-rose-500/15 px-5 py-8 text-center text-sm font-semibold text-rose-200">
              {error}
            </div>
          ) : loading ? (
            <div
              data-search-grid
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4"
            >
              {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
                <GlassCard key={index} className="h-64 animate-pulse" aria-hidden="true" />
              ))}
            </div>
          ) : showEmpty ? (
            /* No dead ends. With no query we teach + suggest (recent,
               popular, for-you); with a query that missed we explain what
               happened and hand back an escape route. */
            <div data-search-zero className="mt-4 flex flex-col gap-4">
              <GlassCard contentClassName="dc-empty">
                <span className="dc-empty-art" aria-hidden="true">
                  <BookOpenIcon className="h-7 w-7 text-indigo-300" />
                </span>
                <p className="dc-empty-title">
                  {queryIsLive ? `Nothing matched “${query.trim()}”` : "What do you want to learn today?"}
                </p>
                <p className="dc-empty-body">
                  {queryIsLive
                    ? "Try a shorter keyword, check the spelling, or clear the active filter — the catalog searches titles, subjects, instructors and tags."
                    : "Search across every course, PDF and e-book by title, subject or instructor. Results update live as you type."}
                </p>
                {queryIsLive ? (
                  <GlassButton
                    variant="capsule"
                    type="button"
                    onClick={handleClear}
                    className="mt-1 [&>span>div]:h-9 [&>span>div]:px-4 [&>span>div]:text-xs [&>span>div]:font-bold"
                  >
                    Clear search
                  </GlassButton>
                ) : null}
              </GlassCard>

              {recent.length > 0 ? (
                <section aria-label="Recent searches" className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="dc-section-label inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Recent
                    </span>
                    <button type="button" onClick={clearRecent} className="dc-focusable text-[11px] font-bold uppercase tracking-wide dc-ink-3">
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recent.map((term) => (
                      <button key={term} type="button" className="dc-suggest-chip dc-focusable" onClick={() => runSearch(term)}>
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {term}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {popularTerms.length > 0 ? (
                <section aria-label="Popular searches" className="flex flex-col gap-2">
                  <span className="dc-section-label inline-flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> Popular right now
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {popularTerms.map((term) => (
                      <button key={term} type="button" className="dc-suggest-chip dc-focusable" onClick={() => runSearch(term)}>
                        {term}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {suggestedForYou.length > 0 ? (
                <section aria-label="Suggested for you" className="flex flex-col gap-2">
                  <span className="dc-section-label inline-flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Browse by category
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {suggestedForYou.map((term) => (
                      <button key={term} type="button" className="dc-suggest-chip dc-focusable" onClick={() => runSearch(term)}>
                        {term}
                      </button>
                    ))}
                  </div>
                </section>
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
