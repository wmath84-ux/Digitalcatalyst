import { BadgeCheck } from "lucide-react";
import type { PublishedProductReview } from "../../hooks/useProductReviews";

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
        <h2 className="text-base font-bold text-slate-900">Loved by Learners</h2>
        <span className="text-xs font-semibold text-slate-400">{average.toFixed(1)} ★ average</span>
      </div>

      <div className="mt-3 flex gap-3 overflow-x-auto px-5 pb-2 no-scrollbar snap-x-mandatory">
        {reviews.map((review) => (
          <button
            type="button"
            key={review.id}
            onClick={() => onOpenReview(review.productId)}
            aria-label={`Open reviews for ${review.productTitle}`}
            className="dc-glass w-64 flex-shrink-0 snap-center-item rounded-[1.6rem] p-4 text-left shadow-[0_18px_42px_-24px_rgba(79,70,229,0.42)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-22px_rgba(79,70,229,0.5)] active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${review.avatarColor}`}>
                {review.initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm font-semibold text-slate-800">
                  <span className="truncate">{review.name}</span>
                  {review.verifiedPurchase && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                </p>
                <p className="text-[11px] text-slate-400">{review.date}</p>
              </div>
            </div>

            <div className="mt-2 text-xs text-amber-500">
              {"★".repeat(review.rating)}
              <span className="text-slate-200">{"★".repeat(5 - review.rating)}</span>
            </div>

            <p className="mt-2 line-clamp-4 text-[12.5px] leading-relaxed text-slate-600">“{review.comment}”</p>
            <p className="mt-2 truncate text-[11px] font-semibold text-indigo-500">{review.productTitle}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
