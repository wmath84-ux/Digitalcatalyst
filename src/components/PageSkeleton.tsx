// src/components/PageSkeleton.tsx
//
// The app's SHARED page-level skeleton — the "dummy layout" shown the moment
// a learner lands on a page whose real content is still loading. Every app
// page swaps its spinner/"loading…" text for this shell so a route change is
// never blank and never shows a bare spinner: the page's structure (header,
// body cards, footer-dock clearance) paints immediately and the real content
// fades in over it.
//
// The skeleton reuses the ONE Skeleton primitive (src/components/ui/Skeleton.tsx)
// and the app's shimmer keyframe, and it is ONLY a placeholder — callers gate
// it on their own loading flags, so an error state is never masked.
//
// Variants are declarative so each page can mirror its own anatomy without
// shipping a bespoke skeleton:
//
//   · `blocks`  — the body's placeholder rows/cards (width × height × radius).
//   · `header`  — show a site-header strip at the top (default true).
//   · `footer`  — show the header's empty band + the footer dock clearance at
//                 the bottom, matching the real always-visible dock.
//   · `count`   — number of times the body list repeats (default 1).

import type { ReactNode } from "react";
import Skeleton from "./ui/Skeleton";

export interface PageSkeletonBlock {
  /** Any CSS width — px, rem, %, "100%", "80%", … */
  width?: number | string;
  /** Any CSS height — px, rem, …. */
  height?: number | string;
  /** Border radius in px (default 12). */
  radius?: number | string;
}

export interface PageSkeletonProps {
  blocks?: PageSkeletonBlock[];
  header?: boolean;
  footer?: boolean;
  count?: number;
  /** Optional hero art placeholder rendered above the blocks (e.g. a 16:9 banner). */
  hero?: boolean;
  /** ARIA label; defaults to a generic loading label. */
  label?: string;
  className?: string;
}

export default function PageSkeleton({
  blocks = [
    { width: "100%", height: 176 },
    { width: "100%", height: 96 },
    { width: "72%", height: 20 },
    { width: "100%", height: 96 },
    { width: "88%", height: 20 },
  ],
  header = true,
  footer = true,
  count = 1,
  hero = false,
  label = "Loading page",
  className,
}: PageSkeletonProps) {
  const rows: ReactNode[] = [];
  for (let i = 0; i < count; i += 1) {
    rows.push(
      <div key={i} className="space-y-3">
        {hero ? <Skeleton width="100%" height={152} radius={20} /> : null}
        {blocks.map((block, index) => (
          <Skeleton
            key={`${i}-${index}`}
            width={block.width}
            height={block.height}
            radius={block.radius ?? 12}
          />
        ))}
      </div>,
    );
  }

  return (
    <div
      data-page-skeleton=""
      aria-busy="true"
      aria-label={label}
      className={className}
    >
      <div className="space-y-3">
        {header ? (
          <div className="space-y-3">
            {/* Site-header placeholder: an avatar + a title line. */}
            <div className="flex items-center gap-3">
              <Skeleton width={40} height={40} radius={999} />
              <Skeleton width="42%" height={18} radius={6} />
            </div>
            <Skeleton width="82%" height={24} radius={8} />
          </div>
        ) : null}
        {rows}
        {footer ? (
          /* The always-visible footer dock's reserved band + capsule, so the
             page clears the dock exactly like the real layout does. */
          <div className="pt-4" aria-hidden="true">
            <div className="mx-auto w-max max-w-full">
              <Skeleton width={296} height={64} radius={999} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
