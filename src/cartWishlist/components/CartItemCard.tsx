import { Trash2 } from "lucide-react";
import { Product } from "../types";
import { formatINR } from "../utils/format";

interface CartItemCardProps {
  product: Product;
  onRemove: (id: string) => void;
}

export default function CartItemCard({ product, onRemove }: CartItemCardProps) {
  return (
    <div className="flex gap-3 rounded-2xl bg-white p-2.5 shadow-sm shadow-slate-200/70 ring-1 ring-slate-100">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
        <img
          src={product.image}
          alt={product.title}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-indigo-500">
            {product.category}
          </span>
          <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-slate-900">
            {product.title}
          </h3>
          <p className="text-[11px] text-slate-400">{product.author}</p>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[14px] font-extrabold text-slate-900">
              {formatINR(product.price)}
            </span>
            <span className="text-[10px] text-slate-400 line-through">
              {formatINR(product.originalPrice)}
            </span>
          </div>
          <button
            onClick={() => onRemove(product.id)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-500 transition active:scale-90"
            aria-label="Remove item"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
