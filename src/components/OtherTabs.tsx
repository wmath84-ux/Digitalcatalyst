import { useMemo, useState } from "react";
import type { Product } from "../data/products";
import { useCatalog } from "../context/CatalogContext";
import { useOwnedProducts } from "../hooks/useCourseAccess";
import { BagIcon, SearchIcon } from "./icons";
import { GlassCard } from "./ui/GlassCard";
import { GlassSurface } from "./ui/glass";
import { EmptyState } from "./ui/EmptyState";
import { WatchActionButton } from "./ui/WatchActionButton";
import "./collection-cards.css";

function accessLabel(product: Product): string {
  return product.category === "Notes" || product.category === "PDF" || product.category === "E-book"
    ? "Open Now"
    : "Watch Now";
}

/** A compact library tile: cover, title and the existing access action. */
function PurchasedProductCard({
  item,
  onOpenCourse,
}: {
  item: Product;
  onOpenCourse: (course: { id: string; title: string }) => void;
}) {
  const label = accessLabel(item);
  const openCourse = () => onOpenCourse({ id: item.id, title: item.title });
  return (
    <GlassCard
      contentClassName="p-0"
      radius={22}
      className="dc-collection-card group"
      data-purchase-entry={item.id}
    >
      <div className="dc-collection-media">
        <button type="button" className="dc-collection-media-link" onClick={openCourse} aria-label={`${label} — ${item.title}`}>
          <img src={item.image} alt={item.title} loading="lazy" decoding="async" />
        </button>
      </div>
      <div className="dc-collection-body">
        <button type="button" onClick={openCourse} className="dc-collection-link">
          <h3 className="dc-collection-title" title={item.title}>{item.title}</h3>
        </button>
        <WatchActionButton
          label={label}
          ariaLabel={`${label} — ${item.title}`}
          className="dc-collection-watch"
          data-purchase-access={item.id}
          onClick={openCourse}
        />
      </div>
    </GlassCard>
  );
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
    return allItems.filter((product) => {
      const haystack = [
        product.title,
        product.instructor,
        product.category,
        product.subject,
        product.classLevel,
        product.description,
        ...(product.tags || []),
        ...(product.searchKeywords || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
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
    <div className="px-3 pb-8 pt-6 sm:px-4">
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
              Lifetime access · Tap <span className="font-semibold text-white/80">Watch Now</span> to continue in the Course Player.
            </p>
          </div>
          <span className="hidden shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/70 sm:inline-flex">
            Library
          </span>
        </div>
      </GlassCard>

      {/* Search — same glass as HOME social card (store lens):
          tint 0.62 over light blue rgb(173,216,255) @ 26%, blur 46% → 18.4px,
          quiet sheen + white rim (src/store-glass.css). */}
      <GlassSurface
        tint={0.62}
        tintColor="173,216,255"
        blur={0}
        radius={18}
        className="dc-store-glass dc-scene-ink relative mt-4"
        contentClassName="flex items-center gap-2 px-3 py-2.5"
      >
        <SearchIcon className="h-4 w-4 shrink-0 text-white/70" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search purchases…"
          className="w-full min-w-0 bg-transparent text-sm font-medium text-white placeholder:text-white/60 focus:outline-none"
          data-purchases-search
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white"
          >
            <span aria-hidden className="text-[14px] leading-none">×</span>
          </button>
        ) : null}
      </GlassSurface>

      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-10 text-center backdrop-blur">
          <p className="text-sm font-bold text-white/80">No matches</p>
          <p className="mt-1 text-xs text-white/45">Try a different search — e.g. course title or instructor.</p>
        </div>
      ) : (
        <div data-collection-grid data-purchases-grid className="mt-4">
          {items.map((item) => (
            <PurchasedProductCard key={item.id} item={item} onOpenCourse={onOpenCourse} />
          ))}
        </div>
      )}
    </div>
  );
}
