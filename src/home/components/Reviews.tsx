import type { Review } from "../types";

interface ReviewsProps {
  reviews: Review[];
}

export default function Reviews({ reviews }: ReviewsProps) {
  return (
    <section className="mt-7 pb-4">
      <div className="flex items-center justify-between px-5">
        <h2 className="text-base font-bold text-slate-900">Loved by Learners</h2>
        <span className="text-xs font-semibold text-slate-400">4.8 ★ average</span>
      </div>

      <div className="mt-3 flex gap-3 overflow-x-auto px-5 pb-2 no-scrollbar snap-x-mandatory">
        {reviews.map((review) => (
          <article
            key={review.id}
            className="w-64 flex-shrink-0 snap-center-item rounded-2xl bg-white p-4 shadow-sm shadow-slate-200 ring-1 ring-slate-100"
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${review.avatarColor}`}
              >
                {review.initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{review.name}</p>
                <p className="text-[11px] text-slate-400">{review.date}</p>
              </div>
            </div>

            <div className="mt-2 text-xs text-amber-500">
              {"★".repeat(review.rating)}
              <span className="text-slate-200">{"★".repeat(5 - review.rating)}</span>
            </div>

            <p className="mt-2 line-clamp-4 text-[12.5px] leading-relaxed text-slate-600">
              “{review.comment}”
            </p>

            <p className="mt-2 truncate text-[11px] font-semibold text-indigo-500">
              {review.course}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
