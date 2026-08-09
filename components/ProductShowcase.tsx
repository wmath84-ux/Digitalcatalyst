import React, { useMemo, useState, useEffect } from 'react';
import { ProductWithRating, WebsiteSettings, Coupon } from '../App';
import { isProductSearchVisible } from '../utils/productSearch';
import { getProductPriceDetails } from '../utils/productPrice';
import Hero from './store-new/Hero';
import SearchBar from './store-new/SearchBar';
import FilterChips from './store-new/FilterChips';
import ProductCard from './store-new/ProductCard';
import { BookOpenIcon } from './store-new/icons';

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

type SortOption = "Recommended" | "Price: Low to High" | "Price: High to Low" | "Top Rated" | "Newest";

const ProductShowcase: React.FC<ProductShowcaseProps> = ({ 
  settings, 
  products, 
  onViewProduct, 
  wishlist, 
  onToggleWishlist, 
  onBuyNow,
  purchasedProductIds = [],
  onOpenSearchPage
}) => {
  const [search, setSearch] = useState("");
  const [activeChip, setActiveChip] = useState("All");
  const [sort, setSort] = useState<SortOption>("Recommended");

  // Filter visible products only
  const catalogProducts = useMemo(() => (products || []).filter(isProductSearchVisible), [products]);

  // Chips: All + category + tags (matching provided logic: category, classLevel, subject)
  const chips = useMemo(() => {
    const set = new Set<string>(["All"]);
    catalogProducts.forEach((p) => {
      if (p.category) set.add(p.category);
      // classLevel equivalent: use department or dimensions
      // subject equivalent: use first tag or keywords
      (p.tags || []).forEach(tag => set.add(tag));
    });
    return Array.from(set);
  }, [catalogProducts]);

  const getPrice = (product: ProductWithRating) => getProductPriceDetails(product).currentPrice;

  const filtered = useMemo(() => {
    let list = catalogProducts.filter((p) => {
      const searchLower = search.trim().toLowerCase();
      const matchesSearch =
        !searchLower ||
        p.title.toLowerCase().includes(searchLower) ||
        (p.category || "").toLowerCase().includes(searchLower) ||
        (p.tags || []).some(t => t.toLowerCase().includes(searchLower)) ||
        (p.description || "").toLowerCase().includes(searchLower);

      const matchesChip =
        activeChip === "All" ||
        p.category === activeChip ||
        (p.tags || []).includes(activeChip);

      return matchesSearch && matchesChip;
    });

    list = [...list];

    if (sort === "Price: Low to High") {
      list.sort((a, b) => getPrice(a) - getPrice(b));
    }

    if (sort === "Price: High to Low") {
      list.sort((a, b) => getPrice(b) - getPrice(a));
    }

    if (sort === "Top Rated") {
      list.sort((a, b) => b.rating - a.rating);
    }

    if (sort === "Newest") {
      list.sort((a, b) => b.id - a.id);
    }

    return list;
  }, [catalogProducts, search, activeChip, sort]);

  // Handle external search trigger from old compact header (Enter)
  const handleSearchChange = (value: string) => {
    setSearch(value);
    // If user presses Enter with query and onOpenSearchPage exists, we still stay in place for new UX
    // but preserve old behavior if needed
    if (onOpenSearchPage && value.trim().length > 2) {
      // optional: keep local search, don't navigate
    }
  };

  return (
    <div className="pb-6 bg-white min-h-[60vh]">
      <Hero resourceCount={filtered.length} />

      <div className="space-y-4">
        <SearchBar
          value={search}
          onChange={handleSearchChange}
          sort={sort}
          onSortChange={setSort as any}
        />

        <FilterChips
          chips={chips}
          active={activeChip}
          onSelect={setActiveChip}
        />
      </div>

      <p className="px-4 pt-5 text-center text-[15px] font-semibold text-slate-500">
        {filtered.length} resource{filtered.length === 1 ? "" : "s"} available
      </p>

      {filtered.length === 0 ? (
        <div className="mx-4 mt-6 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center">
          <BookOpenIcon className="h-8 w-8 text-slate-300" />

          <p className="text-sm font-semibold text-slate-500">
            No resources match your search
          </p>

          <p className="text-xs text-slate-400">
            Try a different keyword or clear filters
          </p>

          <button
            type="button"
            onClick={() => { setSearch(""); setActiveChip("All"); }}
            className="mt-2 rounded-full bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 px-4 pt-4 sm:grid-cols-2">
          {filtered.map((product) => (
            <React.Fragment key={product.id}>
              <ProductCard
                product={product}
                wishlisted={wishlist.includes(product.id)}
                purchased={purchasedProductIds.includes(product.id)}
                onToggleWishlist={onToggleWishlist}
                onView={onViewProduct}
              />
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductShowcase;
