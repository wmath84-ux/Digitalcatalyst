import type { Product } from "../data/products";
import { useCatalog } from "../context/CatalogContext";
import { useOwnedProducts } from "../hooks/useCourseAccess";
import { BagIcon } from "./icons";
import { GlassCard } from "./ui/GlassCard";
import { EmptyState } from "./ui/EmptyState";
import { WatchActionButton } from "./ui/WatchActionButton";

/**
 * The action shown above a purchased product. Every product in this library
 * opens through the SAME existing route the card itself uses
 * (`onOpenCourse({ id, title })` → the Course Player), so the label only
 * follows what the product is: a course or a live session is watched, a
 * document product is opened.
 */
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
  const ownedSet = new Set<string>(signedIn ? canonicalOwnedIds : []);
  for (const id of purchased) ownedSet.add(id);
  const items: Product[] = products.filter((product) =>
    ownedSet.has(product.id) || Boolean(product.documentId && ownedSet.has(product.documentId)),
  );

  if (items.length === 0) {
    /* The empty message sits on the shared empty-state card (same glass +
       type as Home and the Store) instead of loose text on the background.
       Padding mirrors the populated list below, so the card lands where the
       "Your purchases" heading does — no jump when the first purchase lands. */
    return (
      <div className="px-4 pb-8 pt-6">
        <EmptyState
          icon={<BagIcon className="h-7 w-7 text-indigo-300" />}
          title="No purchases yet"
          body="Resources you buy or claim for free from the Store will appear here for lifetime access."
        />
      </div>
    );
  }

  return (
    <div data-library-list className="space-y-4 px-4 pb-8 pt-6">
      <h2 className="text-lg font-extrabold text-white">Your purchases</h2>
      {items.map((item) => (
        /* One entry per purchased product: its own action button ABOVE the
           product card, then the untouched card. The button is scoped to this
           `item`, so it can only ever open the product it sits over. */
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
              <p className="text-xs text-white/55">by {item.instructor}</p>
            </div>
            <span className="relative shrink-0 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
              Owned
            </span>
          </GlassCard>
        </div>
      ))}
    </div>
  );
}
