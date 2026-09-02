import type { Product } from "../data/products";
import { GlassCard } from "./ui/GlassCard";
import { LiquidMetalButton } from "./ui/LiquidMetalButton";
import { GlassSurface } from "./ui/glass";
import { HeartIcon, StarIcon } from "./icons";

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
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-white/[0.06]">
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
            <span className="rounded-md bg-white/[0.08] px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-rose-300">
              Board
            </span>
          )}
        </div>

        <button
          type="button"
          aria-label="Toggle wishlist"
          onClick={(event) => {
            event.stopPropagation();
            onToggleWishlist(product.id);
          }}
          className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full text-white/75 transition hover:scale-105 active:scale-95"
        >
          {/* the same action disc the header and the desktop top bar use, so a
              save control reads identically everywhere in the app */}
          <GlassSurface
            tint={0.4}
            radius={999}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
          />
          <HeartIcon
            filled={wishlisted}
            className={`relative h-4 w-4 ${wishlisted ? "text-rose-500" : "text-white/75"}`}
          />
        </button>
      </div>

      <div className="relative z-20 flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-1.5 text-sm">
          <StarIcon className="h-4 w-4 text-amber-400" />
          <span className="font-bold text-white">{product.rating.toFixed(1)}</span>
          <span className="text-white/55">({product.reviews} review{product.reviews === 1 ? "" : "s"})</span>
        </div>

        <h3 className="text-[15px] font-extrabold leading-snug text-white">{product.title}</h3>
        <p className="text-sm font-medium text-white/75">by {product.instructor}</p>

        <div className="mt-auto flex items-center gap-2 pt-1">
          {product.originalPrice > product.price && (
            <span className="text-sm text-white/55 line-through">₹{product.originalPrice}</span>
          )}
          <span className="text-lg font-extrabold text-white">₹{product.price}</span>
          {discount > 0 && (
            <span className="rounded-md bg-rose-500/20 px-1.5 py-0.5 text-[11px] font-bold text-rose-300">
              -{discount}%
            </span>
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
              <span>Add to Cart</span>
              <span>₹{product.price}</span>
            </span>
          </LiquidMetalButton>
        )}
      </div>
    </GlassCard>
  );
}
