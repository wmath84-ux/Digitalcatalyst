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
          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <img src={item.image} alt={item.title} className="h-16 w-24 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
            <p className="text-xs text-slate-500">by {item.instructor}</p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-extrabold uppercase text-emerald-700">
            Owned
          </span>
        </div>
      ))}
    </div>
  );
}
