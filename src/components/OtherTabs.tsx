import type { Product } from "../data/products";
import { useCatalog } from "../context/CatalogContext";
import { useOwnedProducts } from "../hooks/useCourseAccess";
import { BagIcon } from "./icons";
import { GlassCard } from "./ui/GlassCard";
import { EmptyState } from "./ui/EmptyState";

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
    <div data-library-list className="space-y-3 px-4 pb-8 pt-6">
      <h2 className="text-lg font-extrabold text-white">Your purchases</h2>
      {items.map((item) => (
        <GlassCard
          key={item.id}
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
      ))}
    </div>
  );
}
