// src/course/studyPanels.tsx
//
// The Course Player's SPLIT DECK — "watch the lecture AND write notes / build
// the mind map side by side", the function the owner kept from the old player,
// rebuilt as a first-class layout instead of a per-tab experiment.
//
// What lives here:
//
//   · SplitDeck    — the whole split region: lesson pane, divider, study pane.
//                    It owns the ratio (drag, magnetic snap, spring settle,
//                    fill-to-edge, peek rails) and the per-course/per-axis
//                    persistence. The panes' CONTENT is handed in: the lesson
//                    pane gets the player's lossless viewer stack, the study
//                    pane gets <CourseOverlay variant="pane" /> — the same five
//                    tabs, the same rows and the SAME footer dock, so the dock
//                    literally lives inside the split.
//   · SplitDivider — the draggable divider: a slim 10px strip whose ONLY
//                    visible chrome is a 2px yellow core line (it never takes
//                    the active tab's colour), with full keyboard control. An
//                    invisible grab extension keeps it finger-friendly without
//                    costing the panes any layout space.
//   · PeekRail     — the 28px glass strip a collapsed pane becomes. Tap it and
//                    the last ratio springs back.
//
// Axis follows the player's orientation: portrait = a horizontal divider with
// the lesson on top; landscape = a vertical divider with the lesson on the
// left. The deck is the player's ONLY layout — there is no header anywhere
// (and no non-split variant) for it to share the shell with.
//
// Performance rules honoured here: only transform / opacity / box-shadow /
// flex-grow are animated, the live drag writes straight to the DOM (no React
// re-render per frame), blur is static per theme and coarse pointers lose the
// pulse ring.

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, type AnimationPlaybackControls, type MotionValue } from "framer-motion";
import { ArrowLeftRight, ArrowUpDown, PanelBottom, PanelLeft, PanelRight, PanelTop, PlayCircle, X } from "lucide-react";
import { GlassSurface } from "../components/ui/glass";
import {
  DEFAULT_SPLIT_RATIO,
  DIVIDER_HIT,
  DIVIDER_LINE,
  ENTRY_START,
  EXTRA_PANE_DEFAULT,
  EXTRA_PANE_ENTRY,
  EXTRA_PANE_MAX,
  EXTRA_PANE_MIN,
  SPLIT_WIDE_MIN_PX,
  EASE_OUT_MOTION,
  FILL_THRESHOLD,
  KEY_STEP,
  KEY_STEP_FINE,
  PEEK_RAIL_PX,
  SNAP_TOLERANCE,
  SPLIT_DOCK_MIN_PX,
  SPLIT_MAX,
  SPLIT_MIN,
  SPLIT_SHORT_VIEWPORT_PX,
  SPLIT_SMALL_SCREEN_PX,
  SPLIT_SNAP_POINTS,
  SPRING_ENTRY,
  SPRING_SETTLE,
  SWAP_BUTTON_PX,
  SWAP_HINT_MS,
  SWAP_ICON_PX,
  SWAP_TAP_MS,
  SWAP_TAP_SLOP_PX,
  clampSplitRatio,
  loadSplitCollapsed,
  loadSplitExtras,
  loadSplitRatio,
  loadSplitSwapped,
  saveSplitCollapsed,
  saveSplitExtras,
  saveSplitRatio,
  saveSplitSwapped,
  splitFloorFor,
  type SplitAxis,
  type SplitExtraPane,
  type SplitExtras,
  type SplitRegion,
  type SplitSide,
} from "./splitMotion";
import { useCourseKeyboard } from "./useCourseKeyboard";

/** The glass tokens every split surface is built from (Phase-2 discipline). */
const CHROME_GLASS: CSSProperties = {
  background: "var(--dc-chrome-glass)",
  backdropFilter: "var(--dc-chrome-glass-blur)",
  WebkitBackdropFilter: "var(--dc-chrome-glass-blur)",
  boxShadow: "var(--dc-chrome-glass-rim)",
};

/** Coarse pointers get a cheap scale-only deck (no rail breathing). */
const useCoarsePointer = (): boolean => {
  const [coarse, setCoarse] = useState(
    () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches),
  );
  useEffect(() => {
    const media = window.matchMedia?.("(pointer: coarse)");
    if (!media) return undefined;
    const update = () => setCoarse(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return coarse;
};

/**
 * Soft-keyboard awareness for the study pane (the old overlay's behaviour,
 * ported): while an editable field INSIDE the deck has focus and the visual
 * viewport has shrunk, the deck reports how many px of its bottom edge the
 * keyboard covers. The split region then pads its bottom by exactly that, so
 * the notes editor and its toolbar stay above the keyboard. The lesson pane
 * keeps its own identity — only the box it lives in gets shorter.
 */
const useKeyboardInset = (scopeRef: RefObject<HTMLElement | null>): number => {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const read = () => {
      const covered = Math.max(0, Math.round(window.innerHeight - (viewport.height + viewport.offsetTop)));
      const target = document.activeElement as HTMLElement | null;
      const editing = Boolean(
        target && (target.isContentEditable || /^(textarea|input)$/i.test(target.tagName)),
      );
      const inside = Boolean(target && scopeRef.current?.contains(target));
      // Below ~90px this is browser chrome resizing, not a keyboard.
      setInset(covered > 90 && editing && inside ? covered : 0);
    };
    read();
    viewport.addEventListener("resize", read);
    viewport.addEventListener("scroll", read);
    window.addEventListener("focusin", read);
    window.addEventListener("resize", read);
    return () => {
      viewport.removeEventListener("resize", read);
      viewport.removeEventListener("scroll", read);
      window.removeEventListener("focusin", read);
      window.removeEventListener("resize", read);
    };
  }, [scopeRef]);
  return inset;
};

// ── Peek rail ───────────────────────────────────────────────────────────────

/** The 2px glow strip's position: always the divider-facing edge. */
const railGlowStyle = (axis: SplitAxis, side: SplitSide, accent: string): CSSProperties => {
  const glow = { background: accent, boxShadow: `0 0 14px ${accent}88` };
  if (axis === "row") {
    return { position: "absolute", top: 0, bottom: 0, width: 2, ...(side === "lesson" ? { right: 0 } : { left: 0 }), ...glow };
  }
  return { position: "absolute", left: 0, right: 0, height: 2, ...(side === "lesson" ? { bottom: 0 } : { top: 0 }), ...glow };
};

function PeekRail({
  side,
  glowSide,
  axis,
  accent,
  icon: Icon,
  label,
  breathe,
  onRestore,
}: {
  side: SplitSide;
  /** Which END of the deck this rail sits at — it flips when the panes are
   *  swapped, so the 2px glow always hugs the divider. */
  glowSide: SplitSide;
  axis: SplitAxis;
  accent: string;
  icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }>;
  label: string;
  breathe: boolean;
  onRestore: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onRestore}
      aria-label={label}
      title={label}
      data-course-peek-rail=""
      data-peek-side={side}
      data-axis={axis}
      className="absolute inset-0 z-20 flex cursor-pointer items-center justify-center overflow-hidden"
      style={CHROME_GLASS}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: EASE_OUT_MOTION }}
    >
      <span aria-hidden style={railGlowStyle(axis, glowSide, accent)} data-peek-glow="" />
      {/* Gentle breathing — transform only, and never on a coarse pointer. */}
      <motion.span
        aria-hidden
        data-peek-icon=""
        className="flex items-center justify-center"
        style={{ color: accent }}
        animate={breathe ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={breathe ? { duration: 2.4, ease: "easeInOut", repeat: Infinity } : { duration: 0.2 }}
      >
        <Icon size={15} />
      </motion.span>
    </motion.button>
  );
}

// ── The divider ─────────────────────────────────────────────────────────────

/**
 * One small control the divider reveals beside its switch button.
 *
 * The owner's brief (2026-10-14): on a tablet-sized or desktop stage, tapping
 * the line must offer MORE than the swap — "the left content area splits into
 * one more part" and "the right one splits too". Every divider carries the
 * same two things: the switch, and the way its region's pane count changes.
 * A phone-sized stage keeps the bare switch it always had (a third pane does
 * not fit there), so the split controls simply are not rendered below
 * SPLIT_WIDE_MIN_PX.
 */
export interface SplitDividerAction {
  id: string;
  /** Accessible name + tooltip — the button itself is deliberately icon-only. */
  label: string;
  icon: ReactNode;
  onPress: () => void;
}

/** The small round button every divider control is drawn as. */
const WAKE_BUTTON_STYLE: CSSProperties = {
  width: SWAP_BUTTON_PX,
  height: SWAP_BUTTON_PX,
  background: "rgba(10, 12, 18, 0.88)",
  border: `1px solid ${DIVIDER_LINE}`,
  color: DIVIDER_LINE,
  boxShadow: `0 0 12px ${DIVIDER_LINE}55`,
  touchAction: "manipulation",
};

/**
 * Tap-to-reveal for a divider's control cluster — ONE implementation, shared
 * by the main divider and by the extra-pane dividers inside a region.
 *
 * The divider's own resize drag owns the pointer, so a TAP is recognised on
 * pointer UP: the press only counts when the pointer barely moved and came up
 * quickly. A real resize never reveals the cluster. The cluster fades on its
 * own after an idle window, on the next tap of the line, and on a rotation.
 */
function useDividerReveal(
  axis: SplitAxis,
  handlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  },
) {
  const [swapVisible, setSwapVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);
  const armHideTimer = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setSwapVisible(false), SWAP_HINT_MS);
  }, [clearHideTimer]);
  useEffect(() => () => clearHideTimer(), [clearHideTimer]);
  // A rotation re-lays the deck out; the hint should not survive it.
  useEffect(() => {
    setSwapVisible(false);
    clearHideTimer();
  }, [axis, clearHideTimer]);

  const revealSwap = useCallback(() => {
    setSwapVisible(true);
    armHideTimer();
  }, [armHideTimer]);

  const toggleSwapHint = useCallback(() => {
    setSwapVisible((visible) => {
      if (visible) {
        clearHideTimer();
        return false;
      }
      armHideTimer();
      return true;
    });
  }, [armHideTimer, clearHideTimer]);

  // Tap vs drag: the divider's resize drag owns the pointer, so the tap is
  // recognised on pointer UP — the press only counts when the pointer barely
  // moved and came up quickly. A real resize never reveals the switch.
  const tapRef = useRef<{ x: number; y: number; at: number; id: number } | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    tapRef.current = { x: event.clientX, y: event.clientY, at: Date.now(), id: event.pointerId };
    handlers.onPointerDown(event);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = tapRef.current;
    tapRef.current = null;
    handlers.onPointerUp(event);
    if (!start || start.id !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved <= SWAP_TAP_SLOP_PX && Date.now() - start.at <= SWAP_TAP_MS) toggleSwapHint();
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    tapRef.current = null;
    handlers.onPointerCancel(event);
  };

  return { swapVisible, revealSwap, handlePointerDown, handlePointerUp, handlePointerCancel };
}

interface SplitDividerProps {
  axis: SplitAxis;
  ratio: MotionValue<number>;
  dragging: boolean;
  /** Lesson-side percent, kept in React state for the a11y read-out. */
  ariaNow: number;
  collapsed: SplitSide | null;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  /** True while the STUDY pane is the first one (the panes are swapped). */
  swapped: boolean;
  /** Swap the two panes — the switch button's one job. */
  onSwap: () => void;
  /** The split controls (wide stages only). Empty at every other size. */
  actions?: SplitDividerAction[];
  /** "main" = the region divider; "nested" = a divider inside a region. */
  kind?: "main" | "nested";
}

function SplitDivider({
  axis,
  ratio,
  dragging,
  ariaNow,
  collapsed,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDoubleClick,
  onKeyDown,
  swapped,
  onSwap,
  actions = [],
  kind = "main",
}: SplitDividerProps) {
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const row = axis === "row"; // landscape → a vertical divider

  // ── The control cluster ─────────────────────────────────────────────────
  // At rest the divider is what it has always been: a bare 2px yellow line.
  // TAP the line and the tiny controls appear on it; tap it again and they
  // fade away. The cluster fades out on its own after an idle window, so
  // nothing permanent is added to the divider's chrome.
  const { swapVisible, revealSwap, handlePointerDown, handlePointerUp, handlePointerCancel } =
    useDividerReveal(axis, { onPointerDown, onPointerUp, onPointerCancel });

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Keyboard parity with the tap: "s" swaps the panes outright, and the
    // cluster is shown while it does so (the same control, same feedback).
    if (event.key === "s" || event.key === "S") {
      event.preventDefault();
      revealSwap();
      onSwap();
      return;
    }
    onKeyDown(event);
  };

  // The live read-out never goes through React: the separator's
  // aria-valuenow is written straight to the DOM on every frame.
  useMotionValueEvent(ratio, "change", (value) => {
    const lesson = 100 - Math.round(value);
    dividerRef.current?.setAttribute("aria-valuenow", String(Math.min(100, Math.max(0, lesson))));
  });

  return (
    <div
      ref={dividerRef}
      role="separator"
      tabIndex={0}
      aria-orientation={row ? "vertical" : "horizontal"}
      aria-label={
        kind === "main"
          ? "Split deck divider — drag to resize the lesson and study panes"
          : "Region divider — drag to resize the two parts of this area"
      }
      aria-valuemin={SPLIT_MIN}
      aria-valuemax={SPLIT_MAX}
      aria-valuenow={ariaNow}
      data-course-split-divider=""
      data-divider-kind={kind}
      data-axis={axis}
      data-dragging={dragging ? "true" : "false"}
      data-collapsed={collapsed ?? "none"}
      className={`group relative z-30 flex shrink-0 items-center justify-center ${
        row ? "h-full cursor-col-resize flex-col" : "w-full cursor-row-resize"
      }`}
      style={{
        // A slim 10px strip on the axis that matters, and no browser gesture
        // stealing the drag (the whole point of `touch-action: none`). An
        // invisible `::after` extends the grab area for fingers — the layout
        // cost stays 10px.
        flex: `0 0 ${DIVIDER_HIT}px`,
        touchAction: "none",
        // The panes are reordered with `order` when they are swapped (see the
        // deck below); the divider always keeps the middle slot.
        order: 1,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onDoubleClick={onDoubleClick}
      onKeyDown={handleKeyDown}
    >
      {/* The ONLY visible divider chrome: a 2px yellow core line. It draws
          itself along its own axis when the deck opens (240ms, the pack's
          ease). No grabber, no % bubble, no pulse ring — the panes keep every
          pixel around it. */}
      <motion.span
        key={axis}
        aria-hidden
        data-course-split-line=""
        className={row ? "h-full w-[2px] rounded-full" : "h-[2px] w-full rounded-full"}
        style={{
          background: DIVIDER_LINE,
          boxShadow: dragging ? `0 0 16px ${DIVIDER_LINE}` : `0 0 10px ${DIVIDER_LINE}66`,
        }}
        initial={row ? { scaleY: 0, scaleX: 1 } : { scaleX: 0, scaleY: 1 }}
        animate={{ scaleX: 1, scaleY: 1 }}
        transition={{ duration: 0.24, ease: EASE_OUT_MOTION }}
      />

      {/* The cluster: revealed by a tap on the line, centred ON the line, and
          deliberately tiny. Its own pointer events never reach the divider, so
          pressing a control can never start a resize drag. */}
      <span
        aria-hidden={swapVisible ? undefined : true}
        className="pointer-events-none absolute left-1/2 top-1/2 z-40 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      >
        <AnimatePresence initial={false}>
          {swapVisible ? (
            <motion.span
              data-course-split-cluster={kind}
              className={`pointer-events-auto flex items-center justify-center gap-1.5 ${row ? "flex-col" : "flex-row"}`}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.16, ease: EASE_OUT_MOTION }}
            >
              <motion.button
                type="button"
                data-course-split-swap=""
                data-swapped={swapped ? "true" : "false"}
                aria-label={
                  swapped
                    ? "Swap the panes back — lesson first, study pane second"
                    : "Swap the panes — study pane first, lesson second"
                }
                title="Swap the two panes"
                className="pointer-events-auto grid cursor-pointer place-items-center rounded-full"
                style={WAKE_BUTTON_STYLE}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  // Every press swaps: the same button takes the panes back.
                  onSwap();
                  revealSwap();
                }}
              >
                {row ? <ArrowLeftRight size={SWAP_ICON_PX} /> : <ArrowUpDown size={SWAP_ICON_PX} />}
              </motion.button>
              {/* The split controls — one per region that can still grow, or
                  the merge control for a region that already has its pane. */}
              {actions.map((action) => (
                <motion.button
                  key={action.id}
                  type="button"
                  data-course-split-action={action.id}
                  aria-label={action.label}
                  title={action.label}
                  className="pointer-events-auto grid cursor-pointer place-items-center rounded-full"
                  style={WAKE_BUTTON_STYLE}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    action.onPress();
                    // The cluster stays up after a press (its idle timer is
                    // restarted), so a second control is one tap away.
                    revealSwap();
                  }}
                >
                  {action.icon}
                </motion.button>
              ))}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>
    </div>
  );
}
// ── The extra pane (the third / fourth part, inside one region) ─────────────
//
// The owner's brief (2026-10-14): the divider's button must ALSO be able to
// grow the deck — "left mein jo actual content area hai, yah split ho jayega
// ek aur part mein" and the same for the right one. So a REGION (the lesson
// side or the study side) can host one more pane beside its own, with its own
// divider between them, and every divider offers the switch and the way the
// pane count changes.
//
// The pair is deliberately simple next to the deck: no peek rails (the pane is
// removed, not collapsed) and no fill-to-edge — it is a resizable pair whose
// only persistence is its percentage.

const clampExtraPercent = (value: number) =>
  Math.min(EXTRA_PANE_MAX, Math.max(EXTRA_PANE_MIN, Number.isFinite(value) ? value : EXTRA_PANE_DEFAULT));

interface ExtraPaneRegionProps {
  axis: SplitAxis;
  /** Which region this pair lives in (marks the boxes for CSS and tests). */
  region: SplitRegion;
  /** The region's own pane — the lesson stack, or the study overlay. */
  primary: ReactNode;
  /** The added study pane. */
  extra: ReactNode;
  /** The added pane's share of the region, in percent (persisted). */
  percent: number;
  /** A settled share (drag release, keyboard step, 50/50) → persist it. */
  onPercent: (percent: number) => void;
  /** True while the ADDED pane is the region's first one. */
  swapped: boolean;
  onSwap: () => void;
  /** The region's controls: merge this pane, or split the other region. */
  actions: SplitDividerAction[];
  /** The wrapper's flex classes — the pair fills whatever box it is given. */
  className: string;
}

function ExtraPaneRegion({
  axis,
  region,
  primary,
  extra,
  percent,
  onPercent,
  swapped,
  onSwap,
  actions,
  className,
}: ExtraPaneRegionProps) {
  const row = axis === "row";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLDivElement | null>(null);
  const extraRef = useRef<HTMLDivElement | null>(null);
  const initial = clampExtraPercent(percent);
  const percentMv = useMotionValue(initial);
  const [dragging, setDragging] = useState(false);
  const [ariaNow, setAriaNow] = useState(Math.round(100 - initial));
  const dragRef = useRef<{ pointerId: number; start: number; size: number } | null>(null);

  // Rotation (or another course) hands a new stored share down.
  useEffect(() => {
    percentMv.set(clampExtraPercent(percent));
  }, [percent, percentMv]);

  // The panes' flex-grow is written straight to the DOM on every frame of the
  // drag: no React re-render, exactly like the deck's own divider.
  useMotionValueEvent(percentMv, "change", (value) => {
    if (primaryRef.current) primaryRef.current.style.flexGrow = String(Math.max(0.0001, 100 - value));
    if (extraRef.current) extraRef.current.style.flexGrow = String(Math.max(0.0001, value));
  });

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    dragRef.current = {
      pointerId: event.pointerId,
      start: row ? box.left : box.top,
      size: row ? box.width : box.height,
    };
    containerRef.current?.setPointerCapture?.(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.size <= 0) return;
    const pointer = row ? event.clientX : event.clientY;
    percentMv.set(clampExtraPercent(((pointer - drag.start) / drag.size) * 100));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!drag || drag.pointerId !== event.pointerId) return;
    const settled = Math.round(percentMv.get());
    setAriaNow(Math.round(100 - settled));
    onPercent(settled);
  };

  const handlePointerCancel = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const setPercent = useCallback(
    (next: number) => {
      const clamped = clampExtraPercent(next);
      percentMv.set(clamped);
      setAriaNow(Math.round(100 - clamped));
      onPercent(Math.round(clamped));
    },
    [onPercent, percentMv],
  );

  const fiftyFiftyPair = useCallback(() => setPercent(EXTRA_PANE_DEFAULT), [setPercent]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Enter"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? KEY_STEP_FINE : KEY_STEP;
    const current = percentMv.get();
    const next =
      event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? current - step
        : event.key === "ArrowRight" || event.key === "ArrowDown"
          ? current + step
          : event.key === "Home"
            ? EXTRA_PANE_MIN
            : event.key === "End"
              ? EXTRA_PANE_MAX
              : EXTRA_PANE_DEFAULT;
    setPercent(next);
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      data-course-region={region}
      data-region-split="on"
      data-region-swapped={swapped ? "true" : "false"}
    >
      <div
        ref={primaryRef}
        className="relative flex min-h-0 min-w-0 flex-col overflow-hidden"
        data-region-pane="primary"
        style={{
          flexGrow: Math.max(0.0001, 100 - initial),
          flexShrink: 1,
          flexBasis: "0%",
          order: swapped ? 2 : 0,
        }}
      >
        {primary}
      </div>
      <SplitDivider
        kind="nested"
        axis={axis}
        ratio={percentMv}
        dragging={dragging}
        ariaNow={ariaNow}
        collapsed={null}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onDoubleClick={fiftyFiftyPair}
        onKeyDown={handleKeyDown}
        swapped={swapped}
        onSwap={onSwap}
        actions={actions}
      />
      <div
        ref={extraRef}
        className="relative flex min-h-0 min-w-0 flex-col overflow-hidden"
        data-region-pane="extra"
        style={{
          flexGrow: Math.max(0.0001, initial),
          flexShrink: 1,
          flexBasis: "0%",
          order: swapped ? 0 : 2,
        }}
      >
        {extra}
      </div>
    </div>
  );
}

// ── The deck ────────────────────────────────────────────────────────────────

export interface SplitDeckHandle {
  /** Fill one side to 100% and collapse the other into its peek rail. */
  collapse: (side: SplitSide) => void;
  /** Bring the collapsed pane back to the last free ratio. */
  restore: () => void;
  /** 50/50 — the divider's double-click / Enter shortcut. */
  fiftyFifty: () => void;
  /**
   * The dock's "tap the tab you are already on" gesture: peek-collapse the
   * study pane, or restore it when it is already collapsed. The footer stays
   * reachable either way, because the collapsed pane IS a button.
   */
  toggleStudy: () => void;
  /**
   * Selecting a study tab from the footer navigation while the study pane is
   * peek-collapsed re-opens the pane — from the RIGHT in landscape (the deck
   * is a row there), from the bottom in portrait. A navigation tap must
   * ACTIVATE the split content, never leave the new tab hidden behind the
   * pane's 28px rail. No-op while the pane is already open.
   */
  activateStudy: () => void;
}

export interface SplitDeckProps {
  /** "column" = portrait (lesson above study); "row" = landscape (left/right). */
  axis: SplitAxis;
  orientation: "portrait" | "landscape";
  /** Ratios + collapse are remembered per course and per axis. */
  courseId: string;
  /** The active study tab's colour (peek rails only — the divider is fixed yellow). */
  accent: string;
  /**
   * True while a writing surface that deserves the whole screen is on screen
   * (the notes editor, the mind map, the AI Mentor chat input). When the soft
   * keyboard then opens, the study pane takes over the FULL deck — lesson and
   * divider are hidden — and the previous split comes back untouched when the
   * keyboard closes.
   */
  keyboardExpandEnabled?: boolean;
  /** The active study tab's icon (the study peek rail). */
  studyIcon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }>;
  /** The player's lossless viewer stack — never unmounted, only resized. */
  lesson: ReactNode;
  /** <CourseOverlay /> — tabs + footer dock inside the pane. */
  study: ReactNode;
  /**
   * Notes / Mind map / Player are on screen: the pane gets the deeper plate
   * the solid-panel treatment gives them, so the writing surface reads
   * identically in both themes.
   */
  solid?: boolean;
  handleRef?: RefObject<SplitDeckHandle | null>;
  /**
   * Renders the content of an EXTRA pane — the third or fourth part the
   * divider's split controls add inside a region (wide stages only).
   *
   * The deck owns the pane's presence, its share and its tab; the player only
   * says what a pane showing a given tab looks like. `setTab` is the pane's own
   * tab switch, so each part keeps its own tab without the deck knowing the
   * tab list.
   */
  renderExtraPane?: (region: SplitRegion, tab: string, setTab: (tab: string) => void) => ReactNode;
  /**
   * The tab a brand-new extra pane opens on. `used` lists every tab the deck is
   * already showing (the two remembered panes), so the new part lands on a tab
   * that is not on screen twice — the owner's "vah empty nahin rahega" rule.
   */
  extraPaneTab?: (used: string[]) => string;
}

/** Narrow phone OR a phone turned sideways (a short viewport). Both are the
 *  cases where the study pane can end up too tight for the dock inside it. */
const phoneViewportQuery = (): MediaQueryList | undefined =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia(
        `(max-width: ${SPLIT_SMALL_SCREEN_PX}px), (max-height: ${SPLIT_SHORT_VIEWPORT_PX}px)`,
      )
    : undefined;

const matchesPhoneViewport = (): boolean => phoneViewportQuery()?.matches === true;

export function SplitDeck({
  axis,
  orientation,
  courseId,
  accent,
  studyIcon,
  lesson,
  study,
  solid = false,
  handleRef,
  keyboardExpandEnabled = false,
  renderExtraPane,
  extraPaneTab,
}: SplitDeckProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const lessonRef = useRef<HTMLDivElement | null>(null);
  const studyRef = useRef<HTMLDivElement | null>(null);

  const coarse = useCoarsePointer();
  // Reduced motion keeps the deck fully usable — it only loses the decorative
  // pulse ring and the peek rail's breathing.
  const reduceMotion = useReducedMotion() === true;
  const cheap = coarse || reduceMotion;
  // Phones raise the study pane's floor so notes stay writable (30% in portrait).
  const [phone, setPhone] = useState(matchesPhoneViewport);
  useEffect(() => {
    const media = phoneViewportQuery();
    if (!media) return undefined;
    const update = () => setPhone(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  const specFloor = splitFloorFor(axis, phone);

  /** The deck's measured width, so a short/narrow landscape stage gets a floor
   *  that is genuinely wide enough for the dock rather than a guessed
   *  percentage. This applies to EVERY landscape device, not just phones:
   *  on a tablet landscape (or a narrow desktop window) the study pane could
   *  otherwise settle to the 15% band — far narrower than the six-icon dock's
   *  ~344 px — so the freshly-visible footer dock would be clipped by the
   *  pane's overflow-hidden. Collapse-to-rail still bypasses the floor. */
  const [deckWidth, setDeckWidth] = useState(0);
  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return undefined;
    setDeckWidth(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? node.clientWidth;
      setDeckWidth((current) => (Math.abs(current - width) < 4 ? current : width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const dockFloor =
    axis === "row" && deckWidth > 0 ? clampSplitRatio((SPLIT_DOCK_MIN_PX / deckWidth) * 100) : 0;
  const floor = Math.max(specFloor, dockFloor);

  /** The study pane's percent — the one number the whole deck animates. It
   *  starts at the entry value so the very first painted frame is already the
   *  "grown from nothing" state the entry spring then takes over from. */
  const ratio = useMotionValue(ENTRY_START);
  const [collapsed, setCollapsed] = useState<SplitSide | null>(null);
  /**
   * The divider's switch: `true` = the two panes have traded places, i.e. the
   * STUDY pane is the first one (left in landscape, top in portrait) and the
   * lesson is the far one. Nothing is re-rendered into a different part of the
   * tree for this — the panes keep their DOM position and only their flex
   * `order` changes — so the lesson's viewer stack (videos, PDFs, iframes)
   * is never unmounted or reloaded by a swap.
   */
  const [swapped, setSwapped] = useState(false);
  const swappedRef = useRef(false);
  swappedRef.current = swapped;
  const [dragging, setDragging] = useState(false);
  const [ariaNow, setAriaNow] = useState(100 - ENTRY_START);
  /** While dragging, the smaller pane leans on its divider-side edge. */
  const [compressed, setCompressed] = useState<SplitSide | null>(null);

  // ── The extra panes (the third / fourth part) ─────────────────────────────
  //
  // Each REGION (the lesson side, the study side) can host one more pane: the
  // divider's split controls add it, its own little cluster removes it. What is
  // remembered per course + axis is the pane's presence, its tab and its share
  // of the region — a phone in portrait must not inherit a laptop's layout, and
  // the deck must never fail to open because of its own storage.
  const [extras, setExtras] = useState<SplitExtras>({ lesson: null, study: null });
  const updateExtras = useCallback(
    (next: SplitExtras) => {
      setExtras(next);
      saveSplitExtras(courseId, axis, next);
    },
    [axis, courseId],
  );

  /** The tabs the deck is already showing — a new pane must not repeat one. */
  const usedExtraTabs = useCallback(
    () => [extras.lesson?.tab, extras.study?.tab].filter((tab): tab is string => Boolean(tab)),
    [extras.lesson?.tab, extras.study?.tab],
  );

  /** "Split this region into another part": a NEW study pane, never an empty box. */
  const splitRegion = useCallback(
    (region: SplitRegion) => {
      if (extras[region]) return;
      const tab = extraPaneTab?.(usedExtraTabs()) ?? "modules";
      updateExtras({
        ...extras,
        [region]: { tab, percent: EXTRA_PANE_ENTRY, swapped: false },
      });
    },
    [extraPaneTab, extras, updateExtras, usedExtraTabs],
  );

  /** "Back to two parts": the region's extra pane is removed, its content with it. */
  const mergeRegion = useCallback(
    (region: SplitRegion) => {
      if (!extras[region]) return;
      updateExtras({ ...extras, [region]: null });
    },
    [extras, updateExtras],
  );

  const patchRegion = useCallback(
    (region: SplitRegion, patch: Partial<SplitExtraPane>) => {
      const pane = extras[region];
      if (!pane) return;
      updateExtras({ ...extras, [region]: { ...pane, ...patch } });
    },
    [extras, updateExtras],
  );

  /**
   * The split controls belong to BIG stages only (the owner's "tablet ki badi
   * screen size aur desktop ke liye hi"): the deck measures itself, so the
   * buttons follow the real stage, not the device name.
   */
  const wide = renderExtraPane ? deckWidth >= SPLIT_WIDE_MIN_PX : false;
  const row = axis === "row";

  const splitAction = useCallback(
    (region: SplitRegion): SplitDividerAction => ({
      id: `split-${region}`,
      label:
        region === "lesson"
          ? "Split the lesson area into one more part"
          : "Split the study area into one more part",
      icon: row ? (
        region === "lesson" ? <PanelLeft size={SWAP_ICON_PX} /> : <PanelRight size={SWAP_ICON_PX} />
      ) : region === "lesson" ? (
        <PanelTop size={SWAP_ICON_PX} />
      ) : (
        <PanelBottom size={SWAP_ICON_PX} />
      ),
      onPress: () => splitRegion(region),
    }),
    [row, splitRegion],
  );

  /** The controls the MAIN divider reveals (only for regions still splittable). */
  const mainActions = useMemo<SplitDividerAction[]>(() => {
    if (!wide) return [];
    const actions: SplitDividerAction[] = [];
    if (!extras.lesson) actions.push(splitAction("lesson"));
    if (!extras.study) actions.push(splitAction("study"));
    return actions;
  }, [extras.lesson, extras.study, splitAction, wide]);

  /** The controls a REGION's own divider reveals: merge, plus the other side. */
  const regionActions = useCallback(
    (region: SplitRegion): SplitDividerAction[] => {
      const other: SplitRegion = region === "lesson" ? "study" : "lesson";
      const actions: SplitDividerAction[] = [
        {
          id: `merge-${region}`,
          label: "Remove this extra part — back to two panes",
          icon: <X size={SWAP_ICON_PX} />,
          onPress: () => mergeRegion(region),
        },
      ];
      if (wide && !extras[other]) actions.push(splitAction(other));
      return actions;
    },
    [extras, mergeRegion, splitAction, wide],
  );

  const collapsedRef = useRef<SplitSide | null>(null);
  collapsedRef.current = collapsed;
  const lastRatioRef = useRef(DEFAULT_SPLIT_RATIO[axis]);
  const dragPointerRef = useRef<number | null>(null);
  const controlsRef = useRef<AnimationPlaybackControls | null>(null);

  const stopAnimation = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  const animateRatio = useCallback(
    (target: number, spring: { stiffness: number; damping: number; mass?: number }) => {
      stopAnimation();
      controlsRef.current = animate(ratio, target, { type: "spring", ...spring });
    },
    [ratio, stopAnimation],
  );

  /** A settled FREE ratio: remember it, persist it, keep a11y in sync. */
  const commit = useCallback(
    (percent: number) => {
      lastRatioRef.current = percent;
      saveSplitRatio(courseId, axis, percent);
      setAriaNow(Math.round(100 - percent));
    },
    [axis, courseId],
  );

  // The panes' flex-grow is written straight to the DOM on every frame of the
  // spring/drag: no React re-render, no layout thrash beyond the two writes.
  useMotionValueEvent(ratio, "change", (value) => {
    if (lessonRef.current) lessonRef.current.style.flexGrow = String(Math.max(0.0001, 100 - value));
    if (studyRef.current) studyRef.current.style.flexGrow = String(Math.max(0.0001, value));
    const side: SplitSide = value < 50 ? "study" : "lesson";
    setCompressed((current) => (current === side ? current : side));
  });

  // ── Entry: divider draws, study pane grows open ────────────────────────
  // The deck is the player's ONLY layout now (there is no off state), so the
  // entry choreography runs once on mount: the study pane grows from ~0 with
  // the entry spring while the lesson pane shrinks in the very same tick.
  useLayoutEffect(() => {
    const stored = loadSplitRatio(courseId, axis, floor);
    const storedCollapsed = loadSplitCollapsed(courseId, axis);
    // The extra panes come back with the course and the axis (a third pane
    // that fits a laptop has no place on a phone in portrait).
    setExtras(loadSplitExtras(courseId, axis));
    lastRatioRef.current = stored;
    collapsedRef.current = storedCollapsed;
    setCollapsed(storedCollapsed);
    setAriaNow(Math.round(100 - (storedCollapsed ? (storedCollapsed === "study" ? 0 : 100) : stored)));
    if (storedCollapsed) {
      ratio.set(storedCollapsed === "study" ? 0 : 100);
    } else {
      ratio.set(ENTRY_START);
      animateRatio(stored, SPRING_ENTRY);
    }
    // Mount only — the axis effect below owns every later change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The learner's arrangement comes back with the course (it is NOT per axis:
  // rotating the device must not quietly put the panes back the other way).
  useLayoutEffect(() => {
    setSwapped(loadSplitSwapped(courseId));
  }, [courseId]);

  /** The switch button: trade the panes' places, and remember it. */
  const toggleSwap = useCallback(() => {
    setSwapped((current) => {
      const next = !current;
      saveSplitSwapped(courseId, next);
      return next;
    });
  }, [courseId]);

  // ── Rotation: the other axis's own ratio + collapse come back ──────────
  const axisRunsRef = useRef(0);
  useEffect(() => {
    axisRunsRef.current += 1;
    // The first run is the mount, which the layout effect above already did.
    if (axisRunsRef.current === 1) return;
    const stored = loadSplitRatio(courseId, axis, floor);
    const storedCollapsed = loadSplitCollapsed(courseId, axis);
    setExtras(loadSplitExtras(courseId, axis));
    lastRatioRef.current = stored;
    setCollapsed(storedCollapsed);
    if (storedCollapsed) {
      animateRatio(storedCollapsed === "study" ? 0 : 100, SPRING_ENTRY);
      setAriaNow(storedCollapsed === "study" ? 100 : 0);
    } else {
      animateRatio(stored, SPRING_ENTRY);
      setAriaNow(Math.round(100 - stored));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axis, courseId, floor]);

  useEffect(() => () => stopAnimation(), [stopAnimation]);

  // ── Fill one side / peek rails ─────────────────────────────────────────
  const collapseTo = useCallback(
    (side: SplitSide) => {
      setCollapsed(side);
      saveSplitCollapsed(courseId, axis, side);
      animateRatio(side === "study" ? 0 : 100, SPRING_SETTLE);
      setAriaNow(side === "study" ? 100 : 0);
    },
    [animateRatio, axis, courseId],
  );

  const restore = useCallback(() => {
    if (!collapsedRef.current) return;
    setCollapsed(null);
    saveSplitCollapsed(courseId, axis, null);
    const target = clampSplitRatio(lastRatioRef.current || DEFAULT_SPLIT_RATIO[axis], floor);
    animateRatio(target, SPRING_ENTRY);
    commit(target);
  }, [animateRatio, axis, commit, courseId, floor]);

  const fiftyFifty = useCallback(() => {
    if (collapsedRef.current) {
      setCollapsed(null);
      saveSplitCollapsed(courseId, axis, null);
    }
    animateRatio(50, SPRING_SETTLE);
    commit(50);
  }, [animateRatio, axis, commit, courseId]);

  useImperativeHandle(
    handleRef,
    () => ({
      collapse: collapseTo,
      restore,
      fiftyFifty,
      toggleStudy: () => (collapsedRef.current === "study" ? restore() : collapseTo("study")),
      activateStudy: () => {
        if (collapsedRef.current === "study") restore();
      },
    }),
    [collapseTo, restore, fiftyFifty, handleRef],
  );

  // ── Drag: the proven pointer-capture pattern ───────────────────────────
  const ratioFromPointer = useCallback(
    (clientX: number, clientY: number): number | null => {
      const rect = sectionRef.current?.getBoundingClientRect();
      if (!rect) return null;
      // `ratio` is always the STUDY pane's percent. By default that pane is
      // the SECOND one (right of the divider in landscape, below it in
      // portrait), so its percent is measured from the far edge; once the
      // panes are swapped it is the FIRST one and the measurement flips, which
      // keeps the divider following the finger either way round.
      const raw =
        axis === "row"
          ? ((rect.right - clientX) / Math.max(1, rect.width)) * 100
          : ((rect.bottom - clientY) / Math.max(1, rect.height)) * 100;
      const oriented = swappedRef.current ? 100 - raw : raw;
      return Math.min(100, Math.max(0, oriented));
    },
    [axis],
  );

  const applySplitPercent = useCallback(
    (value: number) => {
      ratio.set(value);
    },
    [ratio],
  );

  const settleAfterDrag = useCallback(
    (raw: number) => {
      // Dragged to an edge → that side fills to 100% and the other becomes a
      // peek rail (the old CLOSE_THRESHOLD idea).
      if (raw <= FILL_THRESHOLD) { collapseTo("study"); return; }
      if (raw >= 100 - FILL_THRESHOLD) { collapseTo("lesson"); return; }
      const snap = SPLIT_SNAP_POINTS.find((point) => Math.abs(point - raw) <= SNAP_TOLERANCE);
      const target = clampSplitRatio(snap ?? raw, floor);
      // Snap (or clamp) animates; a free ratio is already where it should be.
      if (Math.abs(target - raw) > 0.01) animateRatio(target, SPRING_SETTLE);
      commit(target);
    },
    [animateRatio, collapseTo, commit, floor],
  );

  const onSplitPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const value = ratioFromPointer(event.clientX, event.clientY);
      if (value == null) return;
      event.preventDefault();
      stopAnimation();
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* fine without capture */ }
      dragPointerRef.current = event.pointerId;
      // Dragging a collapsed rail wakes the pane up: the finger takes over
      // from the very percent the deck is at.
      if (collapsedRef.current) {
        setCollapsed(null);
        saveSplitCollapsed(courseId, axis, null);
      }
      setDragging(true);
      applySplitPercent(value);
    },
    [applySplitPercent, axis, courseId, ratioFromPointer, stopAnimation],
  );

  const onSplitPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragPointerRef.current !== event.pointerId) return;
      const value = ratioFromPointer(event.clientX, event.clientY);
      if (value == null) return;
      applySplitPercent(value);
    },
    [applySplitPercent, ratioFromPointer],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragPointerRef.current !== event.pointerId) return;
      dragPointerRef.current = null;
      setDragging(false);
      try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* ignore */ }
      settleAfterDrag(ratio.get());
    },
    [ratio, settleAfterDrag],
  );

  const onSplitKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? KEY_STEP_FINE : KEY_STEP;
      const stepRatio = (delta: number) => {
        const base = collapsedRef.current ? lastRatioRef.current : ratio.get();
        if (collapsedRef.current) {
          setCollapsed(null);
          saveSplitCollapsed(courseId, axis, null);
        }
        const target = clampSplitRatio(base + delta, floor);
        animateRatio(target, SPRING_SETTLE);
        commit(target);
      };
      switch (event.key) {
        // Both arrow pairs work in both orientations, so the control never
        // feels dead after a rotation.
        case "ArrowUp":
        case "ArrowLeft":
          event.preventDefault();
          stepRatio(step);
          break;
        case "ArrowDown":
        case "ArrowRight":
          event.preventDefault();
          stepRatio(-step);
          break;
        case "Home":
          // Lesson full, study becomes a peek rail.
          event.preventDefault();
          collapseTo("study");
          break;
        case "End":
          // Study full, lesson becomes a peek rail.
          event.preventDefault();
          collapseTo("lesson");
          break;
        case "Enter":
        case " ":
        case "Spacebar":
          event.preventDefault();
          fiftyFifty();
          break;
        default:
          break;
      }
    },
    [animateRatio, axis, collapseTo, commit, courseId, fiftyFifty, floor, ratio],
  );

  // ── Soft keyboard: keep the writing surface above it ───────────────────
  // The deck's own inset (unchanged): the px its bottom edge gives back to an
  // OVERLAY keyboard, applied as `paddingBottom` below.
  const keyboardInset = useKeyboardInset(sectionRef);
  // The player's ONE keyboard state. It is a superset of the inset above: it
  // also sees the layout viewport that RESIZES under the keyboard (the engine
  // where the inset is 0 by definition), so the takeover engages either way —
  // and the footer navigation hides off the very same state.
  const { keyboardVisible } = useCourseKeyboard();

  /**
   * Keyboard takeover (phones): while the keyboard is open over a writing
   * tab (notes / mind map / the AI Mentor chat input), the study pane takes
   * the FULL deck — the lesson above it and the divider disappear entirely,
   * so no lesson pixel steals writing room. This is DERIVED, never persisted:
   * the moment the keyboard closes, the exact split the learner had (ratio +
   * collapse) is back, because nothing about it was ever touched. A desktop
   * keyboard never moves the viewport, so neither signal fires there and the
   * takeover simply never engages.
   */
  const keyboardTakeover = (keyboardInset > 0 || keyboardVisible) && keyboardExpandEnabled && collapsed !== "study";

  const paneSizeProp = axis === "row" ? "minWidth" : "minHeight";
  const initialRatio = ratio.get();
  // The swap is a pure FLEX REORDER: both panes stay exactly where they are
  // in the DOM (so nothing remounts) and only their visual slot changes —
  // 0 = before the divider, 2 = after it.
  const lessonStyle: CSSProperties = {
    flexGrow: Math.max(0.0001, 100 - initialRatio),
    flexShrink: 1,
    flexBasis: "0%",
    order: swapped ? 2 : 0,
    ...(collapsed === "lesson" ? { [paneSizeProp]: PEEK_RAIL_PX } : { [paneSizeProp]: 0 }),
  };
  const studyStyle: CSSProperties = {
    flexGrow: Math.max(0.0001, initialRatio),
    flexShrink: 1,
    flexBasis: "0%",
    order: swapped ? 0 : 2,
    ...(collapsed === "study" ? { [paneSizeProp]: PEEK_RAIL_PX } : { [paneSizeProp]: 0 }),
  };

  const deckStyle = useMemo<CSSProperties>(
    () => ({ paddingBottom: keyboardInset ? keyboardInset : undefined }),
    [keyboardInset],
  );

  /**
   * The extra panes' CONTENT. The player renders it (the deck never knows what
   * a study tab shows); the deck only decides that a pane exists, what tab it
   * opens on and how much of the region it takes. Each pane gets its own
   * `setTab`, so two parts can show two different tabs at once — which is the
   * whole point of splitting.
   */
  const buildExtraPane = useCallback(
    (region: SplitRegion) => {
      const pane = extras[region];
      if (!pane || !renderExtraPane) return null;
      return renderExtraPane(region, pane.tab, (tab: string) => patchRegion(region, { tab }));
    },
    [extras, patchRegion, renderExtraPane],
  );
  const lessonExtra = buildExtraPane("lesson");
  const studyExtra = buildExtraPane("study");

  return (
    <div
      ref={sectionRef}
      className={`relative flex min-h-0 min-w-0 flex-1 overflow-hidden ${axis === "row" ? "flex-row" : "flex-col"}`}
      data-course-split-deck=""
      data-split-axis={axis}
      data-orientation={orientation}
      data-dragging={dragging ? "true" : "false"}
      data-split-collapsed={collapsed ?? "none"}
      data-split-swapped={swapped ? "true" : "false"}
      data-split-compressed={dragging && compressed ? compressed : "none"}
      data-keyboard-inset={keyboardInset || undefined}
      data-keyboard-takeover={keyboardTakeover ? "true" : undefined}
      style={deckStyle}
    >
      {/* ── Lesson pane: the lossless viewer stack, only ever resized ──
          Hidden entirely during a keyboard takeover (the mounted viewers
          keep their state — only the box is gone). */}
      <div
        ref={lessonRef}
        className="relative min-h-0 min-w-0 overflow-hidden"
        data-course-lesson-pane=""
        data-collapsed={collapsed === "lesson" ? "true" : "false"}
        style={keyboardTakeover ? { display: "none" } : lessonStyle}
      >
        {/* The lesson side's second part (wide stages): the viewer stack keeps
            its own box, and the added pane sits beside it. The viewer stack is
            still never unmounted — it only gets a narrower box. */}
        {lessonExtra ? (
          <ExtraPaneRegion
            axis={axis}
            region="lesson"
            className={`h-full w-full ${row ? "flex-row" : "flex-col"}`}
            primary={
              <div
                className="absolute inset-0 min-h-0 min-w-0 overflow-hidden"
                data-course-lesson-content=""
                style={collapsed === "lesson" ? { pointerEvents: "none" } : undefined}
              >
                {lesson}
              </div>
            }
            extra={lessonExtra}
            percent={extras.lesson?.percent ?? EXTRA_PANE_DEFAULT}
            onPercent={(percent) => patchRegion("lesson", { percent })}
            swapped={extras.lesson?.swapped === true}
            onSwap={() => patchRegion("lesson", { swapped: !(extras.lesson?.swapped === true) })}
            actions={regionActions("lesson")}
          />
        ) : (
          <div
            className="absolute inset-0 min-h-0 min-w-0 overflow-hidden"
            data-course-lesson-content=""
            style={collapsed === "lesson" ? { pointerEvents: "none" } : undefined}
          >
            {lesson}
          </div>
        )}
        {collapsed === "lesson" ? (
          <PeekRail
            side="lesson"
            glowSide={swapped ? "study" : "lesson"}
            axis={axis}
            accent={accent}
            icon={PlayCircle}
            label="Show the lesson pane"
            breathe={!cheap}
            onRestore={restore}
          />
        ) : null}
      </div>

      {/* The divider is gone during a keyboard takeover — there is nothing
          left to divide while the study pane owns the whole deck. */}
      {keyboardTakeover ? null : (
        <SplitDivider
          axis={axis}
          ratio={ratio}
          dragging={dragging}
          ariaNow={ariaNow}
        collapsed={collapsed}
        onPointerDown={onSplitPointerDown}
        onPointerMove={onSplitPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={fiftyFifty}
          onKeyDown={onSplitKeyDown}
          swapped={swapped}
          onSwap={toggleSwap}
          actions={mainActions}
        />
      )}

      {/* ── Study pane: the study tabs AND the footer dock, inside the split ──
          tint 0.3 (≤ 0.35) so notes, the map canvas and the module lists stay
          readable in both themes. */}
      <div
        ref={studyRef}
        className="relative min-h-0 min-w-0 overflow-hidden"
        data-course-study-pane=""
        data-orientation={orientation}
        data-solid-panel={solid ? "true" : "false"}
        data-collapsed={collapsed === "study" ? "true" : "false"}
        style={studyStyle}
      >
        <GlassSurface
          tint={0.3}
          radius={0}
          className="h-full w-full"
          contentClassName="flex h-full min-h-0 flex-col overflow-hidden"
        >
          {/* The study side's second part (wide stages). During a keyboard
              takeover the pair steps aside entirely: the writing surface gets
              the whole deck, exactly like the lesson side does. */}
          {studyExtra && !keyboardTakeover ? (
            <ExtraPaneRegion
              axis={axis}
              region="study"
              className={`min-h-0 min-w-0 flex-1 ${row ? "flex-row" : "flex-col"}`}
              primary={
                /* Study content fades in and rises 8px behind the divider's draw. */
                <motion.div
                  className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: 0.06, ease: EASE_OUT_MOTION }}
                  style={collapsed === "study" ? { pointerEvents: "none" } : undefined}
                >
                  {study}
                </motion.div>
              }
              extra={studyExtra}
              percent={extras.study?.percent ?? EXTRA_PANE_DEFAULT}
              onPercent={(percent) => patchRegion("study", { percent })}
              swapped={extras.study?.swapped === true}
              onSwap={() => patchRegion("study", { swapped: !(extras.study?.swapped === true) })}
              actions={regionActions("study")}
            />
          ) : (
            /* Study content fades in and rises 8px behind the divider's draw. */
            <motion.div
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: 0.06, ease: EASE_OUT_MOTION }}
              style={collapsed === "study" ? { pointerEvents: "none" } : undefined}
            >
              {study}
            </motion.div>
          )}
        </GlassSurface>
        {collapsed === "study" ? (
          <PeekRail
            side="study"
            glowSide={swapped ? "lesson" : "study"}
            axis={axis}
            accent={accent}
            icon={studyIcon}
            label="Show the study pane"
            breathe={!cheap}
            onRestore={restore}
          />
        ) : null}
      </div>
    </div>
  );
}

export default SplitDeck;
