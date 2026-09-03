import type { Product } from "../data/products";
import { GlassCard } from "./ui/GlassCard";
import { LiquidMetalButton } from "./ui/LiquidMetalButton";
import { GlassButton } from "./ui/glass-button";
import { HeartIcon, StarIcon } from "./icons";
import { EmojiBurstLayer, useEmojiBurst } from "./ui/EmojiBurst";

type ProductCardProps = {
  product: Product;
  wishlisted: boolean;
  inCart: boolean;
  purchased: boolean;
  onToggleWishlist: (id: string) => void;
  onAddToCart: (id: string) => void;
  onView: (product: Product) => void;
};

export default function ProductCard({
  product,
  wishlisted,
  inCart,
  purchased,
  onToggleWishlist,
  onAddToCart,
  onView,
}: ProductCardProps) {
  const discount = product.originalPrice > 0
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;
  const unavailable = product.availableForSale === false && !purchased;
  const { particles: likeParticles, burst: likeBurst } = useEmojiBurst();

  return (
    /* Wave 3 (commerce): the card is `glass-card`, so the material, the rim and
       the sheen come from the pack — the hand-painted `bg-white/[0.08]`, the
       `` and the separate fake "Glass sheen" layer are gone
       (`GlassSurface` paints a real specular sheen, which is what that div was
       imitating). `contentClassName="p-0"` keeps the media edge-to-edge. */
    <GlassCard
      onClick={() => onView(product)}
      contentClassName="p-0"
      className="group relative flex h-full flex-col overflow-hidden transition duration-300 hover:-translate-y-1"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        <img src={product.image} alt={product.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />

        <div className="absolute left-2 top-2 z-20 flex gap-1.5">
          {purchased && (
            <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
              Purchased
            </span>
          )}
          {unavailable && (
            <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
              Coming soon
            </span>
          )}
          {!purchased && !unavailable && product.tags.includes("SALE") && (
            <span className="rounded-full bg-teal-400 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
              Sale
            </span>
          )}
          {product.tags.includes("BOARD") && (
            <span className="rounded-md bg-rose-500/15 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-rose-300">
              Board
            </span>
          )}
        </div>

        {/* Wave 10: the pack GlassButton icon disc — the same save control the
            store header and the list card use. */}
        <EmojiBurstLayer particles={likeParticles} />
        <GlassButton
          type="button"
          aria-label="Toggle wishlist"
          onClick={(event) => {
            event.stopPropagation();
            // Owner's direction: every like fires the AI Canvas heart burst.
            if (!wishlisted) likeBurst();
            onToggleWishlist(product.id);
          }}
          className="absolute right-2 top-2 z-20 [&_.size-12]:size-8"
        >
          <HeartIcon
            filled={wishlisted}
            className={`relative h-4 w-4 ${wishlisted ? "text-rose-500" : "text-white/75"}`}
          />
        </GlassButton>
      </div>

      <div className="relative z-20 flex flex-1 flex-col gap-2 p-4">
        {/* Visual hierarchy: title first (largest, heaviest), then the proof
            row, then the quiet byline — instead of three same-weight lines. */}
        <h3 className="text-[15px] font-extrabold leading-[1.35] dc-ink-1">{product.title}</h3>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="inline-flex items-center gap-1">
            <StarIcon className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-bold dc-ink-1">{product.rating.toFixed(1)}</span>
            <span className="dc-ink-3">({product.reviews})</span>
          </span>
          {/* Social proof / scarcity — only shown when it is real (a
              well-reviewed item), never as decoration. */}
          {product.reviews >= 25 ? (
            <span className="dc-proof">🔥 Popular</span>
          ) : null}
        </div>

        <p className="text-[12.5px] font-medium dc-ink-3">by {product.instructor}</p>

        {/* Anchoring + contrast effect: the struck reference price is quiet
            and set BEFORE the payable price, so the eye lands on the smaller
            number last. Loss aversion: the saving is framed as rupees the
            user keeps, not as an abstract percentage alone. */}
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-1 pt-1">
          {product.originalPrice > product.price && (
            <span className="text-[13px] dc-anchor-price">₹{product.originalPrice}</span>
          )}
          <span className="text-xl dc-hero-price">₹{product.price}</span>
          {discount > 0 && (
            <span className="dc-save-pill">Save ₹{product.originalPrice - product.price} · {discount}%</span>
          )}
        </div>

        {/* Two states on purpose: when the card can be acted on it is a
            `glass-button` capsule (gel press included); when it cannot, it stays
            a flat status plate — a disabled lens reads as "dimmed glass", which
            is a worse affordance for Purchased / Coming soon than a solid tint. */}
        {purchased || inCart || unavailable ? (
          <div
            className={`mt-1 flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-extrabold uppercase tracking-wide ${
              unavailable
                ? "cursor-default border border-amber-400/30 bg-amber-500/20 text-amber-200"
                : "cursor-default border border-emerald-400/30 bg-emerald-500/20 text-emerald-200"
            }`}
          >
            <span>{purchased ? "Purchased" : unavailable ? "Not for sale" : "In Cart"}</span>
            <span>{unavailable ? "Soon" : `₹${product.price}`}</span>
          </div>
        ) : (
          <LiquidMetalButton
            tone="primary"
            aria-label={`Add ${product.title} to cart for ₹${product.price}`}
            className="mt-1"
            onClick={(event) => {
              event.stopPropagation();
              onAddToCart(product.id);
            }}
          >
            <span className="flex w-full items-center justify-between gap-2 text-[12px] font-extrabold uppercase tracking-wide">
              <span>Add to my cart</span>
              <span>₹{product.price}</span>
            </span>
          </LiquidMetalButton>
        )}
      </div>
    </GlassCard>
  );
}
