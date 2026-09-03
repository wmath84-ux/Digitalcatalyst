// src/course/splitMotion.ts
//
// ONE motion file for the Course Player's Split Deck.
//
// Every spring, ease, threshold and storage key the split layout uses lives
// here, so the divider, the panes, the peek rails and the settings toggle all
// move with the same physics and never grow ad-hoc constants of their own.
// The values are the ones the owner signed off on for the glass pack:
//
//   · SPRING_SETTLE — the divider's magnetic snap / keyboard step settle.
//   · SPRING_ENTRY  — the study pane growing open (and shrinking shut).
//   · SPRING_MAG    — the magnification spring the dock + list rows already
//                     use (300/22/0.5), reused for the grabber's press scale.
//   · EASE_OUT      — the pack's one cubic-bezier (websiteglass / AI Canvas).
//
// Performance rule for the whole feature: only transform, opacity, box-shadow
// and flex-grow/flex-basis are ever animated. Blur is static per theme (see
// the `.course-player-shell` block in src/index.css) and is never animated.

/** The divider's settle / snap spring. */
export const SPRING_SETTLE = { stiffness: 300, damping: 30 } as const;
/** The study pane's grow-open / shrink-shut spring. */
export const SPRING_ENTRY = { stiffness: 260, damping: 26, mass: 0.9 } as const;
/** The magnification spring (same numbers the GlassDock + sheet rows use). */
export const SPRING_MAG = { stiffness: 300, damping: 22, mass: 0.5 } as const;
/** The pack's single easing curve, as CSS (transitions, keyframes, inline). */
export const EASE_OUT = "cubic-bezier(0.22,1,0.36,1)";
/**
 * The very same curve for framer-motion, which types a custom bezier as a
 * 4-number tuple rather than a CSS string. Both constants are the ONE ease —
 * never hand-roll a third.
 */
export const EASE_OUT_MOTION = [0.22, 1, 0.36, 1] as [number, number, number, number];

// ── Geometry ────────────────────────────────────────────────────────────────

/**
 * The split axis. `column` = portrait (lesson on top, study below, divider
 * horizontal); `row` = landscape (lesson left, study right, divider vertical).
 */
export type SplitAxis = "row" | "column";
/** The side a pane can collapse into a peek rail. */
export type SplitSide = "lesson" | "study";

/** Free-drag clamp: the study pane never settles below / above these. */
export const SPLIT_MIN = 15;
export const SPLIT_MAX = 85;
/** Phone portrait keeps the study pane usable for writing (owner's rule). */
export const SPLIT_SMALL_SCREEN_MIN = 30;
/** Width of the small-screen breakpoint that raises the floor to 30%. */
export const SPLIT_SMALL_SCREEN_PX = 430;
/** A phone in landscape has a short viewport; it gets the same treatment. */
export const SPLIT_SHORT_VIEWPORT_PX = 500;
/** The five-icon glass dock's natural width. On a phone in landscape the study
 *  pane never *settles* narrower than this, or the dock would sit inside the
 *  pane yet be clipped by it — which defeats the point of putting it there.
 *  Tablets and desktops keep the 15% floor, and collapse-to-rail bypasses it. */
export const SPLIT_DOCK_MIN_PX = 288;
/** Magnetic snap points, in study-pane percent. */
export const SPLIT_SNAP_POINTS = [20, 35, 50, 65, 80] as const;
/** Released within this many percent of a snap point → animate onto it. */
export const SNAP_TOLERANCE = 3;
/** Dragging within this many percent of a snap point → one soft pulse ring. */
export const PULSE_TOLERANCE = 2;
/**
 * Crossing this close to either edge fills that side to 100% and collapses the
 * other into its peek rail (the old overlay's CLOSE_THRESHOLD idea).
 */
export const FILL_THRESHOLD = 8;
/** Divider hit area in px — a full 44px touch target on both axes. */
export const DIVIDER_HIT = 44;
/** The collapsed pane's glass strip, in px. */
export const PEEK_RAIL_PX = 28;
/**
 * The ratio the study pane starts from when the deck opens. Not exactly 0: a
 * truly zero-width pane would squash the dock's flex layout for one frame
 * before the spring gets going.
 */
export const ENTRY_START = 5;
/** Default study-pane percent per axis (portrait 40, landscape/tablet 45). */
export const DEFAULT_SPLIT_RATIO: Record<SplitAxis, number> = { column: 40, row: 45 };
/** Keyboard step (px-free, in percent) — Shift gives the fine step. */
export const KEY_STEP = 5;
export const KEY_STEP_FINE = 1;

// ── Persistence ─────────────────────────────────────────────────────────────
// The enabled flag is global (one learner preference); the ratio + collapse
// are remembered PER COURSE and PER AXIS, so rotating the phone mid-session
// comes back to the split the learner had arranged on that axis, and a second
// course never inherits the first one's layout.

export const SPLIT_ENABLED_KEY = "dc.splitDeck.enabled";
export const splitRatioKey = (courseId: string, axis: SplitAxis) => `dc.splitDeck.ratio.v1:${courseId}:${axis}`;
export const splitCollapsedKey = (courseId: string, axis: SplitAxis) => `dc.splitDeck.collapsed.v1:${courseId}:${axis}`;

const clampPercent = (value: number) => (Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0);

/** Split Deck on/off — one global preference, `"1"` / `"0"`. */
export const loadSplitEnabled = (): boolean => {
  try {
    return localStorage.getItem(SPLIT_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
};

export const saveSplitEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(SPLIT_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* private mode / storage disabled — keep the in-memory preference */
  }
};

/**
 * The stored study-pane percent for one course + axis. Any parse problem
 * (missing key, `"abc"`, out-of-range, private mode) falls back to the axis
 * default instead of collapsing the deck — the same defensive read the old
 * per-tab split used.
 */
export const loadSplitRatio = (courseId: string, axis: SplitAxis, floor: number): number => {
  const fallback = Math.max(floor, Math.min(SPLIT_MAX, DEFAULT_SPLIT_RATIO[axis]));
  try {
    const raw = Number.parseFloat(localStorage.getItem(splitRatioKey(courseId, axis)) || "");
    if (!Number.isFinite(raw)) return fallback;
    return Math.min(SPLIT_MAX, Math.max(floor, Math.round(raw)));
  } catch {
    return fallback;
  }
};

export const saveSplitRatio = (courseId: string, axis: SplitAxis, percent: number): void => {
  try {
    localStorage.setItem(splitRatioKey(courseId, axis), String(Math.round(clampPercent(percent))));
  } catch {
    /* private mode / storage disabled — the split still works for this visit */
  }
};

export const loadSplitCollapsed = (courseId: string, axis: SplitAxis): SplitSide | null => {
  try {
    const raw = localStorage.getItem(splitCollapsedKey(courseId, axis));
    return raw === "lesson" || raw === "study" ? raw : null;
  } catch {
    return null;
  }
};

export const saveSplitCollapsed = (courseId: string, axis: SplitAxis, side: SplitSide | null): void => {
  try {
    if (side) localStorage.setItem(splitCollapsedKey(courseId, axis), side);
    else localStorage.removeItem(splitCollapsedKey(courseId, axis));
  } catch {
    /* private mode / storage disabled — nothing to remember */
  }
};

/**
 * Clamp a FREE ratio (drag release, snap, keyboard step) into the usable
 * band. Collapse animations deliberately go outside it (0 / 100) — they call
 * `clampPercent` instead, never this.
 */
export const clampSplitRatio = (value: number, floor: number = SPLIT_MIN): number =>
  Math.min(SPLIT_MAX, Math.max(floor, value));

/**
 * Phone portrait gives the study pane a 30% floor so notes stay writable on a
 * ≤430px screen; everywhere else the band is 15–85.
 */
export const splitFloorFor = (axis: SplitAxis, smallScreen: boolean): number =>
  axis === "column" && smallScreen ? SPLIT_SMALL_SCREEN_MIN : SPLIT_MIN;
