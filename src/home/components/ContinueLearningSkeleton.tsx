/**
 * ContinueLearningSkeleton — loading placeholder with the exact
 * geometry of the Continue Learning cards
 * (src/home/components/ContinueLearning.tsx):
 *
 *   section  px-5 pt-6, header row (h2 text-base)
 *   card     dc-card GlassCard, thumbnail h-16 w-16 rounded-xl,
 *            title/author text lines, 1.5 (6px) progress track,
 *            Resume pill (px-4 py-2 text-xs)
 *
 * The section only renders for signed-in learners whose progress
 * snapshot is still in flight; the real cards replace it without any
 * layout shift.
 */

import { GlassCard } from "../../components/ui/GlassCard";
import Skeleton from "../../components/ui/Skeleton";

export function ContinueLearningCardSkeleton() {
  return (
    <GlassCard
      aria-hidden="true"
      className="dc-card w-full text-left [&>div:last-child]:flex [&>div:last-child]:items-center [&>div:last-child]:gap-3"
    >
      {/* Thumbnail — same h-16 w-16 rounded-xl ringed box. */}
      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10">
        <Skeleton width="100%" height="100%" radius={12} />
      </div>

      <div className="min-w-0 flex-1">
        {/* Title — truncate single line. */}
        <Skeleton width="78%" height="0.85rem" radius={6} />
        {/* Author + progress label row. */}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <Skeleton width="46%" height="0.7rem" radius={6} />
          <Skeleton width="18%" height="0.7rem" radius={6} />
        </div>
        {/* Progress track — h-1.5 rounded-full. */}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full border border-white/15">
          <Skeleton width="100%" height="100%" radius={999} />
        </div>
      </div>

      {/* Resume pill — px-4 py-2 text-xs; reserve its exact width. */}
      <Skeleton width="5.5rem" height="2rem" radius={999} className="flex-shrink-0" />
    </GlassCard>
  );
}

export default function ContinueLearningSkeleton({ count = 2 }: { count?: number }) {
  return (
    <section className="px-5 pt-6" aria-busy="true" aria-label="Loading continue learning">
      <div className="flex items-center justify-between">
        <Skeleton width="9.5rem" height="1.25rem" radius={6} />
        <Skeleton width="4rem" height="0.85rem" radius={6} />
      </div>
      <div className="mt-3 space-y-3">
        {Array.from({ length: count }).map((_, index) => (
          <ContinueLearningCardSkeleton key={index} />
        ))}
      </div>
    </section>
  );
}
