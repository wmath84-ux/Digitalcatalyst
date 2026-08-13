import { Check, X } from "lucide-react";
import type { Product } from "../../data/products";

interface Props { open: boolean; selected: string[]; onClose: () => void; onChangeSelected: (ids: string[]) => void; products: Product[]; }
const price = (value: number) => value === 0 ? "Free" : `₹${value.toLocaleString("en-IN")}`;

export default function CourseSelectModal({ open, selected, onClose, onChangeSelected, products }: Props) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onClick={onClose}>
    <div onClick={(event) => event.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
      <div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="text-base font-black text-slate-900">Pick bonus products</h2><p className="text-xs text-slate-400">All live products · select with real price</p></div><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500"><X size={14} /></button></div>
      <div className="max-h-[65vh] overflow-y-auto p-4">{products.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">No products are currently available.</p> : <ul className="space-y-2">{products.map((product) => {
        const checked = selected.includes(product.id);
        return <li key={product.id}><button type="button" onClick={() => onChangeSelected(checked ? selected.filter((id) => id !== product.id) : [...selected, product.id])} data-subscription-product-pick={product.id} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${checked ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white"}`}>
          <img src={product.image} alt="" className="h-12 w-16 rounded-xl object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{product.title}</span><span className="text-xs text-slate-400">{product.category} · {product.instructor}</span></span><span className="text-right"><span className="block text-sm font-black text-slate-900">{price(product.price)}</span><span className={`ml-auto mt-1 grid h-5 w-5 place-items-center rounded-md border-2 ${checked ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300"}`}>{checked && <Check size={13} strokeWidth={3} />}</span></span>
        </button></li>;
      })}</ul>}</div>
      <div className="border-t border-slate-100 p-3"><button onClick={onClose} className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-black text-white">Done · {selected.length} selected</button></div>
    </div>
  </div>;
}
