import { useEffect, useMemo, useRef, useState } from "react";
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
import Skeleton from "./ui/Skeleton";
import { BookOpenIcon } from "./icons";
import { Download, Gift, ShieldCheck } from "lucide-react";
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

const BENEFITS = [
  {
    title: "Special Offers",
    body: "Grab the best deals on top resources!",
    Icon: Gift,
    accent: "linear-gradient(135deg,#7b4dff 0%,#5c3fff 100%)",
    ringClass: "border-violet-400/35",
  },
  {
    title: "100% Secure",
    body: "Safe & encrypted payments",
    Icon: ShieldCheck,
    accent: "linear-gradient(135deg,#0f56ff 0%,#1ad6ff 100%)",
    ringClass: "border-sky-400/35",
  },
  {
    title: "Instant Access",
    body: "Start learning immediately",
    Icon: Download,
    accent: "linear-gradient(135deg,#773cff 0%,#a941ff 100%)",
    ringClass: "border-fuchsia-400/35",
  },
];

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
  const discount = product.originalPrice > 0
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;
  const unavailable = product.availableForSale === false && !purchased;

  return (
    <GlassCard
      onClick={() => onView(product)}
      contentClassName="flex p-0"
      className="group relative flex overflow-hidden transition duration-300 hover:-translate-y-1"
    >
      <div className="relative h-auto w-36 shrink-0 overflow-hidden sm:w-44">
        <img src={product.image} alt={product.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
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

      <div className="relative flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <h3 className="text-sm font-extrabold leading-[1.35] dc-ink-1 sm:text-[15px]">{product.title}</h3>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-amber-400 text-amber-400"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
            <span className="text-xs font-bold dc-ink-1">{product.rating.toFixed(1)}</span>
            <span className="text-xs dc-ink-3">({product.reviews})</span>
          </span>
          {product.reviews >= 25 ? <span className="dc-proof">🔥 Popular</span> : null}
        </div>
        <p className="text-xs font-medium dc-ink-3">by {product.instructor}</p>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-1 pt-1">
          {product.originalPrice > product.price && (
            <span className="text-xs dc-anchor-price">₹{product.originalPrice}</span>
          )}
          <span className="text-lg dc-hero-price">₹{product.price}</span>
          {discount > 0 && (
            <span className="dc-save-pill">Save ₹{product.originalPrice - product.price} · {discount}%</span>
          )}
        </div>
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
            className="dc-focusable mt-1 flex w-full items-center justify-center rounded-full bg-indigo-600 px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white shadow-[var(--dc-elev-accent)] transition hover:bg-indigo-500 active:scale-[0.98]"
          >
            Add to my cart
          </button>
        )}
      </div>
    </GlassCard>
  );
}

export default function StorePage({ wishlist, cartIds, purchased, onToggleWishlist, onAddToCart, onView }: StorePageProps) {
  const { products, loading, error } = useCatalog();
  const { filters: adminFilters } = useStoreFilters();
  const [search, setSearch] = useState("");
  const [activeFilterId, setActiveFilterId] = useState(ALL_STORE_FILTER.id);
  const [sort, setSort] = useState("Recommended");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewDropdownOpen) return undefined;
    const close = (e: Event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setViewDropdownOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [viewDropdownOpen]);

  const chips: StoreFilter[] = useMemo(() => {
    const active = adminFilters.filter((filter) => filter.active);
    const list = active.length > 0 ? active : derivedStoreFilters(products);
    return [ALL_STORE_FILTER, ...list];
  }, [adminFilters, products]);

  const activeFilter = useMemo(
    () => chips.find((filter) => filter.id === activeFilterId) || ALL_STORE_FILTER,
    [chips, activeFilterId],
  );

  useEffect(() => {
    if (activeFilterId !== ALL_STORE_FILTER.id && !chips.some((filter) => filter.id === activeFilterId)) {
      setActiveFilterId(ALL_STORE_FILTER.id);
    }
  }, [chips, activeFilterId]);

  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      const query = search.toLowerCase();
      const matchesSearch =
        !search.trim()
        || p.title.toLowerCase().includes(query)
        || p.subject.toLowerCase().includes(query)
        || p.instructor.toLowerCase().includes(query)
        || p.tags.some((tag) => tag.toLowerCase().includes(query))
        || (p.searchKeywords || []).some((keyword) => keyword.toLowerCase().includes(query));

      const matchesChip = productMatchesStoreFilter(p, activeFilter);

      return matchesSearch && matchesChip;
    });

    list = [...list];
    if (sort === "Price: Low to High") list.sort((a, b) => a.price - b.price);
    if (sort === "Price: High to Low") list.sort((a, b) => b.price - a.price);
    if (sort === "Top Rated") list.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
    if (sort === "Newest") list.reverse();
    if (sort === "Recommended") list.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews || a.price - b.price);

    return list;
  }, [products, search, activeFilter, sort]);

  const openFilterSheet = () => {
    if (typeof document === "undefined") return;
    const trigger = document.querySelector<HTMLElement>("[data-store-filters-toggle]");
    trigger?.click();
  };

  return (
    <div data-store-page className="relative pb-[7.5rem] lg:pb-8">
      <section data-store-gutter className="px-4 pb-3 pt-4 lg:pt-1">
        <h1 className="text-[3.35rem] font-black leading-none tracking-[-0.055em] text-white lg:text-[2.6rem]">
          Store
        </h1>
        <p className="mt-1 text-[1.05rem] text-white/72 lg:text-base">
          Browse the learning marketplace
        </p>
      </section>

      <Hero resourceCount={filtered.length} />

      <div className="space-y-4">
        <SearchBar value={search} onChange={setSearch} sort={sort} onSortChange={setSort} onOpenFilters={openFilterSheet} />
      </div>

      <div data-store-filter-bar className="dc-scene-plate dc-scene-plate--bar sticky top-0 z-20 mt-4 border-b border-white/10 bg-[var(--dc-chrome-glass)] py-2.5 [backdrop-filter:var(--dc-chrome-glass-blur)]">
        <div className="flex items-center gap-1 pr-3">
          <div className="min-w-0 flex-1 overflow-hidden">
            <FilterChips filters={chips} activeId={activeFilter.id} onSelect={setActiveFilterId} />
          </div>

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
                className="dc-scene-plate absolute right-0 top-full z-30 mt-1.5 flex w-max text-white"
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

      {error ? (
        <div className="dc-scene-ink mx-4 mt-6 rounded-3xl border border-rose-400/30 bg-rose-500/15 px-5 py-8 text-center text-sm font-semibold text-rose-200 lg:mx-0">{error}</div>
      ) : loading ? (
        <div className="space-y-5 px-4 pt-4">
          <section data-store-gutter className="px-4 pt-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[1.65rem] leading-none text-[#ffd447]">★</span>
                <Skeleton width="8.25rem" height="1.8rem" radius={10} />
              </div>
              <Skeleton width="5rem" height="1.15rem" radius={999} />
            </div>
            <div data-store-list data-store-list-loading aria-busy="true" aria-label="Loading products" className="flex gap-4 overflow-x-auto pb-2 min-[960px]:grid min-[960px]:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] min-[960px]:gap-5 min-[960px]:overflow-visible">
              {[0, 1, 2, 3, 4].map((item) => (
                <GlassCard key={item} aria-hidden="true" contentClassName="p-0" className="min-w-[16.9rem] overflow-hidden rounded-[24px] border border-white/10 bg-[#061534]/95 min-[960px]:min-w-0">
                  <div className="p-3">
                    <Skeleton width="100%" height="15rem" radius={20} />
                    <div className="space-y-3 px-1 pb-1 pt-3">
                      <Skeleton width="82%" height="1rem" radius={8} />
                      <Skeleton width="45%" height="0.875rem" radius={8} />
                      <Skeleton width="55%" height="0.875rem" radius={8} />
                      <div className="flex items-center gap-2">
                        <Skeleton width="3rem" height="1.5rem" radius={999} />
                        <Skeleton width="5rem" height="2rem" radius={999} />
                      </div>
                      <Skeleton width="100%" height="3rem" radius={16} />
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </section>

          <div data-store-gutter className="px-4">
            <div className="grid gap-3 md:grid-cols-3">
              {BENEFITS.map(({ title }, index) => (
                <Skeleton key={title + index} width="100%" height="5.6rem" radius={24} />
              ))}
            </div>
          </div>

          <div data-store-gutter className="px-4 pt-1">
            <Skeleton width="13rem" height="1rem" radius={8} />
            <Skeleton width="100%" height="18rem" radius={28} className="mt-3" />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <GlassCard className="mx-4 mt-6 lg:mx-0" contentClassName="dc-empty">
          <span className="dc-empty-art" aria-hidden="true">
            <BookOpenIcon className="h-7 w-7 text-indigo-300" />
          </span>
          <p className="dc-empty-title">
            {search.trim() ? `Nothing matched “${search.trim()}”` : "No resources in this filter yet"}
          </p>
          <p className="dc-empty-body">
            {search.trim()
              ? "We search titles, subjects, instructors and tags. Try a shorter keyword, or reset the filter to see the full catalog."
              : "This category has no published resources right now. Switch back to All to browse everything available today."}
          </p>
          {(search.trim() || activeFilter.id !== ALL_STORE_FILTER.id) ? (
            <button
              type="button"
              onClick={() => { setSearch(""); setActiveFilterId(ALL_STORE_FILTER.id); }}
              className="dc-focusable mt-1 rounded-full bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-[var(--dc-elev-accent)] transition hover:bg-indigo-500"
            >
              Show all resources
            </button>
          ) : null}
        </GlassCard>
      ) : (
        <>
          <section data-store-gutter className="px-4 pt-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[1.65rem] leading-none text-[#ffd447]">★</span>
                <h2 className="text-[1.9rem] font-black tracking-[-0.04em] text-white lg:text-[1.6rem]">Top Rated</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setActiveFilterId(ALL_STORE_FILTER.id);
                }}
                className="inline-flex items-center gap-2 text-base font-medium text-white/78 transition hover:text-white lg:text-sm"
              >
                See all
                <span aria-hidden="true" className="text-xl leading-none">→</span>
              </button>
            </div>
          </section>

          {viewMode === "list" ? (
            <div data-store-gutter data-store-list className="flex flex-col gap-3 px-4 pt-0">
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
            <div data-store-gutter data-store-mixed className="grid grid-cols-2 gap-3 px-4 pt-0">
              {filtered.map((product, index) =>
                index % 3 === 0 ? (
                  <div key={product.id} data-store-mixed-feature className="col-span-2 flex">
                    <ProductCardList
                      product={product}
                      wishlisted={wishlist.has(product.id)}
                      inCart={cartIds.has(product.id)}
                      purchased={purchased.has(product.id)}
                      onToggleWishlist={onToggleWishlist}
                      onAddToCart={onAddToCart}
                      onView={onView}
                    />
                  </div>
                ) : (
                  <ProductCard
                    key={product.id}
                    index={index}
                    product={product}
                    wishlisted={wishlist.has(product.id)}
                    inCart={cartIds.has(product.id)}
                    purchased={purchased.has(product.id)}
                    onToggleWishlist={onToggleWishlist}
                    onAddToCart={onAddToCart}
                    onView={onView}
                  />
                ),
              )}
            </div>
          ) : (
            <div
              data-store-gutter
              data-store-grid
              className="flex gap-4 overflow-x-auto pb-2 px-4 snap-x snap-mandatory min-[960px]:grid min-[960px]:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] min-[960px]:gap-5 min-[960px]:overflow-visible"
            >
              {filtered.map((product, index) => (
                <div key={product.id} className="min-w-[16.9rem] snap-start min-[960px]:min-w-0">
                  <ProductCard
                    index={index}
                    product={product}
                    wishlisted={wishlist.has(product.id)}
                    inCart={cartIds.has(product.id)}
                    purchased={purchased.has(product.id)}
                    onToggleWishlist={onToggleWishlist}
                    onAddToCart={onAddToCart}
                    onView={onView}
                  />
                </div>
              ))}
            </div>
          )}

          <section data-store-gutter className="px-4 pt-6">
            <div className="overflow-hidden rounded-[28px] border border-[#2b4381] bg-[#08173a]/94 shadow-[0_24px_60px_-40px_rgba(71,106,255,0.9)]">
              <div className="grid gap-px bg-white/8 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(230px,1.1fr)]">
                {BENEFITS.map(({ title, body, Icon, accent, ringClass }) => (
                  <div key={title} className={`bg-[#08173a]/96 p-4 ${ringClass}`}>
                    <div className="flex items-center gap-4">
                      <div
                        className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] text-white shadow-[0_14px_30px_-16px_rgba(132,74,255,0.95)]"
                        style={{ backgroundImage: accent }}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-black tracking-[-0.03em] text-white">{title}</p>
                        <p className="mt-1 text-sm leading-6 text-white/70">{body}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => { setSearch(""); setActiveFilterId(ALL_STORE_FILTER.id); }}
                  className="flex items-center justify-between bg-[linear-gradient(135deg,#6e42ff_0%,#5a39ff_55%,#4330f9_100%)] px-6 py-5 text-left shadow-[0_25px_55px_-35px_rgba(103,79,255,0.95)] transition hover:brightness-110"
                >
                  <span>
                    <span className="block text-lg font-black tracking-[-0.03em] text-white">View All Resources</span>
                    <span className="mt-1 block text-sm text-white/80">Browse the full catalog again</span>
                  </span>
                  <span className="text-2xl font-black text-white">→</span>
                </button>
              </div>
            </div>
          </section>

          <section aria-label="Top rated" data-store-top-rated className="pt-8 lg:pt-10">
            <div data-store-gutter className="px-4">
              <p className="dc-scene-ink dc-section-label px-4">Top rated</p>
              <h2 className="dc-scene-ink mt-2 text-[1.8rem] font-black leading-none tracking-[-0.04em] text-white sm:text-[2.1rem]">
                top viral products check it out
              </h2>
              <p className="dc-scene-ink mt-2 max-w-2xl text-sm leading-6 text-white/72 sm:text-base">
                Swipe through the products learners are opening the most right now.
              </p>
            </div>
            <div className="mt-4 overflow-hidden rounded-[30px] border border-[#2b4381] bg-[#05132f]/92 shadow-[0_25px_70px_-42px_rgba(74,92,255,0.85)]">
              <TiltedCoverflow products={products} onOpenProduct={onView} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
