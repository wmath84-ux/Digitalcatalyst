// src/course/BrainQuestionDeck.tsx
//
// The Course Player's Brain practice card — the AI Canvas "Product Card Deck",
// ported to the question screen (the owner's reference, 2026-10-03):
//
//     https://aicanvas.me/components/product-card-deck
//
// WHAT IS THE REFERENCE, EXACTLY (its own source, read line by line):
//
//   · a stack of FOUR slots, resting at y = [0, 12, 24, 36], scale =
//     [1, 0.95, 0.9, 0.86], opacity = [1, 1, 0.92, 0.82], zIndex = 100 - slot —
//     a straight stack with no resting rotation;
//   · every card owns its OWN motion values (x, y, scale, opacity), which is
//     what lets the top card drag freely while the others sit in their slots
//     with no visual hand-off when the deck advances — the card behind becomes
//     the same element at slot 0 and springs up (stiffness 300, damping 30);
//   · `rotate = useTransform(x, [-200, 200], [-18, 18], { clamp: true })` — the
//     top card leans into the horizontal drag, capped at ±18°;
//   · the top card is FREE to drag (no axis, no constraints), with
//     `touchAction: none` so a flick never scrolls the page;
//   · release: speed = hypot(velocity) and dist = hypot(offset). speed > 500
//     OR dist > 130 is a FLICK; otherwise the card springs back to slot 0. A
//     slow-but-far drag falls back to `offset * 9`, so the card still flies
//     the way it was pushed;
//   · fly-off: the released card leaves in the direction of the release
//     velocity — normalized velocity × 1500, opacity → 0 over 0.45 s, scale →
//     0.85 over 0.5 s, then `safeToRemove()`; because rotate follows x, it
//     spins toward its clamp as it goes. `AnimatePresence` + `usePresence`
//     drive that manual exit;
//   · the pill CTA inside the card carries the hover (scale 1.06 + lighter) and
//     press (scale 0.93 + black) springs.
//
// WHAT CHANGED, AND WHY (the owner's brief):
//
//   · the cards ARE the practice questions: the card's "picture" area is the
//     question, its "caption strip" is the answer stack. The question and its
//     options are the whole card — there is NO pill CTA, and no Previous /
//     Next / Skip button anywhere on it. The only controls are the answers;
//   · tapping an answer records it and the card then flicks ITSELF away
//     (a short hold so the learner sees the choice light up) — no button to
//     press, no Next step;
//   · a flick in ANY direction — left, right, up, down, diagonal — skips the
//     question: the card sails off the way it was thrown and the next question
//     rises into the top slot;
//   · the deck DRAINS instead of looping (a catalogue repeats, a test set
//     ends): the card behind rises, no fresh card arrives at the back, and
//     when the last card has flown the deck reports `onEmpty` so the practice
//     continues into its review / submit / result flow;
//   · a small round counter sits in the card's top-right corner (`3/10`) and
//     the question reserves exactly that much room, so nothing overlaps what
//     the learner is reading;
//   · the card is light (#D3DDEE) with dark ink, on the reference's own
//     palette — the glass of the revision page is gone (see BrainCards.tsx).
//
// The deck is solved from the PANE, not the viewport (the learner drags the
// Split Deck divider — see src/course/panelFit.ts), and a card that holds a
// long question with six options grows downwards, up to the pane's own height,
// before its content is scaled to fit.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  usePresence,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { BRAIN, BrainCounter } from "./BrainCards";
import {
  BRAIN_DECK_GUTTER,
  BRAIN_DECK_HINT_HEIGHT,
  BRAIN_DECK_MAX_HEIGHT,
  BRAIN_DECK_MIN_CONTENT_HEIGHT,
  BRAIN_DECK_REFERENCE_WIDTH,
  BRAIN_DECK_STACK_PEEK,
  brainDeckSize,
} from "./panelFit";

/* ── The reference deck's own geometry, verbatim ─────────────────────────── */

const VISIBLE = 4;
const SLOT_COUNT = 4;
const SLOT_Y = [0, 12, 24, 36];
const SLOT_SCALE = [1, 0.95, 0.9, 0.86];
const SLOT_OPACITY = [1, 1, 0.92, 0.82];
const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const;

/** The reference's flick test: speed > 500 px/s OR distance > 130 px. */
const FLICK_SPEED = 500;
const FLICK_DISTANCE = 130;
/** Slower than this but far enough, the offset itself picks the direction. */
const SLOW_FLICK_SPEED = 220;
/** The reference's fly-off distance (normalized velocity × 1500). */
const FLY_DISTANCE = 1500;
/** Movement above this on an answer is a card drag, never a tap. */
const TAP_SLOP = 8;
/** How long the chosen answer stays lit before the card flicks itself away. */
const ANSWER_HOLD_MS = 260;
/**
 * The direction an ANSWERED card leaves in: a tap has no velocity of its own,
 * so the deck picks the deck's own "onwards" direction — the same leftward
 * fly-off a right-to-left flick would produce.
 */
const ANSWER_FLICK = { x: -1, y: 0 };
/**
 * The smallest the question + answers may be scaled to make them fit the card.
 * Below this a card would be a wall of 9 px type, so the card's content becomes
 * scrollable instead and keeps its natural size (see `scrolls` in the deck).
 */
const CONTENT_FLOOR = 0.62;

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

export interface BrainDeckItem {
  /** Stable across re-renders while the question is in the deck. */
  key: string;
  /** Index of the question in the practice set. */
  index: number;
}

export interface BrainDeckQuestion {
  prompt: string;
  options: string[];
}

export interface BrainQuestionDeckProps {
  /** The queue: `[0]` is the card on top, the last one ends the practice. */
  items: BrainDeckItem[];
  questions: BrainDeckQuestion[];
  /** How many questions the set has, for the `3/10` counter. */
  total: number;
  /** The answers recorded so far, by question index. */
  selections: Record<number, number>;
  /** Record an answer — called the moment an option is tapped. */
  onAnswer: (questionIndex: number, optionIndex: number) => void;
  /** The top card left the deck (answered or skipped). Drop it from the queue. */
  onFlick: () => void;
  /** The LAST card finished flying away — the practice is answered through. */
  onEmpty: () => void;
}

/* ------------------------------------------------------------------ */
/* The pane the deck is drawn in                                        */
/* ------------------------------------------------------------------ */

/** Measure the deck's own box (the study pane, whatever the divider gives it). */
function usePaneSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const attach = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    // Synchronously on attach, so the first paint is already the right size.
    setSize({ width: node.clientWidth, height: node.clientHeight });
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setSize({ width: node.clientWidth, height: node.clientHeight }));
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { size, attach };
}

/* ------------------------------------------------------------------ */
/* The card face — the question, its answers, the counter               */
/* ------------------------------------------------------------------ */

interface CardFaceProps {
  question: BrainDeckQuestion;
  /** 1-based position of this question in the set (the counter). */
  ordinal: number;
  total: number;
  /** The answer lit on this card right now. */
  picked: number | null;
  /** Only the top card answers taps. */
  interactive: boolean;
  /** The card's own scale factor: the reference's px × this. */
  scale: number;
  /** A second, smaller factor for content taller than the pane allows. */
  fit: number;
  /** This card's content cannot fit the card even at the deck's scale. */
  scrolls: boolean;
  onPick: (optionIndex: number) => void;
  /** Tells the deck how tall this card's content really is. */
  onMeasure: (height: number) => void;
}

function CardFace({ question, ordinal, total, picked, interactive, scale, fit, scrolls, onPick, onMeasure }: CardFaceProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const measureRef = useRef(onMeasure);
  measureRef.current = onMeasure;

  /**
   * Every metric of the reference card, scaled to this card's WIDTH.
   *
   * `unit` returns a real LENGTH (a px string): a unit-less `16.9` is not a
   * value any of these properties accept, and React would drop the whole
   * declaration — the card would paint with no padding at all. Arithmetic that
   * needs the number itself (the counter's diameter) uses `unitNum`.
   *
   * The deck's own `fit` is deliberately NOT part of this: it is applied once,
   * as the transform on the card's content box. Multiplying the metrics by it
   * as well would scale the card twice, and — because the measurement would
   * then depend on the scale that measurement produces — the card would flip
   * endlessly between two sizes.
   */
  const unitNum = (px: number) => px * scale;
  const unit = (px: number) => `${unitNum(px)}px`;

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    // The measured node is the CONTENT (prompt + answers), never the padded box
    // that `minHeight: 100%` stretches — otherwise the card would measure
    // itself, grow, and measure itself again. `offsetHeight` is LAYOUT height,
    // which a CSS transform does not touch, so this number is the same at every
    // scale: the content's own need in design px, plus the card's padding.
    const measure = () => measureRef.current(node.offsetHeight + 18 + 16);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, fit, question.prompt, question.options.length]);

  return (
    <>
      <div
        data-brain-card-content=""
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          // At least the card's own box, so a short question still reads as a
          // card rather than a strip…
          minHeight: "100%",
          padding: `${unit(18)} ${unit(16)} ${unit(16)}`,
          // …and the question + answers block centred in whatever height the
          // deck solved. A GRID, not a flex column: a flex item is shrunk to fit
          // the box's `min-height` (which would squeeze a long question instead
          // of growing the card), while a grid track takes its content's size
          // and `align-content` centres the leftover space.
          display: "grid",
          // `safe` keeps an overflowing block reachable from its top instead of
          // centring it out of the scroll box.
          alignContent: scrolls ? "start" : "safe center",
          overflowY: scrolls ? "auto" : "visible",
          transform: `scale(${fit})`,
          transformOrigin: "top center",
        }}
      >
        <div
          ref={contentRef}
          data-brain-card-body=""
          style={{ display: "grid", gap: unit(16) }}
        >
          {/* the question — the reference card's "picture" area */}
          <h3
            data-brain-card-prompt=""
            style={{
              margin: 0,
              // The counter owns the top-right corner: the prompt never runs under it.
              paddingRight: unit(48),
              fontSize: unit(21),
              lineHeight: 1.25,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: BRAIN.ink,
            }}
          >
            {question.prompt}
          </h3>

          {/* the answers — the reference card's "caption strip" */}
          <div style={{ display: "grid", gap: unit(10) }} data-brain-options="">
            {question.options.map((option, optionIndex) => {
              const chosen = picked === optionIndex;
              return (
                <motion.button
                  key={optionIndex}
                  type="button"
                  data-brain-option={optionIndex}
                  data-brain-option-chosen={chosen ? "true" : undefined}
                  tabIndex={interactive ? 0 : -1}
                  onPointerDown={(event) => {
                    pressRef.current = { x: event.clientX, y: event.clientY };
                  }}
                  onPointerUp={(event) => {
                    const press = pressRef.current;
                    pressRef.current = null;
                    if (!press) return;
                    // A card DRAG over an answer must never answer it: the pointer
                    // has to come back up on (almost) the same spot to count.
                    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP_SLOP) return;
                    onPick(optionIndex);
                  }}
                  onPointerCancel={() => {
                    pressRef.current = null;
                  }}
                  onPointerLeave={() => {
                    pressRef.current = null;
                  }}
                  onClick={(event) => {
                    // Keyboard activation (Enter / Space) arrives as a click with
                    // no pointer detail — the pointer path is measured above.
                    if (event.detail === 0) onPick(optionIndex);
                  }}
                  /* Framer owns the PRESS, React owns the COLOUR: a motion
                     `backgroundColor` target and a React style would fight over
                     the same property, and the chosen answer would end up
                     painting its own ink invisible. The colour change is a plain
                     CSS transition on the longhand. */
                  whileHover={interactive ? { scale: 1.03 } : undefined}
                  whileTap={interactive ? { scale: 0.97 } : undefined}
                  transition={BRAIN.spring}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: unit(11),
                    width: "100%",
                    minHeight: unit(46),
                    padding: `${unit(9)} ${unit(14)}`,
                    borderRadius: unit(14),
                    border: "none",
                    cursor: interactive ? "pointer" : "default",
                    textAlign: "left",
                    fontFamily: "inherit",
                    fontWeight: 600,
                    fontSize: unit(15),
                    lineHeight: 1.25,
                    backgroundColor: chosen ? BRAIN.pill : BRAIN.plate,
                    color: chosen ? BRAIN.pillInk : BRAIN.pill,
                    boxShadow: "0 2px 6px rgba(2, 6, 16, 0.10)",
                    transition: "background-color 160ms ease, color 160ms ease",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      width: unit(26),
                      height: unit(26),
                      borderRadius: 9999,
                      border: chosen ? "none" : `1px solid rgba(20, 19, 18, 0.35)`,
                      backgroundColor: chosen ? BRAIN.pillInk : "transparent",
                      color: chosen ? BRAIN.pill : BRAIN.pillInk,
                      transition: "background-color 160ms ease",
                      fontSize: unit(11.5),
                      fontWeight: 700,
                    }}
                  >
                    {OPTION_LETTERS[optionIndex]}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>{option}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {/* the counter — the card's top-right corner, and nothing else there.
          It rides the card's own content scale, so a card fitted into a short
          pane keeps a small, clean count instead of a circle as big as the
          question. */}
      <BrainCounter
        value={ordinal}
        total={total}
        size={unitNum(44) * fit}
        /* `unit()` returns a string, so the fit multiplies INSIDE it: "14px" * 0.8
           is NaN, and a NaN offset leaves the counter at the card's left edge. */
        style={{ position: "absolute", top: unit(14 * fit), right: unit(14 * fit) }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* One card in the stack                                                */
/* ------------------------------------------------------------------ */

interface FlickCardProps {
  item: BrainDeckItem;
  slot: number;
  isTop: boolean;
  isLast: boolean;
  question: BrainDeckQuestion;
  ordinal: number;
  total: number;
  selection: number | undefined;
  /** The deck's card box (the reference silhouette, already fitted to the pane). */
  width: number;
  height: number;
  /** The most height the pane can give a card. */
  heightCap: number;
  /** What this card's own content needs (design px), already measured. */
  need: number;
  /** The deck's one content scale (see `contentFit`). */
  fit: number;
  onAnswer: (questionIndex: number, optionIndex: number) => void;
  onReportHeight: (questionIndex: number, height: number) => void;
  onFlick: () => void;
  onEmpty: () => void;
}

function FlickCard({
  item,
  slot,
  isTop,
  isLast,
  question,
  ordinal,
  total,
  selection,
  width,
  height,
  heightCap,
  need,
  fit,
  onAnswer,
  onReportHeight,
  onFlick,
  onEmpty,
}: FlickCardProps) {
  const safeSlot = Math.min(slot, SLOT_COUNT - 1);
  const [isPresent, safeToRemove] = usePresence();
  const x = useMotionValue(0);
  const y = useMotionValue(SLOT_Y[safeSlot]);
  const scale = useMotionValue(SLOT_SCALE[safeSlot]);
  const opacity = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-18, 18], { clamp: true });
  const flickVel = useRef({ x: 0, y: 0 });
  const lastExit = useRef(false);
  const flying = useRef(false);
  const holdTimer = useRef<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  /* Slot transitions — the reference's spring, per card. */
  useEffect(() => {
    if (!isPresent) return;
    const controls = [
      animate(y, SLOT_Y[safeSlot], SPRING),
      animate(scale, SLOT_SCALE[safeSlot], SPRING),
      animate(opacity, SLOT_OPACITY[safeSlot], { duration: 0.3, ease: "easeOut" }),
    ];
    // Background cards also recenter x, so a card that was dragged and released
    // arrives back in its slot squarely.
    if (!isTop) controls.push(animate(x, 0, SPRING));
    return () => controls.forEach((control) => control.stop());
  }, [safeSlot, isTop, isPresent, x, y, scale, opacity]);

  /* Fly-off — the reference's manual exit, in the flick's own direction. */
  useEffect(() => {
    if (isPresent) return;
    const velocity = flickVel.current;
    const magnitude = Math.hypot(velocity.x, velocity.y) || 1;
    animate(x, (velocity.x / magnitude) * FLY_DISTANCE, { duration: 0.5, ease: "easeOut" });
    animate(y, (velocity.y / magnitude) * FLY_DISTANCE, { duration: 0.5, ease: "easeOut" });
    animate(opacity, 0, { duration: 0.45, ease: "easeOut" });
    const last = animate(scale, 0.85, {
      duration: 0.5,
      ease: "easeOut",
      onComplete: () => {
        safeToRemove?.();
        // The deck drains: when the card that just left was the last one, the
        // practice continues (review → submit → result) as soon as it is gone.
        if (lastExit.current) onEmpty();
      },
    });
    return () => last.stop();
  }, [isPresent, safeToRemove, x, y, scale, opacity, onEmpty]);

  const flick = useCallback(
    (velocity: { x: number; y: number }) => {
      if (flying.current || !isPresent) return;
      flying.current = true;
      flickVel.current = velocity;
      lastExit.current = isLast;
      onFlick();
    },
    [isPresent, isLast, onFlick],
  );

  /* One answer per card: it lights up, then the card flicks itself away. */
  const pick = useCallback(
    (optionIndex: number) => {
      if (!isTop || flying.current || picked !== null) return;
      setPicked(optionIndex);
      onAnswer(item.index, optionIndex);
      holdTimer.current = window.setTimeout(() => flick(ANSWER_FLICK), ANSWER_HOLD_MS);
    },
    [isTop, picked, onAnswer, item.index, flick],
  );

  useEffect(
    () => () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    },
    [],
  );

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const speed = Math.hypot(info.velocity.x, info.velocity.y);
    const distance = Math.hypot(info.offset.x, info.offset.y);
    if (speed > FLICK_SPEED || distance > FLICK_DISTANCE) {
      flick(speed > SLOW_FLICK_SPEED ? { x: info.velocity.x, y: info.velocity.y } : { x: info.offset.x * 9, y: info.offset.y * 9 });
    } else {
      // Not a flick: the card springs back into the top slot, exactly like the
      // reference — an unfinished drag never costs the learner a question.
      animate(x, 0, SPRING);
      animate(y, SLOT_Y[0], SPRING);
    }
  };

  /** The card reports what its content needs in design px (see CardFace). */
  const reportHeight = useCallback(
    (value: number) => onReportHeight(item.index, value),
    [item.index, onReportHeight],
  );

  const unitScale = width / BRAIN_DECK_REFERENCE_WIDTH;
  const selected = picked ?? selection ?? null;
  /**
   * Per card, not per deck: the deck shares ONE scale (so a card never resizes
   * as it comes forward), and a question whose content still does not fit that
   * scale keeps its natural size and scrolls inside the card instead of being
   * clipped or crushed.
   */
  const scrolls = need > 0 && fit * need > heightCap + 1;

  return (
    <motion.div
      data-brain-card={item.index}
      data-brain-card-slot={slot}
      data-brain-card-top={isTop ? "" : undefined}
      aria-hidden={!isTop}
      style={{
        x,
        y,
        scale,
        opacity,
        rotate,
        position: "absolute",
        inset: 0,
        // The reference: the top card leans and drags; the rest sit in their slots.
        zIndex: 100 - slot,
        cursor: isTop ? "grab" : "auto",
        // Touch drags must never scroll the pane (the reference's own rule) —
        // except on a card whose content is taller than any card can be, where
        // the pane's own scroll gesture is the only way to reach the last
        // answers. Horizontal swipes still flick there.
        touchAction: isTop ? (scrolls ? "pan-y" : "none") : "auto",
        pointerEvents: isTop ? "auto" : "none",
      }}
      drag={isTop}
      onDragEnd={isTop ? handleDragEnd : undefined}
      whileTap={isTop ? { cursor: "grabbing" } : undefined}
    >
      <div
        className="relative h-full w-full overflow-hidden"
        style={{
          borderRadius: BRAIN.radius,
          background: BRAIN.card,
          // The reference: a heavier drop shadow on the top card.
          boxShadow: isTop ? BRAIN.shadowTop : BRAIN.shadowRest,
          height,
          width,
        }}
      >
        <CardFace
          question={question}
          ordinal={ordinal}
          total={total}
          picked={selected}
          interactive={isTop}
          scale={unitScale}
          fit={scrolls ? 1 : fit}
          scrolls={scrolls}
          onPick={pick}
          onMeasure={reportHeight}
        />
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* The deck                                                             */
/* ------------------------------------------------------------------ */

export default function BrainQuestionDeck({
  items,
  questions,
  total,
  selections,
  onAnswer,
  onFlick,
  onEmpty,
}: BrainQuestionDeckProps) {
  const { size: pane, attach } = usePaneSize();
  const box = useMemo(() => brainDeckSize(pane.width, pane.height), [pane.width, pane.height]);
  /**
   * What each question's content needs, at the deck's own scale (fit 1), keyed
   * by the question so a card that has already been measured keeps its number
   * even after it leaves the deck. The tallest one decides the card height, and
   * it only ever GROWS while a practice set is open: a question that arrives
   * with more to say gets a taller card, a shorter one never shrinks the deck
   * under the learner's thumb.
   */
  const [heights, setHeights] = useState<Record<number, number>>({});
  const reportHeight = useCallback((questionIndex: number, value: number) => {
    // A measurement is only trusted when it makes sense (a hidden or
    // zero-height card reports nothing), and the tallest wins.
    if (!Number.isFinite(value) || value < 120) return;
    setHeights((previous) => (previous[questionIndex] === value ? previous : { ...previous, [questionIndex]: value }));
  }, []);

  /** The tallest content the deck has measured — what the card has to hold. */
  const tallest = useMemo(
    () => Object.values(heights).reduce((max, value) => (value > max ? value : max), 0),
    [heights],
  );
  /** The most height the pane can give a card before it would run off the box. */
  const heightCap = Math.min(
    BRAIN_DECK_MAX_HEIGHT,
    Math.max(box.height, pane.height - BRAIN_DECK_GUTTER - BRAIN_DECK_HINT_HEIGHT - BRAIN_DECK_STACK_PEEK),
  );
  /**
   * The reference silhouette is the FLOOR (a card, never a strip — and before
   * anything has been measured it is the box the pane solved), the measured
   * content is what it grows to, and the pane's own height is the ceiling.
   */
  const contentFloor = Math.max(BRAIN_DECK_MIN_CONTENT_HEIGHT, box.height);
  /**
   * ONE fit for the whole deck: a question that does not fit the pane is scaled
   * down (never past the legibility floor) and every card shares that scale, so
   * the deck never re-sizes card by card.
   */
  const contentFit = tallest > heightCap ? Math.max(CONTENT_FLOOR, heightCap / tallest) : 1;
  const cardHeight = Math.max(contentFloor, Math.min(tallest * contentFit, heightCap));

  return (
    <div
      ref={attach}
      className="flex min-h-0 flex-1 flex-col items-center justify-center"
      data-brain-deck=""
      /* What the deck is showing right now: the exiting card is still in the
         DOM (it is flying away), so the QUEUE is the honest answer. */
      data-brain-deck-top={items[0] ? items[0].index : ""}
      data-brain-deck-remaining={items.length}
      data-brain-deck-need={tallest ? Math.round(tallest) : ""}
      data-brain-deck-fit={contentFit === 1 ? "" : contentFit.toFixed(4)}
    >
      <div
        className="relative"
        data-brain-deck-stage=""
        // The cards behind peek BELOW the top card (the reference's SLOT_Y), so
        // the stage reserves that strip: the hint line never ends up under a
        // card, whatever height the pane solved.
        style={{ width: box.width, height: cardHeight + BRAIN_DECK_STACK_PEEK }}
      >
        <AnimatePresence>
          {items.slice(0, VISIBLE).map((item, slot) => {
            const question = questions[item.index];
            if (!question) return null;
            return (
              <FlickCard
                key={item.key}
                item={item}
                slot={slot}
                isTop={slot === 0}
                isLast={items.length === 1}
                question={question}
                ordinal={item.index + 1}
                total={total}
                selection={selections[item.index]}
                width={box.width}
                height={cardHeight}
                heightCap={heightCap}
                need={heights[item.index] ?? 0}
                fit={contentFit}
                onAnswer={onAnswer}
                onReportHeight={reportHeight}
                onFlick={onFlick}
                onEmpty={onEmpty}
              />
            );
          })}
        </AnimatePresence>
      </div>
      <p
        data-brain-deck-hint=""
        style={{
          marginTop: 12,
          marginBottom: 0,
          fontSize: "calc(12px * var(--brain-scale, 1))",
          fontWeight: 600,
          letterSpacing: "0.01em",
          color: BRAIN.hint,
          textAlign: "center",
        }}
      >
        Tap an answer to submit · flick the card away to skip
      </p>
    </div>
  );
}

/** Exported for the contract tests: the reference geometry this deck runs on. */
export const BRAIN_DECK_GEOMETRY: { slotY: number[]; slotScale: number[]; slotOpacity: number[]; visible: number } = {
  slotY: SLOT_Y,
  slotScale: SLOT_SCALE,
  slotOpacity: SLOT_OPACITY,
  visible: VISIBLE,
};

/** …and the reference's interaction numbers. */
export const BRAIN_DECK_MOTION = {
  flickSpeed: FLICK_SPEED,
  flickDistance: FLICK_DISTANCE,
  slowFlickSpeed: SLOW_FLICK_SPEED,
  flyDistance: FLY_DISTANCE,
  answerFlick: ANSWER_FLICK,
  answerHoldMs: ANSWER_HOLD_MS,
  tapSlop: TAP_SLOP,
  contentFloor: CONTENT_FLOOR,
} as const;


