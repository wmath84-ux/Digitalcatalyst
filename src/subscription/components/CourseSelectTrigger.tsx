import { ChevronRight, LayoutGrid } from "lucide-react";
import type { Product } from "../../data/products";

interface Props { selectedIds: string[]; onOpen: () => void; products: Product[]; }
export default function CourseSelectTrigger({ selectedIds, onOpen, products }: Props) {
  return <div className="px-5 pt-5"><button type="button" onClick={onOpen} data-subscription-products-trigger className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/60 active:scale-[0.99] transition-transform">
    <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50"><LayoutGrid className="h-5 w-5 text-violet-600" /></div><div className="text-left"><p className="text-sm font-bold text-slate-800">Pick bonus products</p><p className="text-xs text-slate-400">{selectedIds.length ? `${selectedIds.length} selected` : `${products.length} live products available`}</p></div></div><ChevronRight className="h-4.5 w-4.5 text-slate-300" />
  </button></div>;
}
