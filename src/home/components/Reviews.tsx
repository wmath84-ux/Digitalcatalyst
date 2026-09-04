import { BadgeCheck } from "lucide-react";
import type { PublishedProductReview } from "../../hooks/useProductReviews";
import { GlassCard } from "../../components/ui/GlassCard";

interface ReviewsProps {
  reviews: PublishedProductReview[];
  onOpenReview: (productId: string) => void;
}

export default function Reviews({ reviews, onOpenReview }: ReviewsProps) {
  const average = reviews.length
    ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length
    : 0;

  if (reviews.length === 0) return null;

  return (
    <section className="mt-7 pb-4">
      <div className="flex items-center justify-between px-5">
        <h2 className="text-base font-bold text-white">Loved by Learners</h2>
        <span className="text-xs font-semibold text-white/55">{average.toFixed(1)} ★ average</span>
      </div>

      <div className="mt-3 flex gap-3 overflow-x-auto px-5 pb-2 no-scrollbar snap-x-mandatory">
        {reviews.map((review) => (
          <GlassCard
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
            aria-label={`Open reviews for ${review.productTitle}`}
            className="w-64 flex-shrink-0 cursor-pointer snap-center-item text-left transition hover:-translate-y-0.5 active:scale-[0.99] [&>div:last-child]:p-4"
          >
            <div className="flex items-center gap-2.5">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${review.avatarColor}`}>
                {review.initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm font-semibold text-white/85">
                  <span className="truncate">{review.name}</span>
                  {review.verifiedPurchase && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
                </p>
                <p className="text-[11px] text-white/55">{review.date}</p>
              </div>
            </div>

            <div className="mt-2 text-xs text-amber-300">
              {"★".repeat(review.rating)}
              <span className="text-white/25">{"★".repeat(5 - review.rating)}</span>
            </div>

            <p className="mt-2 line-clamp-4 text-[12.5px] leading-relaxed text-white/75">“{review.comment}”</p>
            <p className="mt-2 truncate text-[11px] font-semibold text-indigo-300">{review.productTitle}</p>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}
