
import React, { useState, useEffect, useRef } from 'react';
import { ProductWithRating, WebsiteSettings, Coupon } from '../App';
import ProductCard from './ProductCard';

interface ProductShowcaseProps {
  settings: WebsiteSettings;
  products: ProductWithRating[];
  onViewProduct: (product: ProductWithRating, sectionId?: string) => void;
  wishlist: number[];
  onToggleWishlist: (id: number) => void;
  onAddToCart: (productId: number, quantity?: number) => void;
  onBuyNow: (product: ProductWithRating) => void;
  onQuickView: (product: ProductWithRating) => void;
  coupons: Coupon[];
}

const ProductShowcase: React.FC<ProductShowcaseProps> = ({ settings, products, onViewProduct, wishlist, onToggleWishlist, onAddToCart, onBuyNow, onQuickView, coupons }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                }
            });
        },
        { threshold: 0.05, rootMargin: "0px 0px 0px 0px" } // Trigger early
    );

    const section = sectionRef.current;
    const grid = gridRef.current;

    if (section) observer.observe(section);
    if (grid) observer.observe(grid);

    return () => {
        if (section) observer.unobserve(section);
        if (grid) observer.unobserve(grid);
    };
  }, []);
  
  const allTags = products.flatMap(p => p.tags || []);
  const allCategories = products.map(p => p.category).filter((c): c is string => !!c);
  const uniqueKeywords = [...new Set([...allCategories, ...allTags])].sort();
  const filters = ['All', ...uniqueKeywords];

  const getPrice = (product: ProductWithRating) => {
    return product.salePrice ? parseFloat(product.salePrice.replace('₹', '')) : parseFloat(product.price.replace('₹', ''));
  };

  const displayProducts = products
    .filter(product => {
        const query = searchQuery.toLowerCase();
        const filterMatch = activeFilter === 'All'
            || product.category === activeFilter
            || (product.tags && product.tags.includes(activeFilter));

        if (!query) return filterMatch;

        return filterMatch && (
            product.title.toLowerCase().includes(query) ||
            product.description.toLowerCase().includes(query) ||
            (product.category && product.category.toLowerCase().includes(query)) ||
            (product.sku && product.sku.toLowerCase().includes(query)) ||
            (product.tags && product.tags.some(tag => tag.toLowerCase().includes(query)))
        );
    })
    .sort((a, b) => {
        switch (sortBy) {
            case 'newest': return b.id - a.id;
            case 'rating': return b.rating - a.rating;
            case 'price-asc': return getPrice(a) - getPrice(b);
            case 'price-desc': return getPrice(b) - getPrice(a);
            default: return 0;
        }
    });

  return (
    <section 
      id="products" 
      ref={sectionRef}
      className={`py-14 sm:py-24 bg-gradient-to-br from-white via-sky-50/80 to-indigo-100/50 backdrop-blur-xl ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mx-auto mb-8 max-w-3xl text-center sm:mb-12 animate-child animate-delay-1">
          <h2 className="text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">All Products</h2>
          <p className="mt-3 text-base text-text-muted sm:mt-4 sm:text-lg">
            Browse our full catalog or use the search bar to find exactly what you need.
          </p>
        </div>

        <div className="max-w-4xl mx-auto animate-child animate-delay-2">
          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-indigo-100/80 bg-white/80 p-3 shadow-sm sm:p-4 md:flex-row md:gap-4">
              {/* Search */}
              <div className="relative w-full md:w-1/2">
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-12 pr-4 py-3 border border-indigo-200/80 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition bg-white/70 backdrop-blur-xl"
                />
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>

              {/* Sort */}
              <div className="w-full md:w-auto">
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full px-4 py-3 border border-indigo-200/80 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition bg-white/70 backdrop-blur-xl cursor-pointer"
                >
                    <option value="default">Default Sorting</option>
                    <option value="newest">Newest Arrivals</option>
                    <option value="rating">Highest Rated</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                </select>
              </div>
          </div>
          
          {/* Filters */}
          <div className="mt-5 flex flex-nowrap justify-start gap-2 overflow-x-auto pb-2 sm:mt-6 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0 animate-child animate-delay-3">
            {filters.map(filter => (
                <button 
                    key={filter} 
                    onClick={() => setActiveFilter(filter)} 
                    className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 sm:px-4 sm:text-sm ${
                        activeFilter === filter 
                        ? 'bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 text-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] scale-105'
                        : 'bg-indigo-50 text-slate-700 hover:bg-indigo-100 hover:text-slate-950'
                    }`}
                >
                {filter}
                </button>
            ))}
          </div>
        </div>

        <div 
            ref={gridRef} 
            className={`mt-10 grid grid-cols-1 gap-5 sm:mt-16 sm:gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-10 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
        >
          {displayProducts.length > 0 ? (
            displayProducts.map((product, index) => (
              <ProductCard 
                key={product.id} 
                settings={settings}
                product={product} 
                onViewDetails={(sectionId) => onViewProduct(product, sectionId)}
                isWishlisted={wishlist.includes(product.id)}
                onToggleWishlist={onToggleWishlist}
                onAddToCart={onAddToCart}
                onBuyNow={onBuyNow}
                onQuickView={onQuickView}
                animationDelay={index}
                coupons={coupons}
              />
            ))
          ) : (
            <div className="col-span-full text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-lg text-slate-700">No products found matching your criteria.</p>
              <button onClick={() => {setSearchQuery(''); setActiveFilter('All');}} className="mt-4 text-primary font-semibold hover:underline">Clear Filters</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default ProductShowcase;
