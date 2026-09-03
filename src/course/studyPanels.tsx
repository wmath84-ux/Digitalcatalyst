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
//   · SplitDivider — the draggable glass divider: 44px hit area, a 2px core
//                    line in the active tab's colour, a glass grabber with
//                    three dots, a live % bubble, one soft pulse ring per snap
//                    point crossed, full keyboard control.
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
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, type AnimationPlaybackControls, type MotionValue } from "framer-motion";
import { PlayCircle } from "lucide-react";
import { GlassSurface } from "../components/ui/glass";
import {
  DEFAULT_SPLIT_RATIO,
  DIVIDER_HIT,
  ENTRY_START,
  EASE_OUT,
  EASE_OUT_MOTION,
  FILL_THRESHOLD,
  KEY_STEP,
  KEY_STEP_FINE,
  PEEK_RAIL_PX,
  PULSE_TOLERANCE,
  SNAP_TOLERANCE,
  SPLIT_DOCK_MIN_PX,
  SPLIT_MAX,
  SPLIT_MIN,
  SPLIT_SHORT_VIEWPORT_PX,
  SPLIT_SMALL_SCREEN_PX,
  SPLIT_SNAP_POINTS,
  SPRING_ENTRY,
  SPRING_MAG,
  SPRING_SETTLE,
  clampSplitRatio,
  loadSplitCollapsed,
  loadSplitRatio,
  saveSplitCollapsed,
  saveSplitRatio,
  splitFloorFor,
  type SplitAxis,
  type SplitSide,
} from "./splitMotion";

/** The glass tokens every split surface is built from (Phase-2 discipline). */
const CHROME_GLASS: CSSProperties = {
  background: "var(--dc-chrome-glass)",
  backdropFilter: "var(--dc-chrome-glass-blur)",
  WebkitBackdropFilter: "var(--dc-chrome-glass-blur)",
  boxShadow: "var(--dc-chrome-glass-rim)",
};

/** Coarse pointers drop the pulse ring (a cheap scale-only deck instead). */
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
  axis,
  accent,
  icon: Icon,
  label,
  breathe,
  onRestore,
}: {
  side: SplitSide;
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
      <span aria-hidden style={railGlowStyle(axis, side, accent)} data-peek-glow="" />
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

interface SplitDividerProps {
  axis: SplitAxis;
  /** The active tab's colour — the core line, the glow and the focus ring. */
  accent: string;
  ratio: MotionValue<number>;
  dragging: boolean;
  /** Bumped once per snap point crossed mid-drag → one soft pulse ring. */
  pulseKey: number;
  /** Coarse pointer / reduced motion: no pulse ring, no breathing. */
  cheap: boolean;
  /** Lesson-side percent, kept in React state for the a11y read-out. */
  ariaNow: number;
  collapsed: SplitSide | null;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}

function SplitDivider({
  axis,
  accent,
  ratio,
  dragging,
  pulseKey,
  cheap,
  ariaNow,
  collapsed,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDoubleClick,
  onKeyDown,
}: SplitDividerProps) {
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const bubbleTextRef = useRef<HTMLSpanElement | null>(null);
  const row = axis === "row"; // landscape → a vertical divider

  // The live read-out never goes through React: the bubble's text and the
  // separator's aria-valuenow are written straight to the DOM on every frame.
  useMotionValueEvent(ratio, "change", (value) => {
    const study = Math.round(value);
    const lesson = 100 - study;
    if (bubbleTextRef.current) bubbleTextRef.current.textContent = `${lesson}% · ${study}%`;
    dividerRef.current?.setAttribute("aria-valuenow", String(Math.min(100, Math.max(0, lesson))));
  });

  // The three grabber dots: dim at rest, bright on a desktop hover, and gone
  // while dragging (the % bubble takes the grabber's place). Opacity lives in
  // classes, not inline, so the hover rule can actually win.
  const dot = (
    <span
      className="block h-[3px] w-[3px] shrink-0 rounded-full opacity-70 transition-opacity duration-200 group-hover:opacity-100"
      style={{ background: accent }}
    />
  );

  return (
    <div
      ref={dividerRef}
      role="separator"
      tabIndex={0}
      aria-orientation={row ? "vertical" : "horizontal"}
      aria-label="Split deck divider — drag to resize the lesson and study panes"
      aria-valuemin={SPLIT_MIN}
      aria-valuemax={SPLIT_MAX}
      aria-valuenow={ariaNow}
      data-course-split-divider=""
      data-axis={axis}
      data-dragging={dragging ? "true" : "false"}
      data-collapsed={collapsed ?? "none"}
      className={`group relative z-30 flex shrink-0 items-center justify-center ${
        row ? "h-full cursor-col-resize flex-col" : "w-full cursor-row-resize"
      }`}
      style={{
        // A real 44px target on the axis that matters, and no browser gesture
        // stealing the drag (the whole point of `touch-action: none`).
        flex: `0 0 ${DIVIDER_HIT}px`,
        touchAction: "none",
        ["--split-accent" as string]: accent,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    >
      {/* 2px core line in the active tab's colour. It draws itself along its
          own axis when the deck opens (240ms, the pack's ease) and glides to
          the new tab colour over 300ms. */}
      <motion.span
        key={axis}
        aria-hidden
        data-course-split-line=""
        className={row ? "h-full w-[2px] rounded-full" : "h-[2px] w-full rounded-full"}
        style={{
          background: accent,
          boxShadow: `0 0 14px ${accent}66`,
          transition: `background-color 300ms ${EASE_OUT}, box-shadow 300ms ${EASE_OUT}`,
        }}
        initial={row ? { scaleY: 0, scaleX: 1 } : { scaleX: 0, scaleY: 1 }}
        animate={{ scaleX: 1, scaleY: 1 }}
        transition={{ duration: 0.24, ease: EASE_OUT_MOTION }}
      />

      {/* Centred glass grabber: 24×24 pill, three 3px dots, spring to 1.15
          while dragging (the dock's own magnification spring). */}
      <motion.span
        aria-hidden
        data-course-split-grabber=""
        className="absolute left-1/2 top-1/2 flex h-6 w-6 items-center justify-center rounded-full"
        style={{
          x: "-50%",
          y: "-50%",
          ...CHROME_GLASS,
          boxShadow: `var(--dc-chrome-glass-rim), 0 0 12px ${accent}33`,
          willChange: dragging ? "transform" : undefined,
        }}
        animate={{ scale: dragging ? 1.15 : 1 }}
        transition={{ type: "spring", ...SPRING_MAG }}
      >
        <span className={`flex items-center justify-center gap-[3px] ${row ? "flex-col" : "flex-row"}`}>
          {dot}
          {dot}
          {dot}
        </span>
      </motion.span>

      {/* The magnetic click: ONE soft ring per snap point crossed mid-drag.
          Coarse pointers skip it entirely (cheap decks on mid-range phones). */}
      {!cheap && pulseKey > 0 ? (
        <motion.span
          key={pulseKey}
          aria-hidden
          data-course-split-pulse=""
          className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 rounded-full"
          style={{ x: "-50%", y: "-50%", boxShadow: `0 0 0 2px ${accent}66` }}
          initial={{ opacity: 0.85, scale: 0.7 }}
          animate={{ opacity: 0, scale: 2.1 }}
          transition={{ duration: 0.45, ease: EASE_OUT_MOTION }}
        />
      ) : null}

      {/* Live % bubble — glass pill centred on the grabber: "64% · 36%"
          (lesson · study). Fades in with the drag, text written imperatively. */}
      <motion.span
        aria-hidden
        data-course-split-ratio-bubble=""
        className="pointer-events-none absolute left-1/2 top-1/2 z-40 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-black leading-none"
        style={{ x: "-50%", y: "-50%", ...CHROME_GLASS, color: "var(--course-text)" }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: dragging ? 1 : 0, scale: dragging ? 1 : 0.9 }}
        transition={{ duration: 0.16, ease: EASE_OUT_MOTION }}
      >
        <span ref={bubbleTextRef} data-course-split-ratio-value="" />
      </motion.span>
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
}

export interface SplitDeckProps {
  /** "column" = portrait (lesson above study); "row" = landscape (left/right). */
  axis: SplitAxis;
  orientation: "portrait" | "landscape";
  /** Ratios + collapse are remembered per course and per axis. */
  courseId: string;
  /** The active study tab's colour (divider line, glow, focus ring, rail). */
  accent: string;
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
  const [dragging, setDragging] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [ariaNow, setAriaNow] = useState(100 - ENTRY_START);
  /** While dragging, the smaller pane leans on its divider-side edge. */
  const [compressed, setCompressed] = useState<SplitSide | null>(null);

  const collapsedRef = useRef<SplitSide | null>(null);
  collapsedRef.current = collapsed;
  const lastRatioRef = useRef(DEFAULT_SPLIT_RATIO[axis]);
  const dragPointerRef = useRef<number | null>(null);
  const lastPulseRef = useRef<number | null>(null);
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

  // ── Rotation: the other axis's own ratio + collapse come back ──────────
  const axisRunsRef = useRef(0);
  useEffect(() => {
    axisRunsRef.current += 1;
    // The first run is the mount, which the layout effect above already did.
    if (axisRunsRef.current === 1) return;
    const stored = loadSplitRatio(courseId, axis, floor);
    const storedCollapsed = loadSplitCollapsed(courseId, axis);
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
    }),
    [collapseTo, restore, fiftyFifty, handleRef],
  );

  // ── Drag: the proven pointer-capture pattern ───────────────────────────
  const ratioFromPointer = useCallback(
    (clientX: number, clientY: number): number | null => {
      const rect = sectionRef.current?.getBoundingClientRect();
      if (!rect) return null;
      // The study pane is the SECOND one: right of the divider in landscape,
      // below it in portrait — so its percent is measured from the far edge.
      const raw =
        axis === "row"
          ? ((rect.right - clientX) / Math.max(1, rect.width)) * 100
          : ((rect.bottom - clientY) / Math.max(1, rect.height)) * 100;
      return Math.min(100, Math.max(0, raw));
    },
    [axis],
  );

  const applySplitPercent = useCallback(
    (value: number) => {
      ratio.set(value);
      if (cheap) return;
      // One pulse per snap point crossed — the "magnetic click".
      const near = SPLIT_SNAP_POINTS.find((point) => Math.abs(point - value) <= PULSE_TOLERANCE) ?? null;
      if (near != null && near !== lastPulseRef.current) {
        lastPulseRef.current = near;
        setPulseKey((key) => key + 1);
      } else if (near == null) {
        lastPulseRef.current = null;
      }
    },
    [cheap, ratio],
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
      lastPulseRef.current = null;
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

  // ── Soft keyboard: keep the notes editor above it ──────────────────────
  const keyboardInset = useKeyboardInset(sectionRef);

  const paneSizeProp = axis === "row" ? "minWidth" : "minHeight";
  const initialRatio = ratio.get();
  const lessonStyle: CSSProperties = {
    flexGrow: Math.max(0.0001, 100 - initialRatio),
    flexShrink: 1,
    flexBasis: "0%",
    ...(collapsed === "lesson" ? { [paneSizeProp]: PEEK_RAIL_PX } : { [paneSizeProp]: 0 }),
  };
  const studyStyle: CSSProperties = {
    flexGrow: Math.max(0.0001, initialRatio),
    flexShrink: 1,
    flexBasis: "0%",
    ...(collapsed === "study" ? { [paneSizeProp]: PEEK_RAIL_PX } : { [paneSizeProp]: 0 }),
  };

  const deckStyle = useMemo<CSSProperties>(
    () => ({ paddingBottom: keyboardInset ? keyboardInset : undefined }),
    [keyboardInset],
  );

  return (
    <div
      ref={sectionRef}
      className={`relative flex min-h-0 min-w-0 flex-1 overflow-hidden ${axis === "row" ? "flex-row" : "flex-col"}`}
      data-course-split-deck=""
      data-split-axis={axis}
      data-orientation={orientation}
      data-dragging={dragging ? "true" : "false"}
      data-split-collapsed={collapsed ?? "none"}
      data-split-compressed={dragging && compressed ? compressed : "none"}
      data-keyboard-inset={keyboardInset || undefined}
      style={deckStyle}
    >
      {/* ── Lesson pane: the lossless viewer stack, only ever resized ── */}
      <div
        ref={lessonRef}
        className="relative min-h-0 min-w-0 overflow-hidden"
        data-course-lesson-pane=""
        data-collapsed={collapsed === "lesson" ? "true" : "false"}
        style={lessonStyle}
      >
        <div
          className="absolute inset-0 min-h-0 min-w-0 overflow-hidden"
          data-course-lesson-content=""
          style={collapsed === "lesson" ? { pointerEvents: "none" } : undefined}
        >
          {lesson}
        </div>
        {collapsed === "lesson" ? (
          <PeekRail
            side="lesson"
            axis={axis}
            accent={accent}
            icon={PlayCircle}
            label="Show the lesson pane"
            breathe={!cheap}
            onRestore={restore}
          />
        ) : null}
      </div>

      <SplitDivider
        axis={axis}
        accent={accent}
        ratio={ratio}
        dragging={dragging}
        pulseKey={pulseKey}
        cheap={cheap}
        ariaNow={ariaNow}
        collapsed={collapsed}
        onPointerDown={onSplitPointerDown}
        onPointerMove={onSplitPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={fiftyFifty}
        onKeyDown={onSplitKeyDown}
      />

      {/* ── Study pane: the five tabs AND the footer dock, inside the split ──
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
          {/* Study content fades in and rises 8px behind the divider's draw. */}
          <motion.div
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: 0.06, ease: EASE_OUT_MOTION }}
            style={collapsed === "study" ? { pointerEvents: "none" } : undefined}
          >
            {study}
          </motion.div>
        </GlassSurface>
        {collapsed === "study" ? (
          <PeekRail
            side="study"
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
