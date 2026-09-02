import React, { useMemo, useState, useRef, useEffect } from "react";
import type { Product } from "../data/products";
import { useCatalog } from "../context/CatalogContext";
import Hero from "./Hero";
import SearchBar from "./SearchBar";
import FilterChips from "./FilterChips";
import ProductCard from "./ProductCard";
import TiltedCoverflow from "./TiltedCoverflow";
import { GlassCard } from "./ui/GlassCard";
import { GlassSurface } from "./ui/glass";
import { GlassButton } from "./ui/glass-button";
import { BookOpenIcon } from "./icons";
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

/* ── View-mode icons (inline SVGs for the dropdown) ──────────────────── */

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

/* ── ProductCard variant for list / rectangular view ──────────────────── */

function ProductCardList({
  product,
  wishlisted,
  inCart,
  purchased,
  onToggleWishlist,
  onAddToCart,
  onView,
}: {
  product: Product;
  wishlisted: boolean;
  inCart: boolean;
  purchased: boolean;
  onToggleWishlist: (id: string) => void;
  onAddToCart: (id: string) => void;
  onView: (product: Product) => void;
}) {
  const discount =
    product.originalPrice > 0
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
      : 0;
  const unavailable = product.availableForSale === false && !purchased;

  return (
    <GlassCard
      onClick={() => onView(product)}
      contentClassName="flex p-0"
      className="group relative flex overflow-hidden transition duration-300 hover:-translate-y-1"
    >
      {/* Image — left side */}
      <div className="relative h-auto w-36 shrink-0 overflow-hidden sm:w-44">
        <img src={product.image} alt={product.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        <div className="absolute left-2 top-2 flex gap-1">
          {purchased && (
            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
              Purchased
            </span>
          )}
        </div>
        <GlassButton
          type="button"
          aria-label="Toggle wishlist"
          onClick={(e) => { e.stopPropagation(); onToggleWishlist(product.id); }}
          className="absolute right-2 top-2 z-20 [&_.size-12]:size-7"
        >
          <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${wishlisted ? "fill-rose-500 text-rose-500" : "fill-none text-white/75"}`} strokeWidth={2} stroke="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </GlassButton>
      </div>

      {/* Content — right side */}
      <div className="relative flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <div className="flex items-center gap-1 text-sm">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-amber-400 text-amber-400"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
          <span className="text-xs font-bold text-white">{product.rating.toFixed(1)}</span>
          <span className="text-xs text-white/55">({product.reviews})</span>
        </div>
        <h3 className="text-sm font-extrabold leading-snug text-white sm:text-[15px]">{product.title}</h3>
        <p className="text-xs font-medium text-white/75">by {product.instructor}</p>
        <div className="mt-auto flex items-center gap-2 pt-1">
          {product.originalPrice > product.price && (
            <span className="text-xs text-white/55 line-through">₹{product.originalPrice}</span>
          )}
          <span className="text-base font-extrabold text-white">₹{product.price}</span>
          {discount > 0 && (
            <span className="rounded-md bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">-{discount}%</span>
          )}
        </div>
        {/* Wave 10: terminal states are flat meaning-colour plates (amber /
            emerald, same rule as the grid card); the actionable state is the
            solid indigo primary capsule. */}
        {purchased || inCart || unavailable ? (
          <div
            className={`mt-1 flex w-full cursor-default items-center justify-center rounded-full border px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide ${
              unavailable ? "border-amber-400/30 bg-amber-500/20 text-amber-200" : "border-emerald-400/30 bg-emerald-500/20 text-emerald-200"
            }`}
          >
            {purchased ? "Purchased" : unavailable ? "Not for sale" : "In Cart"}
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddToCart(product.id); }}
            className="mt-1 flex w-full items-center justify-center rounded-full bg-indigo-600 px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white transition hover:bg-indigo-500 active:scale-[0.98]"
          >
            Add to Cart
          </button>
        )}
      </div>
    </GlassCard>
  );
}

/* ── Main StorePage ──────────────────────────────────────────────────── */

export default function StorePage({ wishlist, cartIds, purchased, onToggleWishlist, onAddToCart, onView }: StorePageProps) {
  const { products, loading, error } = useCatalog();
  const { filters: adminFilters } = useStoreFilters();
  const [search, setSearch] = useState("");
  const [activeFilterId, setActiveFilterId] = useState(ALL_STORE_FILTER.id);
  const [sort, setSort] = useState("Recommended");
  // Default to the second layout option ("Cards" / rectangular list view).
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
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
    () => chips.find((filter) => filter.id === activeFilterId) || ALL_STORE_FILTER,
    [chips, activeFilterId],
  );

  // A chip the admin deleted or hid must not keep filtering the store.
  useEffect(() => {
    if (activeFilterId !== ALL_STORE_FILTER.id && !chips.some((filter) => filter.id === activeFilterId)) {
      setActiveFilterId(ALL_STORE_FILTER.id);
    }
  }, [chips, activeFilterId]);

  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      const matchesSearch =
        !search.trim() ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.subject.toLowerCase().includes(search.toLowerCase()) ||
        p.instructor.toLowerCase().includes(search.toLowerCase()) ||
        p.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase())) ||
        (p.searchKeywords || []).some((keyword) => keyword.toLowerCase().includes(search.toLowerCase()));

      const matchesChip = productMatchesStoreFilter(p, activeFilter);

      return matchesSearch && matchesChip;
    });

    list = [...list];
    if (sort === "Price: Low to High") list.sort((a, b) => a.price - b.price);
    if (sort === "Price: High to Low") list.sort((a, b) => b.price - a.price);
    if (sort === "Top Rated") list.sort((a, b) => b.rating - a.rating);
    if (sort === "Newest") list.reverse();

    return list;
  }, [products, search, activeFilter, sort]);

  return (
    <div className="relative overflow-hidden pb-6">
      {/* Phase A: the page paints no ambient wash or orbs of its own — the
          single fixed Black Ice backdrop is the background on every device. */}

      <Hero resourceCount={filtered.length} />

      {/* AI Canvas Tilted Coverflow — the store's top-rated rail. Slides are
          ranked by a Bayesian weighted rating (see topRatedSlides) and update
          automatically whenever the catalog snapshot changes; the source
          demo's default cards fill the fan until seven products exist. */}
      <section aria-label="Top rated" className="pt-1">
        <p className="px-4 text-[10px] font-black uppercase tracking-widest text-indigo-300">Top rated</p>
        <TiltedCoverflow products={products} onOpenProduct={onView} />
      </section>

      <div className="space-y-4">
        <SearchBar value={search} onChange={setSearch} sort={sort} onSortChange={setSort} />
        <div data-store-filter-bar className="sticky top-0 z-20 border-b border-white/10 bg-[var(--dc-chrome-glass)] py-2.5 [backdrop-filter:var(--dc-chrome-glass-blur)]">
          {/* Mobile overlap fix: the view-mode toggle is a normal flex
              sibling (shrink-0) instead of an absolutely-positioned overlay,
              so the scrolling chip row and the button can never paint on top
              of each other at any viewport width. */}
          <div className="flex items-center gap-1 pr-3">
            <div className="min-w-0 flex-1 overflow-hidden">
              <FilterChips filters={chips} activeId={activeFilter.id} onSelect={setActiveFilterId} />
            </div>

            {/* View mode toggle — anchored at the right edge of the bar */}
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
                <GlassSurface
                  data-store-view-options
                  className="absolute right-0 top-full z-30 mt-1.5 flex w-max text-white"
                  radius={16}
                  contentClassName="flex w-max gap-1 p-1.5"
                >
                  {VIEW_OPTIONS.map(({ mode, label, Icon }) => (
                    <GlassButton
                      key={mode}
                      type="button"
                      onClick={() => { setViewMode(mode); setViewDropdownOpen(false); }}
                      title={label}
                      aria-label={`${label} view`}
                      aria-pressed={viewMode === mode}
                      className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl transition [&_.size-12]:size-9 ${
                        viewMode === mode ? "[&_svg]:text-violet-300" : "[&_svg]:text-white/70"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </GlassButton>
                  ))}
                </GlassSurface>
              )}
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mx-4 mt-6 rounded-3xl border border-rose-400/30 bg-rose-500/15 px-5 py-8 text-center text-sm font-semibold text-rose-200">{error}</div>
      ) : loading ? (
        <div className="mx-4 mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map((item) => <GlassCard key={item} className="h-72 animate-pulse" aria-hidden="true" />)}</div>
      ) : filtered.length === 0 ? (
        <GlassCard className="mx-4 mt-6" contentClassName="flex flex-col items-center gap-2 py-14 text-center">
          <BookOpenIcon className="h-8 w-8 text-indigo-400" />
          <p className="text-sm font-bold text-white/85">No resources match your search</p>
          <p className="text-xs font-medium text-white/55">Try a different keyword or clear filters</p>
        </GlassCard>
      ) : viewMode === "list" ? (
        /* ── Rectangular cards / list view ── */
        <div data-store-list className="flex flex-col gap-3 px-4 pt-4">
          {filtered.map((product) => (
            <ProductCardList
              key={product.id}
              product={product}
              wishlisted={wishlist.has(product.id)}
              inCart={cartIds.has(product.id)}
              purchased={purchased.has(product.id)}
              onToggleWishlist={onToggleWishlist}
              onAddToCart={onAddToCart}
              onView={onView}
            />
          ))}
        </div>
      ) : viewMode === "mixed" ? (
        /* ── Mixed view: every 3rd item is full-width, others in 2-col grid ── */
        <div className="flex flex-col gap-4 px-4 pt-4">
          {(() => {
            const rows: React.ReactNode[] = [];
            let i = 0;
            while (i < filtered.length) {
              const p = filtered[i];
              if (i % 3 === 0) {
                /* Full-width featured card */
                rows.push(
                  <ProductCardList
                    key={p.id}
                    product={p}
                    wishlisted={wishlist.has(p.id)}
                    inCart={cartIds.has(p.id)}
                    purchased={purchased.has(p.id)}
                    onToggleWishlist={onToggleWishlist}
                    onAddToCart={onAddToCart}
                    onView={onView}
                  />,
                );
                i += 1;
              } else {
                /* 2-column grid pair */
                const next = filtered[i + 1];
                rows.push(
                  <div key={`pair-${p.id}`} data-store-grid className="grid grid-cols-2 gap-3">
                    <ProductCard
                      product={p}
                      wishlisted={wishlist.has(p.id)}
                      inCart={cartIds.has(p.id)}
                      purchased={purchased.has(p.id)}
                      onToggleWishlist={onToggleWishlist}
                      onAddToCart={onAddToCart}
                      onView={onView}
                    />
                    {next ? (
                      <ProductCard
                        product={next}
                        wishlisted={wishlist.has(next.id)}
                        inCart={cartIds.has(next.id)}
                        purchased={purchased.has(next.id)}
                        onToggleWishlist={onToggleWishlist}
                        onAddToCart={onAddToCart}
                        onView={onView}
                      />
                    ) : (
                      <div />
                    )}
                  </div>,
                );
                i += next ? 2 : 1;
              }
            }
            return rows;
          })()}
        </div>
      ) : (
        /* ── Default grid view ── */
        <div data-store-grid className="grid grid-cols-1 gap-4 px-4 pt-4 sm:grid-cols-2">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              wishlisted={wishlist.has(product.id)}
              inCart={cartIds.has(product.id)}
              purchased={purchased.has(product.id)}
              onToggleWishlist={onToggleWishlist}
              onAddToCart={onAddToCart}
              onView={onView}
            />
          ))}
        </div>
      )}
    </div>
  );
}
