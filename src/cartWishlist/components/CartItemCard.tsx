import { Trash2 } from "lucide-react";
import { Product } from "../types";
import { formatINR } from "../utils/format";
import { GlassCard } from "@/components/ui/GlassCard";

interface CartItemCardProps {
  product: Product;
  onRemove: (id: string) => void;
  onOpen?: (id: string) => void;
}

export default function CartItemCard({ product, onRemove, onOpen }: CartItemCardProps) {
  return (
    /* Wave 3 (commerce): the row is a `glass-card` — the pack's surface already
       paints the specular sheen this file was faking with its own gradient div. */
    <GlassCard
      tint={0.5}
      contentClassName="flex gap-3 p-2.5"
      className="group relative overflow-hidden"
    >
      <button
        type="button"
        onClick={() => onOpen?.(product.id)}
        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[1rem] bg-slate-100 ring-1 ring-white/60"
        aria-label={`View ${product.title}`}
      >
        <img
          src={product.image}
          alt={product.title}
          className="h-full w-full object-cover"
        />
      </button>
      <div className="relative flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div>
          <button type="button" onClick={() => onOpen?.(product.id)} className="text-left">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-indigo-500">
              {product.category}
            </span>
            <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-white">
              {product.title}
            </h3>
            <p className="text-[11px] text-white/55">{product.author}</p>
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[14px] font-extrabold text-white">
              {formatINR(product.price)}
            </span>
            <span className="text-[10px] text-white/55 line-through">
              {formatINR(product.originalPrice)}
            </span>
          </div>
          <button
            onClick={() => onRemove(product.id)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-rose-50/85 text-rose-500 shadow-md shadow-rose-100/60 backdrop-blur transition active:scale-90"
            aria-label="Remove item"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </GlassCard>
  );
}
