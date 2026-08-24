import type { Product } from "../data/products";
import { useCatalog } from "../context/CatalogContext";
import { useOwnedProducts } from "../hooks/useCourseAccess";
import { BagIcon } from "./icons";

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
    return (
      <div className="flex flex-col items-center gap-3 px-6 pb-10 pt-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
          <BagIcon className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-900">No purchases yet</h2>
        <p className="max-w-xs text-sm text-slate-500">
          Resources you buy or claim for free from the Store will appear here for lifetime access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 pb-8 pt-6">
      <h2 className="text-lg font-extrabold text-slate-900">Your purchases</h2>
      {items.map((item) => (
        <div
          key={item.id}
          onClick={() => onOpenCourse({ id: item.id, title: item.title })}
          className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-violet-200/70 bg-white p-3 shadow-[0_10px_25px_-12px_rgba(139,92,246,0.55),0_4px_12px_-6px_rgba(34,211,238,0.4)] transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_18px_40px_-12px_rgba(139,92,246,0.7),0_8px_20px_-6px_rgba(34,211,238,0.55)] active:scale-[0.99]"
        >
          {/* Colored glow that intensifies on hover, echoing the Course Player's
              violet→cyan brand gradient so owned items feel like first-class
              citizens, not forgotten receipts. */}
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-violet-500/10 via-transparent to-cyan-400/10 opacity-80 transition-opacity duration-300 group-hover:opacity-100"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -left-10 -top-10 h-28 w-28 rounded-full bg-violet-400/30 blur-2xl transition-opacity duration-300 group-hover:bg-violet-400/50"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -right-10 -bottom-10 h-28 w-28 rounded-full bg-cyan-400/30 blur-2xl transition-opacity duration-300 group-hover:bg-cyan-400/50"
            aria-hidden="true"
          />
          <img
            src={item.image}
            alt={item.title}
            className="relative h-16 w-24 shrink-0 rounded-xl object-cover ring-1 ring-inset ring-slate-200/70"
          />
          <div className="relative min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
            <p className="text-xs text-slate-500">by {item.instructor}</p>
          </div>
          <span className="relative shrink-0 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-md shadow-emerald-500/30">
            Owned
          </span>
        </div>
      ))}
    </div>
  );
}
