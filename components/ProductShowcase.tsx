import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ProductWithRating, WebsiteSettings, Coupon } from '../App';
import ProductCard from './ProductCard';
import { isProductSearchVisible, normalizeSearchValue, rankProductForQuery } from '../utils/productSearch';

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
}

type SortOption = 'recommended' | 'newest' | 'rating' | 'price-asc' | 'price-desc' | 'free-first' | 'popular';

const SEARCH_STORAGE_KEY = 'eduvoraProductSearchQuery';
const RECENT_SEARCHES_KEY = 'eduvoraRecentProductSearches';
const popularKeywords = ['Math', 'Physics', 'Class 10', 'PCM', 'NEET', 'PDF', 'Course'];

const ProductShowcase: React.FC<ProductShowcaseProps> = ({ settings, products, onViewProduct, wishlist, onToggleWishlist, onAddToCart, onBuyNow, coupons, purchasedProductIds = [], variant = 'default', externalSearchQuery = '', hideInternalSearch = false }) => {
  const [searchQuery, setSearchQuery] = useState(() => typeof window !== 'undefined' ? sessionStorage.getItem(SEARCH_STORAGE_KEY) || '' : '');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]'); } catch { return []; }
  });
  const [sortBy, setSortBy] = useState<SortOption>('recommended');
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [isStoreFilterCompact, setIsStoreFilterCompact] = useState(false);
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
  const filters = useMemo(() => {
    const values = catalogProducts.flatMap(product => [product.category, ...(product.tags || [])]).filter((value): value is string => Boolean(value));
    return ['All', ...Array.from(new Set(values)).sort()];
  }, [catalogProducts]);

  const getPrice = (product: ProductWithRating) => parseFloat((product.salePrice || product.price || '0').replace(/[^\d.]/g, '')) || 0;
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
    <section id="products" ref={sectionRef} className={`store-scroll-scope min-h-[100dvh] touch-pan-y ${isMobileHome ? 'pb-36 pt-8 sm:py-14' : 'py-14 sm:py-24'} bg-[#F7F9FC] ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}>
      <div className="container mx-auto px-4 sm:px-6">
        <div className={`${isMobileHome ? 'mb-5 sm:mb-8' : 'mb-8 sm:mb-12'} mx-auto max-w-3xl text-center animate-child animate-delay-1`}>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#1557B0]">Learning marketplace</p>
          <h2 className="mt-3 text-balance text-3xl font-black tracking-tight text-[#10213F] sm:text-5xl">Find your next learning resource</h2>
          <p className="mx-auto mt-3 max-w-2xl text-pretty text-base leading-7 text-[#526179] sm:mt-4 sm:text-lg">{isMobileHome ? 'Find courses, notes, PDFs, and learning tools instantly.' : 'Browse focused notes, courses, PDFs, and study tools by subject, class, or format.'}</p>
        </div>

        <div className={`store-search-sticky sticky top-1 z-20 mx-auto max-w-6xl border border-blue-100/90 bg-white/90 shadow-[0_18px_55px_rgba(23,105,255,0.10)] backdrop-blur-xl animate-child animate-delay-2 transition-all duration-300 sm:top-3 lg:top-4 ${isStoreFilterCompact ? 'rounded-[1.25rem] p-2 sm:rounded-[1.5rem] sm:p-3' : 'rounded-[1.6rem] p-3 sm:rounded-[2rem] sm:p-4'}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {!hideInternalSearch && (
              <div className="relative min-h-[52px] flex-1">
                <label className="sr-only" htmlFor="product-search">Search products</label>
                <svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1769FF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input id="product-search" type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') clearSearch(); }} placeholder="Search Math, physics numericals, class 10, PDF, course..." aria-label="Search products" className="h-[52px] w-full rounded-full border border-blue-100 bg-[#F8FBFF]/90 py-3 pl-12 pr-14 text-sm font-semibold text-[#081A45] outline-none transition focus:border-[#1769FF] focus:bg-white focus:ring-4 focus:ring-blue-100 sm:text-base" />
                {searchQuery && <button type="button" onClick={clearSearch} aria-label="Clear product search" className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white text-[#536178] shadow-sm transition hover:text-[#1769FF]">×</button>}
              </div>
            )}
            <div className={`${isStoreFilterCompact ? 'hidden' : 'flex'} flex-col gap-3 sm:flex-row lg:w-auto`}>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} aria-label="Sort products" className="h-12 rounded-full border border-blue-100 bg-white px-4 text-sm font-bold text-[#081A45] outline-none focus:border-[#1769FF] focus:ring-4 focus:ring-blue-100">
                <option value="recommended">Recommended</option><option value="newest">Newest</option><option value="rating">Top rated</option><option value="price-asc">Price low to high</option><option value="price-desc">Price high to low</option><option value="free-first">Free first</option><option value="popular">Popular</option>
              </select>
              <button type="button" onClick={clearAll} className="h-12 rounded-full border border-blue-100 bg-white px-5 text-sm font-black text-[#1769FF] transition hover:bg-blue-50">Clear all</button>
            </div>
          </div>
          <div className={`${isStoreFilterCompact ? 'hidden' : 'flex'} mt-3 items-center justify-between gap-3 text-sm font-bold text-[#536178]`} aria-live="polite"><span>{isSearching ? 'Searching…' : `${displayProducts.length} product${displayProducts.length === 1 ? '' : 's'} found`}</span><span className="hidden sm:inline">Partial words, tags, keywords, and descriptions supported</span></div>
          <div className={`${isStoreFilterCompact ? 'hidden' : 'flex'} mt-4 gap-2 overflow-x-auto pb-1`} aria-label="Product category filters">
            {filters.map(filter => <button key={filter} type="button" onClick={() => setActiveFilter(filter)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition sm:text-sm ${activeFilter === filter ? 'bg-gradient-to-r from-[#1769FF] to-[#7B61FF] text-white shadow-[0_12px_30px_rgba(23,105,255,0.22)]' : 'border border-blue-100 bg-[#F8FBFF] text-[#536178] hover:bg-white hover:text-[#1769FF]'}`}>{filter}</button>)}
          </div>
          <div className={`${isStoreFilterCompact ? 'hidden' : 'flex'} mt-3 gap-2 overflow-x-auto pb-1`} aria-label="Search suggestions">
            {suggestions.map(suggestion => <button key={suggestion} type="button" onClick={() => setSearchQuery(suggestion)} className="shrink-0 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-[#7B61FF] transition hover:bg-violet-100">{suggestion}</button>)}
          </div>
        </div>

        <div ref={gridRef} className={`${isMobileHome ? 'mt-6 gap-4 sm:mt-10 sm:gap-6' : 'mt-10 gap-5 sm:mt-16 sm:gap-8 lg:gap-10'} grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}>
          {displayProducts.length > 0 ? displayProducts.map((product, index) => <ProductCard key={product.id} settings={settings} product={product} onViewDetails={(sectionId) => onViewProduct(product, sectionId)} isWishlisted={wishlist.includes(product.id)} onToggleWishlist={onToggleWishlist} onAddToCart={onAddToCart} onBuyNow={onBuyNow} animationDelay={index} coupons={coupons} isPurchased={purchasedProductIds.includes(product.id)} />) : (
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
    </section>
  );
};

export default ProductShowcase;
