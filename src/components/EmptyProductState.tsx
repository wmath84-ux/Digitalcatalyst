import type { ReactNode, SVGProps } from "react";
import { GlassCard } from "./ui/GlassCard";

/**
 * The product marketplace's one empty state.
 *
 * Owner brief 2026-09-11: the Home category rail used to end on a bare line of
 * text — "No products in this category yet" — which read like a console error
 * sitting under a polished glass grid. This component is the answer for EVERY
 * place a product collection can come back empty after filtering: Home
 * (category + filter + search), the Store, and My Purchases.
 *
 * It is deliberately NOT a bigger sentence in a box. The anatomy is the same one
 * the store already taught its users (`.dc-empty*` in src/index.css — the
 * `dc-empty` layout, the accent medallion, the two ink steps), lifted onto the
 * pack `GlassCard` so it carries the app's shared frost + rim, plus one
 * optional escape hatch:
 *
 *   · a compact glyph medallion  — geometric, restrained, never an emoji and
 *     never an illustration that eats a third of the viewport
 *   · a short heading           — `.dc-empty-title`
 *   · one supporting line       — `.dc-empty-body`, capped at 22rem so it stays
 *     a caption instead of a paragraph
 *   · an optional action row    — `.dc-empty-action` (primary) and its ghost
 *     variant, both on `--dc-filter-radius`, the same controlled corner the
 *     whole filter hierarchy uses
 *
 * Sizing: the card caps itself at `--dc-empty-max-width` and centres, so on a
 * 27" display it stays a composed card rather than a full-bleed banner, and on
 * a 320px phone it still fits inside the section gutter without overflow.
 */

/** The empty-product glyph: a shelf with the product slot left open. */
export function EmptyShelfIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* the two open flaps of an empty product tile */}
      <path d="M4 9.5 12 5l8 4.5" />
      {/* the plate it would sit on */}
      <path d="M4 9.5v5.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9.5" />
      {/* the missing item, drawn as a dashed placeholder */}
      <path d="M8.5 13.25h7" strokeDasharray="2.6 2.6" opacity={0.65} />
      <path d="M5 21h14" opacity={0.45} />
    </svg>
  );
}

export type EmptyProductStateProps = {
  /** The plate's heading. Defaults to the product-listing copy. */
  heading?: string;
  /** One supporting line — keep it a sentence, not a paragraph. */
  message?: string;
  /** Overrides the default shelf glyph (e.g. `BagIcon` on My Purchases). */
  icon?: ReactNode;
  /** Primary escape hatch, e.g. "Clear filters". Rendered only with a handler. */
  actionLabel?: string;
  onAction?: () => void;
  /** Quieter secondary action, e.g. "Browse the store". */
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
  /** Page gutter / rhythm hooks live with the caller. */
  className?: string;
};

export default function EmptyProductState({
  heading = "No products found",
  message = "Nothing matches the selected filter right now.",
  icon,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
  className = "",
}: EmptyProductStateProps) {
  const hasActions = Boolean(actionLabel && onAction) || Boolean(secondaryLabel && onSecondaryAction);

  return (
    /* `role="status"`: an empty result is a response to something the user did,
       so it is announced politely instead of replacing the page in silence. */
    <GlassCard
      role="status"
      className={`dc-empty-card${className ? ` ${className}` : ""}`}
      contentClassName="dc-empty"
    >
      <span className="dc-empty-art" aria-hidden="true">
        {icon ?? <EmptyShelfIcon className="h-6 w-6" />}
      </span>
      <p className="dc-empty-title">{heading}</p>
      {message ? <p className="dc-empty-body">{message}</p> : null}
      {hasActions ? (
        <span className="dc-empty-actions">
          {actionLabel && onAction ? (
            <button type="button" onClick={onAction} className="dc-empty-action dc-focusable">
              {actionLabel}
            </button>
          ) : null}
          {secondaryLabel && onSecondaryAction ? (
            <button type="button" onClick={onSecondaryAction} className="dc-empty-action dc-empty-action--ghost dc-focusable">
              {secondaryLabel}
            </button>
          ) : null}
        </span>
      ) : null}
    </GlassCard>
  );
}
