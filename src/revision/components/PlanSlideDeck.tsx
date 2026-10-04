// src/revision/components/PlanSlideDeck.tsx
//
// The Revision DASHBOARD's hero — the AI Canvas "Slide Deck", ported to the
// learner's saved revision tests (owner's reference, 2026-10-04):
//
//     https://aicanvas.me/components/slide-deck
//
// WHAT THE REFERENCE IS, EXACTLY (its own source / published remix spec, read
// line by line — the mechanics below are the reference's, not an impression of
// them):
//
//   · ONE stacked deck, every card always mounted. The top THREE layers are
//     visible and the depth comes purely from the stack numbers:
//         STACK    = [ { x:0, y:0,  scale:1.000, opacity:1 },     // front
//                      { x:0, y:11, scale:0.962, opacity:1 },     // second
//                      { x:0, y:20, scale:0.926, opacity:1 } ]    // third
//         OFFSCREEN= { x:0, y:30, scale:0.88, opacity:0 }
//     Each card's slot is `offset = (slide.id - current + n) % n`; offsets 0/1/2
//     take STACK, everything deeper takes OFFSCREEN.
//   · FORWARD (dir = 1): the departing front card FLIES OUT to the left —
//     `exitInfo = { slideId, xTarget: -380 }`, and the card that just left sits
//     at offset n-1 while it travels, so `isExiting` is “this slide, now at the
//     end of the ring”. Its target is { x: xTarget, y: 0, scale: 0.88, opacity:
//     0 } with zIndex 15 — it sails over the stack it is leaving.
//   · BACKWARD (dir = -1): nothing flies out. The card that is becoming the
//     front is the one that slides in from the RIGHT: it is keyed
//     `${id}-right`, takes `initial = { x: 380, opacity: 0, scale: 0.88, y: 0 }`
//     and zIndex 20 (above everything) and springs into slot 0 — the old front
//     simply springs back to STACK[1] underneath it.
//   · Both flags are cleared in `onAnimationComplete` with functional setState.
//   · Spring for the slot/exit motion: `{ stiffness: 300, damping: 28 }`.
//   · Drag lives on the offset-0 card only: x-axis, `dragElastic: 0.5`, and a
//     release dismisses when `|offset.x| > 60` or `|velocity.x| > 400`
//     (forward when the flick goes left, backward when it goes right).
//   · Navigation chrome is DOTS ONLY — no arrows. Each dot is a motion.button
//     6 px tall that animates its width 6 → 24 for the active slide, filled
//     `#E55A2B` when active and `rgba(255,255,255,0.18)` (dark) /
//     `rgba(0,0,0,0.15)` (light) when not, on a `{ stiffness: 400, damping: 30 }`
//     spring.
//   · Card content is a two-part editorial block: TOP row = the small caps
//     label + the `XX / 04` counter; BOTTOM = the huge accent numeral and the
//     title under it, laid out with `justify-between`.
//   · The geometric decorations are per-slide (circle / square / line /
//     triangle) and their geometry is fixed by the reference:
//       circle   128×128, 2 px accent border,    opacity 0.15, right -32 top -32
//       square    60×60,  2 px accent border, 15°, opacity 0.25, right  20 top  30
//       line      two vertical rules, w 2 opacity 0.1 right 28 + w 1 opacity
//                 0.06 right 38, full height, primary ink
//       triangle  SVG 126×112 viewBox "0 0 180 160", polygon
//                 "90,12 172,148 8,148", stroke primary, width 2, linejoin
//                 round, opacity 0.2, right -24 top -18
//   · Theme: `isDark` is read from the document root's class with a
//     MutationObserver; it only affects the inactive dot colour and the card
//     shadow. The stage itself is `#E8E8DF` light / `#1A1A19` dark.
//   · NO GLASS anywhere. The cards are flat painted surfaces (the reference's
//     own four-slide palette below) — no backdrop blur, no translucency.
//
// WHAT CHANGED, AND WHY (the owner's brief / this feature's data):
//
//   · The slides ARE the learner's saved tests and the deck shows EVERY one of
//     them — the reference ships four fixed slides, this deck is built from
//     `listCustomTests(uid)` and keeps that exact count, so a learner with 11
//     tests gets 11 cards in the ring (only three are ever visible at once).
//   · The reference's four editorial themes are cycled over the tests by index,
//     so the palette, the type and the shape vocabulary stay the reference's
//     while the content is the learner's.
//   · Card content mapping (owner's brief):
//         top label        → SUBJECT   (what the learner picked in the generator)
//         `XX / NN`        → the test's position in the deck / the existing count
//         huge numeral     → the TEST'S COUNT (its questions)
//         under the numeral→ TEST NAME (the title the learner typed on import,
//                            or the name given in the AI generator)
//         supporting line  → CHAPTER NAME (the chapter type-in from the import
//                            form, or the selected chapter in the generator)
//   · A tap on the front card opens that test (the reference has no CTA — its
//     only controls are drag + dots — so the card itself stays the control and
//     its footer line names the action). A drag is never a tap: the deck
//     suppresses the click exactly like `useDragScroll` does.
//   · The deck is sized from the DASHBOARD'S VISIBLE AREA, not the viewport: the
//     stage fills the space between the page header and the bottom of the
//     scrolling area (measured against the scroll container, scroll-independent)
//     and the card is scaled inside it, so the first card is prominent, the
//     rest of the dashboard waits below the fold, and nothing — not the card,
//     not the swipe, not the footer navigation — overflows on a phone, a tablet
//     or a desktop window. The reference's own rhythm is kept while scaling by
//     scaling every fixed measure with the card (numerals, padding, shape
//     geometry, fly-out distance).

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { motion, type PanInfo } from "framer-motion";

/* ── The reference's own geometry, verbatim ──────────────────────────────── */

/** The reference's card box and radius. Everything scales from here. */
const CARD_W = 260;
const CARD_H = 300;
const CARD_RADIUS = 20;

/** The three visible layers, and the layer the deck hides cards at. */
const STACK = [
  { x: 0, y: 0, scale: 1.0, opacity: 1 },
  { x: 0, y: 11, scale: 0.962, opacity: 1 },
  { x: 0, y: 20, scale: 0.926, opacity: 1 },
] as const;
const OFFSCREEN = { x: 0, y: 30, scale: 0.88, opacity: 0 } as const;

/** Slot / exit spring. */
const SPRING = { type: "spring", stiffness: 300, damping: 28 } as const;
/** Dot width spring. */
const DOT_SPRING = { type: "spring", stiffness: 400, damping: 30 } as const;

/** Forward exit: the reference's xTarget (-380) for its 260 px card. */
const EXIT_X = -380;
/** Backward entry: the reference starts the card one card-width-ish away. */
const ENTER_X = 380;
/** Release thresholds: |offset.x| > 60 or |velocity.x| > 400. */
const DISMISS_OFFSET = 60;
const DISMISS_VELOCITY = 400;
/** Movement above this on the front card is a drag, never a tap. */
const TAP_SLOP = 8;

/** The reference's palette, one theme per slide index (cycled by id). */
type SlideShape = "circle" | "square" | "line" | "triangle";
const SLIDE_THEMES: Array<{
  accent: string;
  bg: string;
  textPrimary: string;
  textMuted: string;
  shape: SlideShape;
}> = [
  { accent: "#E55A2B", bg: "#111111", textPrimary: "#FFFFFF", textMuted: "rgba(255,255,255,0.35)", shape: "circle" },
  { accent: "#E55A2B", bg: "#F0EDEA", textPrimary: "#111111", textMuted: "rgba(0,0,0,0.35)", shape: "square" },
  { accent: "#111111", bg: "#E55A2B", textPrimary: "#FFFFFF", textMuted: "rgba(255,255,255,0.5)", shape: "line" },
  { accent: "#E55A2B", bg: "#2A2A2A", textPrimary: "#F0EDEA", textMuted: "rgba(240,237,234,0.4)", shape: "triangle" },
];

/** The stage's own surfaces (the reference's container colours). */
const STAGE_DARK = "#1A1A19";
const STAGE_LIGHT = "#E8E8DF";
/** The inactive dot, per theme. */
const DOT_INACTIVE_DARK = "rgba(255,255,255,0.18)";
const DOT_INACTIVE_LIGHT = "rgba(0,0,0,0.15)";

/** Sizing bounds: the card never shrinks past readability nor grows absurdly. */
const MIN_SCALE = 0.8;
const MAX_SCALE = 1.8;
/** A phone-sized card stays the reference's own size at least. */
const MIN_STAGE_HEIGHT = 320;
/** Space kept under the deck so the next dashboard card peeks in. */
const BOTTOM_RESERVE = 12;
/** The stack's peek + the dots row + the swipe hint, at scale 1. */
const STACK_PEEK = STACK[2].y;
const CHROME_BELOW_CARD = 88;

/** One test, as the card shows it. */
export interface PlanSlide {
  /** Stable id — the saved test's id. */
  id: number;
  /** Top label: the subject the learner selected when the test was made. */
  subject: string;
  /** The big numeral: the test's own count (its questions). */
  countLabel: string;
  /** Small caps unit printed next to the numeral. */
  countUnit: string;
  /** The test name: imported type-in or the AI generator's name. */
  title: string;
  /** Supporting information: the chapter name. */
  chapter: string;
  /** 1-based position in the deck. */
  position: number;
  /** How many tests the deck holds — the existing count, unchanged. */
  total: number;
  /** Footer line: Start Revision / Continue Revision / View Results. */
  actionLabel: string;
  /** Optional third supporting value (duration), never more than one line. */
  meta?: string;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const pad2 = (value: number) => String(value).padStart(2, "0");

/**
 * The document root's theme flag, watched live (the reference reads `isDark`
 * from a class on `<html>` with a MutationObserver). Only the inactive dot and
 * the card shadow react to it.
 */
function useIsDark(): boolean {
  const read = () =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const [isDark, setIsDark] = useState(read);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const sync = () => setIsDark(read());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

/**
 * The deck's own box, solved from the dashboard's VISIBLE AREA.
 *
 * The Revision page scrolls inside `[data-revision-page-main]`, so the deck
 * measures that container (never the viewport) and works out how much room
 * exists between its own top edge and the container's bottom edge. The top
 * offset is taken in CONTENT coordinates (`rect.top - mainRect.top +
 * main.scrollTop`), so scrolling the dashboard never resizes the deck.
 */
function useDeckMetrics(stageRef: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el || typeof window === "undefined") return undefined;
    let frame = 0;
    const measure = () => {
      const main = el.closest("[data-revision-page-main]") as HTMLElement | null;
      const rect = el.getBoundingClientRect();
      const width = Math.round(el.clientWidth || rect.width);
      let available: number;
      if (main) {
        const mainRect = main.getBoundingClientRect();
        const innerTop = rect.top - mainRect.top + main.scrollTop;
        available = main.clientHeight - innerTop - BOTTOM_RESERVE;
      } else {
        available = window.innerHeight - rect.top - 96;
      }
      const height = Math.max(MIN_STAGE_HEIGHT, Math.round(available));
      setBox((current) => (current.width === width && current.height === height ? current : { width, height }));
    };
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    const main = el.closest("[data-revision-page-main]");
    if (main) observer.observe(main);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
    };
  }, [stageRef]);

  return box;
}

/** The reference's per-slide geometric decoration, geometry verbatim. */
function ShapeDecor({ shape, accent, ink, s }: { shape: SlideShape; accent: string; ink: string; s: number }) {
  if (shape === "circle") {
    return (
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: -32 * s,
          top: -32 * s,
          width: 128 * s,
          height: 128 * s,
          borderRadius: "50%",
          border: `${2 * s}px solid ${accent}`,
          opacity: 0.15,
        }}
      />
    );
  }
  if (shape === "square") {
    return (
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: 20 * s,
          top: 30 * s,
          width: 60 * s,
          height: 60 * s,
          border: `${2 * s}px solid ${accent}`,
          transform: "rotate(15deg)",
          opacity: 0.25,
        }}
      />
    );
  }
  if (shape === "line") {
    return (
      <div aria-hidden="true">
        <div style={{ position: "absolute", right: 28 * s, top: 0, bottom: 0, width: 2 * s, background: ink, opacity: 0.1 }} />
        <div style={{ position: "absolute", right: 38 * s, top: 0, bottom: 0, width: 1 * s, background: ink, opacity: 0.06 }} />
      </div>
    );
  }
  return (
    <svg
      aria-hidden="true"
      width={126 * s}
      height={112 * s}
      viewBox="0 0 180 160"
      style={{ position: "absolute", right: -24 * s, top: -18 * s, opacity: 0.2 }}
    >
      <polygon points="90,12 172,148 8,148" fill="none" stroke={ink} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

export function PlanSlideDeck({
  slides,
  onOpen,
  onIndexChange,
}: {
  slides: PlanSlide[];
  /** A tap (never a drag) on the front card opens that test. */
  onOpen: (slide: PlanSlide) => void;
  onIndexChange?: (index: number) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const box = useDeckMetrics(stageRef);
  const isDark = useIsDark();

  const count = slides.length;
  const [current, setCurrent] = useState(0);
  const [exitInfo, setExitInfo] = useState<{ slideId: number; xTarget: number } | null>(null);
  const [enterFromRight, setEnterFromRight] = useState<number | null>(null);
  const draggedRef = useRef(false);

  // A shrinking deck (a test deleted on another surface) can never point past
  // its own end.
  useEffect(() => {
    if (current > count - 1) setCurrent(Math.max(0, count - 1));
  }, [count, current]);

  useEffect(() => {
    onIndexChange?.(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  /* ── Card fit: the reference's proportions, scaled into the visible area ── */
  const stageW = box.width || CARD_W + 28;
  const stageH = box.height || MIN_STAGE_HEIGHT;
  const scale = clamp(
    Math.min((stageW - 28) / CARD_W, Math.max(CARD_H * MIN_SCALE, stageH - CHROME_BELOW_CARD) / CARD_H),
    MIN_SCALE,
    MAX_SCALE,
  );
  const s = Math.round(scale * 1000) / 1000;
  const cardW = Math.round(CARD_W * s);
  const cardH = Math.round(CARD_H * s);
  const stackPeek = Math.round(STACK_PEEK * s);
  const exitX = Math.round(EXIT_X * s);
  const enterX = Math.round(ENTER_X * s);

  /* ── Navigation ─────────────────────────────────────────────────────────── */

  const go = useCallback(
    (step: 1 | -1) => {
      if (count < 2) return;
      const next = (current + step + count) % count;
      if (step === 1) {
        // Forward: the front card flies out left and the ring closes behind it.
        setEnterFromRight(null);
        setExitInfo({ slideId: slides[current].id, xTarget: exitX });
      } else {
        // Backward: no exit — the incoming card slides in from the right.
        setExitInfo(null);
        setEnterFromRight(slides[next].id);
      }
      setCurrent(next);
    },
    [count, current, exitX, slides],
  );

  const jumpTo = useCallback(
    (index: number) => {
      if (index === current || count < 2) return;
      const forward = (index - current + count) % count;
      if (forward === 1) {
        // A single step forward plays the reference's fly-out.
        setEnterFromRight(null);
        setExitInfo({ slideId: slides[current].id, xTarget: exitX });
      } else if (forward > count / 2) {
        // Walking backwards: the target card slides in from the right.
        setExitInfo(null);
        setEnterFromRight(slides[index].id);
      } else {
        // A multi-step forward jump just re-seats the ring (no fly-out).
        setExitInfo(null);
        setEnterFromRight(null);
      }
      setCurrent(index);
    },
    [count, current, exitX, slides],
  );

  const onDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x <= -DISMISS_OFFSET || info.velocity.x <= -DISMISS_VELOCITY) go(1);
    else if (info.offset.x >= DISMISS_OFFSET || info.velocity.x >= DISMISS_VELOCITY) go(-1);
  };

  const stageStyle: CSSProperties = {
    height: stageH,
    background: isDark ? STAGE_DARK : STAGE_LIGHT,
  };

  const frontSlide = slides[Math.min(current, Math.max(0, count - 1))];

  return (
    <section
      ref={stageRef}
      aria-label="Your revision test deck"
      data-plan-slide-deck
      data-slide-count={count}
      data-active-index={current}
      className="relative flex w-full flex-col items-center justify-center overflow-hidden rounded-[28px]"
      style={stageStyle}
    >
      {/* The stack. `justify-center` + the extra peek room centres the whole
          stack exactly like the reference's own stage does. */}
      <div
        className="flex flex-col items-center justify-center"
        style={{ width: "100%", height: "100%" }}
      >
        <div style={{ position: "relative", width: cardW, height: cardH + stackPeek }}>
          {slides.map((slide, index) => {
            const theme = SLIDE_THEMES[index % SLIDE_THEMES.length];
            const offset = (index - current + count) % count;
            const isExiting = exitInfo?.slideId === slide.id && offset === count - 1;
            const isEnteringFromRight = enterFromRight === slide.id && offset === 0;
            const isFront = offset === 0 && !isExiting;
            const target = isExiting
              ? { x: exitInfo ? exitInfo.xTarget : exitX, y: 0, scale: 0.88, opacity: 0 }
              : offset <= 2
                ? STACK[offset]
                : OFFSCREEN;
            const zIndex = isEnteringFromRight ? 20 : isExiting ? 15 : offset === 0 ? 10 : offset === 1 ? 6 : offset === 2 ? 2 : 0;
            const labelStyle: CSSProperties = {
              fontSize: Math.round(10 * s * 10) / 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: theme.textMuted,
            };
            const counterStyle: CSSProperties = {
              fontSize: Math.round(11 * s * 10) / 10,
              fontWeight: 700,
              color: theme.textMuted,
              whiteSpace: "nowrap",
            };
            return (
              <motion.div
                key={isEnteringFromRight ? `${slide.id}-right` : slide.id}
                data-plan-slide={slide.id}
                data-slide-offset={offset}
                data-slide-front={isFront ? "true" : "false"}
                aria-hidden={isFront ? undefined : true}
                initial={isEnteringFromRight ? { x: enterX, opacity: 0, scale: 0.88, y: 0 } : false}
                animate={target}
                transition={SPRING}
                drag={isFront && count > 1 ? "x" : false}
                dragConstraints={isFront && count > 1 ? { left: 0, right: 0 } : undefined}
                dragElastic={0.5}
                onDragStart={() => {
                  draggedRef.current = false;
                }}
                onDrag={(_event, info) => {
                  if (Math.abs(info.offset.x) > TAP_SLOP) draggedRef.current = true;
                }}
                onDragEnd={onDragEnd}
                onAnimationComplete={() => {
                  setExitInfo((info) => (info && info.slideId === slide.id ? null : info));
                  setEnterFromRight((id) => (id === slide.id ? null : id));
                }}
                onClick={() => {
                  // A drag is not a tap (same rule as the repo's useDragScroll).
                  if (draggedRef.current) {
                    draggedRef.current = false;
                    return;
                  }
                  if (isFront) onOpen(slide);
                }}
                onKeyDown={(event) => {
                  if (!isFront) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(slide);
                  }
                }}
                role={isFront ? "button" : undefined}
                tabIndex={isFront ? 0 : -1}
                aria-label={isFront ? `${slide.title} — ${slide.actionLabel}` : undefined}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: cardW,
                  height: cardH,
                  borderRadius: CARD_RADIUS * s,
                  background: theme.bg,
                  color: theme.textPrimary,
                  zIndex,
                  cursor: isFront && count > 1 ? "grab" : "pointer",
                  boxShadow: isDark ? "0 26px 60px rgba(0, 0, 0, 0.55)" : "0 22px 50px rgba(17, 17, 17, 0.18)",
                  touchAction: "pan-y",
                }}
              >
                <ShapeDecor shape={theme.shape} accent={theme.accent} ink={theme.textPrimary} s={s} />
                {/* The reference's two-part editorial block: label + counter on
                    top, the numeral + title pinned to the bottom. */}
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    height: "100%",
                    padding: `${24 * s}px ${28 * s}px ${28 * s}px`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 * s }}>
                    <span style={{ ...labelStyle, overflowWrap: "anywhere" }} data-slide-subject>
                      {slide.subject}
                    </span>
                    <span style={counterStyle} data-slide-counter>
                      {pad2(slide.position)} / {pad2(slide.total)}
                    </span>
                  </div>

                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 * s }}>
                      <span
                        style={{
                          fontSize: Math.round(88 * s),
                          fontWeight: 900,
                          lineHeight: 0.85,
                          letterSpacing: "-0.05em",
                          color: theme.accent,
                        }}
                        data-slide-count
                      >
                        {slide.countLabel}
                      </span>
                      <span style={labelStyle}>{slide.countUnit}</span>
                    </div>

                    <div
                      style={{
                        marginTop: 10 * s,
                        fontSize: Math.round(26 * s),
                        fontWeight: 800,
                        lineHeight: 1.15,
                        letterSpacing: "-0.03em",
                        whiteSpace: "pre-line",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                      data-slide-title
                    >
                      {slide.title}
                    </div>

                    <div style={{ marginTop: 12 * s }} data-slide-chapter>
                      <span style={{ ...labelStyle, display: "block" }}>Chapter</span>
                      <span
                        style={{
                          display: "block",
                          fontSize: Math.round(13 * s),
                          fontWeight: 700,
                          color: theme.textPrimary,
                          opacity: 0.92,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {slide.chapter}
                      </span>
                    </div>

                    <div
                      style={{
                        marginTop: 14 * s,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8 * s,
                        color: theme.accent,
                        fontSize: Math.round(11 * s),
                        fontWeight: 800,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                      }}
                      data-slide-action
                    >
                      <span>{slide.actionLabel}</span>
                      <span style={{ fontSize: Math.round(13 * s) }} aria-hidden="true">
                        →
                      </span>
                    </div>
                    {slide.meta ? (
                      <div style={{ marginTop: 6 * s, ...labelStyle, opacity: 0.85 }}>{slide.meta}</div>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Dots only — the reference has no arrows. */}
        {count > 1 ? (
          <div data-rev-plan-dots style={{ display: "flex", alignItems: "center", gap: 6 * s, marginTop: 16 * s }}>
            {slides.map((slide, index) => {
              const active = index === current;
              return (
                <motion.button
                  key={slide.id}
                  type="button"
                  onClick={() => jumpTo(index)}
                  aria-label={`Show test ${index + 1} of ${count}: ${slide.title}`}
                  aria-current={active ? "true" : undefined}
                  data-plan-slide-dot={slide.id}
                  data-dot-active={active ? "true" : "false"}
                  animate={{ width: active ? 24 : 6 }}
                  transition={DOT_SPRING}
                  style={{
                    height: 6,
                    borderRadius: 999,
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    background: active ? "#E55A2B" : isDark ? DOT_INACTIVE_DARK : DOT_INACTIVE_LIGHT,
                  }}
                />
              );
            })}
          </div>
        ) : null}

        {count > 1 ? (
          <p
            style={{
              marginTop: 10 * s,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
            }}
            data-plan-deck-hint
          >
            Swipe the card for the next test
          </p>
        ) : null}
      </div>

      {/* Screen readers get the deck's position without the drag vocabulary. */}
      <span role="status" aria-live="polite" className="sr-only">
        {frontSlide ? `${frontSlide.title}, ${frontSlide.position} of ${frontSlide.total}` : ""}
      </span>
    </section>
  );
}

export default PlanSlideDeck;
