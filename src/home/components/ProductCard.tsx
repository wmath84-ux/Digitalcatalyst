import type { Product } from "../types";

interface ProductCardProps {
  product: Product;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  className?: string;
  onOpen?: (product: Product) => void;
}

const typeMeta: Record<string, { label: string; color: string }> = {
  video: { label: "Video", color: "bg-indigo-500" },
  pdf: { label: "PDF", color: "bg-rose-500" },
  ebook: { label: "E-book", color: "bg-emerald-500" },
  live: { label: "Live", color: "bg-orange-500" },
};

export default function ProductCard({
  product,
  isFavorite,
  onToggleFavorite,
  className = "",
  onOpen,
}: ProductCardProps) {
  const discount = Math.round(((product.mrp - product.price) / product.mrp) * 100);
  const meta = typeMeta[product.type];

  return (
    <div
      onClick={() => onOpen?.(product)}
      className={`group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm shadow-slate-200 ring-1 ring-slate-100 transition-transform duration-200 active:scale-[0.98] ${className}`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
        <img
          src={product.image}
          alt={product.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span
          className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white ${meta.color}`}
        >
          {meta.label}
        </span>
        {product.trending && (
          <span className="absolute left-2 bottom-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            🔥 Trending
          </span>
        )}
        <button
          type="button"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(product.id);
          }}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition active:scale-90"
        >
          <span className={isFavorite ? "text-rose-500" : "text-slate-400"}>
            {isFavorite ? "❤️" : "🤍"}
          </span>
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h4 className="line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-tight text-slate-800">
          {product.title}
        </h4>
        <p className="text-[11px] text-slate-400">{product.author}</p>

        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-500">
          <span>⭐ {product.rating}</span>
          <span className="text-slate-300">({product.ratingCount.toLocaleString()})</span>
        </div>

        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-slate-900">₹{product.price}</span>
            <span className="text-[11px] text-slate-400 line-through">₹{product.mrp}</span>
          </div>
          <span className="text-[10px] font-bold text-emerald-600">{discount}% off</span>
        </div>

        <div className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 ring-1 ring-amber-200">
          <span>🪙</span> +{product.educoins} EduCoins
        </div>
      </div>
    </div>
  );
}
