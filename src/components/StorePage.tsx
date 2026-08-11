import { useMemo, useState } from "react";
import { products, type Product } from "../data/products";
import Hero from "./Hero";
import SearchBar from "./SearchBar";
import FilterChips from "./FilterChips";
import ProductCard from "./ProductCard";
import { BookOpenIcon } from "./icons";

type StorePageProps = {
  wishlist: Set<string>;
  purchased: Set<string>;
  onToggleWishlist: (id: string) => void;
  onBuy: (product: Product) => void;
  onView: (product: Product) => void;
};

export default function StorePage({ wishlist, purchased, onToggleWishlist, onBuy, onView }: StorePageProps) {
  const [search, setSearch] = useState("");
  const [activeChip, setActiveChip] = useState("All");
  const [sort, setSort] = useState("Recommended");

  const chips = useMemo(() => {
    const set = new Set<string>(["All"]);
    products.forEach((p) => {
      set.add(p.category);
      set.add(p.classLevel);
      set.add(p.subject);
    });
    return Array.from(set);
  }, []);

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
  }, [search, activeChip, sort]);

  return (
    <div className="pb-6">
      <Hero resourceCount={filtered.length} />

      <div className="space-y-4">
        <SearchBar value={search} onChange={setSearch} sort={sort} onSortChange={setSort} />
        <FilterChips chips={chips} active={activeChip} onSelect={setActiveChip} />
      </div>

      <p className="px-4 pt-5 text-center text-[15px] font-semibold text-slate-500">
        {filtered.length} resource{filtered.length === 1 ? "" : "s"} available
      </p>

      {filtered.length === 0 ? (
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
              purchased={purchased.has(product.id)}
              onToggleWishlist={onToggleWishlist}
              onBuy={onBuy}
              onView={onView}
            />
          ))}
        </div>
      )}
    </div>
  );
}
