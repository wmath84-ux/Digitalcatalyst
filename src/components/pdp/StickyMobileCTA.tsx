import { ShoppingCart, Zap } from "lucide-react";
import { product } from "../../data/product";

export default function StickyMobileCTA({ onCheckout }: { onCheckout: (finalPrice: number) => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/90 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl sm:hidden">
      <div className="flex items-center gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] text-zinc-400 line-through">
            ${product.compareAtPrice}
          </span>
          <span className="text-lg font-extrabold text-zinc-900">${product.price}</span>
        </div>
        <button className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-gradient-to-b from-white to-zinc-100 py-3 text-sm font-bold text-zinc-900 shadow-sm">
          <ShoppingCart className="h-4 w-4" /> Cart
        </button>
        <button onClick={() => onCheckout(product.price)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-zinc-800 to-black py-3 text-sm font-bold text-white shadow-md">
          <Zap className="h-4 w-4 fill-white" /> Buy Now
        </button>
      </div>
    </div>
  );
}
