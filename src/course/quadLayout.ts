// src/course/quadLayout.ts
//
// THE COURSE PLAYER'S QUAD DECK — the owner's desktop/tablet layout
// (2026-10-16):
//
//   "Tum clear puri screen ko char parts mein divide kar do dividers use karke
//    + shape, ek horizontal aur ek vertical. Left ki first split area mein
//    video chalega (main content wala area) … uske just niche wala resource
//    library wala page, right mein top wala notes, aur bottom right wala
//    mind map. Divider to do hi honge lekin char dabbe banenge."
//
// So the deck is a PLUS: ONE vertical divider and ONE horizontal divider, four
// blocks. This module is the pure model behind it — the geometry, the shapes
// (formats), the pane close/reopen state and its persistence — with no React
// and no DOM, so every rule below is unit-testable.
//
// ── The four panes ───────────────────────────────────────────────────────
//
// The owner named the panes the way a grid is named (row, then column):
//
//   c11 = top-left     → the PLAYER (the main content: the lesson/video stack)
//   c12 = top-right    → NOTES
//   c21 = bottom-left  → the RESOURCE LIBRARY
//   c22 = bottom-right → the MIND MAP
//
// Those four names are also the four buttons the divider menu shows: tapping
// one CLOSES that block (the rest grow to fill it) and the button reads
// "c22+" — tap it again and the block comes back. The names never move: c11
// is always the player, whatever shape the learner picked.
//
// ── The shapes (formats) ─────────────────────────────────────────────────
//
// Every shape is a list of ROWS of panes, top to bottom. A row splits evenly
// between the panes it holds, and the two dividers do the rest:
//
//   · the HORIZONTAL divider sets the row heights (when there are two rows),
//   · the VERTICAL divider sets the column split for every two-pane row,
//   · a three-pane row (only the "1 upar · 3 niche" shapes) splits evenly.
//
// A shape that does not hold a pane simply does not show it, and that pane's
// button reads "+" (tap → the pane comes back in the default 2×2 shape).
//
// ── Mobile is untouched ──────────────────────────────────────────────────
//
// Everything here is gated by `QUAD_MIN_SCREEN_PX` — 768px, the owner's own
// line: "tablet ke sabhi chhote se bade screen aur desktop sabhi ke liye …
// mobile users ke liye same rahega jo abhi hai". Standard tablet portrait and
// everything above it gets the plus deck; below 768px the player keeps the
// layout it has today, untouched.

import { useCallback, useSyncExternalStore } from "react";
import {
  clampQuadFlex,
  mirrorQuadFlex,
  QUAD_FLEX_DEFAULT,
  type QuadFlexState,
} from "./quadFlex";
import type { BlockPageKey } from "./blockPages";

export type QuadPaneId = "c11" | "c12" | "c21" | "c22";

/** What a block can hold. */
export type QuadSlot = "player" | "resources" | "notes" | "mindmap";

/** The panes in reading order — the owner's own c11 · c12 · c21 · c22. */
export const QUAD_PANE_ORDER: QuadPaneId[] = ["c11", "c12", "c21", "c22"];

/**
 * The owner's layout, fixed for good: left-top the main content, right-top
 * the notes, left-bottom the Resource Library, right-bottom the mind map.
 * The pane id carries its slot — the SHAPES only move the panes around.
 */
export const QUAD_PANE_SLOT: Record<QuadPaneId, QuadSlot> = {
  c11: "player",
  c12: "notes",
  c21: "resources",
  c22: "mindmap",
};

/** The words the divider menu and the panel headers use. */
export const QUAD_SLOT_LABEL: Record<QuadSlot, string> = {
  player: "Player",
  notes: "Notes",
  resources: "Resource library",
  mindmap: "Mind map",
};

/** The words the four close/reopen buttons carry. */
export const QUAD_PANE_LABEL: Record<QuadPaneId, string> = {
  c11: "Player area",
  c12: "Notes area",
  c21: "Resource library area",
  c22: "Mind map area",
};

export type QuadFormat = "quad" | "top1" | "bottom1" | "triple" | "top2" | "bottom2" | "pair";

export interface QuadFormatSpec {
  /**
   * Rows, top to bottom; each row lists the panes it holds, left to right.
   * An id that is CLOSED is dropped and an emptied row collapses, so the same
   * shape serves every open/closed combination.
   */
  rows: QuadPaneId[][];
  /** What the button says in the divider menu. */
  label: string;
  /** One line of English for the button's title/tooltip. */
  hint: string;
}

/**
 * The shapes. The owner's list, in his own words:
 *
 *   "ek screen upar, baaki 3 niche, aur issi ka ulta",
 *   "ek button jo do split screen ko niche rakhe aur ek screen ko upar, aur
 *    iska ulta wala ek aur button jo do split screen ko upar rakhen aur ek ko
 *    niche",
 *   "aur ek button jo simple directly single divider 2 screen mein divide kare
 *    — right wale ki taraf resource page aur uske niche footer navigation,
 *    left ki taraf main player area".
 *
 * `quad` is the way back to the owner's 2×2 default.
 */
export const QUAD_FORMATS: Record<QuadFormat, QuadFormatSpec> = {
  quad: {
    rows: [["c11", "c12"], ["c21", "c22"]],
    label: "4 · 2×2",
    hint: "Four equal blocks: player · notes / resource library · mind map",
  },
  top1: {
    rows: [["c11"], ["c21", "c12", "c22"]],
    label: "1 upar · 3 niche",
    hint: "One block across the top, three below",
  },
  bottom1: {
    rows: [["c21", "c12", "c22"], ["c11"]],
    label: "3 upar · 1 niche",
    hint: "Three blocks across the top, one below",
  },
  triple: {
    rows: [["c11", "c12", "c22"]],
    label: "3 · side by side",
    hint: "Three blocks side by side, full height — player, notes, mind map",
  },
  top2: {
    rows: [["c11", "c21"], ["c12"]],
    label: "2 upar · 1 niche",
    hint: "Two blocks on top, one below",
  },
  bottom2: {
    rows: [["c11"], ["c21", "c12"]],
    label: "1 upar · 2 niche",
    hint: "One block on top, two below",
  },
  pair: {
    rows: [["c11", "c21"]],
    label: "2 · single divider",
    hint: "One divider, two blocks: the player, and the resource library with the footer navigation under it",
  },
};

/** The order the format buttons appear in the divider menu. */
export const QUAD_FORMAT_ORDER: QuadFormat[] = ["quad", "top1", "bottom1", "triple", "top2", "bottom2", "pair"];

export interface QuadLayoutState {
  format: QuadFormat;
  /** Panes the learner closed (their buttons read "c22+" and reopen them). */
  closed: QuadPaneId[];
  /** The vertical divider, in percent of the deck's width. */
  col: number;
  /**
   * The SECOND vertical divider — the three-column shape's right split, in
   * percent of the deck's width. Never crosses `col` (see `quadTripleCols`).
   */
  col2: number;
  /** The horizontal divider, in percent of the deck's height. */
  row: number;
  /** The two swap buttons: mirror the columns / the rows. */
  swappedCols: boolean;
  swappedRows: boolean;
  /**
   * The DYNAMIC CROSS (the 2×2 shape): four half-dividers — xTop, xBottom,
   * yLeft, yRight — each with its own drag position, all meeting at the
   * centre joint (see quadFlex.ts). `col`/`row` live on for the other shapes.
   */
  flex: QuadFlexState;
  /**
   * The page each block shows — the owner's free blocks ("block Keval aur
   * Keval ek blank page se start hoga … user koi bhi page kisi bhi block
   * mein open kar sakta hai"). null = the block's blank picker page. A page
   * lives in at most one block.
   */
  pages: Record<QuadPaneId, BlockPageKey | null>;
  /** The block the navigation and deep links act on (last block touched). */
  focus: QuadPaneId;
}

/** Where the vertical divider may rest (the owner's blocks stay usable). */
export const QUAD_COL_MIN = 20;
export const QUAD_COL_MAX = 80;
/** Where the horizontal divider may rest. */
export const QUAD_ROW_MIN = 15;
export const QUAD_ROW_MAX = 85;
/** Where the SECOND vertical divider may rest (the three-column shape). */
export const QUAD_COL2_MIN = 26;
export const QUAD_COL2_MAX = 92;
/** The gap the two vertical dividers always keep between them. */
export const QUAD_TRIPLE_GAP = 8;

/** The screen width the whole system starts at (the owner's own pick). */
export const QUAD_MIN_SCREEN_PX = 768;

/** The media query the player reacts to. */
export const QUAD_MEDIA_QUERY = `(min-width: ${QUAD_MIN_SCREEN_PX}px)`;

export const QUAD_DEFAULT_STATE: QuadLayoutState = {
  format: "quad",
  closed: [],
  col: 50,
  col2: 67,
  row: 50,
  swappedCols: false,
  swappedRows: false,
  flex: { ...QUAD_FLEX_DEFAULT },
  pages: { c11: null, c12: null, c21: null, c22: null },
  focus: "c11",
};

const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);

/** A divider position the deck can actually render. */
export const clampQuadCol = (value: number) => clamp(value, QUAD_COL_MIN, QUAD_COL_MAX);
export const clampQuadCol2 = (value: number) => clamp(value, QUAD_COL2_MIN, QUAD_COL2_MAX);
export const clampQuadRow = (value: number) => clamp(value, QUAD_ROW_MIN, QUAD_ROW_MAX);

/**
 * The two vertical splits of a THREE-column row, in order and never crossing:
 * `first` is the draggable `col`, `second` the draggable `col2`, and they always
 * keep `QUAD_TRIPLE_GAP` between them so neither block can be dragged away.
 */
export function quadTripleCols(state: { col: number; col2: number }): { first: number; second: number } {
  const first = clamp(state.col, QUAD_COL_MIN, QUAD_COL2_MAX - QUAD_TRIPLE_GAP);
  const second = clamp(state.col2, first + QUAD_TRIPLE_GAP, QUAD_COL2_MAX);
  return { first, second };
}

/** The panes the current shape actually shows, in reading order. */
export function quadOpenPanes(state: QuadLayoutState): QuadPaneId[] {
  return QUAD_PANE_ORDER.filter((pane) => !state.closed.includes(pane));
}

/**
 * The deck's rows after the shape, the closed panes and the two swaps have
 * had their say — the ONE thing both the renderer and the tests read.
 */
export function quadRows(state: QuadLayoutState): QuadPaneId[][] {
  const spec = QUAD_FORMATS[state.format] ?? QUAD_FORMATS.quad;
  const rows = spec.rows
    .map((row) => row.filter((pane) => !state.closed.includes(pane)))
    .filter((row) => row.length > 0);
  // Never empty: `quadTogglePane` refuses to close the last open block, and a
  // shape with nothing to show reopens its own first block — this is the belt
  // to those braces.
  const fallback = rows.length ? rows : [QUAD_PANE_ORDER.filter((pane) => !state.closed.includes(pane))];
  const mirrored = state.swappedCols ? fallback.map((row) => [...row].reverse()) : fallback;
  return state.swappedRows ? [...mirrored].reverse() : mirrored;
}

/**
 * `grid-template-columns` for ONE row: an even split, except for a two-pane
 * row, whose split is the draggable vertical divider.
 */
export function quadRowColumns(count: number, col: number, col2: number = QUAD_DEFAULT_STATE.col2): string {
  if (count <= 1) return "minmax(0, 1fr)";
  if (count === 2) {
    const split = clampQuadCol(col);
    return `minmax(0, ${split}fr) minmax(0, ${100 - split}fr)`;
  }
  // Three (or more) blocks in a row: the TWO vertical dividers own the splits,
  // so this shape is as resizable as any other. Extra blocks beyond three keep
  // an even share of what is left.
  const { first, second } = quadTripleCols({ col, col2 });
  const parts = [`minmax(0, ${first}fr)`, `minmax(0, ${second - first}fr)`, `minmax(0, ${100 - second}fr)`];
  for (let index = 3; index < count; index += 1) parts.push("minmax(0, 1fr)");
  return parts.join(" ");
}

/**
 * `grid-template-rows` for the deck: the draggable horizontal divider when
 * there are two rows, a single row otherwise.
 */
export function quadDeckRows(count: number, row: number): string {
  if (count <= 1) return "minmax(0, 1fr)";
  if (count === 2) {
    const split = clampQuadRow(row);
    return `minmax(0, ${split}fr) minmax(0, ${100 - split}fr)`;
  }
  return Array.from({ length: count }, () => "minmax(0, 1fr)").join(" ");
}

/** Is this pane on screen in the current shape? */
export const quadPaneVisible = (state: QuadLayoutState, pane: QuadPaneId): boolean =>
  !state.closed.includes(pane) && quadRows(state).some((row) => row.includes(pane));

/**
 * The four close / reopen buttons, in the owner's order: closing the LAST open
 * pane is refused (the deck must keep something on screen), so that one button
 * reports `disabled`.
 */
export interface QuadPaneButton {
  pane: QuadPaneId;
  label: string;
  visible: boolean;
  /** True when this is the only block left — closing it would empty the deck. */
  lastOne: boolean;
  /** What the button reads: "c22" while shown, "c22+" while closed. */
  text: string;
}

export function quadPaneButtons(state: QuadLayoutState): QuadPaneButton[] {
  const open = quadOpenPanes(state);
  return QUAD_PANE_ORDER.map((pane) => {
    const visible = quadPaneVisible(state, pane);
    return {
      pane,
      label: QUAD_PANE_LABEL[pane],
      visible,
      lastOne: visible && open.length === 1,
      text: visible ? pane : `${pane}+`,
    };
  });
}

/** Close an open pane, or bring back a closed one. */
export function quadTogglePane(state: QuadLayoutState, pane: QuadPaneId): QuadLayoutState {
  const open = quadOpenPanes(state);
  const isOpen = quadPaneVisible(state, pane);
  if (isOpen) {
    // The deck never empties: the last block on screen stays.
    if (open.length <= 1) return state;
    return { ...state, closed: [...state.closed, pane] };
  }
  // Coming back: the plain 2×2 shape is the one that holds every pane.
  const stillClosed = state.closed.filter((entry) => entry !== pane);
  return { ...state, closed: stillClosed, format: "quad" };
}

/** The side-to-side swap (mirror every row) and the top/bottom swap. */
export function quadSwap(state: QuadLayoutState, axis: "cols" | "rows"): QuadLayoutState {
  return axis === "cols"
    ? { ...state, swappedCols: !state.swappedCols }
    : { ...state, swappedRows: !state.swappedRows };
}

/* ── Free blocks: the page each block shows ─────────────────────────────── */

/**
 * Open `page` in `pane`. A page lives in at most one block, so picking it
 * somewhere else MOVES it — "user koi bhi page kisi bhi block mein open kar
 * sakta hai" — and the pane the learner touched becomes the navigation's
 * focused block. The store keeps `pages` as exactly the four keys.
 */
export function quadSetBlockPage(
  state: QuadLayoutState,
  pane: QuadPaneId,
  page: BlockPageKey | null,
): QuadLayoutState {
  const pages: Record<QuadPaneId, BlockPageKey | null> = {
    c11: state.pages?.c11 ?? null,
    c12: state.pages?.c12 ?? null,
    c21: state.pages?.c21 ?? null,
    c22: state.pages?.c22 ?? null,
  };
  if (page) {
    for (const other of QUAD_PANE_ORDER) {
      if (other !== pane && pages[other] === page) pages[other] = null;
    }
  }
  pages[pane] = page;
  return { ...state, pages, focus: pane };
}

/** Put the block back on its blank picker page. */
export const quadClearBlockPage = (state: QuadLayoutState, pane: QuadPaneId): QuadLayoutState =>
  quadSetBlockPage(state, pane, null);

/** Remember which block the learner touched last (nav taps act on it). */
export const quadSetFocus = (state: QuadLayoutState, pane: QuadPaneId): QuadLayoutState =>
  state.focus === pane ? state : { ...state, focus: pane };

/** Where a page currently lives, or null. */
export function quadFindPageBlock(state: QuadLayoutState, page: BlockPageKey): QuadPaneId | null {
  for (const pane of QUAD_PANE_ORDER) {
    if (state.pages?.[pane] === page) return pane;
  }
  return null;
}

/**
 * The cluster's swap on the DYNAMIC CROSS: mirror the arms on that axis and
 * trade the two blocks' pages, so the layout and its content flip together.
 */
export function quadSwapFlex(state: QuadLayoutState, axis: "cols" | "rows"): QuadLayoutState {
  const flex = mirrorQuadFlex(state.flex ?? QUAD_FLEX_DEFAULT, axis);
  const pages: Record<QuadPaneId, BlockPageKey | null> = {
    c11: state.pages?.c11 ?? null,
    c12: state.pages?.c12 ?? null,
    c21: state.pages?.c21 ?? null,
    c22: state.pages?.c22 ?? null,
  };
  if (axis === "cols") {
    const { c11, c12, c21, c22 } = pages;
    return { ...state, flex, pages: { c11: c12, c12: c11, c21: c22, c22: c21 } };
  }
  const { c11, c12, c21, c22 } = pages;
  return { ...state, flex, pages: { c11: c21, c12: c22, c21: c11, c22: c12 } };
}

/* ── The footer navigation rule ─────────────────────────────────────────── */

/** How many blocks the current shape actually shows. */
export function quadOpenBlockCount(state: QuadLayoutState): number {
  return quadRows(state).flat().length;
}

/**
 * The owner's footer rule (2026-10-16+): "footer navigations Keval tabhi
 * dikhe jo bhi user single split mode mein ho, means Keval do block" — the
 * navigation shows only in the single-split layout, exactly two blocks. The
 * 2×2 cross and the three-block shapes run without it (the blocks themselves
 * carry the pages); a phone is never in this system and keeps its footer.
 */
export function quadSingleSplit(state: QuadLayoutState): boolean {
  return quadOpenBlockCount(state) === 2;
}

/**
 * A shape button. Panes the shape cannot hold stay closed; the ones it can
 * hold come back, so tapping "1 upar · 3 niche" always gives that shape with
 * as many blocks as it can show.
 */
export function quadSetFormat(state: QuadLayoutState, format: QuadFormat): QuadLayoutState {
  const spec = QUAD_FORMATS[format] ?? QUAD_FORMATS.quad;
  const holds = new Set(spec.rows.flat());
  const visible = QUAD_PANE_ORDER.filter((pane) => holds.has(pane) && !state.closed.includes(pane));
  // The learner's own close choices are kept (a pane they closed stays closed,
  // and a pane this shape cannot hold simply is not shown — its button reads
  // "c22+" either way). Only a shape with nothing left to show reopens its
  // first block, so no shape can ever leave an empty deck.
  // The three-column shape opens as three EQUAL columns (owner: "teen screen
  // side by side") — every other shape keeps the learner's own splits.
  const seeded = format === "triple" && state.format !== "triple"
    ? { ...state, col: 33, col2: 67 }
    : state;
  if (visible.length) return { ...seeded, format };
  const first = spec.rows[0][0];
  return { ...seeded, format, closed: seeded.closed.filter((pane) => pane !== first) };
}

/* ── Persistence (per course, per device — the split's own pattern) ─────── */

const storageKey = (courseId: string) => `dc.course.quadLayout.v1.${courseId || "course"}`;

const isPane = (value: unknown): value is QuadPaneId =>
  value === "c11" || value === "c12" || value === "c21" || value === "c22";

const BLOCK_PAGE_KEYS: readonly string[] = [
  "lesson",
  "personal",
  "modules",
  "notes",
  "mindmap",
  "sketch",
  "read",
  "music",
  "brain",
  "experiment",
  "ai",
  "player",
  "paid",
];

/** A stored page id, or null for the block's blank picker page. */
const isPageKey = (value: unknown): BlockPageKey | null =>
  typeof value === "string" && BLOCK_PAGE_KEYS.includes(value) ? (value as BlockPageKey) : null;

const isFormat = (value: unknown): value is QuadFormat =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(QUAD_FORMATS, value);

export function loadQuadLayout(courseId: string): QuadLayoutState {
  if (typeof window === "undefined") return QUAD_DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(storageKey(courseId));
    if (!raw) return QUAD_DEFAULT_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return QUAD_DEFAULT_STATE;
    const value = parsed as Partial<QuadLayoutState>;
    return {
      format: isFormat(value.format) ? value.format : "quad",
      closed: Array.isArray(value.closed) ? value.closed.filter(isPane) : [],
      col: typeof value.col === "number" ? clampQuadCol(value.col) : 50,
      col2: typeof value.col2 === "number" ? clampQuadCol2(value.col2) : QUAD_DEFAULT_STATE.col2,
      row: typeof value.row === "number" ? clampQuadRow(value.row) : 50,
      swappedCols: value.swappedCols === true,
      swappedRows: value.swappedRows === true,
      // Stored decks from before the dynamic cross carry no `flex`/`pages`:
      // they migrate to the even cross with every block on its blank page.
      flex: clampQuadFlex(value.flex),
      pages: {
        c11: isPageKey(value.pages?.c11),
        c12: isPageKey(value.pages?.c12),
        c21: isPageKey(value.pages?.c21),
        c22: isPageKey(value.pages?.c22),
      },
      focus: isPane(value.focus) ? value.focus : "c11",
    };
  } catch {
    return QUAD_DEFAULT_STATE;
  }
}

export function saveQuadLayout(courseId: string, state: QuadLayoutState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(courseId), JSON.stringify(state));
  } catch {
    // Private mode / storage denied: the deck still works for this visit.
  }
}

/** The one-line summary the player logs in its report and tests assert on. */
export const quadLayoutSignature = (state: QuadLayoutState): string =>
  [
    state.format,
    quadRows(state).map((row) => row.join("+")).join("/"),
    `col:${Math.round(clampQuadCol(state.col))}`,
    `row:${Math.round(clampQuadRow(state.row))}`,
    state.swappedCols ? "swapCols" : "",
    state.swappedRows ? "swapRows" : "",
  ]
    .filter(Boolean)
    .join(" ");

/* ── The device gate: the plus deck is a tablet/desktop layout ──────────── */

/**
 * True from `QUAD_MIN_SCREEN_PX` (768px — standard tablet portrait) up, and it
 * follows a rotation or a window resize live. Below it the player renders
 * exactly what it renders today. The same query is the one the header nav's
 * placement button gates on (`FOOTER_NAVIGATION_PLACEMENT_MEDIA_QUERY`), so one
 * width decides for the whole system.
 */
export function useQuadDeckEnabled(): boolean {
  const query = QUAD_MEDIA_QUERY;
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
      const media = window.matchMedia(query);
      const read = () => onStoreChange();
      media.addEventListener?.("change", read);
      media.addListener?.(read);
      return () => {
        media.removeEventListener?.("change", read);
        media.removeListener?.(read);
      };
    },
    [query],
  );
  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches === true;
  }, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
