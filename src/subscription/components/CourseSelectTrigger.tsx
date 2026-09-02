import { ChevronRight, LayoutGrid } from "lucide-react";
import type { Product } from "../../data/products";
import { GlassButton } from "../../components/ui/glass-button";

interface Props { selectedIds: string[]; onOpen: () => void; products: Product[]; }
export default function CourseSelectTrigger({ selectedIds, onOpen, products }: Props) {
  return <div className="px-5 pt-5"><GlassButton variant="capsule" type="button" onClick={onOpen} data-subscription-products-trigger className="w-full text-left [&>span>div]:h-auto [&>span>div]:w-full [&>span>div]:rounded-2xl [&>span>div]:p-4 [&>span>div>span]:w-full"><span className="flex w-full items-center justify-between">
    <span className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15"><LayoutGrid className="h-5 w-5 text-violet-300" /></span><span className="text-left"><span className="block text-sm font-bold text-white/85">Pick bonus products</span><span className="block text-xs font-normal text-white/55">{selectedIds.length ? `${selectedIds.length} selected` : `${products.length} live products available`}</span></span></span><ChevronRight className="h-4.5 w-4.5 text-white/40" />
  </span></GlassButton></div>;
}
