import { Heart, ShoppingCart, Star } from "lucide-react";
import { Product } from "../types";
import { formatINR } from "../utils/format";

interface FavoriteCardProps {
  product: Product;
  inCart: boolean;
  onRemove: (id: string) => void;
  onAddToCart: (id: string) => void;
  onOpen?: (id: string) => void;
}

export default function FavoriteCard({
  product,
  inCart,
  onRemove,
  onAddToCart,
  onOpen,
}: FavoriteCardProps) {
  const discount = Math.round(
    ((product.originalPrice - product.price) / product.originalPrice) * 100
  );

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm shadow-slate-200/70 ring-1 ring-slate-100">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
        <button
          type="button"
          onClick={() => onOpen?.(product.id)}
          className="h-full w-full"
          aria-label={`View ${product.title}`}
        >
          <img
            src={product.image}
            alt={product.title}
            className="h-full w-full object-cover"
          />
        </button>
        <button
          onClick={() => onRemove(product.id)}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow-md backdrop-blur transition active:scale-90"
          aria-label="Remove from favorites"
        >
          <Heart size={16} className="fill-rose-500 text-rose-500" />
        </button>
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur">
          {product.hours} • {product.lessons} lessons
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <button type="button" onClick={() => onOpen?.(product.id)} className="text-left">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">
            {product.category}
          </span>
          <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-slate-900">
            {product.title}
          </h3>
        </button>
        <p className="text-[11px] text-slate-400">{product.author}</p>
        <div className="flex items-center gap-1 text-[11px] text-slate-500">
          <Star size={12} className="fill-amber-400 text-amber-400" />
          <span className="font-semibold text-slate-700">{product.rating}</span>
          <span>({product.reviewsCount.toLocaleString("en-IN")})</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[15px] font-extrabold text-slate-900">
            {formatINR(product.price)}
          </span>
          <span className="text-[11px] text-slate-400 line-through">
            {formatINR(product.originalPrice)}
          </span>
          <span className="text-[11px] font-semibold text-emerald-600">
            {discount}% off
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => onRemove(product.id)}
            className="flex-1 rounded-xl border border-slate-200 py-2 text-[11px] font-bold text-slate-500 transition active:scale-95"
          >
            Remove
          </button>
          <button
            onClick={() => !inCart && onAddToCart(product.id)}
            disabled={inCart}
            className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-bold transition active:scale-95 ${
              inCart
                ? "bg-emerald-50 text-emerald-600"
                : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-indigo-200"
            }`}
          >
            <ShoppingCart size={13} />
            {inCart ? "In Cart" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
