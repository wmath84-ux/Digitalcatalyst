/**
 * ProductCardSkeleton — loading placeholder with the EXACT geometry of
 * ProductCard (src/home/components/ProductCard.tsx), so swapping the
 * skeleton grid for the real card grid causes zero layout shift:
 *
 *   - same GlassSurface material (dc-scene-plate · radius 24 · tint 0.25 ·
 *     blur 0), same `flex flex-col` body
 *   - same aspect-[4/3] artwork block
 *   - same `p-3` text block, same line counts/heights:
 *       title  — line-clamp-2 min-h-[2.5rem] at text-[13px]
 *       author — text-[11px] line
 *       rating — text-[11px] line
 *       price  — two-line row
 *
 * The placeholder is purely decorative; the parent grid sets
 * aria-busy so screen readers announce the section as loading.
 */

import { GlassSurface } from "../../components/ui/glass";
import Skeleton from "../../components/ui/Skeleton";

export default function ProductCardSkeleton() {
  return (
    <GlassSurface
      radius={24}
      tint={0.25}
      blur={0}
      aria-hidden="true"
      className="dc-scene-plate relative overflow-hidden text-white"
      contentClassName="flex flex-col"
    >
      {/* Artwork — same aspect box as the real <img>. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <Skeleton width="100%" height="100%" radius={0} />
      </div>

      {/* Copy block — same padding + gaps as ProductCard. */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        {/* Title reserve: the real <h4> is line-clamp-2 with
            min-h-[2.5rem]; a single block of that height keeps the
            card's total height identical while the two text lines are
            suggested by two inset bars. */}
        <div className="flex min-h-[2.5rem] flex-col justify-center gap-1.5">
          <Skeleton width="92%" height="0.72rem" radius={6} />
          <Skeleton width="68%" height="0.72rem" radius={6} />
        </div>
        {/* Author line. */}
        <Skeleton width="62%" height="0.7rem" radius={6} />
        {/* Rating line. */}
        <Skeleton width="48%" height="0.7rem" radius={6} />
        {/* Price row. */}
        <div className="mt-1.5 flex items-center justify-between">
          <Skeleton width="42%" height="0.95rem" radius={6} />
          <Skeleton width="26%" height="0.7rem" radius={6} />
        </div>
      </div>
    </GlassSurface>
  );
}
