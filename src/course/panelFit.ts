// src/course/panelFit.ts
//
// ONE fit model for the Course Player's two self-sizing surfaces — the Brain
// practice page (src/course/CourseBrainPanel.tsx) and the glass music player
// (src/course/AudioPlayer.tsx).
//
// Owner brief, 2026-09-28:
//
//   "Course player ke andar jo Brain page ka design hai, itna flexible banao
//    ki vah screen size / jaise area ke according question, option aur jo bhi
//    button hai sab kuchh properly visible ho jaaye … jaise course player ke
//    andar flexible design hai ki split mode mein ham donon hisson ko jitna
//    man kahe utna khinchkar upar niche kar sakte hain, to uske according yah
//    Brain page utna hi flexible ho, vah size ke according acche se properly
//    visible ho … aur isi tarah module mein jo music player hai uska bhi
//    design utna hi flexible banao taki vah apne area mein jitna bhi ho uske
//    according vah acche se dikhe pura bina cut hue."
//
// Both surfaces live inside the player's Split Deck, where the learner drags
// the divider and the pane becomes ANY size on ANY screen. A design sized from
// the VIEWPORT (which is what the Brain page's `@media` ladder did, and what
// the music player's fixed 320 px card did) is simply wrong in there: the same
// 1400 px desktop can hand a pane 520 px or 240 px, and the phone in portrait
// hands the lesson pane ~440 px of height while landscape hands it ~310 px.
//
// So each surface measures ITS OWN box and publishes ONE scale, and every
// metric of the design is written as `calc(<the design's px> * var(--…))`:
//
//   · Brain  — `--brain-scale` on the panel root. WIDTH may grow the design
//     (up to the 1.24 the viewport ladder used to stop at) and a SHORT pane
//     shrinks it, down to a legibility floor where the 56 px answer tiles are
//     still above a 44 px touch target. Nothing else changes: the design is
//     the revision test-taking page at 1× and stays proportional at every
//     other size.
//   · Audio  — `--audio-scale` on the stage. The whole glass card is one
//     artwork (320 px wide, ~490 px tall, disc + transport included), so it is
//     scaled as one piece to the box the stage actually has, never past its
//     reference size by more than a fifth, and never so small that the 52 px
//     play button stops being a control.
//
// The scale is a pure function of the box — `brainFitScale` / `audioFitScale`
// below, pinned by tests — and `useFitTarget` is the ONE way an element gets
// measured and re-measured (its own resize, plus the window's). It publishes
// synchronously when the element attaches, so the first paint already wears
// the right size and nothing pops in a frame later.

import { useCallback, useEffect, useRef } from "react";

/* ── Brain ──────────────────────────────────────────────────────────────── */

/**
 * The height the question screen needs at scale 1: the top row + the card + the
 * review screen's docked bar. A pane with less than this shrinks the design
 * instead of cutting the question off.
 */
export const BRAIN_FIT_REFERENCE_HEIGHT = 620;
/**
 * Legibility + touch floor: at 0.8 the panel's own type (11–19 px) lands at
 * 8.8–15.2 px, and the deck's cards fit themselves inside the box this scale
 * leaves them (BrainQuestionDeck scales the card's content down, never below
 * its own 0.62 floor, and scrolls after that). Below this the pane simply
 * scrolls.
 */
export const BRAIN_FIT_FLOOR = 0.8;
/** The cap the viewport ladder used to reach at 1200 px — kept, as the width cap. */
export const BRAIN_FIT_CEIL = 1.24;
/** The width the practice design was drawn for — the reference's own phone. */
export const BRAIN_FIT_PHONE_WIDTH = 320;
/** A pane narrower than this keeps the phone design exactly (its home size). */
export const BRAIN_FIT_GROW_FROM = 560;
/** …and this is where the design reaches its cap. */
export const BRAIN_FIT_GROW_TO = 1200;

/**
 * Quantise a scale to a thousandth — and always DOWNWARD, so the fitted size
 * can never end up a hair bigger than the box it was solved for (a rounded-up
 * 0.633 on a 490 px card is 310.17 px in a 310 px stage, and a scrollbar is
 * exactly the "cut" this work exists to remove).
 */
const quantize = (value: number) => Math.floor(value * 1000) / 1000;

/**
 * The Brain design's scale for the box it has been given, in px.
 *
 * Two independent limits, and the smaller one wins:
 *
 *   · WIDTH — 320 to 560 → 1 (the revision page itself). Wider than 560 it
 *     grows smoothly to the 1.24 cap at 1200: that is the ladder the viewport
 *     media queries used to climb, now keyed to the PANE the design actually
 *     sits in, so a wide pane reads like a tablet while the same design in a
 *     narrow split column still reads like a phone. NARROWER than 320 — a
 *     divider dragged hard towards the study side — it shrinks with the pane
 *     (floor), so the question and its options still fit ACROSS;
 *   · HEIGHT — the room the question screen needs (620 px at 1×). Less room
 *     shrinks the design, never below the floor; more room never grows it on
 *     its own (width is what makes it big).
 *
 * A missing / zero measurement returns 1: the design's own size, exactly what
 * the panel renders before its first measurement.
 */
export function brainFitScale(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  const byWidth =
    width <= BRAIN_FIT_GROW_FROM
      ? Math.min(1, Math.max(BRAIN_FIT_FLOOR, width / BRAIN_FIT_PHONE_WIDTH))
      : Math.min(
          BRAIN_FIT_CEIL,
          1 + ((width - BRAIN_FIT_GROW_FROM) / (BRAIN_FIT_GROW_TO - BRAIN_FIT_GROW_FROM)) * (BRAIN_FIT_CEIL - 1),
        );
  const byHeight = Math.min(BRAIN_FIT_CEIL, Math.max(BRAIN_FIT_FLOOR, height / BRAIN_FIT_REFERENCE_HEIGHT));
  return quantize(Math.min(byWidth, byHeight));
}

/* ── The Brain practice deck (the Product Card Deck port) ───────────────── */

/**
 * The deck the Brain question screen is built on is the AI Canvas
 * "Product Card Deck" (https://aicanvas.me/components/product-card-deck),
 * whose stage is `clamp(220px, 72vw, 300px)` wide and 56 px taller than it is
 * wide. Those three numbers are kept — as the reference width, the reference
 * extra height (its caption strip) and the 72% of the box the card is allowed
 * to take — so the deck reads like the reference at every pane size while
 * still being solved from the PANE, not the viewport (the learner drags the
 * Split Deck divider; see the header of this file).
 */
export const BRAIN_DECK_REFERENCE_WIDTH = 300;
/** `SLOT_Y[3]` of the reference deck — how far the deepest card peeks out. */
export const BRAIN_DECK_STACK_PEEK = 36;
/** The hint line under the deck ("tap an answer … flick the card away"). */
export const BRAIN_DECK_HINT_HEIGHT = 26;
/** The deck's breathing room inside the pane (its own padding + the shadow). */
export const BRAIN_DECK_GUTTER = 28;
/** Below this the card stops being readable; the pane scrolls instead. */
export const BRAIN_DECK_MIN_WIDTH = 200;
/** A big pane may enlarge the card — but it stays a card, never a poster. */
export const BRAIN_DECK_MAX_WIDTH = 360;
/** …and never taller than this before its content is scaled to fit. */
export const BRAIN_DECK_MAX_HEIGHT = 560;
/** The reference silhouette: the card is this much taller than it is wide. */
export const BRAIN_DECK_EXTRA_HEIGHT = 56;
/** The absolute floor under a card's height (a pane shorter than a card). */
export const BRAIN_DECK_MIN_CONTENT_HEIGHT = 180;

/**
 * The card box for the pane the deck has been given.
 *
 * There is deliberately no third dimension: the reference card is a square
 * plus a 56 px strip, and a practice card that has to hold a long question and
 * six options grows downwards at runtime (the card measures its own content;
 * see src/course/BrainQuestionDeck.tsx). What this function decides is the box
 * the deck is DRAWN in — 72% of the pane's width like the reference's `72vw`,
 * never wider than the reference cap, never taller than the pane can hold
 * (with the stack's peek and the hint line reserved), and never so small that
 * an option stops being a touch target. It is a pure function of the box, and
 * an unmeasured box returns the reference card exactly.
 */
export function brainDeckSize(width: number, height: number): { width: number; height: number } {
  const reference = { width: BRAIN_DECK_REFERENCE_WIDTH, height: BRAIN_DECK_REFERENCE_WIDTH + BRAIN_DECK_EXTRA_HEIGHT };
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return reference;
  const availableWidth = Math.max(BRAIN_DECK_MIN_WIDTH, width - BRAIN_DECK_GUTTER);
  const availableHeight = Math.max(
    BRAIN_DECK_EXTRA_HEIGHT + 100,
    height - BRAIN_DECK_GUTTER - BRAIN_DECK_HINT_HEIGHT - BRAIN_DECK_STACK_PEEK,
  );
  const maxWidth = Math.min(BRAIN_DECK_MAX_WIDTH, availableWidth);
  const maxHeight = Math.min(BRAIN_DECK_MAX_HEIGHT, availableHeight);
  // WIDTH comes from the pane's width (the reference's own 72%), and a pane too
  // short to afford the reference silhouette takes it out of the HEIGHT instead
  // — a wide-but-short pane gets a short card, never a postage stamp. (The
  // question and its answers re-fit inside whatever box this returns; see
  // src/course/BrainQuestionDeck.tsx.)
  const cardWidth = Math.max(BRAIN_DECK_MIN_WIDTH, Math.min(width * 0.72, maxWidth));
  const cardHeight = Math.max(1, Math.min(cardWidth + BRAIN_DECK_EXTRA_HEIGHT, maxHeight));
  return { width: Math.round(cardWidth), height: Math.round(cardHeight) };
}

/* ── The glass music player ─────────────────────────────────────────────── */

/** The reference card's width — the AI Canvas design's own 320 px. */
export const AUDIO_CARD_WIDTH = 320;
/** Its height before the mounted card has been measured (see `--audio-card-h`). */
export const AUDIO_CARD_HEIGHT = 490;
/** Below this the card would stop being usable, so the stage scrolls instead. */
export const AUDIO_FIT_FLOOR = 0.55;
/** A big stage may enlarge the card, but only a fifth: it stays a card. */
export const AUDIO_FIT_CEIL = 1.2;

/**
 * The scale that fits the whole card — disc, transport and all — inside the
 * box the stage has. Never past the cap, never below the floor; a missing
 * measurement returns 1 (the reference card).
 */
export function audioFitScale(
  width: number,
  height: number,
  cardWidth: number = AUDIO_CARD_WIDTH,
  cardHeight: number = AUDIO_CARD_HEIGHT,
): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  const fit = Math.min(width / cardWidth, height / cardHeight, AUDIO_FIT_CEIL);
  return quantize(Math.max(AUDIO_FIT_FLOOR, fit));
}

/** The px a box gives away to its own padding (computed style, jsdom-safe). */
export function paddingOf(el: HTMLElement): { x: number; y: number } {
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") return { x: 0, y: 0 };
  const style = window.getComputedStyle(el);
  const px = (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    x: px(style.paddingLeft) + px(style.paddingRight),
    y: px(style.paddingTop) + px(style.paddingBottom),
  };
}

/**
 * Write a custom property, but only when it says something new. Both surfaces
 * are re-solved from a ResizeObserver — i.e. once per frame while the Split
 * Deck divider is being dragged — and a custom property write invalidates the
 * style of the whole subtree it lives on whether or not the text changed, so
 * the unchanged frames are skipped instead.
 */
export function publishVar(el: HTMLElement, name: string, value: string): void {
  if (el.style.getPropertyValue(name) === value) return;
  el.style.setProperty(name, value);
}

/* ── The one measuring hook ─────────────────────────────────────────────── */

/**
 * Hands back a ref callback that keeps `publish` fed with the element it lands
 * on: immediately on attach (before the browser paints, so the first paint is
 * already the fitted one), then on that element's own resize (ResizeObserver —
 * this is the signal the Split Deck divider drag produces) and on the window's
 * resize / rotation.
 *
 * `publish` is read from a ref, so the callback identity never changes and the
 * element is never detached/re-attached by a re-render. No state, no
 * re-render: the surfaces write their own custom property and let CSS do the
 * rest (the same pattern as src/utils/footerNavSpace.ts).
 */
export function useFitTarget(publish: (node: HTMLElement | null) => void) {
  const publishRef = useRef(publish);
  publishRef.current = publish;
  const nodeRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const attach = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    nodeRef.current = node;
    if (!node) return;
    publishRef.current(node);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => publishRef.current(nodeRef.current));
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(() => {
    const remeasure = () => publishRef.current(nodeRef.current);
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("orientationchange", remeasure);
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  return attach;
}
