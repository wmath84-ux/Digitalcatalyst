import { BadgeCheck, Check, Lock, X } from "lucide-react";
import type { Product } from "../../data/products";

interface Props {
  open: boolean;
  selected: string[];
  onClose: () => void;
  onChangeSelected: (ids: string[]) => void;
  products: Product[];
  /**
   * Every id the user already owns (Firestore document ids and legacy public
   * ids are both accepted). A product matching any of these renders with a
   * clear "Purchased" badge and a disabled checkbox — it can no longer be
   * selected (or deselected) on the subscription page.
   */
  purchasedIds?: Set<string> | string[];
}
const price = (value: number) => value === 0 ? "Free" : `₹${value.toLocaleString("en-IN")}`;

/**
 * Checkout APIs use the Firestore document id as the lookup key. A few older
 * products also expose a different public `id`, so selection/removal accepts
 * either alias while always sending the document id when it is available.
 */
const productKeys = (product: Product) =>
  Array.from(new Set([product.documentId, product.id].map((value) => String(value || "").trim()).filter(Boolean)));

export default function CourseSelectModal({ open, selected, onClose, onChangeSelected, products, purchasedIds }: Props) {
  if (!open) return null;
  const purchasedSet = purchasedIds instanceof Set ? purchasedIds : new Set(purchasedIds || []);
  const isPurchased = (product: Product) => productKeys(product).some((key) => purchasedSet.has(key));
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onClick={onClose}>
    <div onClick={(event) => event.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
      <div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="text-base font-black text-slate-900">Pick bonus products</h2><p className="text-xs text-slate-400">All live products · select with real price</p></div><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500"><X size={14} /></button></div>
      <div className="max-h-[65vh] overflow-y-auto p-4">{products.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">No products are currently available.</p> : <ul className="space-y-2">{products.map((product) => {
        const keys = productKeys(product);
        const checkoutId = String(product.documentId || product.id);
        const checked = keys.some((key) => selected.includes(key));
        const purchased = isPurchased(product);
        const toggle = () => {
          // Already-purchased products are locked — the user owns them and
          // they must never be re-added (or removed) through this picker.
          if (purchased) return;
          const withoutAliases = selected.filter((id) => !keys.includes(id));
          onChangeSelected(checked ? withoutAliases : [...withoutAliases, checkoutId]);
        };
        return <li key={checkoutId}><button type="button" onClick={toggle} disabled={purchased} data-subscription-product-pick={checkoutId} data-purchased={purchased ? "true" : "false"} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${checked ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white"} ${purchased ? "cursor-not-allowed border-emerald-200 bg-emerald-50/70" : ""}`}>
          <img src={product.image} alt="" className="h-12 w-16 shrink-0 rounded-xl object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{product.title}</span><span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">{purchased ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white"><BadgeCheck size={11} strokeWidth={3} /> Purchased</span> : null}<span className="text-xs text-slate-400">{product.category} · {product.instructor}</span></span></span><span className="shrink-0 text-right"><span className={`block text-sm font-black ${purchased ? "text-slate-400" : "text-slate-900"}`}>{price(product.price)}</span><span aria-label={purchased ? "Already purchased — locked" : checked ? "Selected" : "Not selected"} className={`ml-auto mt-1 grid h-5 w-5 place-items-center rounded-md border-2 ${purchased ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : checked ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300"}`}>{purchased ? <Lock size={11} /> : checked ? <Check size={13} strokeWidth={3} /> : null}</span></span>
        </button></li>;
      })}</ul>}</div>
      <div className="border-t border-slate-100 p-3"><button onClick={onClose} className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-black text-white">Done · {selected.length} selected</button></div>
    </div>
  </div>;
}
