"use client";

import { AdminLink as Link } from "@/lib/admin/router";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, Pill, PrimaryButton, RecordCard, SecondaryButton, Sheet, inputClass, selectClass } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/client";
import type { ProductImage, ProductModule } from "@/lib/admin/types";

type ProductRow = {
  id: string;
  title: string;
  category: string | null;
  productType: string | null;
  regularPrice: string;
  salePrice: string | null;
  rating: string | null;
  reviewCount: number;
  visibility: string;
  availableForSale: boolean;
  isFree: boolean;
  images: ProductImage[] | null;
  modules: ProductModule[] | null;
  updatedAt: string;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [visibility, setVisibility] = useState("");
  const [availability, setAvailability] = useState("");
  const [pricing, setPricing] = useState("");
  const [sort, setSort] = useState("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (visibility) params.set("visibility", visibility);
      if (availability) params.set("availability", availability);
      if (pricing) params.set("pricing", pricing);
      params.set("sort", sort);
      const res = await adminFetch<{ products: ProductRow[] }>(`/api/admin/products?${params.toString()}`);
      setProducts(res.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products.");
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibility, availability, pricing, sort]);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const activeFilterCount = [visibility, availability, pricing].filter(Boolean).length;

  const effectivePrice = (p: ProductRow) => (p.salePrice ? Number(p.salePrice) : Number(p.regularPrice));

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!products) return <LoadingState label="Loading products…" />;

  return (
    <div className="space-y-3 pb-24 lg:space-y-4">
      <form onSubmit={onSearchSubmit} className="flex gap-2">
        <input
          className={inputClass + " flex-1"}
          placeholder="Search title, ID or category"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <SecondaryButton onClick={() => setFiltersOpen(true)} className="relative">
          Filters {activeFilterCount > 0 && <span className="ml-1 rounded-full bg-slate-900 px-1.5 text-[10px] text-white">{activeFilterCount}</span>}
        </SecondaryButton>
      </form>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 lg:text-sm">{products.length} product(s)</p>
        <Link href="/admin/products/new">
          <PrimaryButton>+ Add product</PrimaryButton>
        </Link>
      </div>

      {products.length === 0 ? (
        <EmptyState title="No products found" description="Try adjusting filters or add your first product." />
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
          {products.map((p) => (
            <Link key={p.id} href={`/admin/products/${p.id}`}>
              <RecordCard>
                <div className="flex gap-3">
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100 lg:h-20 lg:w-20">
                    {p.images?.[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.images[0].url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg lg:text-2xl">🎓</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900 lg:text-[15px]">{p.title}</p>
                    </div>
                    <p className="text-[11px] text-slate-500 lg:text-xs">{p.id} · {p.category || "Uncategorized"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Pill tone={p.visibility === "visible" ? "success" : "default"}>{p.visibility}</Pill>
                      <Pill tone={p.availableForSale ? "success" : "warn"}>{p.availableForSale ? "on sale" : "unavailable"}</Pill>
                      {p.isFree && <Pill tone="info">free</Pill>}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-600 lg:text-[13px]">
                      <span>
                        ₹{effectivePrice(p).toLocaleString("en-IN")}
                        {p.salePrice && <span className="ml-1 text-slate-400 line-through">₹{Number(p.regularPrice).toLocaleString("en-IN")}</span>}
                      </span>
                      <span>⭐ {Number(p.rating ?? 0).toFixed(1)} ({p.reviewCount})</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400 lg:text-xs">{p.modules?.length ?? 0} module(s)</p>
                  </div>
                </div>
              </RecordCard>
            </Link>
          ))}
        </div>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter & sort products" footer={
        <div className="flex gap-2">
          <SecondaryButton className="flex-1" onClick={() => { setVisibility(""); setAvailability(""); setPricing(""); setSort("newest"); }}>Reset</SecondaryButton>
          <PrimaryButton className="flex-1" onClick={() => { setFiltersOpen(false); load(); }}>Apply</PrimaryButton>
        </div>
      }>
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-700">Visibility</p>
            <select className={selectClass} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="">All</option>
              <option value="visible">Visible</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-700">Availability</p>
            <select className={selectClass} value={availability} onChange={(e) => setAvailability(e.target.value)}>
              <option value="">All</option>
              <option value="available">Available for sale</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-700">Pricing</p>
            <select className={selectClass} value={pricing} onChange={(e) => setPricing(e.target.value)}>
              <option value="">All</option>
              <option value="free">Free</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-700">Sort by</p>
            <select className={selectClass} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="title">Title</option>
              <option value="price">Price</option>
              <option value="rating">Rating</option>
            </select>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
