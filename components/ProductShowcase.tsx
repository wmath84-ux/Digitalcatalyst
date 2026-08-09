import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ProductWithRating, WebsiteSettings, Coupon } from '../App';
import ProductCard from './ProductCard';
import { isProductSearchVisible, normalizeSearchValue, rankProductForQuery } from '../utils/productSearch';
import MobileProductSearchPage from './MobileProductSearchPage';
import { getProductPriceDetails } from '../utils/productPrice';

interface ProductShowcaseProps {
  settings: WebsiteSettings;
  products: ProductWithRating[];
  onViewProduct: (product: ProductWithRating, sectionId?: string) => void;
  wishlist: number[];
  onToggleWishlist: (id: number) => void;
  onAddToCart: (productId: number, quantity?: number) => void;
  onBuyNow: (product: ProductWithRating) => void;
  coupons: Coupon[];
  purchasedProductIds?: number[];
  variant?: 'default' | 'mobileHome';
  externalSearchQuery?: string;
  hideInternalSearch?: boolean;
  onOpenSearchPage?: (query: string) => void;
}

type SortOption = 'recommended' | 'newest' | 'rating' | 'price-asc' | 'price-desc' | 'free-first' | 'popular';

const SEARCH_STORAGE_KEY = 'eduvoraProductSearchQuery';
const RECENT_SEARCHES_KEY = 'eduvoraRecentProductSearches';
const popularKeywords = ['Math', 'Physics', 'Class 10', 'PCM', 'NEET', 'PDF', 'Course'];

const ProductShowcase: React.FC<ProductShowcaseProps> = ({ settings, products, onViewProduct, wishlist, onToggleWishlist, onAddToCart, onBuyNow, coupons, purchasedProductIds = [], variant = 'default', externalSearchQuery = '', hideInternalSearch = false, onOpenSearchPage }) => {
  const [searchQuery, setSearchQuery] = useState(() => typeof window !== 'undefined' ? sessionStorage.getItem(SEARCH_STORAGE_KEY) || '' : '');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]'); } catch { return []; }
  });
  const [sortBy, setSortBy] = useState<SortOption>('recommended');
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [searchBoxExpanded, setSearchBoxExpanded] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isStoreFilterCompact, setIsStoreFilterCompact] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const isMobileHome = variant === 'mobileHome';

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 240);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(SEARCH_STORAGE_KEY, searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const normalized = normalizeSearchValue(debouncedSearchQuery);
    if (normalized.length < 2) return;
    setRecentSearches(prev => {
      const next = [debouncedSearchQuery.trim(), ...prev.filter(item => normalizeSearchValue(item) !== normalized)].slice(0, 5);
      try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [debouncedSearchQuery]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('is-visible'); });
    }, { threshold: 0.05 });
    const section = sectionRef.current;
    const grid = gridRef.current;
    if (section) observer.observe(section);
    if (grid) observer.observe(grid);
    return () => { if (section) observer.unobserve(section); if (grid) observer.unobserve(grid); };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let rafId = 0;
    const updateStoreSearchChrome = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        const section = sectionRef.current;

        if (!section) {
          setIsStoreFilterCompact(false);
          return;
        }

        const rect = section.getBoundingClientRect();
        const isMobileViewport = window.innerWidth < 640;
        const compactTop = isMobileViewport ? 8 : 72;
        const visibleBottom = isMobileViewport ? 220 : 360;

        setIsStoreFilterCompact(rect.top < compactTop && rect.bottom > visibleBottom);
      });
    };

    updateStoreSearchChrome();
    const visualViewport = window.visualViewport;
    window.addEventListener('scroll', updateStoreSearchChrome, { passive: true });
    window.addEventListener('resize', updateStoreSearchChrome);
    visualViewport?.addEventListener('scroll', updateStoreSearchChrome, { passive: true });
    visualViewport?.addEventListener('resize', updateStoreSearchChrome);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', updateStoreSearchChrome);
      window.removeEventListener('resize', updateStoreSearchChrome);
      visualViewport?.removeEventListener('scroll', updateStoreSearchChrome);
      visualViewport?.removeEventListener('resize', updateStoreSearchChrome);
    };
  }, []);

  const catalogProducts = useMemo(() => (products || []).filter(isProductSearchVisible), [products]);
  const freeProductCount = catalogProducts.filter(product => product.isFree).length;
  const filters = useMemo(() => {
    const values = catalogProducts.flatMap(product => [product.category, ...(product.tags || [])]).filter((value): value is string => Boolean(value));
    return ['All', ...Array.from(new Set(values)).sort()];
  }, [catalogProducts]);

  const getPrice = (product: ProductWithRating) => getProductPriceDetails(product).currentPrice;
  const activeQuery = normalizeSearchValue([debouncedSearchQuery, externalSearchQuery].filter(Boolean).join(' '));
  const isSearching = searchQuery !== debouncedSearchQuery;

  const displayProducts = useMemo(() => {
    const categoryQuery = normalizeSearchValue(activeFilter);
    return catalogProducts
      .map(product => ({ product, score: rankProductForQuery(product, activeQuery) }))
      .filter(({ product, score }) => {
        const categoryMatch = activeFilter === 'All' || normalizeSearchValue(product.category) === categoryQuery || (product.tags || []).some(tag => normalizeSearchValue(tag) === categoryQuery);
        return categoryMatch && (!activeQuery || score > 0);
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'newest': return b.product.id - a.product.id;
          case 'rating': return b.product.rating - a.product.rating;
          case 'price-asc': return getPrice(a.product) - getPrice(b.product);
          case 'price-desc': return getPrice(b.product) - getPrice(a.product);
          case 'free-first': return Number(Boolean(b.product.isFree)) - Number(Boolean(a.product.isFree)) || a.product.id - b.product.id;
          case 'popular': return (b.product.viewCount || 0) - (a.product.viewCount || 0) || (b.product.wishlistCount || 0) - (a.product.wishlistCount || 0);
          default: return b.score - a.score || b.product.rating - a.product.rating || b.product.id - a.product.id;
        }
      })
      .map(item => item.product);
  }, [activeFilter, activeQuery, catalogProducts, sortBy]);

  const suggestions = useMemo(() => {
    const fromProducts = catalogProducts.flatMap(product => [product.category, ...(product.tags || []), ...(product.keywords || [])]).filter((value): value is string => Boolean(value));
    return Array.from(new Set([...recentSearches, ...popularKeywords, ...fromProducts])).slice(0, 12);
  }, [catalogProducts, recentSearches]);

  const clearSearch = () => setSearchQuery('');
  const clearAll = () => { setSearchQuery(''); setActiveFilter('All'); setSortBy('recommended'); };
  return (
    <section id="products" ref={sectionRef} className={`store-scroll-scope relative min-h-[100dvh] touch-pan-y ${isMobileHome ? 'pb-36 pt-8 sm:py-14' : 'pt-14 pb-28 sm:py-24'} bg-[#EEF4FB] ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-36 left-1/2 h-[32rem] w-[68rem] max-w-none -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(191,215,255,0.62),transparent)]" />
        <div className="absolute -left-44 top-64 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(closest-side,rgba(123,97,255,0.15),transparent)]" />
        <div className="absolute -right-44 bottom-52 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(closest-side,rgba(191,215,255,0.5),transparent)]" />
      </div>
      <div className="relative container mx-auto px-4 sm:px-6">
        <div className={`${isMobileHome ? 'mb-5 sm:mb-8' : 'mb-7 sm:mb-9'} mx-auto max-w-6xl animate-child animate-delay-1`}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0B63FF]">Learning marketplace</p>
              <h2 className="mt-3 text-balance text-3xl font-black tracking-tight text-[#081A44] sm:text-5xl">Find the right resource, faster</h2>
              <p className="mt-3 max-w-2xl text-pretty text-base leading-7 text-[#64708F] sm:text-lg">{isMobileHome ? 'Find courses, notes, PDFs, and learning tools instantly.' : 'Search focused notes, courses, PDFs, and study tools by subject, class, or format.'}</p>
              <div className="mt-5 flex flex-wrap items-center gap-2 sm:gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D8E6FF] bg-white/95 px-3 py-1.5 text-xs font-black text-[#0B63FF] shadow-sm">
                  <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Instant download
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D8E6FF] bg-white/95 px-3 py-1.5 text-xs font-black text-[#0B63FF] shadow-sm">
                  <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  Secure checkout
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D8E6FF] bg-white/95 px-3 py-1.5 text-xs font-black text-[#0B63FF] shadow-sm">
                  <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h7v8l10-12h-7l0-8z" /></svg>
                  Lifetime access
                </span>
              </div>
            </div>
            <div className="shrink-0 space-y-2">
              <p className="inline-flex items-center gap-2 rounded-full border border-[#D8E6FF] bg-white/95 px-4 py-2 text-sm font-black text-[#0B63FF] shadow-sm" aria-live="polite">
                <svg className="h-4 w-4 text-[#1769FF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                {isSearching ? 'Updating results…' : `${displayProducts.length} resource${displayProducts.length === 1 ? '' : 's'} available`}
              </p>
              {freeProductCount > 0 && (
                <p className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#059669] to-[#0E9F6E] px-4 py-2 text-sm font-black text-white shadow-[0_8px_22px_rgba(5,150,105,0.30)]">
                  <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01" /></svg>
                  {freeProductCount} free
                </p>
              )}
            </div>
          </div>
        </div>

        <div className={`store-search-sticky sticky top-2 z-20 mx-auto max-w-6xl overflow-hidden border border-[#D0D5DD] bg-[#F0F2F5]/95 backdrop-blur-2xl animate-child animate-delay-2 transition-all duration-300 sm:top-4 lg:top-5 ${isStoreFilterCompact ? 'rounded-[1.35rem] p-2 sm:p-3' : 'rounded-[1.75rem] p-3.5 sm:p-5'}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {!hideInternalSearch && (
              <div className="store-search-field group relative min-h-[58px] flex-1">
                <label className="sr-only" htmlFor="product-search">Search products</label>
                <div className="pointer-events-none absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-[#EAF2FF] to-[#F4F0FF] text-[#1769FF]">
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                {!searchBoxExpanded ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      if (window.matchMedia('(max-width: 767px)').matches) {
                        setIsMobileSearchOpen(true);
                        return;
                      }
                      setSearchBoxExpanded(true);
                      window.setTimeout(() => searchInputRef.current?.focus(), 30);
                      event.currentTarget.blur();
                    }}
                    aria-label="Expand product search"
                    className="h-[58px] w-full rounded-[1.15rem] border border-[#CFE0F7] bg-gradient-to-r from-white to-[#F7FAFF] py-3 pl-16 pr-14 text-left text-[15px] font-black text-[#8794AA] outline-none transition hover:border-[#1769FF] hover:bg-white hover:text-[#081A45] focus:border-[#1769FF] focus:ring-4 focus:ring-blue-100 sm:rounded-[1.35rem] sm:text-base"
                  >
                    <span className="inline-flex items-center gap-2">Search courses, notes, class, subject... <span className="rounded-full bg-[#EEF4FF] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#1557B0]">Enter ↵</span></span>
                  </button>
                ) : (
                  <input ref={searchInputRef} id="product-search" type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onFocus={(event) => { if (window.matchMedia('(max-width: 767px)').matches) { event.currentTarget.blur(); setIsMobileSearchOpen(true); } }} onClick={(event) => { if (window.matchMedia('(max-width: 767px)').matches) { event.currentTarget.blur(); setIsMobileSearchOpen(true); } }} onKeyDown={(event) => { if (event.key === 'Escape') { clearSearch(); setSearchBoxExpanded(false); } if (event.key === 'Enter' && onOpenSearchPage && searchQuery.trim()) { onOpenSearchPage(searchQuery.trim()); } }} placeholder="Search courses, notes, class, subject..." aria-label="Search products" className="h-[58px] w-full rounded-[1.15rem] border border-[#CFE0F7] bg-gradient-to-r from-white to-[#F7FAFF] py-3 pl-16 pr-14 text-[15px] font-black text-[#081A45] outline-none transition placeholder:text-[#8794AA] focus:border-[#1769FF] focus:bg-white focus:ring-4 focus:ring-blue-100 sm:rounded-[1.35rem] sm:text-base" />
                )}
                {searchQuery && <button type="button" onClick={() => { clearSearch(); if (!searchBoxExpanded) setSearchBoxExpanded(true); }} aria-label="Clear product search" className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-[#E1EAF7] bg-white text-lg font-black text-[#536178] transition hover:border-[#1769FF] hover:text-[#1769FF]">×</button>}
              </div>
            )}
            <div className={`${isStoreFilterCompact ? 'hidden' : 'flex'} store-sort-actions flex-col gap-2 sm:flex-row lg:w-auto`}>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} aria-label="Sort products" className="h-12 rounded-2xl border border-[#CFE0F7] bg-white px-4 text-sm font-black text-[#081A45] shadow-sm outline-none focus:border-[#1769FF] focus:ring-4 focus:ring-blue-100">
                <option value="recommended">Recommended</option><option value="newest">Newest</option><option value="rating">Top rated</option><option value="price-asc">Price low to high</option><option value="price-desc">Price high to low</option><option value="free-first">Free first</option><option value="popular">Popular</option>
              </select>
              <button type="button" onClick={clearAll} className="h-12 rounded-2xl border border-[#CFE0F7] bg-[#F8FBFF] px-5 text-sm font-black text-[#1769FF] shadow-sm transition hover:border-[#1769FF] hover:bg-white">Clear all</button>
            </div>
          </div>
          <div className={`${isStoreFilterCompact ? 'hidden' : 'flex'} store-filter-chip-strip mt-4 items-center gap-2 overflow-x-auto border-t border-[#D8E6FF]/80 pt-4 pb-1`} aria-label="Product category filters">
            <button type="button" className="shrink-0 rounded-full bg-[#F2F4F7] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#667085]">⚙ Filters</button>
            {filters.map(filter => (
              <button key={filter} type="button" onClick={() => setActiveFilter(filter)} aria-pressed={activeFilter === filter} className={`shrink-0 rounded-full border px-4 py-2.5 text-xs font-black transition sm:text-sm ${activeFilter === filter ? 'border-[#D8E6FF] bg-[#EEF6FF] text-[#344054] shadow-sm' : 'border-transparent bg-[#F2F4F7] text-[#667085] hover:bg-[#E8EBF0]'}`}>
                {activeFilter === filter && <span className="mr-1.5">✓</span>}{filter}
              </button>
            ))}
          </div>
          {!activeQuery && suggestions.length > 0 && <div className={`${isStoreFilterCompact ? 'hidden' : 'flex'} store-popular-chip-strip mt-3 items-center gap-2 overflow-x-auto pb-1`} aria-label="Popular searches">
            <span className="shrink-0 text-xs font-black uppercase tracking-[0.14em] text-[#7A879A]">Try</span>
            {suggestions.slice(0, 6).map(suggestion => <button key={suggestion} type="button" onClick={() => setSearchQuery(suggestion)} className="shrink-0 rounded-full border border-[#DDE7F5] bg-[#F8FBFF] px-3.5 py-2 text-xs font-black text-[#1557B0] shadow-sm transition hover:border-[#1769FF] hover:bg-white">{suggestion}</button>)}
          </div>}
        </div>

        <div ref={gridRef} className={`store-mobile-two-column-grid ${isMobileHome ? 'mt-6 gap-2.5 sm:mt-10 sm:gap-6' : 'mt-10 gap-2.5 sm:mt-16 sm:gap-8 lg:gap-10'} grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}>
          {displayProducts.length > 0 ? displayProducts.map((product, index) => <ProductCard key={product.id} settings={settings} product={product} onViewDetails={(sectionId) => onViewProduct(product, sectionId)} isWishlisted={wishlist.includes(product.id)} onToggleWishlist={onToggleWishlist} onAddToCart={onAddToCart} onBuyNow={onBuyNow} animationDelay={index} coupons={coupons} isPurchased={purchasedProductIds.includes(product.id)} roundnessSurface="store" compactMobile />) : (
            <div className="col-span-full rounded-[2rem] border border-dashed border-blue-200 bg-white/85 px-6 py-14 text-center shadow-[0_18px_55px_rgba(23,105,255,0.08)]" role="status" aria-live="polite">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-blue-50 to-violet-50 text-3xl">🔎</div>
              <h3 className="mt-5 text-2xl font-black text-[#081A45]">No matching products found</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-[#536178]">Try searching Math, Physics, Class 10, PDF, Course — or clear filters to browse every active product.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">{popularKeywords.map(keyword => <button key={keyword} type="button" onClick={() => setSearchQuery(keyword)} className="rounded-full border border-blue-100 bg-[#F8FBFF] px-4 py-2 text-sm font-black text-[#1769FF]">{keyword}</button>)}</div>
              <button onClick={clearAll} className="mt-6 rounded-full bg-gradient-to-r from-[#1769FF] to-[#7B61FF] px-6 py-3 text-sm font-black text-white shadow-[0_12px_30px_rgba(23,105,255,0.22)]">Clear search</button>
            </div>
          )}
        </div>
      </div>
      {isMobileSearchOpen ? <MobileProductSearchPage source="store" products={products} query={searchQuery} onQueryChange={setSearchQuery} onClose={() => setIsMobileSearchOpen(false)} onViewProduct={(product) => onViewProduct(product)} wishlist={wishlist} onToggleWishlist={onToggleWishlist} purchasedProductIds={purchasedProductIds} /> : null}
    </section>
  );
};

export default ProductShowcase;
