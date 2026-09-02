import { Heart, ShoppingCart, Star } from "lucide-react";
import { Product } from "../types";
import { formatINR } from "../utils/format";
import { GlassCard } from "@/components/ui/GlassCard";
import { LiquidMetalButton } from "@/components/ui/LiquidMetalButton";

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
    <GlassCard
      contentClassName="p-0"
      className="group relative flex flex-col overflow-hidden"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-white/[0.06]">
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
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] backdrop-blur-md transition active:scale-90"
          aria-label="Remove from favorites"
        >
          <Heart size={16} className="fill-rose-500 text-rose-500" />
        </button>
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur">
          {product.hours} • {product.lessons} lessons
        </span>
      </div>
      <div className="relative flex flex-1 flex-col gap-1.5 p-3">
        <button type="button" onClick={() => onOpen?.(product.id)} className="text-left">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">
            {product.category}
          </span>
          <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-white">
            {product.title}
          </h3>
        </button>
        <p className="text-[11px] text-white/55">{product.author}</p>
        <div className="flex items-center gap-1 text-[11px] text-white/55">
          <Star size={12} className="fill-amber-400 text-amber-400" />
          <span className="font-semibold text-white/85">{product.rating}</span>
          <span>({product.reviewsCount.toLocaleString("en-IN")})</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[15px] font-extrabold text-white">
            {formatINR(product.price)}
          </span>
          <span className="text-[11px] text-white/55 line-through">
            {formatINR(product.originalPrice)}
          </span>
          <span className="text-[11px] font-semibold text-emerald-300">
            {discount}% off
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {/* Both actions are glass buttons now, so they share one height and one
              press. `disabled` is the pack's own dimming rather than a second
              colour scheme — "In Cart" reads as an unavailable action, not as a
              different kind of button. */}
          <LiquidMetalButton
            tone="silver"
            className="flex-1"
            aria-label={`Remove ${product.title} from favourites`}
            onClick={() => onRemove(product.id)}
          >
            <span className="text-[11px] font-bold">Remove</span>
          </LiquidMetalButton>
          <LiquidMetalButton
            tone="primary"
            className="flex-1"
            disabled={inCart}
            onClick={() => !inCart && onAddToCart(product.id)}
          >
            <span className="flex items-center gap-1 text-[11px] font-bold">
              <ShoppingCart size={13} />
              {inCart ? "In Cart" : "Add"}
            </span>
          </LiquidMetalButton>
        </div>
      </div>
    </GlassCard>
  );
}
