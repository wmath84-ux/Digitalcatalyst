import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import type { Product } from "../data/products";
import { useCatalog } from "../context/CatalogContext";
import { useOwnedProducts } from "../hooks/useCourseAccess";
import { useProductFilters } from "../hooks/useProductFilters";
import { BagIcon } from "./icons";
import { GlassCard } from "./ui/GlassCard";
import EmptyProductState from "./EmptyProductState";
import ProductFilterBar from "./ProductFilterBar";

/**
 * My Purchases (the Store tab's second page: `#/store/purchases`).
 *
 * Owner brief, 2026-09-11 — the owned catalogue is a LIST, not a grid:
 *
 *   · ONE column, every screen (`data-library-list` is a vertical flex; the
 *     tablet/desktop rules in src/index.css that used to tile it were dropped,
 *     and `max-w-3xl` keeps a 27" display from turning each row into a banner);
 *   · the artwork is a strict 1:1 square (`aspect-square` + `self-center`, so a
 *     long title can never stretch one card's image past another's) and stays
 *     `object-cover`, i.e. cropped the way every other product image in the app
 *     is cropped — never squeezed;
 *   · the card is the store's glass lens lifted toward ice (`.dc-glacier-glass`
 *     in src/store-glass.css): translucent, softly frosted, hairline rim,
 *     restrained shadow, white ink on the shared scene scrim;
 *   · the filter is the Store page's filter — `<ProductFilterBar/>` over the
 *     admin chips — so the three product surfaces share one filtering system;
 *   · and an empty shelf is the shared `<EmptyProductState/>`, not a bare line
 *     of text.
 */
export function PurchasesTab({
  purchased,
  onOpenCourse,
}: {
  purchased: Set<string>;
  onOpenCourse: (course: { id: string; title: string }) => void;
}) {
  const { products } = useCatalog();
  const { ownedProductIds: canonicalOwnedIds, signedIn } = useOwnedProducts();

  const items = useMemo<Product[]>(() => {
    const ownedSet = new Set<string>(signedIn ? canonicalOwnedIds : []);
    for (const id of purchased) ownedSet.add(id);
    return products.filter((product) =>
      ownedSet.has(product.id) || Boolean(product.documentId && ownedSet.has(product.documentId)),
    );
  }, [canonicalOwnedIds, purchased, products, signedIn]);

  // The store's filter chips, scoped to what this learner owns.
  const filters = useProductFilters(items);
  const visible = filters.visible;

  const browseStore = () => { window.location.hash = "#/store"; };

  return (
    <div data-purchases-page className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        {/* A page-level h1 on the app's heading ramp (same treatment as
            Profile / the Study Library), not a bolded paragraph — `dc-scene-ink`
            keeps it legible where it crosses the bright snow band. */}
        <h1 className="dc-scene-ink text-2xl font-black leading-[1.08] tracking-[-0.03em] text-white md:text-3xl">
          Your Purchases
        </h1>
        {items.length > 0 ? (
          <p className="dc-scene-ink text-[11px] font-semibold text-white/55">
            {visible.length === items.length
              ? `${items.length} item${items.length === 1 ? "" : "s"} · lifetime access`
              : `${visible.length} of ${items.length} · lifetime access`}
          </p>
        ) : null}
      </header>

      {items.length > 0 ? (
        <ProductFilterBar
          variant="trigger"
          className="mt-4"
          chips={filters.chips}
          activeId={filters.activeFilterId}
          onSelect={filters.setActiveFilterId}
        />
      ) : null}

      {items.length === 0 ? (
        <EmptyProductState
          className="mt-6"
          icon={<BagIcon className="h-6 w-6" />}
          heading="No purchases yet"
          message="Resources you buy or claim for free from the Store land here, unlocked for life."
          actionLabel="Browse the store"
          onAction={browseStore}
        />
      ) : visible.length === 0 ? (
        <EmptyProductState
          className="mt-6"
          icon={<BagIcon className="h-6 w-6" />}
          heading="No products found"
          message={`Nothing you own is filed under “${filters.activeFilter.label}”. Clear the filter to see the whole shelf.`}
          actionLabel="Clear filters"
          onAction={filters.clearFilters}
        />
      ) : (
        <div data-library-list className="mt-4 flex flex-col gap-3">
          {visible.map((item) => (
            <PurchasedProductCard
              key={item.id}
              item={item}
              onOpen={() => onOpenCourse({ id: item.id, title: item.title })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One owned product, as a row: the square glass thumbnail and the copy beside
 * it. Same anatomy as the Store's rectangular card (`ProductCardList`) — glass
 * plate, title first, proof, then the quiet meta line — so a purchase reads as
 * the product it was bought as.
 */
function PurchasedProductCard({ item, onOpen }: { item: Product; onOpen: () => void }) {
  return (
    <GlassCard
      onClick={onOpen}
      contentClassName="flex p-0"
      /* The pack's light-blue lens, re-pointed at the glacier tone by
         `.dc-glacier-glass` (src/store-glass.css): translucent frost, soft
         rim, restrained lift — a light icy surface, not a dark glass card. */
      tint={0.62}
      tintColor="173,216,255"
      blur={0}
      radius={22}
      className="dc-glacier-glass dc-scene-ink group relative flex min-w-0 overflow-hidden transition duration-300 hover:-translate-y-0.5 active:scale-[0.995]"
    >
      {/* 1:1 artwork. `self-center` is what keeps the ratio honest: without it
          the row's `align-items: stretch` would set the height from the copy
          column and every card's thumbnail would be a different shape. */}
      <div className="relative aspect-square w-24 shrink-0 self-center overflow-hidden sm:w-28 md:w-32">
        <img
          src={item.image}
          alt={item.title}
          loading="lazy"
          decoding="async"
          width={128}
          height={128}
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        />
        <div aria-hidden className="dc-store-card-scrim pointer-events-none absolute inset-x-0 bottom-0 h-1/2" />
        <span className="absolute left-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
          Owned
        </span>
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <h3 className="dc-ink-1 line-clamp-2 text-sm font-extrabold leading-[1.35] sm:text-[15px]">{item.title}</h3>
        <p className="truncate text-xs font-medium dc-ink-3">by {item.instructor}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1.5">
          <span className="dc-store-card-kicker truncate rounded-full border border-white/20 px-2 py-0.5">
            {item.category}
          </span>
          <span className="text-[11px] font-semibold dc-ink-3">Lifetime access</span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white">
            Open
            <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </GlassCard>
  );
}
