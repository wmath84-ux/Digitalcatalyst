import type { Product } from "../types";
import { GlassSurface } from "../../components/ui/glass";
import { GlassButton } from "../../components/ui/glass-button";

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
    <GlassSurface
      onClick={() => onOpen?.(product)}
      radius={24}
      tint={0.25}
      blur={0}
      /* `dc-scene-plate` — the shared contrast plate (glass.css) the review
         cards already wear. A tile's copy sits under its artwork, and the
         scene's snow shows straight through a 10% tint, so the title / author
         / price need the same dark backing to read. Same pinned sensitivity
         (tint 0.25 · blur 0 · radius 24); only the material's paint changes. */
      className={`dc-scene-plate group relative overflow-hidden text-white transition-transform duration-200 active:scale-[0.98] ${className}`}
      contentClassName="flex flex-col"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
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
          <span className="absolute left-2 bottom-2 rounded-md bg-[var(--dc-chrome-glass)] px-1.5 py-0.5 text-[10px] font-semibold text-white [backdrop-filter:var(--dc-chrome-glass-blur)]">
            🔥 Trending
          </span>
        )}
        <GlassButton
          type="button"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(product.id);
          }}
          className="absolute right-2 top-2 [&_.size-12]:size-7"
        >
          <span className={isFavorite ? "text-rose-500" : "text-white/55"}>
            {isFavorite ? "❤️" : "🤍"}
          </span>
        </GlassButton>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h4 className="line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-tight text-white/85">
          {product.title}
        </h4>
        <p className="text-[11px] text-white/55">{product.author}</p>

        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-300">
          <span>⭐ {product.rating}</span>
          <span className="text-white/40">({product.ratingCount.toLocaleString()})</span>
        </div>

        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-white">₹{product.price}</span>
            <span className="text-[11px] text-white/55 line-through">₹{product.mrp}</span>
          </div>
          <span className="text-[10px] font-bold text-emerald-300">{discount}% off</span>
        </div>
      </div>
    </GlassSurface>
  );
}
