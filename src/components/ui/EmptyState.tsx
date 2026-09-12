// src/components/ui/EmptyState.tsx
//
// The shared empty / no-content card. Home (category empty), the Store
// (search + filter empty) and My Purchases (nothing owned yet) all render
// their roadblock copy through this one component, so the three screens wear
// the same glassmorphism material and typography instead of hand-rolling a
// different container each.
//
// Layout + type come from the app's design-system classes (`.dc-empty`,
// `.dc-empty-art`, `.dc-empty-title`, `.dc-empty-body` — src/index.css); the
// light-glacier glass material comes from the `.dc-empty-glass` hook
// (src/empty-state-glass.css). Copy inside keeps the `.dc-scene-ink` dark
// scrim — same practice as the store's copy over its light-blue lens.
//
// Content is passed in, never invented here: `title` / `body` / `action` are
// the caller's exact words and CTA, so screens keep their own copy.
import type { ReactNode } from "react";
import { GlassCard } from "./GlassCard";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
  contentClassName,
}: {
  /** Decorative glyph inside the `.dc-empty-art` tile (e.g. a 7×7 icon). */
  icon?: ReactNode;
  /** The headline — the caller's exact copy. */
  title: ReactNode;
  /** Optional explanation line under the title. */
  body?: ReactNode;
  /** Optional escape hatch (e.g. a "Show all resources" button). */
  action?: ReactNode;
  /** Outer placement (margins/width) — the caller owns the page rhythm. */
  className?: string;
  /** Extra classes for the content box (rare; `.dc-empty` is already applied). */
  contentClassName?: string;
}) {
  return (
    <GlassCard
      /* Same light-blue lens family as the store's cards; the softer frost,
         tint and rim numbers live in `.dc-empty-glass` (empty-state-glass.css). */
      tint={0.62}
      tintColor="173,216,255"
      blur={0}
      className={cn("dc-empty-glass", className)}
      contentClassName={cn("dc-empty dc-scene-ink", contentClassName)}
    >
      {icon ? (
        <span className="dc-empty-art" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className="dc-empty-title">{title}</p>
      {body ? <p className="dc-empty-body">{body}</p> : null}
      {action}
    </GlassCard>
  );
}
