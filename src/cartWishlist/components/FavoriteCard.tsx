import { Heart, ShoppingCart, Star } from "lucide-react";
import { EmojiBurstLayer, useEmojiBurst } from "../../components/ui/EmojiBurst";
import { Product } from "../types";
import { formatINR } from "../utils/format";
import { GlassCard } from "@/components/ui/GlassCard";
import { LiquidMetalButton } from "@/components/ui/LiquidMetalButton";
import { GlassButton } from "@/components/ui/glass-button";
import "../../components/collection-cards.css";

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
  const { particles: likeParticles, burst: likeBurst } = useEmojiBurst();
  const discount = product.originalPrice > product.price
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  return (
    <GlassCard
      contentClassName="p-0"
      className="dc-collection-card group"
      data-favorite-card={product.id}
    >
      <div className="dc-collection-media">
        <button
          type="button"
          onClick={() => onOpen?.(product.id)}
          className="dc-collection-media-link"
          aria-label={`View ${product.title}`}
        >
          <img
            src={product.image}
            alt={product.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        </button>
        <EmojiBurstLayer particles={likeParticles} />
        <GlassButton
          onClick={() => { likeBurst(); onRemove(product.id); }}
          className="absolute right-2 top-2 [&_.size-12]:size-11"
          aria-label="Remove from favorites"
        >
          <Heart size={16} className="fill-rose-500 text-rose-500" />
        </GlassButton>
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-[var(--dc-chrome-glass)] px-2 py-0.5 text-[11px] font-semibold text-white [backdrop-filter:var(--dc-chrome-glass-blur)]">
          {product.hours} • {product.lessons} lessons
        </span>
      </div>
      <div className="dc-collection-body">
        <button type="button" onClick={() => onOpen?.(product.id)} className="dc-collection-link">
          <span className="dc-collection-category">
            {product.category}
          </span>
          <h3 className="dc-collection-title" title={product.title}>
            {product.title}
          </h3>
        </button>
        <p className="dc-collection-meta">{product.author}</p>
        <div className="dc-collection-meta flex items-center gap-1">
          <Star size={12} className="fill-amber-400 text-amber-400" />
          <span className="font-semibold text-white/85">{product.rating}</span>
          <span>({product.reviewsCount.toLocaleString("en-IN")})</span>
        </div>
        <div className="dc-collection-prices">
          <span className="dc-collection-price">{formatINR(product.price)}</span>
          {product.originalPrice > product.price && (
            <span className="line-through">{formatINR(product.originalPrice)}</span>
          )}
          {discount > 0 && <span className="dc-collection-discount">{discount}% off</span>}
        </div>
        <div className="dc-collection-actions">
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
