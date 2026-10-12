import { useState } from "react";
import { Heart, Star } from "lucide-react";
import type { Product } from "../data/products";

export const storeMoney = (value: number) =>
  `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type StoreProductCardProps = {
  product: Product;
  wishlisted: boolean;
  inCart: boolean;
  purchased: boolean;
  onToggleWishlist: (id: string) => void;
  onAddToCart: (id: string) => void;
  onView: (product: Product) => void;
  list?: boolean;
  /** Large, editorial card used by the single-column Grid and Mixed views. */
  large?: boolean;
  brandName?: string;
};

export default function StoreProductCard({
  product,
  wishlisted,
  inCart,
  purchased,
  onToggleWishlist,
  onAddToCart,
  onView,
  list = false,
  large = false,
  brandName = "Digital Catalyst",
}: StoreProductCardProps) {
  const [failedImage, setFailedImage] = useState("");
  const free = product.isFree === true || product.price === 0;
  const finalPrice = free ? 0 : product.price;
  const hasPrice = Number.isFinite(finalPrice) && finalPrice >= 0;
  const hasOriginal =
    hasPrice &&
    Number.isFinite(product.originalPrice) &&
    product.originalPrice > finalPrice &&
    product.originalPrice > 0;
  const discountPercent = hasOriginal
    ? Math.round((1 - finalPrice / product.originalPrice) * 100)
    : 0;
  const hasRating =
    Number.isFinite(product.rating) &&
    product.rating > 0 &&
    Number.isFinite(product.reviews) &&
    product.reviews > 0;
  const unavailable = product.availableForSale === false && !purchased;
  const instructor = product.instructor?.trim();
  const hasInstructor =
    Boolean(instructor) &&
    !["digital catalyst", brandName.toLowerCase()].includes(instructor.toLowerCase());
  const details = [product.classLevel, product.subject]
    .filter(
      (value) =>
        value &&
        !["lifetime access", "digital learning"].includes(value.toLowerCase()),
    )
    .join(" · ");
  const status = purchased
    ? { kind: "purchased", label: "Purchased" }
    : unavailable
      ? { kind: "unavailable", label: "Coming soon" }
      : free
        ? { kind: "free", label: "Free access" }
        : hasOriginal
          ? { kind: "sale", label: `${discountPercent}% off` }
          : product.tags?.includes("SALE")
            ? { kind: "sale", label: "Sale" }
            : null;

  // Artwork is intentionally image-only. Product status, savings, rating,
  // favorite controls and every other decoration live in the content below it.
  const renderCover = () => (
    <div className="dc-marketplace-cover">
      {product.image && failedImage !== product.image ? (
        <img
          src={product.image}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedImage(product.image)}
        />
      ) : (
        <span
          aria-hidden="true"
          className={`dc-marketplace-cover-fallback ${list ? "dc-purchases-image-fallback" : ""}`}
        >
          {list ? product.category : product.title.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );

  const renderCopy = () => (
    <div className={`dc-marketplace-copy ${list ? "dc-purchases-copy" : ""}`}>
      <div className="dc-marketplace-card-eyebrows">
        <p className="dc-marketplace-kind">{product.category}</p>
        {status ? (
          <span
            className="dc-marketplace-status"
            data-status={status.kind}
          >
            {status.label}
          </span>
        ) : null}
      </div>
      <h3 className={list ? "dc-purchases-title" : undefined} title={product.title}>
        {product.title}
      </h3>
      {details ? <p className="dc-marketplace-details">{details}</p> : null}
      {hasInstructor ? <p className="dc-marketplace-instructor">{instructor}</p> : null}
    </div>
  );

  const renderSaveButton = () => (
    <button
      type="button"
      className="dc-marketplace-save"
      aria-label={`${wishlisted ? "Remove" : "Save"} ${product.title} ${
        wishlisted ? "from" : "to"
      } favorites`}
      aria-pressed={wishlisted}
      onClick={() => onToggleWishlist(product.id)}
    >
      <Heart
        size={18}
        aria-hidden="true"
        fill={wishlisted ? "currentColor" : "none"}
      />
    </button>
  );

  const renderPurchaseAction = () =>
    purchased ? null : inCart || unavailable ? (
      <p className="dc-marketplace-purchase-state">
        {unavailable ? "Not for sale" : "In cart"}
      </p>
    ) : (
      <button
        type="button"
        className="dc-marketplace-buy"
        disabled={!hasPrice}
        onClick={() => (free ? onView(product) : onAddToCart(product.id))}
      >
        {free ? "Get access" : "Add to cart"}
      </button>
    );

  const renderFooter = () => (
    <div className="dc-marketplace-card-footer">
      {hasRating ? (
        <p className="dc-marketplace-rating">
          <Star size={14} fill="#facc15" stroke="#ca8a04" aria-hidden="true" />
          <strong>{product.rating.toFixed(1)}</strong>
          <span>({product.reviews.toLocaleString("en-IN")})</span>
        </p>
      ) : null}
      <div className="dc-marketplace-price">
        {hasOriginal ? <del>{storeMoney(product.originalPrice)}</del> : null}
        {hasPrice ? (
          <strong data-store-final-price>{storeMoney(finalPrice)}</strong>
        ) : (
          <span>Price unavailable</span>
        )}
      </div>
      {hasOriginal && !purchased ? (
        <p className="dc-marketplace-saving">
          Save {storeMoney(product.originalPrice - finalPrice)}
        </p>
      ) : null}
      {renderPurchaseAction()}
    </div>
  );

  return (
    <article
      className={`dc-marketplace-card ${
        list ? "is-list dc-purchases-row" : large ? "is-large" : ""
      }`}
      data-store-product={product.id}
      data-store-card-variant={list ? "list" : large ? "large" : "grid"}
    >
      <button
        type="button"
        className="dc-marketplace-open"
        aria-label={`View ${product.title}`}
        onClick={() => onView(product)}
      >
        {renderCover()}
        {renderCopy()}
      </button>
      {list ? (
        <div className="dc-marketplace-list-actions" data-store-product-actions>
          {renderFooter()}
          {renderSaveButton()}
        </div>
      ) : (
        <div className="dc-marketplace-card-actions" data-store-product-actions>
          {renderFooter()}
          {renderSaveButton()}
        </div>
      )}
    </article>
  );
}
