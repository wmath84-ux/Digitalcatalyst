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
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-300/60 transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
        <img src={product.image} alt={product.title} className="h-full w-full object-cover" />

        <div className="absolute left-2 top-2 flex gap-1.5">
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
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow transition hover:scale-105 active:scale-95"
        >
          <HeartIcon
            filled={wishlisted}
            className={`h-4 w-4 ${wishlisted ? "text-rose-500" : "text-slate-600"}`}
          />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
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
              ? "cursor-default bg-amber-100 text-amber-800"
              : purchased || inCart
                ? "cursor-default bg-emerald-100 text-emerald-700"
                : "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-200 hover:brightness-110 active:scale-[0.98]"
          }`}
        >
          <span>{purchased ? "Purchased" : unavailable ? "Not for sale" : inCart ? "In Cart" : "Add to Cart"}</span>
          <span>{unavailable ? "Soon" : `₹${product.price}`}</span>
        </button>
      </div>
    </div>
  );
}
