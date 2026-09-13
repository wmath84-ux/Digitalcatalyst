import { useMemo, useState } from "react";
import type { Product } from "../data/products";
import { useCatalog } from "../context/CatalogContext";
import { useOwnedProducts } from "../hooks/useCourseAccess";
import { BagIcon, SearchIcon } from "./icons";
import { GlassCard } from "./ui/GlassCard";
import { EmptyState } from "./ui/EmptyState";
import { WatchActionButton } from "./ui/WatchActionButton";

function accessLabel(product: Product): string {
  return product.category === "Notes" || product.category === "PDF" || product.category === "E-book"
    ? "Open Now"
    : "Watch Now";
}

export function PurchasesTab({
  purchased,
  onOpenCourse,
}: {
  purchased: Set<string>;
  onOpenCourse: (course: { id: string; title: string }) => void;
}) {
  const { products } = useCatalog();
  const { ownedProductIds: canonicalOwnedIds, signedIn } = useOwnedProducts();
  const ownedSet = useMemo(() => {
    const s = new Set<string>(signedIn ? canonicalOwnedIds : []);
    for (const id of purchased) s.add(id);
    return s;
  }, [canonicalOwnedIds, purchased, signedIn]);
  const allItems: Product[] = useMemo(
    () => products.filter((product) => ownedSet.has(product.id) || Boolean(product.documentId && ownedSet.has(product.documentId))),
    [products, ownedSet],
  );

  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.instructor.toLowerCase().includes(q) ||
        String(p.category || "").toLowerCase().includes(q),
    );
  }, [allItems, query]);

  if (allItems.length === 0) {
    return (
      <div className="px-4 pb-8 pt-6">
        <EmptyState
          icon={<BagIcon className="h-7 w-7 text-indigo-300" />}
          title="No purchases yet"
          body="Resources you buy or claim for free from the Store will appear here for lifetime access."
        />
        <button
          type="button"
          onClick={() => { window.location.hash = "#/store"; }}
          className="mx-auto mt-4 block rounded-full bg-white/10 px-5 py-2 text-xs font-black text-white backdrop-blur hover:bg-white/15"
        >
          Browse Store
        </button>
      </div>
    );
  }

  return (
    <div data-library-list className="space-y-4 px-4 pb-8 pt-6">
      {/* Header — lifetime access + count badge */}
      <GlassCard contentClassName="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-extrabold tracking-tight text-white">Your purchases</h2>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/20 px-1.5 text-[10px] font-black text-emerald-200 ring-1 ring-emerald-400/30">
                {allItems.length}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-white/55">
              Lifetime access · Tap <span className="font-semibold text-white/80">Watch / Open</span> to continue in the Course Player.
            </p>
          </div>
          <span className="hidden shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/70 sm:inline-flex">
            Library
          </span>
        </div>
      </GlassCard>

      {/* Search */}
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35">
          <SearchIcon className="h-4 w-4" />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search purchases…"
          className="w-full rounded-2xl border border-white/10 bg-white/[0.07] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-white/35 backdrop-blur focus:border-white/15 focus:bg-white/[0.10] focus:outline-none"
          data-purchases-search
        />
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-10 text-center backdrop-blur">
          <p className="text-sm font-bold text-white/80">No matches</p>
          <p className="mt-1 text-xs text-white/45">Try a different search — e.g. course title or instructor.</p>
        </div>
      ) : (
        items.map((item) => (
          <div key={item.id} data-purchase-entry={item.id} className="space-y-2">
            <div className="flex justify-end">
              <WatchActionButton
                label={accessLabel(item)}
                ariaLabel={`${accessLabel(item)} — ${item.title}`}
                data-purchase-access={item.id}
                onClick={() => onOpenCourse({ id: item.id, title: item.title })}
              />
            </div>
            <GlassCard
              onClick={() => onOpenCourse({ id: item.id, title: item.title })}
              contentClassName="flex items-center gap-3 p-3"
              className="group relative cursor-pointer overflow-hidden transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.99]"
            >
              <img
                src={item.image}
                alt={item.title}
                loading="lazy"
                decoding="async"
                width={96}
                height={64}
                className="relative h-16 w-24 shrink-0 rounded-xl object-cover ring-1 ring-inset ring-white/10"
              />
              <div className="relative min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{item.title}</p>
                <p className="truncate text-xs text-white/55">by {item.instructor}</p>
                {item.category ? (
                  <span className="mt-1 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/60">
                    {item.category}
                  </span>
                ) : null}
              </div>
              <span className="relative shrink-0 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
                Owned
              </span>
            </GlassCard>
          </div>
        ))
      )}
    </div>
  );
}
