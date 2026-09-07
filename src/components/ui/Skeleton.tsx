'use client';

/**
 * Skeleton — the app's single shimmer placeholder primitive (Part 17,
 * loading experience).
 *
 * A plain div wearing the shared `.dc-skeleton` class (defined in
 * src/index.css next to the existing `shimmer` keyframes — it reuses
 * that exact keyframe so the app has one shimmer vocabulary). The tint
 * matches the pack's ~10% white glass token and the moving highlight is
 * the same indigo family used by progress fills/accent pills; the CSS
 * collapses the sweep to a static surface under
 * `prefers-reduced-motion`.
 *
 * Zero layout-shift contract: the element is ALWAYS rendered with the
 * exact width/height/radius of the content it stands in for, and it
 * never brings its own margin — spacing comes from the same grid/flex
 * container the real content lives in, so replacing it with real
 * content moves nothing. Compose it with the same wrapper + classes
 * the real component uses (see ProductCardSkeleton / ContinueLearningSkeleton).
 */

import { cn } from "../../utils/cn";

export interface SkeletonProps {
  /** CSS width — anything `width:` accepts (px, rem, %, fr-safe values). */
  width?: number | string;
  /** CSS height. Defaults to 1em so text-line skeletons inherit font size. */
  height?: number | string;
  /** CSS border-radius; default 0.75rem (12px) matches card-body lines. */
  radius?: number | string;
  className?: string;
  /** ARIA label for assistive tech; defaults to a generic loading label. */
  label?: string;
  style?: React.CSSProperties;
}

const toCssSize = (value: number | string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
};

export default function Skeleton({
  width,
  height = "1em",
  radius = 12,
  className,
  label = "Loading",
  style,
}: SkeletonProps) {
  return (
    <span
      role="status"
      aria-label={label}
      aria-busy="true"
      className={cn("dc-skeleton", className)}
      style={{
        width: toCssSize(width) ?? "100%",
        height: toCssSize(height),
        borderRadius: toCssSize(radius),
        ...style,
      }}
    />
  );
}
