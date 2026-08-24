import type { Product } from "../data/products";
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
    <div
      onClick={() => onView(product)}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/60 shadow-[0_14px_40px_-20px_rgba(49,46,129,0.65)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-indigo-200/80 hover:bg-white/80 hover:shadow-[0_22px_55px_-18px_rgba(79,70,229,0.55)]"
    >
      {/* Glass sheen */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-br from-white/60 via-transparent to-transparent opacity-70" />
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
        <img src={product.image} alt={product.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />

        <div className="absolute left-2 top-2 z-20 flex gap-1.5">
          {purchased && (
            <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow">
              Purchased
            </span>
          )}
          {unavailable && (
            <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow">
              Coming soon
            </span>
          )}
          {!purchased && !unavailable && product.tags.includes("SALE") && (
            <span className="rounded-full bg-teal-400 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-900 shadow">
              Sale
            </span>
          )}
          {product.tags.includes("BOARD") && (
            <span className="rounded-md bg-white px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-rose-600 shadow">
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
          className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-white/70 text-slate-600 shadow-lg shadow-slate-900/10 backdrop-blur-md transition hover:scale-105 hover:bg-white/90 active:scale-95"
        >
          <HeartIcon
            filled={wishlisted}
            className={`h-4 w-4 ${wishlisted ? "text-rose-500" : "text-slate-600"}`}
          />
        </button>
      </div>

      <div className="relative z-20 flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-1.5 text-sm">
          <StarIcon className="h-4 w-4 text-amber-400" />
          <span className="font-bold text-slate-900">{product.rating.toFixed(1)}</span>
          <span className="text-slate-500">({product.reviews} review{product.reviews === 1 ? "" : "s"})</span>
        </div>

        <h3 className="text-[15px] font-extrabold leading-snug text-slate-900">{product.title}</h3>
        <p className="text-sm font-medium text-slate-600">by {product.instructor}</p>

        <div className="mt-auto flex items-center gap-2 pt-1">
          {product.originalPrice > product.price && (
            <span className="text-sm text-slate-500 line-through">₹{product.originalPrice}</span>
          )}
          <span className="text-lg font-extrabold text-slate-900">₹{product.price}</span>
          {discount > 0 && (
            <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-600">
              -{discount}%
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={purchased || inCart || unavailable}
          onClick={(event) => {
            event.stopPropagation();
            if (!unavailable) onAddToCart(product.id);
          }}
          className={`mt-1 flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-extrabold uppercase tracking-wide transition ${
            unavailable
              ? "cursor-default border border-amber-200/70 bg-amber-100/70 text-amber-800 backdrop-blur"
              : purchased || inCart
                ? "cursor-default border border-emerald-200/70 bg-emerald-100/70 text-emerald-700 backdrop-blur"
                : "bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-lg shadow-indigo-500/30 hover:brightness-110 active:scale-[0.98]"
          }`}
        >
          <span>{purchased ? "Purchased" : unavailable ? "Not for sale" : inCart ? "In Cart" : "Add to Cart"}</span>
          <span>{unavailable ? "Soon" : `₹${product.price}`}</span>
        </button>
      </div>
    </div>
  );
}
