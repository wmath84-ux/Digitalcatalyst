// src/course/QuadDeck.tsx
//
// THE PLUS DECK — the owner's desktop/tablet layout, in his own words
// (2026-10-16):
//
//   "Tum clear puri screen ko char parts mein divide kar do dividers use karke
//    + shape, ek horizontal aur ek vertical. Left ki first split area mein
//    video chalega (main content wala area), uske just niche wala resource
//    library wala page, right mein top wala notes, aur bottom right wala mind
//    map. Divider to do hi honge lekin char dabbe banenge. … Har divider
//    hamesha drag ho sake, resizable rahe.
//
//    Ab jab bhi click karoge — kisi bhi divider ke segment ke THEEK CENTER pe —
//    ek chhota popup khule jisme do swap button ho: ek left-right swap kare
//    (vertical divider) aur ek top-bottom (horizontal divider). Bahar kahin bhi
//    click karne pe popup apne aap band ho jaye. Swap button dabane par bhi
//    swap ke baad band ho jaye.
//
//    Usi popup mein char quadrant ke close/open button ho: c11, c12, c21, c22.
//    Agar user ne c22 band kar diya to divider pe click karne par wahi button
//    'c22+' likha aaye aur dabane par wapas khul jaye.
//
//    Iske alawa aur bhi grid-format ke button: 1-upar / 3-neeche aur uska
//    ulta, 2-upar / 1-neeche aur uska ulta (sabse zaruri), aur ek button jo
//    simple single divider se 2 screen banaye — right taraf resource page aur
//    uske niche footer navigation, left taraf main player area."
//
// What this file is:
//
//   · the deck itself — a CSS grid whose row/column templates come from
//     `quadLayout.ts` (the pure model: shapes, closed panes, the two ratios),
//     with the panes handed in ready-rendered (the player, the Resource
//     Library, Notes, the Mind map) so the deck owns arrangement and nothing
//     else;
//   · every divider the shape needs — ONE vertical, ONE horizontal, and the
//     SECOND vertical the three-column shape brings (the owner's "teen screen
//     side by side", 2026-10-16) — each drawn as half segments with a dot at
//     every half's centre: those dots are the owner's "divider ke segment ke
//     theek center" click targets, and the guides the brief asks for;
//   · the ONE control cluster a dot opens: the two swaps, the four quadrant
//     buttons (a closed block reads `c22+`), and every grid shape — grouped,
//     scrollable (~6 rows visible, the rest scrolls), never a pile of loose
//     buttons on the line;
//   · the zoom + divider-visibility the Course view page sets.
//
// Rules kept from the brief, in the code below:
//   · every divider always drags (no mode, no gate, no "unlock" step), and the
//     two verticals can never cross — a small gap always stays between them;
//   · outside click closes the cluster — and so does pressing a swap, a
//     quadrant or a shape button;
//   · the cluster opens at the dot that was pressed and never leaves the deck;
//   · mobile never sees any of this — the deck only mounts from 768px up
//     (see `useQuadDeckEnabled`), so the phone keeps today's player untouched.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeftRight, ArrowUpDown, Move } from "lucide-react";
import { DIVIDER_HIT, DIVIDER_LINE, EASE_OUT_MOTION, PEEK_STRIP_PX } from "./splitMotion";
import type { CourseViewSettings } from "./courseViewSettings";
import {
  clampQuadFlex,
  moveQuadFlexArm,
  moveQuadFlexJoint,
  quadFlexArms,
  quadFlexJoint,
  quadFlexSignature,
  setQuadFlexArm,
  QUAD_FLEX_X_MAX,
  QUAD_FLEX_X_MIN,
  QUAD_FLEX_Y_MAX,
  QUAD_FLEX_Y_MIN,
  type QuadArmKey,
  type QuadFlexState,
} from "./quadFlex";
import type { BlockPageKey, BlockPageRecord } from "./blockPages";
import BlockPicker from "./BlockPicker";
import { pageHistoryOf, pushPageHistory } from "./pageHistory";
import { quadSetBlockPage, quadSetFocus, quadSwapFlex } from "./quadLayout";
import {
  QUAD_COL2_MAX,
  QUAD_COL2_MIN,
  QUAD_COL_MAX,
  QUAD_COL_MIN,
  QUAD_FORMAT_ORDER,
  QUAD_FORMATS,
  QUAD_PANE_ORDER,
  QUAD_PANE_SLOT,
  QUAD_ROW_MAX,
  QUAD_ROW_MIN,
  QUAD_SLOT_LABEL,
  QUAD_TRIPLE_GAP,
  clampQuadCol,
  clampQuadCol2,
  clampQuadRow,
  quadTripleCols,
  quadDeckRows,
  quadPaneButtons,
  quadPaneVisible,
  quadRowColumns,
  quadRows,
  quadSetFormat,
  quadSwap,
  quadTogglePane,
  type QuadFormat,
  type QuadLayoutState,
  type QuadPaneId,
} from "./quadLayout";
import type { FooterNavigationPlacement } from "../utils/footerNavigationPlacement";
import "./course-quad-deck.css";

/** How far one arrow-key step moves a divider. */
const QUAD_KEY_STEP = 2;

/**
 * A divider this close to its own clamp has SQUEEZED its panes together: the
 * deck then keeps a slightly wider gap between them and shows the small icon
 * that puts the divider back where it was (owner: "do pages ke window ko lakar
 * compress karke sata deta hai to unke bich mein ek chhota sa gap dikhna
 * chahiye aur icon bhi dikhe … click karne per vah apne previous area mein
 * directly expand ho jata tha").
 */
const QUAD_SQUEEZE_EPS = 0.6;
/** The gap the deck keeps around a squeezed divider (vs the usual 10px). */
const QUAD_SQUEEZE_GAP = 18;

/**
 * The three draggable lines: the vertical divider, the SECOND vertical divider
 * (the three-column shape) and the horizontal divider.
 */
type QuadAxisKey = "v" | "v2" | "h";

/** One half of a divider — the small dot the cluster opens from. */
type QuadSegment = "vTop" | "vBottom" | "v2" | "hLeft" | "hRight";

/** The value one line sits at, in percent. */
const quadAxisValue = (state: QuadLayoutState, axis: QuadAxisKey): number =>
  axis === "v" ? state.col : axis === "v2" ? state.col2 : state.row;

/** How long a pane glows after the navigation brings it back. */
const QUAD_FOCUS_MS = 1600;

export interface QuadDeckProps {
  /** The shape + both ratios. Owned by the player (it also persists them). */
  state: QuadLayoutState;
  /** Every settled change (drag release, keyboard step, a button press). */
  onState: (next: QuadLayoutState) => void;
  /** Course view page: zoom + the four divider-segment switches. */
  view: CourseViewSettings;
  /** Where the navigation sits — panes step their own chrome out of its way. */
  navSide: FooterNavigationPlacement;
  /** c11 — the main content (the video / lesson stack). Always mounted. */
  player: ReactNode;
  /** c12 — Notes. */
  notes: ReactNode;
  /** c21 — the Resource Library page. */
  resources: ReactNode;
  /** c22 — the Mind map. */
  mindmap: ReactNode;
  /**
   * c11's second face: the study body of a tab that has no pane of its own
   * (Music, Read, Brain, Live Experiment, Sketch, AI, Player settings, Paid)
   * plus the surfaces that outlive a tab switch. It stays MOUNTED whenever it
   * is handed in — the player face does too — so a playing video or song never
   * loses its place to a tab switch.
   */
  study?: ReactNode;
  /**
   * Whether that second face is the one on screen. Defaults to true when
   * `study` is given; the player passes false while a tab WITH a pane of its
   * own is active, so the borrowed stack is hidden but still mounted.
   */
  studyVisible?: boolean;
  /** The navigation, for the single-divider shape's strip under the library. */
  resourcesFooter?: ReactNode;
  /**
   * "Bring this block back" — bumped when the navigation picks a tab that has
   * its own pane (`{ pane, count }`, the same signal shape the Notes panel
   * takes for master notes).
   */
  reveal?: { pane: QuadPaneId; count: number } | null;
  /**
   * FREE BLOCKS (the owner's 2026-10-16+ upgrade): when given, every block
   * starts on its blank picker page and the learner opens ANY course player
   * page in it — plus the DYNAMIC CROSS on the 2×2 shape (four half-dividers,
   * each with its own drag, all meeting at the draggable centre joint). The
   * four fixed pane props above stay for callers that map pages themselves
   * (Work mode's deck).
   */
  blocks?: {
    /** The picker's catalog (hidden tabs already filtered out). */
    catalog: readonly BlockPageRecord[];
    /** Render one page's panel inside a block. */
    renderPage: (page: BlockPageKey, pane: QuadPaneId) => ReactNode;
  };
}

/* ── The little layout glyphs ───────────────────────────────────────────── */

/**
 * The shape of a layout, drawn as THIN BARS — "format ke icon aise banao ki
 * user ko samajh aaye ki ye kaunsa format hai; note-format ke button patli
 * bars ho". One bar per block, in the block's own place, so the button looks
 * like what it does.
 */
function QuadGlyph({ rows, accent }: { rows: QuadPaneId[][]; accent?: QuadPaneId }) {
  return (
    <span className="dc-quad-glyph" aria-hidden data-quad-glyph={rows.map((row) => row.join("")).join("-")}>
      {rows.map((row, index) => (
        <span key={`${index}-${row.join("")}`} className="dc-quad-glyph__row" data-bars={row.length}>
          {row.map((pane) => (
            <span
              key={pane}
              className="dc-quad-glyph__bar"
              data-pane={pane}
              data-accent={accent === pane ? "true" : "false"}
            />
          ))}
        </span>
      ))}
    </span>
  );
}

/** The 2×2 frame the quadrant buttons draw, with the closed blocks dimmed. */
const QUAD_BUTTON_GLYPH_ROWS: QuadPaneId[][] = [
  ["c11", "c12"],
  ["c21", "c22"],
];

function QuadMenuButton({
  label,
  text,
  glyph,
  onPress,
  attrs,
  disabled,
}: {
  label: string;
  text: string;
  glyph: ReactNode;
  onPress: () => void;
  attrs: Record<string, string>;
  /** Refused presses (the last block on screen) — drawn but inert. */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="dc-quad-btn"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-disabled={disabled ? "true" : "false"}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onPress();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      {...attrs}
    >
      <span className="dc-quad-btn__glyph" aria-hidden>
        {glyph}
      </span>
      <span className="dc-quad-btn__text">{text}</span>
      {/* The owner's guide dots: every button carries its own dot, and the dot
          under the pressed button is the lit one. */}
      <span className="dc-quad-btn__dot" aria-hidden data-quad-dot />
    </button>
  );
}

/* ── One free block: its blank picker, its pages, its back button ───────── */

/**
 * A block's content in FREE-BLOCKS mode. Every block starts on the white
 * picker ("block Keval aur Keval ek blank page se start hoga"); a page the
 * learner opens stays mounted here (hidden behind the current one) so a
 * playing video or song never loses its place to a page switch.
 *
 * The owner's 2026-10-16+ revision: the per-page top-left Back button and the
 * per-block top-right "Pages" switch are GONE — their one job (back to the
 * selection page) now belongs to the header's Pages button, which acts on the
 * ACTIVE block (the one the learner touched last). The block's own history
 * store keeps recording in the background.
 */
function FreeBlock({
  pane,
  page,
  pagesRecord,
  catalog,
  renderPage,
  onOpen,
}: {
  pane: QuadPaneId;
  page: BlockPageKey | null;
  pagesRecord: Record<QuadPaneId, BlockPageKey | null>;
  catalog: readonly BlockPageRecord[];
  renderPage: (page: BlockPageKey, pane: QuadPaneId) => ReactNode;
  onOpen: (pane: QuadPaneId, page: BlockPageKey | null) => void;
}) {
  const scope = `block:${pane}`;
  const [, bump] = useState(0);
  const openedRef = useRef<BlockPageKey[]>([]);

  // Keep-alive: the pages this block has opened, minus any page that has
  // moved to another block ("user koi bhi page kisi bhi block mein open kar
  // sakta hai" — a pick elsewhere MOVES it).
  useEffect(() => {
    const kept = openedRef.current.filter((candidate) => {
      for (const [otherPane, otherPage] of Object.entries(pagesRecord)) {
        if (otherPane !== pane && otherPage === candidate) return false;
      }
      return true;
    });
    if (page && !kept.includes(page)) kept.push(page);
    const changed =
      kept.length !== openedRef.current.length ||
      kept.some((candidate, index) => openedRef.current[index] !== candidate);
    if (changed) {
      openedRef.current = kept;
      bump((n) => n + 1);
    }
  }, [page, pagesRecord, pane]);

  // The blank page is a page too: the walk starts on it so Back from a page
  // opened later always has somewhere to land.
  useEffect(() => {
    if (pageHistoryOf(scope).length === 0) pushPageHistory(scope, page ?? "blank");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  return (
    <div className="dc-quad-free" data-quad-free={pane} data-quad-free-page={page ?? "blank"}>
      {page === null ? (
        <BlockPicker
          pane={pane}
          pages={catalog}
          taken={pagesRecord}
          onPick={(picked) => onOpen(pane, picked)}
        />
      ) : null}
      {openedRef.current.map((opened) => (
        <div
          key={opened}
          className="dc-quad-free__layer"
          data-quad-free-layer={opened}
          hidden={opened !== page}
        >
          {renderPage(opened, pane)}
        </div>
      ))}
    </div>
  );
}

/* ── The deck ───────────────────────────────────────────────────────────── */

export default function QuadDeck({
  state,
  onState,
  view,
  navSide,
  player,
  notes,
  resources,
  mindmap,
  study,
  studyVisible,
  resourcesFooter,
  reveal,
  blocks,
}: QuadDeckProps) {
  const borrowedVisible = Boolean(study) && (studyVisible ?? true);
  const reducedMotion = useReducedMotion() === true;

  const deckRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ axis: QuadAxisKey; start: number; base: number; live: number } | null>(null);
  const [dragging, setDragging] = useState<QuadAxisKey | QuadArmKey | "joint" | null>(null);
  const [menu, setMenu] = useState<
    { divider: QuadAxisKey | "flex"; segment: QuadSegment | QuadArmKey | "joint" } | null
  >(null);
  const [focusPane, setFocusPane] = useState<QuadPaneId | null>(null);

  const commit = onState;

  /* The navigation asked for a block (a pane tab was tapped): bring it back
     and let it glow for a moment. Reads the live state through a ref so a
     later drag never re-triggers this. */
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (!reveal) return undefined;
    const pane = reveal.pane;
    setFocusPane(pane);
    const current = stateRef.current;
    if (!quadPaneVisible(current, pane)) onState(quadTogglePane(current, pane));
    const timer = setTimeout(() => setFocusPane(null), QUAD_FOCUS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);

  const rows = useMemo(() => quadRows(state), [state]);
  const hasVertical = rows.some((row) => row.length >= 2);
  const hasHorizontal = rows.length >= 2;
  const cross = hasVertical && hasHorizontal;

  /* ── The squeeze: two blocks pressed together ───────────────────────────
   * A divider sitting on its clamp has compressed its blocks as far as the
   * deck allows. The last ROOMY value of each axis is remembered, so the small
   * icon in the gap can put that divider straight back where it was. */
  /* The three-column shape (and the owner's "1 upar · 3 niche" shapes) hold a
     row of three blocks: that row has TWO vertical dividers, both draggable. */
  const secondVertical = rows.some((row) => row.length >= 3);
  const tripleRowIndex = rows.findIndex((row) => row.length >= 3);
  const rowSplit = clampQuadRow(state.row);
  const secondSpan = secondVertical
    ? rows.length === 1
      ? { top: 0, height: 100 }
      : tripleRowIndex <= 0
        ? { top: 0, height: rowSplit }
        : { top: rowSplit, height: 100 - rowSplit }
    : null;

  const squeezedCol = state.col <= QUAD_COL_MIN + QUAD_SQUEEZE_EPS || state.col >= QUAD_COL_MAX - QUAD_SQUEEZE_EPS;
  const squeezedRow = state.row <= QUAD_ROW_MIN + QUAD_SQUEEZE_EPS || state.row >= QUAD_ROW_MAX - QUAD_SQUEEZE_EPS;

  const squeezedCol2 = state.col2 <= QUAD_COL2_MIN + QUAD_SQUEEZE_EPS || state.col2 >= QUAD_COL2_MAX - QUAD_SQUEEZE_EPS;
  /** Any vertical line squeezed — the deck's own one-line reading. */
  const squeezedVertical = squeezedCol || squeezedCol2;
  const lastColRef = useRef(state.col);
  const lastCol2Ref = useRef(state.col2);
  const lastRowRef = useRef(state.row);
  useEffect(() => {
    if (!squeezedCol) lastColRef.current = state.col;
  }, [state.col, squeezedCol]);
  useEffect(() => {
    if (!squeezedCol2) lastCol2Ref.current = state.col2;
  }, [state.col2, squeezedCol2]);
  useEffect(() => {
    if (!squeezedRow) lastRowRef.current = state.row;
  }, [state.row, squeezedRow]);
  const restoreCol = () => commit({ ...state, col: clampQuadCol(lastColRef.current) });
  const restoreCol2 = () => commit({ ...state, col2: clampQuadCol2(lastCol2Ref.current) });
  const restoreRow = () => commit({ ...state, row: clampQuadRow(lastRowRef.current) });

  /**
   * A drag's value for one line, clamped to its own band AND to the other
   * vertical divider (the two never cross: `QUAD_TRIPLE_GAP` always stays
   * between them).
   */
  const clampAxis = (axis: QuadAxisKey, value: number): number => {
    if (axis === "h") return clampQuadRow(value);
    if (axis === "v2") {
      const { first } = quadTripleCols(state);
      return Math.max(clampQuadCol2(value), first + QUAD_TRIPLE_GAP);
    }
    const next = clampQuadCol(value);
    if (!secondVertical) return next;
    const { second } = quadTripleCols(state);
    return Math.min(next, second - QUAD_TRIPLE_GAP);
  };

  /* ── Drag: the lines ────────────────────────────────────────────────────
   * Every line the shape shows — the vertical, its second vertical, the
   * horizontal — drags on its own; one rule: the whole strip drags, always. During the
   * move the live value is written straight to the deck's CSS variables (no
   * React re-render per frame — the panes hold videos and canvases), and the
   * settled value is committed on release.
   *
   * Independence rule (owner, 2026-10-16): a drag of one divider MUST NOT
   * resize the other axis's blocks. While a drag is live:
   *   1. the OTHER axis's CSS variable is hidden from pointer events so a
   *      stray finger never picks up the wrong divider;
   *   2. the deck's `data-dragging` attribute carries the live axis, so the
   *      CSS can dim the other divider's segment line — the learner sees which
   *      one they own and which one they don't. */
  const writeLive = (axis: QuadAxisKey, value: number) => {
    const deck = deckRef.current;
    if (!deck) return;
    deck.style.setProperty(axis === "v" ? "--quad-col" : axis === "v2" ? "--quad-col2" : "--quad-row", `${value}%`);
    const divider = deck.querySelector(`[data-course-quad-divider="${axis}"]`);
    divider?.setAttribute("aria-valuenow", String(Math.round(value)));
  };

  const handlePointerDown = (axis: QuadAxisKey) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const base = axis === "v" ? state.col : axis === "v2" ? state.col2 : state.row;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { axis, start: axis === "h" ? event.clientY : event.clientX, base, live: base };
    setDragging(axis);
    // A drag on the line puts the cluster away — the learner is resizing.
    setMenu(null);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deck = deckRef.current;
    const rect = deck?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const delta = (drag.axis === "h" ? event.clientY : event.clientX) - drag.start;
    const span = drag.axis === "h" ? rect.height : rect.width;
    const next = clampAxis(drag.axis, drag.base + (delta / span) * 100);
    drag.live = next;
    writeLive(drag.axis, next);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setDragging(null);
    if (!drag) return;
    if (drag.axis === "v") commit({ ...state, col: clampAxis("v", drag.live) });
    else if (drag.axis === "v2") commit({ ...state, col2: clampAxis("v2", drag.live) });
    else commit({ ...state, row: clampAxis("h", drag.live) });
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setDragging(null);
    if (!drag) return;
    // Cancelled mid-resize: put the line back where it started.
    writeLive(drag.axis, drag.base);
  };

  const handleDividerKeyDown = (axis: QuadAxisKey, segment: QuadSegment) =>
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = (delta: number) => {
        event.preventDefault();
        const base = axis === "v" ? state.col : axis === "v2" ? state.col2 : state.row;
        const next = clampAxis(axis, base + delta);
        commit(axis === "v" ? { ...state, col: next } : axis === "v2" ? { ...state, col2: next } : { ...state, row: next });
      };
      if (axis !== "h" && event.key === "ArrowLeft") return step(-QUAD_KEY_STEP);
      if (axis !== "h" && event.key === "ArrowRight") return step(QUAD_KEY_STEP);
      if (axis === "h" && event.key === "ArrowUp") return step(-QUAD_KEY_STEP);
      if (axis === "h" && event.key === "ArrowDown") return step(QUAD_KEY_STEP);
      if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        commit(quadSwap(state, axis === "h" ? "rows" : "cols"));
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setMenu({ divider: axis, segment });
        return;
      }
      if (event.key === "Escape") setMenu(null);
    };

  /* ── The dynamic cross: four half-dividers + the centre joint ───────────
   * Free-blocks mode's 2×2 shape. Every arm drags on its OWN position —
   * "charon ka apna alag drag position hoga, sabhi draggable honge" — and
   * the centre joint drags all four together ("center se directly ham drag
   * karenge to charon ek saath resize honge"). Live drags write the four CSS
   * variables (no React re-render per frame); the settled values commit on
   * release, exactly like the grid dividers. */
  const flex: QuadFlexState = clampQuadFlex(state.flex);
  const dynamicCross = Boolean(blocks) && state.format === "quad";
  const flexDragRef = useRef<{ kind: QuadArmKey | "joint"; start: number; start2: number; base: QuadFlexState; live: QuadFlexState } | null>(null);

  const flexMin = (arm: QuadArmKey) => (arm === "top" || arm === "bottom" ? QUAD_FLEX_X_MIN : QUAD_FLEX_Y_MIN);
  const flexMax = (arm: QuadArmKey) => (arm === "top" || arm === "bottom" ? QUAD_FLEX_X_MAX : QUAD_FLEX_Y_MAX);
  const flexValue = (f: QuadFlexState, arm: QuadArmKey) =>
    arm === "top" ? f.xTop : arm === "bottom" ? f.xBottom : arm === "left" ? f.yLeft : f.yRight;
  const flexSqueezed = (arm: QuadArmKey) => {
    const value = flexValue(flex, arm);
    return value <= flexMin(arm) + QUAD_SQUEEZE_EPS || value >= flexMax(arm) - QUAD_SQUEEZE_EPS;
  };
  const lastFlexRef = useRef<QuadFlexState>({ ...flex });
  useEffect(() => {
    for (const arm of ["top", "bottom", "left", "right"] as QuadArmKey[]) {
      if (!flexSqueezed(arm)) {
        lastFlexRef.current = { ...lastFlexRef.current, [arm === "top" ? "xTop" : arm === "bottom" ? "xBottom" : arm === "left" ? "yLeft" : "yRight"]: flexValue(flex, arm) };
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flex.xTop, flex.xBottom, flex.yLeft, flex.yRight]);
  const restoreFlexArm = (arm: QuadArmKey) =>
    commit({ ...state, flex: setQuadFlexArm(flex, arm, flexValue(lastFlexRef.current, arm)) });

  /** One arm's live value on the deck's CSS variables. */
  const writeLiveFlex = (arm: QuadArmKey, value: number) => {
    const deck = deckRef.current;
    if (!deck) return;
    const name = arm === "top" ? "--flex-xt" : arm === "bottom" ? "--flex-xb" : arm === "left" ? "--flex-yl" : "--flex-yr";
    deck.style.setProperty(name, `${value}%`);
  };
  const writeLiveFlexJoint = (next: QuadFlexState) => {
    const deck = deckRef.current;
    if (!deck) return;
    deck.style.setProperty("--flex-xt", `${next.xTop}%`);
    deck.style.setProperty("--flex-xb", `${next.xBottom}%`);
    deck.style.setProperty("--flex-yl", `${next.yLeft}%`);
    deck.style.setProperty("--flex-yr", `${next.yRight}%`);
  };

  const suppressClickRef = useRef(false);
  const handleFlexPointerDown = (kind: QuadArmKey | "joint") => (event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.stopPropagation();
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    flexDragRef.current = { kind, start: event.clientX, start2: event.clientY, base: { ...flex }, live: { ...flex } };
    setDragging(kind);
    setMenu(null);
  };

  const handleFlexPointerMove = (event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    const drag = flexDragRef.current;
    if (!drag) return;
    const deck = deckRef.current;
    const rect = deck?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const dx = ((event.clientX - drag.start) / rect.width) * 100;
    const dy = ((event.clientY - drag.start2) / rect.height) * 100;
    if (drag.kind === "joint") {
      const next = moveQuadFlexJoint(drag.base, dx, dy);
      drag.live = next;
      writeLiveFlexJoint(next);
      return;
    }
    const arm = drag.kind;
    const delta = arm === "top" || arm === "bottom" ? dx : dy;
    const next = moveQuadFlexArm(drag.base, arm, delta);
    drag.live = next;
    writeLiveFlex(arm, flexValue(next, arm));
  };

  const handleFlexPointerUp = (event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    const drag = flexDragRef.current;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    flexDragRef.current = null;
    setDragging(null);
    if (!drag) return;
    const moved =
      drag.live.xTop !== drag.base.xTop ||
      drag.live.xBottom !== drag.base.xBottom ||
      drag.live.yLeft !== drag.base.yLeft ||
      drag.live.yRight !== drag.base.yRight;
    suppressClickRef.current = moved;
    commit({ ...state, flex: clampQuadFlex(drag.live) });
  };

  const handleFlexPointerCancel = (event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    const drag = flexDragRef.current;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    flexDragRef.current = null;
    setDragging(null);
    if (!drag) return;
    // Cancelled mid-resize: every arm back where it started.
    writeLiveFlexJoint(drag.base);
  };

  const handleFlexKeyDown = (kind: QuadArmKey | "joint") => (event: ReactKeyboardEvent<HTMLDivElement | HTMLButtonElement>) => {
    const step = (dx: number, dy: number) => {
      event.preventDefault();
      commit({ ...state, flex: moveQuadFlexJoint(flex, dx, dy) });
    };
    const stepArm = (delta: number) => {
      event.preventDefault();
      commit({ ...state, flex: moveQuadFlexArm(flex, kind as QuadArmKey, delta) });
    };
    if (kind === "joint") {
      if (event.key === "ArrowLeft") return step(-QUAD_KEY_STEP, 0);
      if (event.key === "ArrowRight") return step(QUAD_KEY_STEP, 0);
      if (event.key === "ArrowUp") return step(0, -QUAD_KEY_STEP);
      if (event.key === "ArrowDown") return step(0, QUAD_KEY_STEP);
    } else {
      const vertical = kind === "top" || kind === "bottom";
      if (vertical && event.key === "ArrowLeft") return stepArm(-QUAD_KEY_STEP);
      if (vertical && event.key === "ArrowRight") return stepArm(QUAD_KEY_STEP);
      if (!vertical && event.key === "ArrowUp") return stepArm(-QUAD_KEY_STEP);
      if (!vertical && event.key === "ArrowDown") return stepArm(QUAD_KEY_STEP);
    }
    if (event.key === "s" || event.key === "S") {
      event.preventDefault();
      commit(quadSwapFlex(state, kind === "left" || kind === "right" ? "rows" : "cols"));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setMenu({ divider: "flex", segment: kind });
      return;
    }
    if (event.key === "Escape") setMenu(null);
  };

  /* ── Free blocks: open a page, walk back one step ──────────────────────── */
  const blockPagesRecord = (): Record<QuadPaneId, BlockPageKey | null> => ({
    c11: state.pages?.c11 ?? null,
    c12: state.pages?.c12 ?? null,
    c21: state.pages?.c21 ?? null,
    c22: state.pages?.c22 ?? null,
  });

  const openBlockPage = (pane: QuadPaneId, page: BlockPageKey | null) => {
    pushPageHistory(`block:${pane}`, page ?? "blank");
    commit(quadSetBlockPage(state, pane, page));
  };

  /* ── The cluster: outside click closes it ─────────────────────────────── */
  useEffect(() => {
    if (!menu) return undefined;
    const onPointerDown = (event: Event) => {
      const target = event.target as Element | null;
      if (target?.closest?.("[data-course-quad-menu]") || target?.closest?.("[data-course-quad-dot]")) return;
      setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  /* Rotation / split changes invalidate an open cluster. */
  useEffect(() => {
    setMenu(null);
  }, [state.format]);

  const zoom = view.zoom / 100;
  const paneButtons = quadPaneButtons(state);
  const formatRows = (format: QuadFormat) => QUAD_FORMATS[format].rows;

  /** Where the cluster sits: exactly on the dot whose segment was pressed. */
  const menuAnchor = (): CSSProperties => {
    if (!menu) return {};
    // The dynamic cross: the cluster opens on the pressed arm's centre or on
    // the joint itself — the owner's "screen ke center mein point".
    if (menu.divider === "flex") {
      const joint = quadFlexJoint(flex);
      const cx = joint.left + joint.width / 2;
      const cy = joint.top + joint.height / 2;
      const arms = quadFlexArms(flex);
      if (menu.segment === "top") return { left: `${flex.xTop}%`, top: `${arms.top.to / 2}%` };
      if (menu.segment === "bottom") return { left: `${flex.xBottom}%`, top: `${(arms.bottom.from + 100) / 2}%` };
      if (menu.segment === "left") return { left: `${arms.left.to / 2}%`, top: `${flex.yLeft}%` };
      if (menu.segment === "right") return { left: `${(arms.right.from + 100) / 2}%`, top: `${flex.yRight}%` };
      return { left: `${cx}%`, top: `${cy}%` };
    }
    // With no cross the cluster opens in the middle of the deck (the little
    // door above); with the cross it opens exactly on the pressed dot.
    if (!cross) return { left: "50%", top: "50%" };
    if (menu.divider !== "h") {
      // The three-column row's SECOND divider: the cluster opens on its dot,
      // in the middle of the band that divider spans.
      if (menu.segment === "v2") {
        return { left: `${state.col2}%`, top: `${secondSpan ? secondSpan.top + secondSpan.height / 2 : 50}%` };
      }
      const top = menu.segment === "vBottom" ? (cross ? (state.row + 100) / 2 : 50) : cross ? state.row / 2 : 50;
      return { left: `${state.col}%`, top: `${top}%` };
    }
    const left = menu.segment === "hRight" ? (cross ? (state.col + 100) / 2 : 50) : cross ? state.col / 2 : 50;
    return { left: `${left}%`, top: `${state.row}%` };
  };

  const paneContent = (pane: QuadPaneId): ReactNode => {
    // FREE-BLOCKS mode: every block shows the page the learner opened in it
    // (or its blank picker), wrapped in its own keep-alive layers + back.
    if (blocks) {
      return (
        <FreeBlock
          pane={pane}
          page={state.pages?.[pane] ?? null}
          pagesRecord={blockPagesRecord()}
          catalog={blocks.catalog}
          renderPage={blocks.renderPage}
          onOpen={openBlockPage}
        />
      );
    }
    if (pane === "c11") {
      return (
        <div className="dc-quad-pane__stack">
          <div className="dc-quad-pane__body" data-quad-player-face hidden={borrowedVisible}>
            {player}
          </div>
          {/* A tab without its own block borrows the main area — while the
              player stays mounted underneath, so nothing restarts. */}
          {study ? (
            <div className="dc-quad-pane__body" data-quad-study-face hidden={!borrowedVisible}>
              {study}
            </div>
          ) : null}
        </div>
      );
    }
    if (pane === "c21") {
      const navUnderLibrary = state.format === "pair" && Boolean(resourcesFooter);
      return (
        <div className="dc-quad-pane__stack">
          <div className="dc-quad-pane__body">{resources}</div>
          {navUnderLibrary ? (
            <div className="dc-quad-pane__nav" data-quad-pane-nav>
              {resourcesFooter}
            </div>
          ) : null}
        </div>
      );
    }
    return <div className="dc-quad-pane__body">{pane === "c12" ? notes : mindmap}</div>;
  };

  return (
    <div
      ref={deckRef}
      className="dc-quad-deck"
      data-course-quad-deck
      data-format={state.format}
      data-quad-rows={rows.map((row) => row.join("+")).join("/")}
      data-quad-col={Math.round(state.col)}
      data-quad-col2={Math.round(state.col2)}
      data-quad-row={Math.round(state.row)}
      data-quad-nav-side={navSide}
      data-quad-zoom={view.zoom}
      data-quad-cross={cross ? "true" : "false"}
      data-quad-squeezed={squeezedVertical && squeezedRow ? "both" : squeezedVertical ? "v" : squeezedRow ? "h" : "none"}
      data-quad-dragging={dragging ?? "none"}
      style={
        {
          "--quad-col": `${state.col}%`,
          "--quad-col2": `${state.col2}%`,
          "--quad-row": `${state.row}%`,
          "--quad-strip": `${PEEK_STRIP_PX}px`,
          // The dynamic cross's four arm positions (free-blocks mode).
          "--flex-xt": `${flex.xTop}%`,
          "--flex-xb": `${flex.xBottom}%`,
          "--flex-yl": `${flex.yLeft}%`,
          "--flex-yr": `${flex.yRight}%`,
        } as CSSProperties
      }
    >
      <div
        className="dc-quad-zoom"
        data-quad-zoom-layer
        style={{
          transform: zoom === 1 ? undefined : `scale(${zoom})`,
          transition: reducedMotion ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {dynamicCross ? (
          /* ── THE DYNAMIC CROSS ──────────────────────────────────────────
           * Four corner blocks that each hug their outer corner and end at
           * their own two arms; the arms run edge → joint and drag one at a
           * time; the joint (the owner's "screen ke center mein point") drags
           * all four together. When the four positions agree the joint is a
           * single point — the default even cross. */
          <div
            className="dc-quad-flex"
            data-course-quad-flex
            data-quad-flex-signature={quadFlexSignature(flex)}
          >
            {QUAD_PANE_ORDER.filter((pane) => quadPaneVisible(state, pane)).map((pane) => (
              <section
                key={pane}
                className={`dc-quad-flex__block dc-quad-flex__block--${pane}`}
                data-quad-pane={pane}
                data-quad-pane-label={QUAD_SLOT_LABEL[QUAD_PANE_SLOT[pane]]}
                data-quad-focused={focusPane === pane ? "true" : "false"}
                aria-label={`Block ${pane}`}
                onPointerDown={() => {
                  if (stateRef.current.focus !== pane) commit(quadSetFocus(stateRef.current, pane));
                }}
              >
                {paneContent(pane)}
              </section>
            ))}

            {/* The four half-dividers — each from its outer edge in to the
                joint. Every one drags on its own position; a hidden segment
                (Course view page) still drags, it is just not drawn. */}
            {(
              [
                ["top", "vTop"],
                ["bottom", "vBottom"],
                ["left", "hLeft"],
                ["right", "hRight"],
              ] as const
            ).map(([arm, segmentKey]) => {
              const vertical = arm === "top" || arm === "bottom";
              return (
                <div
                  key={arm}
                  role="separator"
                  tabIndex={0}
                  aria-orientation={vertical ? "vertical" : "horizontal"}
                  aria-label={`${arm} divider — drag to resize its blocks, press Enter for its buttons`}
                  aria-valuemin={vertical ? QUAD_FLEX_X_MIN : QUAD_FLEX_Y_MIN}
                  aria-valuemax={vertical ? QUAD_FLEX_X_MAX : QUAD_FLEX_Y_MAX}
                  aria-valuenow={Math.round(flexValue(flex, arm))}
                  data-course-quad-flex-arm={arm}
                  data-axis={arm}
                  data-dragging={dragging === arm ? "true" : "false"}
                  data-squeezed={flexSqueezed(arm) ? "true" : "false"}
                  className={`dc-quad-flex__arm dc-quad-flex__arm--${arm}`}
                  style={
                    {
                      ["--quad-hit" as string]: `${flexSqueezed(arm) ? QUAD_SQUEEZE_GAP : DIVIDER_HIT}px`,
                    } as CSSProperties
                  }
                  onPointerDown={handleFlexPointerDown(arm)}
                  onPointerMove={handleFlexPointerMove}
                  onPointerUp={handleFlexPointerUp}
                  onPointerCancel={handleFlexPointerCancel}
                  onKeyDown={handleFlexKeyDown(arm)}
                >
                  <span
                    className="dc-quad-flex__arm-line"
                    data-course-quad-line={vertical ? "v" : "h"}
                    data-visible={view.dividers[segmentKey] ? "true" : "false"}
                    aria-hidden
                    style={{
                      background: DIVIDER_LINE,
                      boxShadow:
                        dragging === arm ? `0 0 16px ${DIVIDER_LINE}` : `0 0 10px ${DIVIDER_LINE}66`,
                    }}
                  />
                  {flexSqueezed(arm) ? (
                    <>
                      <span aria-hidden data-course-quad-strip="" className="dc-quad-strip" />
                      <button
                        type="button"
                        className="dc-quad-restore"
                        data-course-quad-restore={arm}
                        aria-label={`Expand the squeezed blocks back to their previous size — ${arm}`}
                        title="Back to the previous size"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          restoreFlexArm(arm);
                        }}
                      >
                        <span aria-hidden data-quad-restore-icon>
                          {vertical ? <ArrowLeftRight size={14} /> : <ArrowUpDown size={14} />}
                        </span>
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="dc-quad-dot dc-quad-flex__dot"
                    data-course-quad-dot
                    data-quad-dot-segment={arm}
                    data-open={menu?.divider === "flex" && menu.segment === arm ? "true" : "false"}
                    aria-label={`Divider buttons — ${arm} divider`}
                    title="Divider buttons"
                    onPointerDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenu({ divider: "flex", segment: arm });
                    }}
                  >
                    <span className="dc-quad-dot__pip" aria-hidden data-quad-dot-pip />
                  </button>
                </div>
              );
            })}

            {/* The centre joint: drag it and all four positions travel
                together. Its zone is exactly what the arms leave between
                them — a point when all four agree. */}
            <div
              className="dc-quad-flex__joint"
              data-course-quad-flex-joint
              data-quad-joint-size={
                quadFlexJoint(flex).width + quadFlexJoint(flex).height > 0 ? "open" : "point"
              }
            >
              <span className="dc-quad-flex__joint-zone" aria-hidden data-quad-joint-zone />
              <button
                type="button"
                className="dc-quad-flex__joint-handle"
                data-course-quad-dot
                data-quad-joint-handle
                data-dragging={dragging === "joint" ? "true" : "false"}
                data-open={menu?.divider === "flex" && menu.segment === "joint" ? "true" : "false"}
                aria-label="Centre joint — drag to resize every block together, press Enter for its buttons"
                title="Drag the centre to resize every block"
                onPointerDown={handleFlexPointerDown("joint")}
                onPointerMove={handleFlexPointerMove}
                onPointerUp={handleFlexPointerUp}
                onPointerCancel={handleFlexPointerCancel}
                onKeyDown={handleFlexKeyDown("joint")}
                onClick={(event) => {
                  event.stopPropagation();
                  if (suppressClickRef.current) return;
                  setMenu({ divider: "flex", segment: "joint" });
                }}
              >
                <span className="dc-quad-dot__pip" aria-hidden data-quad-dot-pip />
              </button>
            </div>
          </div>
        ) : (
          <>
        <div className="dc-quad-grid" style={{ gridTemplateRows: quadDeckRows(rows.length, state.row) }}>
          {rows.map((row, index) => (
            <div
              key={`row-${index}-${row.join("")}`}
              className="dc-quad-row"
              data-quad-row-index={index}
              data-quad-row-panes={row.join("+")}
              style={{ gridTemplateColumns: quadRowColumns(row.length, state.col, state.col2) }}
            >
              {row.map((pane) => (
                <section
                  key={pane}
                  className="dc-quad-pane"
                  data-quad-pane={pane}
                  data-quad-slot={QUAD_PANE_SLOT[pane]}
                  data-quad-pane-label={QUAD_SLOT_LABEL[QUAD_PANE_SLOT[pane]]}
                  data-quad-focused={focusPane === pane ? "true" : "false"}
                  aria-label={QUAD_SLOT_LABEL[QUAD_PANE_SLOT[pane]]}
                  onPointerDown={() => {
                    // The header's Pages button acts on the ACTIVE block, so
                    // every grid shape records the block the learner touched
                    // last — the same rule the dynamic cross already keeps.
                    if (stateRef.current.focus !== pane) commit(quadSetFocus(stateRef.current, pane));
                  }}
                >
                  {paneContent(pane)}
                </section>
              ))}
            </div>
          ))}
        </div>

        {/* ── The vertical divider (two half segments, a dot at each centre) */}
        {hasVertical ? (
          <QuadDivider
            axis="v"
            state={state}
            cross={cross}
            dragging={dragging === "v"}
            visible={{ vTop: view.dividers.vTop, vBottom: view.dividers.vBottom }}
            openSegment={
              menu && menu.divider === "v" && (menu.segment === "vTop" || menu.segment === "vBottom")
                ? menu.segment
                : null
            }
            squeezed={squeezedCol}
            onRestore={restoreCol}
            onPointerDown={handlePointerDown("v")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onKeyDown={handleDividerKeyDown}
            onDot={(segment) => setMenu({ divider: "v", segment })}
            onDoubleClick={() => setMenu({ divider: "v", segment: "vTop" })}
          />
        ) : null}

        {/* ── The SECOND vertical divider — the row of three blocks ──────────
            It is a vertical line, so the Course view page's vertical switches
            (vTop / vBottom) govern it: either one showing means "show my
            vertical dividers", and this one belongs to that family. */}
        {secondVertical ? (
          <QuadDivider
            axis="v2"
            span={secondSpan ?? undefined}
            state={state}
            cross={false}
            dragging={dragging === "v2"}
            visible={{ vTop: view.dividers.vTop || view.dividers.vBottom, vBottom: false }}
            openSegment={menu && menu.divider === "v" && menu.segment === "v2" ? "v2" : null}
            squeezed={squeezedCol2}
            onRestore={restoreCol2}
            onPointerDown={handlePointerDown("v2")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onKeyDown={handleDividerKeyDown}
            onDot={() => setMenu({ divider: "v", segment: "v2" })}
            onDoubleClick={() => setMenu({ divider: "v", segment: "v2" })}
          />
        ) : null}

        {/* ── The horizontal divider ──────────────────────────────────────── */}
        {hasHorizontal ? (
          <QuadDivider
            axis="h"
            state={state}
            cross={cross}
            dragging={dragging === "h"}
            visible={{ vTop: view.dividers.hLeft, vBottom: view.dividers.hRight }}
            openSegment={
              menu && menu.divider === "h" && (menu.segment === "hLeft" || menu.segment === "hRight")
                ? menu.segment
                : null
            }
            squeezed={squeezedRow}
            onRestore={restoreRow}
            onPointerDown={handlePointerDown("h")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onKeyDown={handleDividerKeyDown}
            onDot={(segment) => setMenu({ divider: "h", segment })}
            onDoubleClick={() => setMenu({ divider: "h", segment: "hLeft" })}
          />
        ) : null}

        {/* When the deck has no cross — one row, one column, or a single block
            left — there is no divider to press, so the same cluster keeps a
            small door of its own. Only then: with the cross on screen the dots
            on the dividers are the way in, exactly as the brief asks. */}
        {!cross ? (
          <button
            type="button"
            className="dc-quad-menu-button"
            data-course-quad-menu-button
            aria-label="Divider controls — blocks and grid formats"
            title="Divider controls"
            onClick={(event) => {
              event.stopPropagation();
              setMenu({ divider: hasVertical ? "v" : "h", segment: hasVertical ? "vTop" : "hLeft" });
            }}
          >
            <Move size={14} aria-hidden />
          </button>
        ) : null}

          </>
        )}

        {/* ── The ONE cluster a dot opens ─────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {menu ? (
            <motion.div
              key={`${menu.divider}-${menu.segment}`}
              className="dc-quad-menu"
              data-course-quad-menu
              data-quad-menu-divider={menu.divider}
              data-quad-menu-segment={menu.segment}
              role="dialog"
              aria-label="Divider controls"
              style={{ ...menuAnchor(), position: "absolute", zIndex: 60 }}
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.92 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
              transition={{ duration: reducedMotion ? 0 : 0.16, ease: EASE_OUT_MOTION }}
            >
              <p className="dc-quad-menu__title">
                <Move size={12} aria-hidden />
                <span>Divider controls</span>
              </p>

              <div className="dc-quad-menu__scroll" data-quad-menu-scroll>
                {/* 1 · the two swaps */}
                <div className="dc-quad-group" data-quad-group="swap">
                  <span className="dc-quad-group__label">Swap</span>
                  <div className="dc-quad-group__row">
                    <QuadMenuButton
                      label="Swap left and right"
                      text="Left ↔ right"
                      attrs={{ "data-quad-swap": "cols" }}
                      glyph={<ArrowLeftRight size={15} aria-hidden />}
                      onPress={() => {
                        commit(dynamicCross ? quadSwapFlex(state, "cols") : quadSwap(state, "cols"));
                        setMenu(null);
                      }}
                    />
                    <QuadMenuButton
                      label="Swap top and bottom"
                      text="Top ↔ bottom"
                      attrs={{ "data-quad-swap": "rows" }}
                      glyph={<ArrowUpDown size={15} aria-hidden />}
                      onPress={() => {
                        commit(dynamicCross ? quadSwapFlex(state, "rows") : quadSwap(state, "rows"));
                        setMenu(null);
                      }}
                    />
                  </div>
                </div>

                {/* 2 · the four quadrant blocks */}
                <div className="dc-quad-group" data-quad-group="blocks">
                  <span className="dc-quad-group__label">Blocks</span>
                  <div className="dc-quad-group__row">
                    {paneButtons.map((button) => (
                      <QuadMenuButton
                        key={button.pane}
                        label={
                          dynamicCross
                            ? `Put block ${button.pane} back on its blank page`
                            : button.visible
                              ? `Close the ${button.label.toLowerCase()}`
                              : `Open the ${button.label.toLowerCase()}`
                        }
                        text={button.text}
                        disabled={dynamicCross ? false : button.lastOne}
                        attrs={{ "data-quad-pane-button": button.pane, "data-quad-pane-open": button.visible ? "true" : "false" }}
                        glyph={
                          <QuadGlyph
                            rows={QUAD_BUTTON_GLYPH_ROWS}
                            accent={button.visible ? button.pane : undefined}
                          />
                        }
                        onPress={() => {
                          if (dynamicCross) {
                            // Free blocks: the button puts the block back on
                            // its blank picker page (never close — the cross
                            // always keeps its four corners).
                            openBlockPage(button.pane, null);
                          } else {
                            commit(quadTogglePane(state, button.pane));
                          }
                          setMenu(null);
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* 3 · every grid shape */}
                <div className="dc-quad-group" data-quad-group="formats">
                  <span className="dc-quad-group__label">Grid format</span>
                  <div className="dc-quad-group__row">
                    {QUAD_FORMAT_ORDER.map((format) => (
                      <QuadMenuButton
                        key={format}
                        label={QUAD_FORMATS[format].hint}
                        text={QUAD_FORMATS[format].label}
                        attrs={{
                          "data-quad-format": format,
                          "data-quad-format-active": state.format === format ? "true" : "false",
                        }}
                        glyph={<QuadGlyph rows={formatRows(format)} accent="c11" />}
                        onPress={() => {
                          commit(quadSetFormat(state, format));
                          setMenu(null);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <p className="dc-quad-menu__foot" data-quad-menu-foot>
                Press a button and this closes. Scroll here for the rest.
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── One divider: two segments, two dots, one drag ──────────────────────── */

function QuadDivider({
  axis,
  span,
  state,
  cross,
  dragging,
  visible,
  openSegment,
  squeezed,
  onRestore,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
  onDot,
  onDoubleClick,
}: {
  axis: QuadAxisKey;
  /** The second vertical divider spans only the row of three blocks. */
  span?: { top: number; height: number };
  state: QuadLayoutState;
  cross: boolean;
  dragging: boolean;
  visible: { vTop: boolean; vBottom: boolean };
  openSegment: QuadSegment | null;
  /** The blocks on this axis are pressed together — show the way back. */
  squeezed: boolean;
  onRestore: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown: (axis: QuadAxisKey, segment: QuadSegment) => (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onDot: (segment: QuadSegment) => void;
  onDoubleClick: () => void;
}) {
  const vertical = axis !== "h";
  const value = quadAxisValue(state, axis);
  const firstSegment: QuadSegment = vertical ? "vTop" : "hLeft";
  const secondSegment: QuadSegment = vertical ? "vBottom" : "hRight";
  const segments: readonly QuadSegment[] =
    axis === "v2" ? (["v2"] as const) : cross ? ([firstSegment, secondSegment] as const) : ([firstSegment] as const);

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label={
        axis === "h"
          ? "Horizontal divider — drag to resize the top and bottom blocks, press Enter for its buttons"
          : axis === "v2"
            ? "Second vertical divider — drag to resize the middle and right blocks, press Enter for its buttons"
            : "Vertical divider — drag to resize the left and right blocks, press Enter for its buttons"
      }
      aria-valuemin={axis === "h" ? QUAD_ROW_MIN : axis === "v2" ? QUAD_COL2_MIN : QUAD_COL_MIN}
      aria-valuemax={axis === "h" ? QUAD_ROW_MAX : axis === "v2" ? QUAD_COL2_MAX : QUAD_COL_MAX}
      aria-valuenow={Math.round(value)}
      data-course-quad-divider={axis}
      data-axis={axis}
      data-dragging={dragging ? "true" : "false"}
      data-cross={cross ? "true" : "false"}
      className={`dc-quad-divider dc-quad-divider--${vertical ? "v" : "h"} dc-quad-divider--${axis}`}
      data-squeezed={squeezed ? "true" : "false"}
      style={{
        ["--quad-hit" as string]: `${squeezed ? QUAD_SQUEEZE_GAP : DIVIDER_HIT}px`,
        ...(span ? { top: `${span.top}%`, height: `${span.height}%`, bottom: "auto" } : null),
      } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown(axis, firstSegment)}
    >
      {/* Squeezed: ONE small icon at the divider's centre — the way back to
          the size these blocks had before they were pressed together. */}
      {squeezed ? (
        <>
          {/* The thin white strip BETWEEN the two pressed-together blocks — the
              owner asked it back (2026-10-16), the same as the collapsed split
              edge wears, with the small icon centred on top of it. */}
          <span aria-hidden data-course-quad-strip="" className="dc-quad-strip" />
          <button
            type="button"
            className="dc-quad-restore"
          data-course-quad-restore={axis}
          aria-label={vertical
            ? "Expand the squeezed blocks back to their previous width"
            : "Expand the squeezed blocks back to their previous height"}
          title="Back to the previous size"
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRestore();
          }}
        >
            <span aria-hidden data-quad-restore-icon>
              {vertical ? <ArrowLeftRight size={14} /> : <ArrowUpDown size={14} />}
            </span>
          </button>
        </>
      ) : null}
      {segments.map((segment) => {
        const isFirst = segment !== secondSegment;
        const share = axis === "h" ? state.col : state.row;
        const size = cross ? (isFirst ? `${share}%` : `${100 - share}%`) : "100%";
        const shown = isFirst ? visible.vTop : visible.vBottom;
        return (
          <span
            key={segment}
            className="dc-quad-segment"
            data-course-quad-segment={segment}
            data-visible={shown ? "true" : "false"}
            style={vertical ? { height: size } : { width: size }}
          >
            {/* The 2px core line — the ONLY visible chrome on the deck. */}
            <span
              className="dc-quad-segment__line"
              data-course-quad-line={vertical ? "v" : "h"}
              aria-hidden
              style={{ background: DIVIDER_LINE, boxShadow: dragging ? `0 0 16px ${DIVIDER_LINE}` : `0 0 10px ${DIVIDER_LINE}66` }}
            />
            {/* The guide dot at THIS segment's exact centre: press it and the
                cluster opens right there. */}
            <button
              type="button"
              className="dc-quad-dot"
              data-course-quad-dot
              data-quad-dot-segment={segment}
              data-open={openSegment === segment ? "true" : "false"}
              aria-label={
                axis === "h"
                  ? `Divider buttons — horizontal divider, ${isFirst ? "left" : "right"} half`
                  : axis === "v2"
                    ? "Divider buttons — second vertical divider"
                    : `Divider buttons — vertical divider, ${isFirst ? "top" : "bottom"} half`
              }
              title="Divider buttons"
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onDot(segment);
              }}
            >
              <span className="dc-quad-dot__pip" aria-hidden data-quad-dot-pip />
            </button>
          </span>
        );
      })}
    </div>
  );
}

/** Exported for the tests: the deck's own reading of its state, one line. */
export const quadDeckPaneList = (state: QuadLayoutState): QuadPaneId[] =>
  quadRows(state).flat().filter((pane) => QUAD_PANE_ORDER.includes(pane));
