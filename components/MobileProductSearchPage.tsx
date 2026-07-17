import React, { useEffect, useMemo, useRef } from 'react';
import type { ProductWithRating } from '../App';
import { getProductImage, getProductImageFallback } from '../utils/productImages';
import { isProductSearchVisible, rankProductForQuery } from '../utils/productSearch';
import SafeImage from './common/SafeImage';

interface MobileProductSearchPageProps {
  source: 'home' | 'store';
  products: ProductWithRating[];
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onViewProduct: (product: ProductWithRating) => void;
  wishlist: number[];
  onToggleWishlist: (id: number) => void;
  purchasedProductIds?: number[];
}

const HISTORY_KEY = 'dcMobileProductSearch';
const formatPrice = (product: ProductWithRating) => product.salePrice || product.price || '₹0';

const MobileProductSearchPage: React.FC<MobileProductSearchPageProps> = ({ source, products, query, onQueryChange, onClose, onViewProduct, wishlist, onToggleWishlist, purchasedProductIds = [] }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const existingState = window.history.state || {};
    if (existingState?.[HISTORY_KEY] !== source) {
      window.history.pushState({ ...existingState, [HISTORY_KEY]: source }, '', window.location.href);
    }

    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.[HISTORY_KEY] !== source) closeRef.current();
    };
    window.addEventListener('popstate', handlePopState);
    window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [source]);

  const results = useMemo(() => products
    .filter(isProductSearchVisible)
    .map((product) => ({ product, score: rankProductForQuery(product, query) }))
    .filter(({ score }) => !query.trim() || score > 0)
    .sort((left, right) => right.score - left.score || right.product.rating - left.product.rating)
    .map(({ product }) => product), [products, query]);

  const removeHistoryMarker = () => {
    if (typeof window === 'undefined') return;
    const state = window.history.state || {};
    if (state?.[HISTORY_KEY] !== source) return;
    const nextState = { ...state };
    delete nextState[HISTORY_KEY];
    window.history.replaceState(nextState, '', window.location.href);
  };

  const handleClose = () => {
    if (typeof window !== 'undefined' && window.history.state?.[HISTORY_KEY] === source) {
      window.history.back();
      return;
    }
    onClose();
  };

  const handleOpenProduct = (product: ProductWithRating) => {
    removeHistoryMarker();
    onClose();
    onViewProduct(product);
  };

  return (
    <section className="fixed inset-0 z-[1700] flex min-h-0 flex-col bg-[#F4F8FF] text-[#081A44] md:hidden" aria-label={`${source === 'home' ? 'Home' : 'Store'} product search`}>
      <header className="sticky top-0 z-20 border-b border-[#D8E6FF] bg-white/96 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_8px_28px_rgba(8,26,68,0.08)] backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleClose} aria-label="Close product search" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#D8E6FF] bg-white text-xl font-black shadow-sm">←</button>
          <label className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#BFD7FF] bg-[#F7FAFF] px-3 focus-within:border-[#0B63FF] focus-within:ring-4 focus-within:ring-blue-100">
            <span aria-hidden="true">🔎</span>
            <input ref={inputRef} type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search any course, notes or subject..." aria-label="Search products live" className="min-w-0 flex-1 bg-transparent py-3 text-sm font-black outline-none placeholder:text-[#7C879A]" />
            {query ? <button type="button" onClick={() => onQueryChange('')} aria-label="Clear search" className="grid h-8 w-8 place-items-center rounded-lg bg-white text-sm font-black shadow-sm">×</button> : null}
          </label>
        </div>
        <p className="mt-2 px-1 text-[11px] font-bold text-[#64708F]">Live results support partial words and small spelling mistakes.</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 custom-scrollbar">
        <div className="mb-3 flex items-center justify-between px-1"><h2 className="text-base font-black">{query.trim() ? 'Search results' : 'All products'}</h2><span className="text-xs font-black text-[#64708F]">{results.length} found</span></div>
        {results.length ? (
          <div className="grid grid-cols-2 gap-2.5">
            {results.map((product) => {
              const image = getProductImage(product, 'card');
              const purchased = purchasedProductIds.includes(product.id);
              return (
                <article key={product.id} className="min-w-0 overflow-hidden rounded-[18px] border border-[#D8E6FF] bg-white p-2 shadow-[0_12px_30px_rgba(11,99,255,0.08)]">
                  <div className="relative aspect-square overflow-hidden rounded-[14px] bg-[#EEF6FF]">
                    <SafeImage src={image} fallbackSrc={getProductImageFallback(product)} alt={product.title} className="h-full w-full object-contain" fallbackTitle={product.title} fallbackBadge={product.category || 'Course'} fallbackIcon="🎓" fallbackMessage="Image preview unavailable" aspect="square" />
                    {purchased ? <span className="absolute left-1.5 top-1.5 rounded-lg bg-white/95 px-1.5 py-1 text-[8px] font-black uppercase text-emerald-700 shadow">Purchased</span> : null}
                    <button type="button" onClick={() => onToggleWishlist(product.id)} aria-label={wishlist.includes(product.id) ? 'Remove from wishlist' : 'Add to wishlist'} className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-sm shadow">{wishlist.includes(product.id) ? '❤️' : '♡'}</button>
                    <button type="button" onClick={() => handleOpenProduct(product)} aria-label={`Open ${product.title}`} className="absolute inset-0 z-10" />
                  </div>
                  <button type="button" onClick={() => handleOpenProduct(product)} className="mt-2 block w-full text-left"><h3 className="line-clamp-2 min-h-9 text-[13px] font-black leading-[1.15] text-[#081A44]">{product.title}</h3></button>
                  <p className="mt-1 line-clamp-1 text-[10px] font-bold text-[#64708F]">{product.category || 'Learning'} · ⭐ {product.rating.toFixed(1)}</p>
                  <div className="mt-2 flex items-center justify-between gap-1"><strong className="truncate text-sm font-black">{formatPrice(product)}</strong><button type="button" onClick={() => handleOpenProduct(product)} className="shrink-0 rounded-lg bg-[#0B63FF] px-2 py-1.5 text-[10px] font-black text-white">View</button></div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-[#BFD7FF] bg-white px-5 py-14 text-center"><div className="text-4xl">🔎</div><h3 className="mt-3 text-lg font-black">No matching products</h3><p className="mt-2 text-sm font-semibold text-[#64708F]">Try a shorter word, another spelling, class, subject or product type.</p></div>
        )}
      </div>
    </section>
  );
};

export default MobileProductSearchPage;
