import { useMemo, useRef, useState } from "react";
import type { Product } from "../data/products";
import { useCatalog } from "../context/CatalogContext";
import Hero from "./Hero";
import SearchBar from "./SearchBar";
import FilterChips from "./FilterChips";
import ProductCard from "./ProductCard";
import { BookOpenIcon } from "./icons";

type StorePageProps = {
  wishlist: Set<string>;
  cartIds: Set<string>;
  purchased: Set<string>;
  onToggleWishlist: (id: string) => void;
  onAddToCart: (id: string) => void;
  onView: (product: Product) => void;
};

export default function StorePage({ wishlist, cartIds, purchased, onToggleWishlist, onAddToCart, onView }: StorePageProps) {
  const { products, loading, error } = useCatalog();
  const [search, setSearch] = useState("");
  const [activeChip, setActiveChip] = useState("All");
  const [sort, setSort] = useState("Recommended");
  const touchStartX = useRef<number | null>(null);

  const chips = useMemo(() => {
    const set = new Set<string>(["All"]);
    products.forEach((p) => {
      set.add(p.category);
      set.add(p.classLevel);
      set.add(p.subject);
    });
    return Array.from(set);
  }, [products]);

  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      const matchesSearch =
        !search.trim() ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.subject.toLowerCase().includes(search.toLowerCase()) ||
        p.instructor.toLowerCase().includes(search.toLowerCase());

      const matchesChip =
        activeChip === "All" ||
        p.category === activeChip ||
        p.classLevel === activeChip ||
        p.subject === activeChip;

      return matchesSearch && matchesChip;
    });

    list = [...list];
    if (sort === "Price: Low to High") list.sort((a, b) => a.price - b.price);
    if (sort === "Price: High to Low") list.sort((a, b) => b.price - a.price);
    if (sort === "Top Rated") list.sort((a, b) => b.rating - a.rating);
    if (sort === "Newest") list.reverse();

    return list;
  }, [products, search, activeChip, sort]);

  const switchChip = (direction: -1 | 1) => {
    if (chips.length === 0) return;
    const index = Math.max(0, chips.indexOf(activeChip));
    const next = (index + direction + chips.length) % chips.length;
    setActiveChip(chips[next]);
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 48) return;
    switchChip(delta < 0 ? 1 : -1);
  };

  return (
    <div className="pb-6" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <Hero resourceCount={filtered.length} />

      <div className="space-y-4">
        <SearchBar value={search} onChange={setSearch} sort={sort} onSortChange={setSort} />
        <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 py-2 backdrop-blur">
          <FilterChips chips={chips} active={activeChip} onSelect={setActiveChip} />
        </div>
      </div>

      <p className="px-4 pt-5 text-center text-[15px] font-semibold text-slate-500">
        {loading ? "Syncing live catalog…" : `${filtered.length} resource${filtered.length === 1 ? "" : "s"} available`}
      </p>

      {error ? (
        <div className="mx-4 mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-8 text-center text-sm font-semibold text-rose-700">{error}</div>
      ) : loading ? (
        <div className="mx-4 mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-72 animate-pulse rounded-2xl bg-slate-100" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="mx-4 mt-6 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center">
          <BookOpenIcon className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No resources match your search</p>
          <p className="text-xs text-slate-400">Try a different keyword or clear filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 px-4 pt-4 sm:grid-cols-2">
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
