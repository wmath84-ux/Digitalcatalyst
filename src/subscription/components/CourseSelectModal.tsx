import { BadgeCheck, Check, X } from "lucide-react";
import { GlassSheet, GlassSheetContent, GlassSheetTitle, GlassSheetDescription } from "../../components/ui/glass-sheet";
import { GlassButton } from "../../components/ui/glass-button";
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
  const purchasedSet = purchasedIds instanceof Set ? purchasedIds : new Set(purchasedIds || []);
  const isPurchased = (product: Product) => productKeys(product).some((key) => purchasedSet.has(key));
  // Phase A: the picker is the pack's bottom GlassSheet at its defaults.
  return <GlassSheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
    <GlassSheetContent side="bottom" className="max-h-[85vh] text-white" aria-label="Pick bonus products" data-subscription-product-sheet>
      <div className="flex items-center justify-between pb-4"><div><GlassSheetTitle>Pick bonus products</GlassSheetTitle><GlassSheetDescription>All live products · select with real price</GlassSheetDescription></div><GlassButton onClick={onClose} aria-label="Close" className="[&_.size-12]:size-9"><X size={14} /></GlassButton></div>
      <div className="max-h-[60vh] overflow-y-auto">{products.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-white/55">No products are currently available.</p> : <ul className="space-y-2">{products.map((product) => {
        const keys = productKeys(product);
        const checkoutId = String(product.documentId || product.id);
        const checked = keys.some((key) => selected.includes(key));
        const purchased = isPurchased(product);
        const toggle = () => {
          // Already-purchased products are marked "Purchased" — the user owns them and
          // they must never be re-added (or removed) through this picker.
          if (purchased) return;
          const withoutAliases = selected.filter((id) => !keys.includes(id));
          onChangeSelected(checked ? withoutAliases : [...withoutAliases, checkoutId]);
        };
        return <li key={checkoutId}><button type="button" onClick={toggle} disabled={purchased} data-subscription-product-pick={checkoutId} data-purchased={purchased ? "true" : "false"} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${checked ? "border-violet-400/30 bg-violet-500/15" : "border-white/10 bg-white/[0.06]"} ${purchased ? "cursor-not-allowed border-emerald-400/30 bg-emerald-500/15" : ""}`}>
          <img src={product.image} alt="" className="h-12 w-16 shrink-0 rounded-xl object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white/85">{product.title}</span><span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">{purchased ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white"><BadgeCheck size={11} strokeWidth={3} /> Purchased</span> : null}<span className="text-xs text-white/55">{product.category} · {product.instructor}</span></span></span><span className="shrink-0 text-right"><span className={`block text-sm font-black ${purchased ? "text-emerald-200" : "text-white"}`}>{purchased ? "Purchased" : price(product.price)}</span><span aria-label={purchased ? "Purchased" : checked ? "Selected" : "Not selected"} className={`ml-auto mt-1 grid h-5 w-5 place-items-center rounded-md border-2 ${purchased ? "cursor-not-allowed border-emerald-600 bg-emerald-600 text-white" : checked ? "border-violet-600 bg-violet-600 text-white" : "border-white/10"}`}>{purchased ? <BadgeCheck size={12} strokeWidth={3} /> : checked ? <Check size={13} strokeWidth={3} /> : null}</span></span>
        </button></li>;
      })}</ul>}</div>
      <div className="pt-4 pb-[env(safe-area-inset-bottom)]"><GlassButton variant="capsule" onClick={onClose} className="w-full [&>span>div]:w-full">Done · {selected.length} selected</GlassButton></div>
    </GlassSheetContent>
  </GlassSheet>;
}
