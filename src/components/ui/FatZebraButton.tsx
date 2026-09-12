import { type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import "./fat-zebra.css";

/**
 * FatZebraButton — a faithful React port of Marcelo Dolza's "fat-zebra-11"
 * Uiverse button (https://uiverse.io/marcelodolza/fat-zebra-11).
 *
 * This is a SELECTED action-button treatment, not a global button. It is only
 * used on the primary "send / create" actions where the tactile, neutral
 * send-button design genuinely fits:
 *   · User Query reply composer — "Send reply"
 *   · AI Revision Generator — "Generate revision plan"
 *
 * The material is opaque and neutral (the reference's #f7f8f7 → #e7e7e7 face
 * with the #ff5569 accent), with no backdrop-filter — deliberately NOT glass.
 *
 * Labels are split into per-letter spans to reproduce the reference's
 * slide-down entrance and hover "wave" (each letter flashes the coral accent),
 * but the visible text is never changed: pass the real label as `label` and
 * the real icon as `icon`. All native behaviour (onClick, disabled, type,
 * aria-*) is forwarded untouched.
 */

export type FatZebraSize = "sm" | "md" | "lg";

export interface FatZebraButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visible button text. Spaces are preserved. */
  label: string;
  /** Optional icon rendered in the reference's left icon slot. */
  icon?: ReactNode;
  /** lg = reference scale (18px). md = 16px. sm = 13px. Defaults to md. */
  size?: FatZebraSize;
  /** Enables the paper-plane behaviours (land on mount, tilt on hover). */
  plane?: boolean;
}

const FONT_SIZES: Record<FatZebraSize, number> = { sm: 13, md: 16, lg: 18 };

export function FatZebraButton({
  label,
  icon,
  size = "md",
  plane = false,
  className,
  style,
  type = "button",
  children: _children,
  ...props
}: FatZebraButtonProps) {
  const letters = Array.from(label).map((char, index) => (
    <span
      key={index}
      aria-hidden="true"
      className="uz-letter"
      style={{ "--i": index } as CSSProperties}
    >
      {char === " " ? "\u00A0" : char}
    </span>
  ));

  return (
    <button
      {...props}
      type={type}
      data-plane={plane ? "true" : undefined}
      className={
        `uiverse-fat-zebra focus-visible:ring-2 focus-visible:ring-[#ff5569] ${className ?? ""}`.trim()
      }
      style={{ fontSize: FONT_SIZES[size], ...style }}
    >
      <span className="uz-outline" aria-hidden="true" />
      <span className="uz-state">
        {icon ? (
          <span className="uz-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="uz-label">{letters}</span>
      </span>
      {/* The per-letter spans are aria-hidden, so expose the full label once. */}
      <span className="sr-only">{label}</span>
    </button>
  );
}

export default FatZebraButton;
