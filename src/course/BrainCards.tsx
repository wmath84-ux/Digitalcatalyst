// src/course/BrainCards.tsx
//
// The Course Player's Brain practice surfaces, in the SOLID card language of
// the reference deck the owner picked:
//
//     https://aicanvas.me/components/product-card-deck
//
// The reference is a draggable stack of cards: a rounded-22 card painted
// #D3DDEE, dark #111111 ink on it, ONE dark pill call-to-action
// (#141312 / #F5F1E8) with its own hover and press springs, a heavier drop
// shadow on the top card than on the ones behind, and a dark page (#1A1A19)
// or a light one (#E8E8DF) under the whole thing.
//
// Owner brief, 2026-10-03:
//
//   "Glass design bilkul use nahi karna hai. Reference jaisa actual card
//    design use karna hai."
//
// So every surface below is painted with the reference's own palette and
// nothing here uses a backdrop filter, a glass lens or a translucent frost —
// the Brain page no longer borrows the revision page's glass (GlassSurface /
// GlassTile / GlassButton). The deck itself lives next door
// (src/course/BrainQuestionDeck.tsx); these are the pieces it and the other
// Brain screens (library, review, result, answers, submit dialog) share, so
// the whole practice flow reads as one deck of cards.

import { motion } from "framer-motion";
import type { ComponentProps, CSSProperties, HTMLAttributes, ReactNode } from "react";

/** The reference deck's own palette — the exact values its source uses. */
export const BRAIN = {
  /** The card face (reference: `backgroundColor: '#D3DDEE'`). */
  card: "#D3DDEE",
  /** The card ink (reference title colour). */
  ink: "#111111",
  /** Secondary ink on the card — the reference's own colour, softened. */
  inkSoft: "rgba(17, 17, 17, 0.68)",
  inkFaint: "rgba(17, 17, 17, 0.46)",
  /** The pill (reference: `backgroundColor: '#141312'`, `color: '#F5F1E8'`). */
  pill: "#141312",
  pillHover: "#2C2825",
  pillPress: "#000000",
  pillInk: "#F5F1E8",
  /** The light face the reference uses as its pill's TEXT — here, a plate. */
  plate: "#F5F1E8",
  /** The reference's light page / dark page. */
  page: "#E8E8DF",
  pageInk: "#666662",
  /** The reference's hint line, dark mode. */
  hint: "#9E9E98",
  line: "rgba(17, 17, 17, 0.14)",
  /** The reference's two shadows, verbatim. */
  shadowTop: "0 30px 60px rgba(0,0,0,0.30), 0 10px 20px rgba(0,0,0,0.20)",
  shadowRest: "0 14px 30px rgba(0,0,0,0.18)",
  /** The reference card's radius. */
  radius: 22,
  /** The reference pill's press/release spring. */
  spring: { type: "spring", stiffness: 500, damping: 30 } as const,
} as const;

/** Solid tones for the difficulty / result badges (no glass tints). */
const BADGE_TONES: Record<string, { background: string; color: string }> = {
  easy: { background: "#1F7A54", color: BRAIN.pillInk },
  medium: { background: "#9A6400", color: BRAIN.pillInk },
  hard: { background: "#B23A48", color: BRAIN.pillInk },
  correct: { background: "#1F7A54", color: BRAIN.pillInk },
  wrong: { background: "#B23A48", color: BRAIN.pillInk },
  skipped: { background: "rgba(17, 17, 17, 0.16)", color: BRAIN.ink },
};

export type BrainSurfaceTone = "card" | "plate" | "dark";

/**
 * One solid card face: the reference's rounded-22 #D3DDEE card (or its warm
 * #F5F1E8 plate, or the dark pill's surface for the score card). No blur, no
 * frost, no lens — a flat surface and one shadow, heavier when it is the card
 * in front (`shadow="top"`).
 */
export function BrainSurface({
  tone = "card",
  shadow = "rest",
  className = "",
  style,
  children,
  ...rest
}: {
  tone?: BrainSurfaceTone;
  shadow?: "top" | "rest" | "none";
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  const background = tone === "dark" ? BRAIN.pill : tone === "plate" ? BRAIN.plate : BRAIN.card;
  const color = tone === "dark" ? BRAIN.pillInk : BRAIN.ink;
  return (
    <div
      {...rest}
      className={className}
      style={{
        background,
        color,
        borderRadius: BRAIN.radius,
        boxShadow: shadow === "top" ? BRAIN.shadowTop : shadow === "rest" ? BRAIN.shadowRest : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The reference's pill button, exactly: `#141312` on `#F5F1E8`, hover
 * (scale 1.06 + the lighter #2C2825), press (scale 0.93 + black), and the
 * 500/30 spring between them. `tone="light"` flips the two colours for a pill
 * that sits on a dark bar; `tone="outline"` is the quiet one for a light card.
 */
export function BrainPill({
  children,
  onClick,
  disabled = false,
  tone = "dark",
  className = "",
  style,
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "dark" | "light" | "outline";
  className?: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLButtonElement>, "onClick" | "style" | "className" | "children">) {
  /* `motion.button`'s own prop types are wider than React's for the animation
     callbacks, so the plain button attributes are handed over as a whole. */
  const motionProps = rest as ComponentProps<typeof motion.button>;
  /* Longhands only (`backgroundColor`, never the `background` shorthand): the
     hover / press states below animate `backgroundColor`, and a React-set
     shorthand would repaint straight over the animation. */
  const base =
    tone === "light"
      ? { backgroundColor: BRAIN.pillInk, color: BRAIN.pill }
      : tone === "outline"
        ? { backgroundColor: "transparent", color: BRAIN.ink, border: `1px solid ${BRAIN.line}` }
        : { backgroundColor: BRAIN.pill, color: BRAIN.pillInk };
  const hover =
    tone === "light"
      ? { scale: 1.06, backgroundColor: "#FFFFFF" }
      : tone === "outline"
        ? { scale: 1.06, backgroundColor: "rgba(17, 17, 17, 0.07)" }
        : { scale: 1.06, backgroundColor: BRAIN.pillHover };
  const tap =
    tone === "light"
      ? { scale: 0.93, backgroundColor: "#E4E9F2" }
      : tone === "outline"
        ? { scale: 0.93, backgroundColor: "rgba(17, 17, 17, 0.12)" }
        : { scale: 0.93, backgroundColor: BRAIN.pillPress };
  return (
    <motion.button
      {...motionProps}
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : hover}
      whileTap={disabled ? undefined : tap}
      transition={BRAIN.spring}
      className={className}
      style={{
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 9999,
        padding: "8px 16px",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.01em",
        opacity: disabled ? 0.5 : 1,
        ...base,
        ...style,
      }}
    >
      {children}
    </motion.button>
  );
}

/**
 * The small circular counter of the practice card's top-right corner:
 * `3/10`, on the reference's dark pill surface.
 */
export function BrainCounter({
  value,
  total,
  size,
  style,
}: {
  value: number;
  total: number;
  size: number;
  style?: CSSProperties;
}) {
  return (
    <span
      data-brain-counter=""
      aria-label={`Question ${value} of ${total}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 9999,
        background: BRAIN.pill,
        color: BRAIN.pillInk,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
        fontSize: Math.max(9, size * 0.29),
        letterSpacing: "-0.02em",
        ...style,
      }}
    >
      {value}/{total}
    </span>
  );
}

/** A solid difficulty / result badge — the reference palette, no glass tint. */
export function BrainBadge({ tone, children }: { tone?: string; children: ReactNode }) {
  const paint = BADGE_TONES[tone ?? ""] ?? { background: "rgba(17, 17, 17, 0.16)", color: BRAIN.ink };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 9999,
        padding: "3px 10px",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "capitalize",
        ...paint,
      }}
    >
      {children}
    </span>
  );
}

/** A solid progress bar, drawn for the light card (no glass rim). */
export function BrainProgress({ value, height = 8, style }: { value: number; height?: number; style?: CSSProperties }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      style={{
        height,
        width: "100%",
        borderRadius: 9999,
        background: "rgba(17, 17, 17, 0.14)",
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${clamped}%`,
          borderRadius: 9999,
          background: BRAIN.pill,
          transition: "width 300ms ease",
        }}
      />
    </div>
  );
}
