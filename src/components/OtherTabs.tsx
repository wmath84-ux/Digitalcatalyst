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

/**
 * One purchased product on the My Purchases page.
 *
 * Owner brief (2026-09-24): the card is the STORE's square-grid card
 * (`data-store-grid` columns + the exact ProductCard material —
 * `dc-store-glass` light-blue lens, 4:3 artwork, radius 22) but it carries
 * ONLY the thumbnail, the title and the My Purchases "Watch Now" button
 * (src/components/ui/WatchActionButton.tsx — the uiverse "spicy-liger-32"
 * control the owner had built for this page). No price, rating, instructor,
 * category chip, "Owned" pill or wishlist control: everything else a store
 * card shows is deliberately absent here.
 */
function PurchasedProductCard({
  item,
  onOpenCourse,
}: {
  item: Product;
  onOpenCourse: (course: { id: string; title: string }) => void;
}) {
  const label = accessLabel(item);
  return (
    <GlassCard
      onClick={() => onOpenCourse({ id: item.id, title: item.title })}
      contentClassName="p-0"
      /* Same light-blue lens as the store grid card (owner brief: "card ka
         design vaise hi rakho jaise store page ka Card hai"). */
      tint={0.62}
      tintColor="173,216,255"
      blur={0}
      radius={22}
      /* The pack's content wrapper must become the flex column — same fix the
         store's ProductCard ships (see the comment there): the wrapper is a
         BLOCK box, so without it the copy never hugs the artwork. */
      className="dc-store-glass dc-scene-ink group relative flex w-full min-h-0 flex-col overflow-hidden transition duration-300 hover:-translate-y-0.5 [&>div:last-child]:flex [&>div:last-child]:min-h-0 [&>div:last-child]:flex-col"
      data-purchase-entry={item.id}
    >
      {/* Artwork — the store card's exact 4:3 box. `absolute inset-0` keeps
          the <img> cropped: index.css's unlayered `img { height: auto }`
          (640–1366px) would beat a Tailwind `h-full`. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <img
          src={item.image}
          alt={item.title}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div aria-hidden className="dc-store-card-scrim pointer-events-none absolute inset-x-0 bottom-0 h-2/3" />
      </div>

      {/* Copy stack — title + the Watch Now button, NOTHING else. */}
      <div className="relative z-20 flex flex-1 flex-col gap-2 p-3">
        <h3 className="dc-store-card-title line-clamp-2">{item.title}</h3>
        <div className="mt-auto">
          <WatchActionButton
            label={label}
            ariaLabel={`${label} — ${item.title}`}
            /* The reference control is authored in `em`, so one font-size
               scales the whole button (shell, padding, goo layers, press) as
               a single unit — here down to the store card's CTA size. The
               size rides an inline style on purpose: watch-action-button.css
               is unlayered author CSS, so a Tailwind `text-[11px]` utility
               (layered) could never beat its 18px default. */
            style={{ fontSize: "11px" }}
            className="w-full"
            data-purchase-access={item.id}
            onClick={(event) => {
              event.stopPropagation();
              onOpenCourse({ id: item.id, title: item.title });
            }}
          />
        </div>
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

      {/* Search */}
      <div className="relative mt-4">
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
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-10 text-center backdrop-blur">
          <p className="text-sm font-bold text-white/80">No matches</p>
          <p className="mt-1 text-xs text-white/45">Try a different search — e.g. course title or instructor.</p>
        </div>
      ) : (
        /* The STORE's square grid, verbatim: same container attribute
           (`data-store-grid`, so index.css's tablet/desktop auto-fill rules
           keep the tiles in lockstep with the store) and same mobile
           column/gap rhythm (2-up, gap-3). */
        <div data-store-grid data-purchases-grid className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
          {items.map((item) => (
            <PurchasedProductCard key={item.id} item={item} onOpenCourse={onOpenCourse} />
          ))}
        </div>
      )}
    </div>
  );
}
