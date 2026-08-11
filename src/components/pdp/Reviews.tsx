import { ThumbsUp, PenLine, BadgeCheck } from "lucide-react";
import { product, reviews } from "../../data/product";
import RatingStars from "./RatingStars";

const breakdown = [
  { star: 5, pct: 78 },
  { star: 4, pct: 15 },
  { star: 3, pct: 4 },
  { star: 2, pct: 2 },
  { star: 1, pct: 1 },
];

export default function Reviews() {
  return (
    <div id="reviews" className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <h2 className="text-xl font-bold text-zinc-900">Ratings & Reviews</h2>
        <button className="flex items-center justify-center gap-2 self-start rounded-full bg-gradient-to-b from-zinc-800 to-black px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:scale-[1.02] sm:self-auto">
          <PenLine className="h-4 w-4" /> Write a Review
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-zinc-50/70 px-8 py-6">
          <span className="text-5xl font-extrabold text-zinc-900">{product.rating}</span>
          <RatingStars rating={product.rating} size="h-5 w-5" />
          <span className="text-xs text-zinc-400">{product.ratingCount.toLocaleString()} reviews</span>
        </div>

        <div className="flex flex-col justify-center gap-2">
          {breakdown.map((b) => (
            <div key={b.star} className="flex items-center gap-3 text-xs text-zinc-500">
              <span className="w-8 shrink-0 font-medium">{b.star} star</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500"
                  style={{ width: `${b.pct}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right">{b.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {reviews.map((r) => (
          <div
            key={r.name}
            className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/40 p-5 transition hover:border-zinc-200 hover:shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-zinc-300 via-zinc-100 to-zinc-400 text-xs font-bold text-zinc-800 shadow">
                {r.initials}
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
                  {r.name}
                  {r.verified && <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />}
                </p>
                <p className="text-[11px] text-zinc-400">{r.date}</p>
              </div>
              <RatingStars rating={r.rating} size="h-3.5 w-3.5" className="ml-auto" />
            </div>
            <p className="text-sm font-semibold text-zinc-800">{r.title}</p>
            <p className="text-sm leading-relaxed text-zinc-500">{r.body}</p>
            <button className="flex w-fit items-center gap-1.5 text-xs font-medium text-zinc-400 transition hover:text-zinc-700">
              <ThumbsUp className="h-3.5 w-3.5" /> Helpful ({r.helpful})
            </button>
          </div>
        ))}
      </div>

      <button className="mx-auto mt-7 block rounded-full border border-zinc-200 px-6 py-2.5 text-sm font-semibold text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900">
        Load more reviews
      </button>
    </div>
  );
}
