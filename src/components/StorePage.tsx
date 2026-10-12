import { useMemo, useState, useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Product } from "../data/products";
import { useCatalog } from "../context/CatalogContext";
import { Check, ChevronDown, Search } from "lucide-react";
import StoreProductCard from "./StoreProductCard";
import ContentDialog from "./ui/ContentDialog";
import { useBranding } from "../context/BrandingContext";
import {
  DEFAULT_ADVANCED_FILTERS,
  type AdvancedFilters,
} from "./StoreAdvancedFilters";
import "./store-marketplace.css";
import "./store-filter-radio.css";
import useDragScroll from "../hooks/useDragScroll";
import { useStoreFilters } from "../hooks/useStoreFilters";
import { openCommandPalette } from "../lib/commandPalette";
import {
  ALL_STORE_FILTER,
  derivedStoreFilters,
  productMatchesStoreFilter,
  type StoreFilter,
} from "../data/storeFilters";

type ViewMode = "grid" | "list" | "mixed";
type StorePopoverOption = { value: string; label: string };
type StorePopoverKind = "sort" | "view";

const STORE_SORT_OPTIONS: StorePopoverOption[] = [
  { value: "Recommended", label: "Recommended" },
  { value: "Price: Low to High", label: "Price: Low to High" },
  { value: "Price: High to Low", label: "Price: High to Low" },
  { value: "Top Rated", label: "Top Rated" },
  { value: "Newest", label: "Newest" },
];
const STORE_VIEW_OPTIONS: StorePopoverOption[] = [
  { value: "grid", label: "Grid" },
  { value: "list", label: "List" },
  { value: "mixed", label: "Mixed" },
];

function StoreOptionPopover({
  kind,
  value,
  options,
  onChange,
}: {
  kind: StorePopoverKind;
  value: string;
  options: StorePopoverOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];
  const isSort = kind === "sort";

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>("[aria-selected='true']")?.focus({ preventScroll: true });
    });
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const moveOptionFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='option']"));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus({ preventScroll: true });
  };

  return (
    <div ref={rootRef} className={`dc-marketplace-popup-anchor ${isSort ? "dc-marketplace-popup-anchor--sort" : "dc-marketplace-popup-anchor--view"}`}>
      <button
        ref={triggerRef}
        id={`${id}-trigger`}
        type="button"
        data-store-sort={isSort ? "" : undefined}
        data-store-view-selector={!isSort ? "" : undefined}
        className={`dc-marketplace-popup-trigger ${isSort ? "dc-marketplace-popup-trigger--sort" : "dc-marketplace-popup-trigger--view"}`}
        aria-label={isSort ? "Sort products" : "Product layout"}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        title={isSort ? `Sort products: ${selected.label}` : `Product layout: ${selected.label}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{selected.label}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <div
        ref={menuRef}
        id={`${id}-options`}
        role="listbox"
        aria-label={isSort ? "Sort options" : "Product layouts"}
        aria-labelledby={`${id}-trigger`}
        aria-hidden={!open}
        data-open={open ? "true" : "false"}
        data-store-sort-options={isSort ? "" : undefined}
        data-store-view-popover={!isSort ? "" : undefined}
        className={`dc-compact-glass-window ${isSort ? "dc-compact-glass-window--menu dc-marketplace-sort-window" : "dc-marketplace-view-window"}`}
        onKeyDown={moveOptionFocus}
      >
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-selected={isSelected ? "true" : "false"}
              className={`dc-marketplace-popup-option ${!isSort ? "dc-marketplace-popup-option--view" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                triggerRef.current?.focus({ preventScroll: true });
              }}
            >
              <span>{option.label}</span>
              {isSelected ? <Check size={15} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  const filterGroupName = useId();
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
    let list = products.filter((p) => {
      const price = p.isFree === true ? 0 : p.price;
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

      return matchesChip && matchesAdvanced;
    });

    list = [...list];
    if (sort === "Price: Low to High")
      list.sort((a, b) => (a.isFree ? 0 : a.price) - (b.isFree ? 0 : b.price));
    if (sort === "Price: High to Low")
      list.sort((a, b) => (b.isFree ? 0 : b.price) - (a.isFree ? 0 : a.price));
    if (sort === "Top Rated") list.sort((a, b) => b.rating - a.rating);
    if (sort === "Newest") list.reverse();

    return list;
  }, [products, activeFilter, sort, advancedFilters, purchased]);

  const activeAdvancedCount = Object.values(advancedFilters).filter(
    (value) => value !== "all"
  ).length;
  const clearFilters = () => {
    setActiveFilterId(ALL_STORE_FILTER.id);
    setAdvancedFilters(DEFAULT_ADVANCED_FILTERS);
  };
  const card = (product: Product, list = false, large = false) => (
    <StoreProductCard
      key={product.id}
      product={product}
      brandName={appName}
      list={list}
      large={large}
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
        <div className="dc-marketplace-discovery">
          <button
            type="button"
            data-store-search-trigger
            data-search-launcher
            className="dc-marketplace-search"
            aria-label="Search products"
            aria-haspopup="dialog"
            onClick={() => openCommandPalette({ scope: "products" })}
          >
            <Search size={20} aria-hidden="true" />
            <span className="dc-marketplace-search-placeholder">Search courses, subjects or instructors</span>
          </button>
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
          className="dc-marketplace-chips dc-store-radio-filters"
          role="radiogroup"
          aria-label="Catalog categories"
        >
          {chips.map((filter) => (
            <label key={filter.id} className="dc-store-radio-option">
              <input
                type="radio"
                name={filterGroupName}
                value={filter.id}
                checked={activeFilter.id === filter.id}
                onChange={() => setActiveFilterId(filter.id)}
              />
              <span>{filter.label}</span>
            </label>
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
          {activeFilter.id !== ALL_STORE_FILTER.id || activeAdvancedCount ? (
            <button
              type="button"
              className="dc-marketplace-text-action"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
          <div className="dc-marketplace-arrange">
            <StoreOptionPopover
              kind="sort"
              value={sort}
              options={STORE_SORT_OPTIONS}
              onChange={setSort}
            />
            <StoreOptionPopover
              kind="view"
              value={viewMode}
              options={STORE_VIEW_OPTIONS}
              onChange={(value) => setViewMode(value as ViewMode)}
            />
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
                ? "Try a different filter or clear the filters to see all resources."
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
            {filtered.map((product, index) => {
              if (viewMode === "mixed" && index % 3 !== 0) {
                return (
                  <div key={product.id} className="dc-marketplace-feature" data-store-mixed-feature>
                    {card(product, true)}
                  </div>
                );
              }
              return card(product, false, true);
            })}
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
