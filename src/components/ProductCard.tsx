import { ShoppingCart } from "lucide-react";
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
  index?: number;
};

type CardTheme = {
  frame: string;
  glow: string;
  buttonFrom: string;
  buttonTo: string;
  saveBg: string;
  saveText: string;
  badgeBg: string;
  badgeText: string;
};

const CARD_THEMES: CardTheme[] = [
  {
    frame: "rgba(32, 214, 164, 0.55)",
    glow: "linear-gradient(180deg, rgba(22,163,74,0.18) 0%, rgba(6,18,48,0.04) 48%, rgba(3,11,28,0.78) 100%)",
    buttonFrom: "#1fdf9c",
    buttonTo: "#15c4c7",
    saveBg: "rgba(18, 155, 110, 0.26)",
    saveText: "#56f0b6",
    badgeBg: "#21c87b",
    badgeText: "#effff7",
  },
  {
    frame: "rgba(51, 139, 255, 0.55)",
    glow: "linear-gradient(180deg, rgba(37,99,235,0.18) 0%, rgba(6,18,48,0.04) 48%, rgba(3,11,28,0.78) 100%)",
    buttonFrom: "#2794ff",
    buttonTo: "#347dff",
    saveBg: "rgba(15, 132, 197, 0.24)",
    saveText: "#79dbff",
    badgeBg: "#1d5cff",
    badgeText: "#eef6ff",
  },
  {
    frame: "rgba(237, 146, 44, 0.5)",
    glow: "linear-gradient(180deg, rgba(245,158,11,0.18) 0%, rgba(6,18,48,0.04) 48%, rgba(3,11,28,0.78) 100%)",
    buttonFrom: "#cf8a3a",
    buttonTo: "#bf7a3b",
    saveBg: "rgba(41, 177, 123, 0.22)",
    saveText: "#67f3b5",
    badgeBg: "#ff9a25",
    badgeText: "#fff8ed",
  },
  {
    frame: "rgba(170, 88, 255, 0.5)",
    glow: "linear-gradient(180deg, rgba(168,85,247,0.18) 0%, rgba(6,18,48,0.04) 48%, rgba(3,11,28,0.78) 100%)",
    buttonFrom: "#9352ff",
    buttonTo: "#6f46ff",
    saveBg: "rgba(65, 179, 228, 0.22)",
    saveText: "#8ae5ff",
    badgeBg: "#8b5cf6",
    badgeText: "#f4efff",
  },
  {
    frame: "rgba(34, 211, 238, 0.48)",
    glow: "linear-gradient(180deg, rgba(20,184,166,0.18) 0%, rgba(6,18,48,0.04) 48%, rgba(3,11,28,0.78) 100%)",
    buttonFrom: "#15a7c4",
    buttonTo: "#0ba0a9",
    saveBg: "rgba(42, 186, 214, 0.22)",
    saveText: "#82eeff",
    badgeBg: "#0fa8b3",
    badgeText: "#ecfeff",
  },
];

function cardBadge(product: Product, index: number) {
  if (product.availableForSale === false) return "Coming soon";
  if (product.price === 0 || product.isFree) return "Free";
  if (product.tags?.includes("BESTSELLER")) return "Bestseller";
  if (product.tags?.includes("SALE")) return "Sale";
  if (product.tags?.includes("NEW")) return "New";
  return index === 0 ? "Bestseller" : "Popular";
}

function formatReviews(reviews: number) {
  if (reviews >= 1000) return `${(reviews / 1000).toFixed(1)}k`;
  return String(reviews);
}

export default function ProductCard({
  product,
  wishlisted,
  inCart,
  purchased,
  onToggleWishlist,
  onAddToCart,
  onView,
  index = 0,
}: ProductCardProps) {
  const theme = CARD_THEMES[index % CARD_THEMES.length];
  const discount = product.originalPrice > 0
    ? Math.max(0, Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100))
    : 0;
  const unavailable = product.availableForSale === false && !purchased;
  const { particles: likeParticles, burst: likeBurst } = useEmojiBurst();
  const badge = cardBadge(product, index);

  return (
    <GlassCard
      onClick={() => onView(product)}
      contentClassName="p-0"
      className="group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#061534]/95 transition duration-300 hover:-translate-y-1"
      style={{
        borderColor: theme.frame,
        boxShadow: `0 22px 45px -30px ${theme.frame}, inset 0 1px 0 rgba(255,255,255,0.15)`,
      }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: theme.glow }} />
      <div className="relative flex h-full flex-col p-3">
        <div className="relative overflow-hidden rounded-[20px] border border-white/10 bg-slate-900/80">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0)_56%,rgba(7,21,45,0.45)_100%)]" />
          <img
            src={product.image}
            alt={product.title}
            loading="lazy"
            decoding="async"
            className="aspect-[4/3] h-auto w-full object-cover transition duration-500 group-hover:scale-105"
          />

          <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
            <span
              className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em]"
              style={{ background: theme.badgeBg, color: theme.badgeText }}
            >
              {badge}
            </span>
          </div>

          <EmojiBurstLayer particles={likeParticles} />
          <GlassButton
            type="button"
            aria-label="Toggle wishlist"
            onClick={(event) => {
              event.stopPropagation();
              if (!wishlisted) likeBurst();
              onToggleWishlist(product.id);
            }}
            className="absolute right-2.5 top-2.5 z-20 [&_.size-12]:size-8"
          >
            <HeartIcon
              filled={wishlisted}
              className={`h-4 w-4 ${wishlisted ? "text-rose-500" : "text-white/85"}`}
            />
          </GlassButton>
        </div>

        <div className="relative flex flex-1 flex-col px-1 pb-1 pt-3 text-white">
          <h3 className="line-clamp-2 min-h-[3.2rem] text-[15px] font-extrabold leading-[1.35] text-white">
            {product.title}
          </h3>

          <div className="mt-2 flex items-center gap-1.5 text-[12px] text-white/88">
            <StarIcon className="h-3.5 w-3.5 text-[#ffc84d]" />
            <span className="font-bold">{product.rating.toFixed(1)}</span>
            <span className="text-white/60">({formatReviews(product.reviews)})</span>
          </div>

          <p className="mt-1 line-clamp-2 min-h-[2.4rem] text-[12.5px] font-medium leading-5 text-white/72">
            by {product.instructor}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {product.originalPrice > product.price ? (
              <span className="text-[13px] font-semibold text-white/45 line-through">₹{product.originalPrice}</span>
            ) : null}
            <span className="text-[2rem] font-black leading-none tracking-[-0.03em] text-white">₹{product.price}</span>
            {discount > 0 ? (
              <span
                className="rounded-full px-3 py-1 text-[11px] font-bold"
                style={{ background: theme.saveBg, color: theme.saveText }}
              >
                Save {discount}%
              </span>
            ) : null}
          </div>

          {purchased || inCart || unavailable ? (
            <div
              className={`mt-4 flex w-full items-center justify-between rounded-[16px] border px-4 py-3 text-sm font-extrabold ${
                unavailable
                  ? "border-amber-300/25 bg-amber-500/18 text-amber-100"
                  : "border-emerald-300/25 bg-emerald-500/18 text-emerald-50"
              }`}
            >
              <span>{purchased ? "Purchased" : unavailable ? "Not for sale" : "In Cart"}</span>
              <span>{unavailable ? "Soon" : `₹${product.price}`}</span>
            </div>
          ) : (
            <LiquidMetalButton
              tone="primary"
              aria-label={`Add ${product.title} to cart for ₹${product.price}`}
              className="mt-4"
              onClick={(event) => {
                event.stopPropagation();
                onAddToCart(product.id);
              }}
            >
              <span className="flex w-full items-center justify-between gap-2 text-[12px] font-extrabold uppercase tracking-wide">
                <span className="inline-flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  <span>Add to Cart</span>
                </span>
                <span>₹{product.price}</span>
                <span className="sr-only">Add to my cart</span>
              </span>
            </LiquidMetalButton>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
