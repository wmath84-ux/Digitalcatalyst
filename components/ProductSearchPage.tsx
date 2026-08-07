import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ProductWithRating, WebsiteSettings, Coupon } from '../App';
import ProductCard from './ProductCard';
import { isProductSearchVisible, rankProductForQuery } from '../utils/productSearch';

interface ProductSearchPageProps {
  settings: WebsiteSettings;
  products: ProductWithRating[];
  initialQuery?: string;
  onBack: () => void;
  onViewProduct: (product: ProductWithRating) => void;
  wishlist: number[];
  onToggleWishlist: (id: number) => void;
  onAddToCart: (productId: number, quantity?: number) => void;
  onBuyNow: (product: ProductWithRating) => void;
  coupons: Coupon[];
  purchasedProductIds?: number[];
}

const FADE_OUT_MS = 420;
const BLINK_MS = 620;

const ProductSearchPage: React.FC<ProductSearchPageProps> = ({ settings, products, initialQuery = '', onBack, onViewProduct, wishlist, onToggleWishlist, onAddToCart, onBuyNow, coupons, purchasedProductIds = [] }) => {
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [renderedIds, setRenderedIds] = useState<number[]>(() => (products || []).filter(isProductSearchVisible).map(product => product.id));
  const [fadingIds, setFadingIds] = useState<Set<number>>(new Set());
  const [blinkIds, setBlinkIds] = useState<Set<number>>(new Set());
  const timeoutsRef = useRef<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousQueryRef = useRef(initialQuery);

  const catalogProducts = useMemo(() => (products || []).filter(isProductSearchVisible), [products]);
  const catalogIds = useMemo(() => catalogProducts.map(product => product.id), [catalogProducts]);

  useEffect(() => {
    setRenderedIds(catalogIds);
  }, [catalogIds]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 240);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(timer => window.clearTimeout(timer));
      timeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matchedProducts = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim();
    if (!normalizedQuery) return catalogProducts;
    return catalogProducts
      .map(product => ({ product, score: rankProductForQuery(product, normalizedQuery) }))
      .filter(item => item.score > 0)
      .sort((left, right) => right.score - left.score || right.product.rating - left.product.rating || right.product.id - left.product.id)
      .map(item => item.product);
  }, [catalogProducts, debouncedQuery]);

  useEffect(() => {
    const matchedIds = matchedProducts.map(product => product.id);
    const matchedSet = new Set(matchedIds);
    const renderedSet = new Set(renderedIds);

    const wasEmptyQuery = previousQueryRef.current.trim() === '';
    const isQueryActive = debouncedQuery.trim() !== '';

    const leaving = [...renderedSet].filter(id => !matchedSet.has(id));
    const appearing = isQueryActive && (wasEmptyQuery
      ? matchedIds
      : matchedIds.filter(id => !renderedSet.has(id)));

    if (leaving.length === 0 && appearing.length === 0) return;

    const nextBlink = new Set(appearing);
    setBlinkIds(nextBlink);

    if (leaving.length > 0) {
      setFadingIds(new Set(leaving));
      setRenderedIds([...new Set([...matchedIds, ...leaving])]);
      const fadeTimer = window.setTimeout(() => {
        setRenderedIds(matchedIds);
        setFadingIds(new Set());
      }, FADE_OUT_MS);
      timeoutsRef.current.push(fadeTimer);
    } else {
      setRenderedIds(matchedIds);
    }

    if (appearing.length > 0) {
      const blinkTimer = window.setTimeout(() => setBlinkIds(new Set()), BLINK_MS);
      timeoutsRef.current.push(blinkTimer);
    }

    previousQueryRef.current = debouncedQuery;
  }, [matchedProducts, debouncedQuery]);

  const resultCount = debouncedQuery.trim() ? matchedProducts.length : catalogProducts.length;

  return (
    <section className="min-h-[100dvh] bg-[#F7F9FC] text-[#081A45]" aria-label="Product search page">
      <header className="sticky top-0 z-30 border-b border-[#D8E6FF] bg-white/95 shadow-[0_10px_36px_rgba(8,26,68,0.1)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
          <button type="button" onClick={onBack} aria-label="Back to store" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#D8E6FF] bg-white text-xl font-black text-[#081A45] shadow-sm transition hover:border-[#0B63FF] hover:text-[#0B63FF] active:scale-95">←</button>
          <label className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-[#BFD7FF] bg-[#F7FAFF] px-3.5 transition focus-within:border-[#0B63FF] focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
            <svg className="h-5 w-5 shrink-0 text-[#0B63FF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input ref={inputRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search courses, notes, class, subject..." aria-label="Search products live" className="min-w-0 flex-1 bg-transparent py-3 text-sm font-black outline-none placeholder:text-[#7C879A] sm:text-base" />
            {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-lg font-black text-[#536178] shadow-sm transition hover:text-[#0B63FF]">×</button> : null}
          </label>
          <span className="hidden shrink-0 text-xs font-black text-[#64708F] sm:block" aria-live="polite">{resultCount} result{resultCount === 1 ? '' : 's'}</span>
        </div>
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-3 sm:px-6">
          <span className="rounded-full bg-[#EEF4FF] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#1557B0]">Live</span>
          <p className="text-[11px] font-bold text-[#64708F]">Products that don&apos;t match blink out; matching resources highlight instantly.</p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {renderedIds.length > 0 ? (
          <div className="store-mobile-two-column-grid grid grid-cols-2 gap-2.5 md:grid-cols-2 md:gap-6 lg:grid-cols-3 lg:gap-8">
            {renderedIds.map((id) => {
              const product = catalogProducts.find(item => item.id === id);
              if (!product) return null;
              const isFading = fadingIds.has(id);
              const isBlinking = blinkIds.has(id);
              return (
                <div key={id} className={`min-w-0 ${isFading ? 'product-search-fade-out' : ''} ${isBlinking ? 'product-search-blink-in' : ''}`}>
                  <ProductCard settings={settings} product={product} onViewDetails={(sectionId) => onViewProduct(product, sectionId)} isWishlisted={wishlist.includes(product.id)} onToggleWishlist={onToggleWishlist} onAddToCart={onAddToCart} onBuyNow={onBuyNow} animationDelay={0} coupons={coupons} isPurchased={purchasedProductIds.includes(product.id)} roundnessSurface="store" compactMobile />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-blue-200 bg-white/85 px-6 py-16 text-center" role="status" aria-live="polite">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-blue-50 to-violet-50 text-3xl">🔎</div>
            <h3 className="mt-5 text-2xl font-black text-[#081A45]">No matching products found</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-[#536178]">Try a shorter word, another spelling, class, subject or product type.</p>
            <button type="button" onClick={() => setQuery('')} className="mt-6 rounded-full bg-gradient-to-r from-[#1769FF] to-[#7B61FF] px-6 py-3 text-sm font-black text-white shadow-[0_12px_30px_rgba(23,105,255,0.22)]">Clear search</button>
          </div>
        )}
      </div>
    </section>
  );
};

export default ProductSearchPage;
