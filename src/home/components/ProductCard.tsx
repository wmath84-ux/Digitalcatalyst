import { Heart, Star } from "lucide-react";
import type { Product } from "../types";
import { GlassCard } from "../../components/ui/GlassCard";

interface ProductCardProps {
  product: Product;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  className?: string;
  onOpen?: (product: Product) => void;
}

const typeMeta: Record<Product["type"], string> = {
  video: "Video",
  pdf: "PDF",
  ebook: "E-book",
  live: "Live class",
};

const GENERIC_SUBJECTS = new Set(["digital learning", "course", "pdf", "notes", "e-book", "live"]);
const GENERIC_LEVELS = new Set(["lifetime access"]);

function productDetails(product: Product) {
  const subject = product.subject?.trim();
  const level = product.classLevel?.trim();
  const details = [
    level && !GENERIC_LEVELS.has(level.toLowerCase()) ? level : "",
    subject && !GENERIC_SUBJECTS.has(subject.toLowerCase()) ? subject : "",
  ].filter((value, index, all) => value && all.indexOf(value) === index);
  return details.join(" · ") || product.author?.trim() || "";
}

const money = (amount: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount)}`;

export default function ProductCard({
  product,
  isFavorite,
  onToggleFavorite,
  className = "",
  onOpen,
}: ProductCardProps) {
  const meta = typeMeta[product.type];
  const details = productDetails(product);
  const hasRating = Number.isFinite(product.rating) && product.rating > 0 && product.ratingCount > 0;
  const isFree = product.isFree === true || product.price === 0;
  const hasPrice = isFree || (Number.isFinite(product.price) && product.price >= 0);
  const finalPrice = isFree ? 0 : product.price;
  const formattedPrice = hasPrice ? money(finalPrice) : "";
  // Only strike a real catalog MRP. A missing original price is never invented.
  const hasOriginalPrice = hasPrice && Number.isFinite(product.mrp) && product.mrp > finalPrice && product.mrp > 0;

  return (
    <GlassCard
      radius={24}
      tint={0.25}
      blur={0}
      contentClassName="flex min-w-0 flex-col p-0"
      className={`dc-scene-plate group relative overflow-hidden text-white dc-home-product-card ${className}`}
    >
      <div className="dc-home-product-shell">
        <button
          type="button"
          className="dc-home-product-open"
          onClick={() => onOpen?.(product)}
          aria-label={`View ${product.title}`}
        >
          <div className="dc-home-product-media aspect-[4/3]">
            <img
              src={product.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="dc-home-product-image"
            />
            <span className="dc-home-product-type">{meta}</span>
          </div>
          <div className="dc-home-product-copy">
            <h3 className="dc-home-product-title min-h-[2.5rem]" title={product.title}>{product.title}</h3>
            {details ? <p className="dc-home-product-details" title={details}>{details}</p> : <span className="dc-home-product-details-spacer" aria-hidden="true" />}
            <div className="dc-home-product-meta-row">
              {hasRating ? (
                <span className="dc-home-product-rating" aria-label={`Rated ${product.rating.toFixed(1)} out of 5${product.ratingCount > 0 ? ` from ${product.ratingCount} reviews` : ""}`}>
                  <Star size={13} fill="currentColor" strokeWidth={1.8} aria-hidden="true" />
                  {product.rating.toFixed(1)}
                  {product.ratingCount > 0 ? <span className="dc-home-product-rating-count">({product.ratingCount.toLocaleString()})</span> : null}
                </span>
              ) : <span className="dc-home-product-rating-spacer" aria-hidden="true" />}
              {hasPrice ? (
                <span className="dc-home-product-price">
                  {hasOriginalPrice ? <del title="Original price">{money(product.mrp)}</del> : null}
                  <strong className={`dc-home-product-current-price${formattedPrice.length > 10 ? " dc-home-product-current-price--long" : ""}`} title="Final price">{formattedPrice}</strong>
                </span>
              ) : null}
            </div>
          </div>
        </button>
        <button
          type="button"
          aria-label={isFavorite ? `Remove ${product.title} from favorites` : `Add ${product.title} to favorites`}
          aria-pressed={isFavorite}
          onClick={() => onToggleFavorite(product.id)}
          className={`dc-home-product-favorite ${isFavorite ? "is-favorite" : ""}`}
        >
          <Heart size={17} fill={isFavorite ? "currentColor" : "none"} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </GlassCard>
  );
}
