import { useMemo, useState, useEffect } from "react";
import type { Product } from "../data/products";
import { useCatalog } from "../context/CatalogContext";
import { Search } from "lucide-react";
import StoreProductCard from "./StoreProductCard";
import ContentDialog from "./ui/ContentDialog";
import { useBranding } from "../context/BrandingContext";
import {
  DEFAULT_ADVANCED_FILTERS,
  type AdvancedFilters,
} from "./StoreAdvancedFilters";
import "./store-marketplace.css";
import useDragScroll from "../hooks/useDragScroll";
import { useStoreFilters } from "../hooks/useStoreFilters";
import {
  ALL_STORE_FILTER,
  derivedStoreFilters,
  productMatchesStoreFilter,
  type StoreFilter,
} from "../data/storeFilters";

type ViewMode = "grid" | "list" | "mixed";

type StorePageProps = {
  wishlist: Set<string>;
  cartIds: Set<string>;
  purchased: Set<string>;
  onToggleWishlist: (id: string) => void;
  onAddToCart: (id: string) => void;
  onView: (product: Product) => void;
};

/* ── Main StorePage ──────────────────────────────────────────────────── */

export default function StorePage({
  wishlist,
  cartIds,
  purchased,
  onToggleWishlist,
  onAddToCart,
  onView,
}: StorePageProps) {
  const { products, loading, error } = useCatalog();
  const { filters: adminFilters } = useStoreFilters();
  const { appName } = useBranding();
  const chipDrag = useDragScroll<HTMLDivElement>();
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilterId, setActiveFilterId] = useState(ALL_STORE_FILTER.id);
  const [sort, setSort] = useState("Recommended");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  // Native advanced filters preserve all catalog and ownership constraints.
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    priceRange: "all",
    rating: "all",
    category: "all",
    availability: "all",
  });

  /**
   * The chip row. Filters created in the admin panel (Products → Store
   * filters) are authoritative; until one exists we derive chips from the
   * catalog so the store is never filter-less. "All" is always first.
   */
  const chips: StoreFilter[] = useMemo(() => {
    const active = adminFilters.filter((filter) => filter.active);
    const list = active.length > 0 ? active : derivedStoreFilters(products);
    return [ALL_STORE_FILTER, ...list];
  }, [adminFilters, products]);

  const activeFilter = useMemo(
    () =>
      chips.find((filter) => filter.id === activeFilterId) || ALL_STORE_FILTER,
    [chips, activeFilterId]
  );

  useEffect(() => {
    if (
      activeFilterId !== ALL_STORE_FILTER.id &&
      !chips.some((filter) => filter.id === activeFilterId)
    ) {
      setActiveFilterId(ALL_STORE_FILTER.id);
    }
  }, [chips, activeFilterId]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = products.filter((p) => {
      const price = p.isFree === true ? 0 : p.price;
      const matchesSearch =
        !query ||
        p.title.toLowerCase().includes(query) ||
        p.subject.toLowerCase().includes(query) ||
        p.instructor.toLowerCase().includes(query) ||
        p.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        (p.searchKeywords || []).some((keyword) =>
          keyword.toLowerCase().includes(query)
        );

      const matchesChip = productMatchesStoreFilter(p, activeFilter);

      // Advanced filters
      let matchesAdvanced = true;
      // Price range
      if (advancedFilters.priceRange !== "all") {
        if (advancedFilters.priceRange === "free")
          matchesAdvanced = matchesAdvanced && (p.isFree || price === 0);
        else if (advancedFilters.priceRange === "under500")
          matchesAdvanced = matchesAdvanced && price > 0 && price < 500;
        else if (advancedFilters.priceRange === "under1000")
          matchesAdvanced = matchesAdvanced && price > 0 && price < 1000;
        else if (advancedFilters.priceRange === "under2000")
          matchesAdvanced = matchesAdvanced && price > 0 && price < 2000;
        else if (advancedFilters.priceRange === "premium")
          matchesAdvanced = matchesAdvanced && price >= 2000;
      }
      // Rating
      if (advancedFilters.rating !== "all") {
        const minRating = parseFloat(advancedFilters.rating);
        if (!isNaN(minRating))
          matchesAdvanced = matchesAdvanced && p.rating >= minRating;
      }
      // Category
      if (advancedFilters.category !== "all") {
        matchesAdvanced =
          matchesAdvanced && p.category === advancedFilters.category;
      }
      // Availability
      if (advancedFilters.availability !== "all") {
        if (advancedFilters.availability === "free")
          matchesAdvanced = matchesAdvanced && (p.isFree || price === 0);
        else if (advancedFilters.availability === "paid")
          matchesAdvanced = matchesAdvanced && !p.isFree && price > 0;
        else if (advancedFilters.availability === "purchased")
          matchesAdvanced = matchesAdvanced && purchased.has(p.id);
        else if (advancedFilters.availability === "not-purchased")
          matchesAdvanced = matchesAdvanced && !purchased.has(p.id);
      }

      return matchesSearch && matchesChip && matchesAdvanced;
    });

    list = [...list];
    if (sort === "Price: Low to High")
      list.sort((a, b) => (a.isFree ? 0 : a.price) - (b.isFree ? 0 : b.price));
    if (sort === "Price: High to Low")
      list.sort((a, b) => (b.isFree ? 0 : b.price) - (a.isFree ? 0 : a.price));
    if (sort === "Top Rated") list.sort((a, b) => b.rating - a.rating);
    if (sort === "Newest") list.reverse();

    return list;
  }, [products, search, activeFilter, sort, advancedFilters, purchased]);

  const activeAdvancedCount = Object.values(advancedFilters).filter(
    (value) => value !== "all"
  ).length;
  const clearFilters = () => {
    setSearch("");
    setActiveFilterId(ALL_STORE_FILTER.id);
    setAdvancedFilters(DEFAULT_ADVANCED_FILTERS);
  };
  const card = (product: Product, list = false) => (
    <StoreProductCard
      key={product.id}
      product={product}
      brandName={appName}
      list={list}
      wishlisted={wishlist.has(product.id)}
      inCart={cartIds.has(product.id)}
      purchased={purchased.has(product.id)}
      onToggleWishlist={onToggleWishlist}
      onAddToCart={onAddToCart}
      onView={onView}
    />
  );
  return (
    <section data-store-page data-store-marketplace>
      <div className="dc-marketplace-layout">
        <header className="dc-marketplace-heading">
          <p>{appName} · Learning marketplace</p>
          <h1>Explore the Store</h1>
          <span>Courses, notes and resources for your next step.</span>
        </header>
        <div className="dc-marketplace-discovery">
          <label className="dc-marketplace-search">
            <Search size={20} aria-hidden="true" />
            <span className="sr-only">Search the Store</span>
            <input
              data-store-search-trigger
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search courses, subjects or instructors"
              aria-label="Search the Store"
            />
          </label>
          <button
            type="button"
            data-store-advanced-filter-trigger
            className="dc-marketplace-control"
            onClick={() => setFilterOpen(true)}
          >
            Filters{activeAdvancedCount ? ` (${activeAdvancedCount})` : ""}
          </button>
        </div>
        <div
          data-store-filter-bar
          ref={chipDrag.ref}
          onPointerDown={chipDrag.onPointerDown}
          className="dc-marketplace-chips"
          role="group"
          aria-label="Catalog categories"
        >
          {chips.map((filter) => (
            <button
              type="button"
              key={filter.id}
              aria-pressed={activeFilter.id === filter.id}
              onClick={() => setActiveFilterId(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="dc-marketplace-toolbar">
          <p role="status" aria-live="polite">
            {loading
              ? "Loading catalog…"
              : error
              ? "Catalog unavailable"
              : `${filtered.length} resource${
                  filtered.length === 1 ? "" : "s"
                }`}
          </p>
          {search.trim() ||
          activeFilter.id !== ALL_STORE_FILTER.id ||
          activeAdvancedCount ? (
            <button
              type="button"
              className="dc-marketplace-text-action"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
          <div className="dc-marketplace-arrange">
            <label>
              <span className="sr-only">Sort products</span>
              <select
                data-store-sort
                aria-label="Sort products"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                {[
                  "Recommended",
                  "Price: Low to High",
                  "Price: High to Low",
                  "Top Rated",
                  "Newest",
                ].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Product layout</span>
              <select
                data-store-view-selector
                aria-label="Product layout"
                value={viewMode}
                onChange={(event) =>
                  setViewMode(event.target.value as ViewMode)
                }
              >
                <option value="grid">Grid</option>
                <option value="list">List</option>
                <option value="mixed">Mixed</option>
              </select>
            </label>
          </div>
        </div>
        {error ? (
          <div role="alert" className="dc-marketplace-state">
            <h2>Catalog could not be loaded</h2>
            <p>{error}</p>
            <button
              type="button"
              className="dc-marketplace-text-action"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div
            data-store-grid
            data-store-grid-loading
            className="dc-marketplace-grid"
            aria-busy="true"
            aria-label="Loading products"
          >
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="dc-marketplace-skeleton"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : !filtered.length ? (
          <div className="dc-marketplace-state">
            <h2>
              {products.length
                ? "No matching resources"
                : "The catalog is being prepared"}
            </h2>
            <p>
              {products.length
                ? "Try another search or clear the filters."
                : "Published courses and study resources will appear here."}
            </p>
            {products.length ? (
              <button
                type="button"
                className="dc-marketplace-text-action"
                onClick={clearFilters}
              >
                Show all resources
              </button>
            ) : null}
          </div>
        ) : viewMode === "list" ? (
          <div data-store-list className="dc-marketplace-list">
            {filtered.map((product) => card(product, true))}
          </div>
        ) : (
          <div
            data-store-grid={viewMode === "grid" ? "" : undefined}
            data-store-mixed={viewMode === "mixed" ? "" : undefined}
            className={`dc-marketplace-grid ${
              viewMode === "mixed" ? "is-mixed" : ""
            }`}
          >
            {filtered.map((product, index) =>
              viewMode === "mixed" && index % 3 === 0 ? (
                <div
                  key={product.id}
                  className="dc-marketplace-feature"
                  data-store-mixed-feature
                >
                  {card(product, true)}
                </div>
              ) : (
                card(product)
              )
            )}
          </div>
        )}
      </div>
      <ContentDialog
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter the Store"
        description="Choose the resources you want to see."
        data-store-advanced-filters
        footer={
          <>
            <button
              type="button"
              className="dc-content-secondary"
              onClick={() => setAdvancedFilters(DEFAULT_ADVANCED_FILTERS)}
            >
              Reset filters
            </button>
            <button
              type="button"
              className="dc-content-primary"
              onClick={() => setFilterOpen(false)}
            >
              Show results
            </button>
          </>
        }
      >
        <div className="dc-marketplace-filter-fields">
          {(
            [
              {
                key: "priceRange",
                label: "Price",
                options: [
                  ["all", "All prices"],
                  ["free", "₹0 · Free"],
                  ["under500", "Under ₹500"],
                  ["under1000", "Under ₹1,000"],
                  ["under2000", "Under ₹2,000"],
                  ["premium", "₹2,000 and above"],
                ],
              },
              {
                key: "rating",
                label: "Rating",
                options: [
                  ["all", "All ratings"],
                  ["4.5", "4.5 and above"],
                  ["4", "4 and above"],
                  ["3.5", "3.5 and above"],
                  ["3", "3 and above"],
                ],
              },
              {
                key: "category",
                label: "Resource type",
                options: [
                  ["all", "All types"],
                  ...["Course", "Notes", "PDF", "E-book", "Live"].map(
                    (value) => [value, value]
                  ),
                ],
              },
              {
                key: "availability",
                label: "Access",
                options: [
                  ["all", "All resources"],
                  ["free", "Free"],
                  ["paid", "Paid"],
                  ["purchased", "Purchased"],
                  ["not-purchased", "Not purchased"],
                ],
              },
            ] as {
              key: keyof AdvancedFilters;
              label: string;
              options: string[][];
            }[]
          ).map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <select
                aria-label={field.label}
                value={advancedFilters[field.key]}
                onChange={(event) =>
                  setAdvancedFilters((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
              >
                {field.options.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </ContentDialog>
    </section>
  );
}
