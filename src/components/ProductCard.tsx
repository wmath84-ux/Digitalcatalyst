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

/**
 * The store's product card — same length/width stack as Home's trending
 * tiles (`src/home/components/ProductCard.tsx`): a 4:3 artwork band, then
 * natural-height copy. The card itself is NOT a square; width comes from
 * the auto-fill grid (`[data-store-grid]`), height from 4:3 art + copy, so
 * the ratio tracks Home on every phone / tablet / desktop width.
 *
 * Material stays the store lens: `.dc-store-glass` light-blue glass
 * (src/store-glass.css). The product title is still the card's heading —
 * `.dc-store-card-title` is the biggest type on the card at every
 * breakpoint, clamped to two lines.
 *
 * The rating and the subject ride on the artwork so the glass area stays
 * type-only. The byline and the save pill wait for `sm:` where the track
 * is wide enough.
 */
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
       the sheen come from the pack — `dc-store-glass` (src/store-glass.css)
       re-points those layers at the owner's light-blue lens.
       `contentClassName="p-0"` keeps the media edge-to-edge.
       The pack props mirror the CSS tokens (tint 0.62 * 0.42 = 0.26 alpha of
       rgb(173,216,255)), so the surface paints the requested material even
       before the stylesheet's `!important` layers land. */
    <GlassCard
      onClick={() => onView(product)}
      contentClassName="p-0"
      tint={0.62}
      tintColor="173,216,255"
      blur={0}
      radius={22}
      /* `[&>div:last-child]` is the pack's content wrapper (GlassSurface puts
         one between this root and the card's real children). It ships as a
         BLOCK box, so a flex column on the root never reached the artwork /
         copy below: `flex-1` and `mt-auto` did nothing and the CTA floated up
         under the title. Making the wrapper the flex column fixes the card
         without touching `contentClassName="p-0"` — the artwork stays
         edge-to-edge, which liquidGlassWaveThreeContract pins. */
      className="dc-store-glass dc-scene-ink group relative flex w-full min-h-0 flex-col overflow-hidden transition duration-300 hover:-translate-y-0.5 [&>div:last-child]:flex [&>div:last-child]:min-h-0 [&>div:last-child]:flex-col"
    >
      {/* Artwork — same 4:3 box Home's trending card uses. `absolute inset-0`
          on the <img> keeps it cropped to the box: index.css's unlayered
          `img { height: auto }` (640–1366px) would beat a Tailwind `h-full`. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <img src={product.image} alt={product.title} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        {/* Bottom scrim: the rating chip sits on the artwork, so it needs the
            same edge the copy gets from `.dc-scene-ink`. */}
        <div aria-hidden className="dc-store-card-scrim pointer-events-none absolute inset-x-0 bottom-0 h-2/3" />

        <div className="absolute left-2 top-2 z-20 flex max-w-[70%] flex-wrap gap-1">
          {purchased ? (
            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
              Purchased
            </span>
          ) : unavailable ? (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
              Coming soon
            </span>
          ) : product.tags.includes("SALE") ? (
            <span className="rounded-full bg-teal-400 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
              Sale
            </span>
          ) : (
            <span className="dc-store-card-kicker truncate rounded-full border border-white/25 bg-[rgba(4,8,18,0.45)] px-2 py-0.5">
              {product.subject}
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
          className="absolute right-2 top-2 z-20 [&_.size-12]:size-7"
        >
          <HeartIcon
            filled={wishlisted}
            className={`relative h-3.5 w-3.5 ${wishlisted ? "text-rose-500" : "text-white/80"}`}
          />
        </GlassButton>

        {/* Rating + review count, on the artwork: social proof without taking
            a line from the heading below. */}
        <span className="dc-store-card-meta absolute bottom-1.5 left-2 z-20 inline-flex items-center gap-1">
          <StarIcon className="h-3 w-3 text-amber-300" />
          <span className="font-extrabold">{product.rating.toFixed(1)}</span>
          <span className="text-white/70">({product.reviews})</span>
          {product.reviews >= 25 ? <span className="dc-proof">🔥</span> : null}
        </span>
      </div>

      {/* `flex-1` + `p-3`: same copy stack Home's trending card uses under
          the 4:3 art. (Braces matter here: between JSX children a bare
          slash-star comment is literal TEXT and paints itself onto the card.) */}
      <div className="relative z-20 flex flex-1 flex-col gap-1 p-3">
        {/* The card's heading: title first, biggest and heaviest. */}
        <h3 className="dc-store-card-title line-clamp-2">{product.title}</h3>

        {/* Anchoring + contrast: the struck reference price is quiet, and the
            saving is framed as rupees the user keeps rather than an abstract
            percentage. The price shows at EVERY breakpoint — hiding it below
            `sm:` left a phone card with nothing but a title and a button. The
            save pill is wrapped (not `hidden` on itself) because
            `.dc-save-pill`'s `display: inline-flex` is unlayered CSS and would
            beat the utility. */}
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-[13px] dc-hero-price sm:text-lg">₹{product.price}</span>
          {product.originalPrice > product.price && (
            <span className="text-[10px] dc-anchor-price sm:text-[12px]">₹{product.originalPrice}</span>
          )}
          {discount > 0 && (
            <span className="hidden sm:inline-flex">
              <span className="dc-save-pill">Save ₹{product.originalPrice - product.price} · {discount}%</span>
            </span>
          )}
        </div>

        <p className="dc-store-card-meta hidden truncate sm:block">by {product.instructor}</p>

        {/* Two states on purpose: when the card can be acted on it is a
            `glass-button` capsule (gel press included); when it cannot, it stays
            a flat status plate — a disabled lens reads as "dimmed glass", which
            is a worse affordance for Purchased / Coming soon than a solid tint.
            The `[&.h-11]` / `[&_.h-11]` pair pulls the pack's 44px capsule down
            to 32px: inside an exact square the full-height CTA would push the
            heading out of the card on a phone. */}
        <div>
          {purchased || inCart || unavailable ? (
            <div
              className={`flex w-full items-center justify-between gap-1 rounded-full px-2.5 py-2 text-[10px] font-extrabold uppercase tracking-wide ${
                unavailable
                  ? "cursor-default border border-amber-400/40 bg-amber-500/25 text-amber-100"
                  : "cursor-default border border-emerald-400/40 bg-emerald-500/25 text-emerald-100"
              }`}
            >
              <span>{purchased ? "Purchased" : unavailable ? "Not for sale" : "In Cart"}</span>
              <span>{unavailable ? "Soon" : `₹${product.price}`}</span>
            </div>
          ) : (
            <LiquidMetalButton
              tone="primary"
              aria-label={`Add ${product.title} to cart for ₹${product.price}`}
              className="[&.h-11]:h-8 [&_.h-11]:h-8 [&_.px-5]:px-2.5"
              onClick={(event) => {
                event.stopPropagation();
                onAddToCart(product.id);
              }}
            >
              <span className="flex w-full items-center justify-between gap-1.5 text-[10px] font-extrabold uppercase tracking-wide sm:text-[11px]">
                <span className="truncate">Add to my cart</span>
                <span className="shrink-0">₹{product.price}</span>
              </span>
            </LiquidMetalButton>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
