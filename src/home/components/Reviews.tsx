import { BadgeCheck } from "lucide-react";
import type { PublishedProductReview } from "../../hooks/useProductReviews";
import { GlassCard } from "../../components/ui/GlassCard";
import { useDragScroll } from "../../hooks/useDragScroll";
import HomeSectionHeader from "./HomeSectionHeader";

interface ReviewsProps {
  /** Published Firestore reviews only; placeholders are filtered by Home. */
  reviews: PublishedProductReview[];
  onOpenReview: (productId: string) => void;
}

export default function Reviews({ reviews, onOpenReview }: ReviewsProps) {
  const rail = useDragScroll<HTMLDivElement>();

  if (reviews.length === 0) return null;

  return (
    <section className="dc-home-section dc-home-reviews-section" aria-labelledby="home-reviews-title">
      <HomeSectionHeader
        id="home-reviews-title"
        title="Loved by Learners"
      />
      <div
        ref={rail.ref}
        onPointerDown={rail.onPointerDown}
        role="region"
        className="dc-home-review-rail no-scrollbar snap-x-mandatory"
        aria-label="Learner reviews"
      >
        {reviews.map((review) => {
          const safeName = !review.verifiedPurchase && review.name.trim().toLowerCase() === "verified learner"
            ? "Learner"
            : review.name;
          return (
            <GlassCard
              tint={0.25}
              blur={0}
              radius={20}
              contentClassName="p-4"
              role="button"
              tabIndex={0}
              key={review.id}
              onClick={() => onOpenReview(review.productId)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenReview(review.productId);
                }
              }}
              aria-label={`Read reviews for ${review.productTitle}`}
              className="dc-scene-plate dc-home-card dc-home-review-card cursor-pointer text-left"
            >
              <div className="dc-home-review-person">
                <div className={`dc-home-review-avatar ${review.avatarColor}`} aria-hidden="true">{review.initials}</div>
                <div className="min-w-0 flex-1">
                  <p className="dc-home-review-name">
                    <span>{safeName}</span>
                    {review.verifiedPurchase ? <BadgeCheck size={14} aria-label="Verified purchase" className="dc-home-verified-icon" /> : null}
                  </p>
                  <p className="dc-home-review-byline">
                    {review.verifiedPurchase ? <><span>Verified learner</span><span aria-hidden="true">·</span></> : null}
                    <span>{review.date}</span>
                  </p>
                </div>
              </div>
              <p className="dc-home-review-stars" aria-label={`${review.rating} out of 5 stars`}>
                <span aria-hidden="true">{"★".repeat(review.rating)}</span>
                <span className="dc-home-review-empty-stars" aria-hidden="true">{"★".repeat(5 - review.rating)}</span>
              </p>
              <p className="dc-home-review-comment">“{review.comment}”</p>
              <p className="dc-home-review-course" title={review.productTitle}>{review.productTitle}</p>
            </GlassCard>
          );
        })}
      </div>
    </section>
  );
}
