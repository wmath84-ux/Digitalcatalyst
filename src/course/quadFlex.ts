// src/course/quadFlex.ts
//
// THE DYNAMIC CROSS — the tablet/desktop plus deck's divider model, upgraded
// from the owner's 2026-10-16 two-divider cross (his brief then: "divider to
// do hi honge lekin char dabbe banenge") to his 2026-10-16+ brief:
//
//   "screen ke center mein point hoga jahan per left se aur right se ek-ek
//    divider usse connect honge aur ek upar se aur ek niche se — matlab total
//    4 divider, aur charon ka apna alag drag position hoga, sabhi draggable
//    honge, sabhi char divider independently drive kar payenge … aur center se
//    directly ham drag karenge to charon ek saath resize honge."
//
// So the ONE cross is now FOUR half-dividers — the top and bottom halves of
// the vertical line and the left and right halves of the horizontal line —
// each with its OWN position, all meeting at the centre joint:
//
//          xTop         xBottom
//           │              │
//     ┌─────┼──────┬───────┼─────┐
//     │ c11 │      │  c12  │     │   yLeft  ── the left half-divider's y
//     │     ├──────●───────┤     │   yRight ── the right half-divider's y
//     │     │   JOINT     │     │
//     ├─────┤      │       ├─────┤
//     │ c21 │      │  c22  │     │
//     └─────┴──────┴───────┴─────┘
//
// The four arms slide independently: the top arm moves the TOP row's column
// split alone (c11 vs c12), the left arm the LEFT column's row split alone
// (c11 vs c21) — "independently ham kisi bhi area ko adjust karvayenge block
// ko". The joint is the owner's "screen ke center mein point": drag it and all
// four positions travel together, so every block resizes at once.
//
// Geometry: each block hugs its outer corner and ends at ITS two arms, and
// whatever the four lines leave between them — an overlap when the arms cross
// past each other, a hole when they pull apart — is exactly the JOINT rect
// [min(xTop,xBottom), max] × [min(yLeft,yRight), max]. The joint handle is
// drawn on top of it, so the tiling is always complete and never double-reads
// a press. When the four positions are equal (the default) the joint shrinks
// to the owner's single centre point.
//
// Pure model — no React, no DOM — so `node --test` can pin every rule.

export type QuadArmKey = "top" | "bottom" | "left" | "right";

/** The four arm positions, in percent of the deck. */
export interface QuadFlexState {
  /** The TOP vertical arm (c11 | c12), percent of width. */
  xTop: number;
  /** The BOTTOM vertical arm (c21 | c22), percent of width. */
  xBottom: number;
  /** The LEFT horizontal arm (c11 | c21), percent of height. */
  yLeft: number;
  /** The RIGHT horizontal arm (c12 | c22), percent of height. */
  yRight: number;
}

/** The blocks may keep a usable size: the same bands the old cross used. */
export const QUAD_FLEX_X_MIN = 20;
export const QUAD_FLEX_X_MAX = 80;
export const QUAD_FLEX_Y_MIN = 15;
export const QUAD_FLEX_Y_MAX = 85;

export const QUAD_FLEX_DEFAULT: QuadFlexState = { xTop: 50, xBottom: 50, yLeft: 50, yRight: 50 };

const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);

const finite = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** One arm's clamped value. */
export const clampFlexX = (value: number) => clamp(finite(value, 50), QUAD_FLEX_X_MIN, QUAD_FLEX_X_MAX);
export const clampFlexY = (value: number) => clamp(finite(value, 50), QUAD_FLEX_Y_MIN, QUAD_FLEX_Y_MAX);

/** Every arm back inside its band — tolerant of whatever was stored. */
export const clampQuadFlex = (flex: Partial<QuadFlexState> | null | undefined): QuadFlexState => ({
  xTop: clampFlexX(flex?.xTop ?? QUAD_FLEX_DEFAULT.xTop),
  xBottom: clampFlexX(flex?.xBottom ?? QUAD_FLEX_DEFAULT.xBottom),
  yLeft: clampFlexY(flex?.yLeft ?? QUAD_FLEX_DEFAULT.yLeft),
  yRight: clampFlexY(flex?.yRight ?? QUAD_FLEX_DEFAULT.yRight),
});

/** One block's rect, in percents of the deck. */
export interface QuadFlexRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The centre joint: exactly the zone the four arms leave between them. It
 * collapses to a point when all four positions agree.
 */
export const quadFlexJoint = (flex: QuadFlexState): QuadFlexRect => {
  const f = clampQuadFlex(flex);
  const x0 = Math.min(f.xTop, f.xBottom);
  const x1 = Math.max(f.xTop, f.xBottom);
  const y0 = Math.min(f.yLeft, f.yRight);
  const y1 = Math.max(f.yLeft, f.yRight);
  return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
};

/**
 * The four corner blocks. Each hugs its outer corner and stops at its own two
 * arms — the joint covers whatever the arms leave in the middle, so the four
 * rects plus the joint always tile the deck exactly once.
 */
export const quadFlexBlocks = (flex: QuadFlexState): Record<"c11" | "c12" | "c21" | "c22", QuadFlexRect> => {
  const f = clampQuadFlex(flex);
  return {
    c11: { left: 0, top: 0, width: f.xTop, height: f.yLeft },
    c12: { left: f.xTop, top: 0, width: 100 - f.xTop, height: f.yRight },
    c21: { left: 0, top: f.yLeft, width: f.xBottom, height: 100 - f.yLeft },
    c22: { left: f.xBottom, top: f.yRight, width: 100 - f.xBottom, height: 100 - f.yRight },
  };
};

/** One arm's reach: from the deck's outer edge in to the joint. */
export interface QuadFlexArm {
  /** Percent position of the arm's line (x for vertical arms, y for horizontal). */
  value: number;
  /** Where the arm starts along its run (percent of the perpendicular axis). */
  from: number;
  /** Where the arm ends at the joint (percent). */
  to: number;
}

/**
 * The four half-dividers' geometry. Each arm runs from its outer edge in to
 * the joint — "left se aur right se ek-ek divider usse connect honge".
 */
export const quadFlexArms = (flex: QuadFlexState): Record<QuadArmKey, QuadFlexArm> => {
  const f = clampQuadFlex(flex);
  const joint = quadFlexJoint(f);
  return {
    top: { value: f.xTop, from: 0, to: joint.top },
    bottom: { value: f.xBottom, from: joint.top + joint.height, to: 100 },
    left: { value: f.yLeft, from: 0, to: joint.left },
    right: { value: f.yRight, from: joint.left + joint.width, to: 100 },
  };
};

/**
 * Move ONE arm by a delta in percent — the arm's own drag. The top and bottom
 * arms travel along x, the left and right arms along y; nothing else moves.
 */
export const moveQuadFlexArm = (flex: QuadFlexState, arm: QuadArmKey, delta: number): QuadFlexState => {
  const f = clampQuadFlex(flex);
  const d = finite(delta, 0);
  if (arm === "top") return { ...f, xTop: clampFlexX(f.xTop + d) };
  if (arm === "bottom") return { ...f, xBottom: clampFlexX(f.xBottom + d) };
  if (arm === "left") return { ...f, yLeft: clampFlexY(f.yLeft + d) };
  return { ...f, yRight: clampFlexY(f.yRight + d) };
};

/**
 * Place ONE arm at an absolute percent — the settled drag / keyboard step.
 */
export const setQuadFlexArm = (flex: QuadFlexState, arm: QuadArmKey, value: number): QuadFlexState => {
  const f = clampQuadFlex(flex);
  if (arm === "top") return { ...f, xTop: clampFlexX(value) };
  if (arm === "bottom") return { ...f, xBottom: clampFlexX(value) };
  if (arm === "left") return { ...f, yLeft: clampFlexY(value) };
  return { ...f, yRight: clampFlexY(value) };
};

/**
 * Drag the CENTRE JOINT: all four positions travel together — "center se
 * directly ham drag karenge to charon ek saath resize honge". Each arm still
 * lands inside its own band, so the blocks can never be dragged away.
 */
export const moveQuadFlexJoint = (flex: QuadFlexState, dx: number, dy: number): QuadFlexState => {
  const f = clampQuadFlex(flex);
  const ddx = finite(dx, 0);
  const ddy = finite(dy, 0);
  return {
    xTop: clampFlexX(f.xTop + ddx),
    xBottom: clampFlexX(f.xBottom + ddx),
    yLeft: clampFlexY(f.yLeft + ddy),
    yRight: clampFlexY(f.yRight + ddy),
  };
};

/** Mirror every arm on one axis (the cluster's swap buttons). */
export const mirrorQuadFlex = (flex: QuadFlexState, axis: "cols" | "rows"): QuadFlexState => {
  const f = clampQuadFlex(flex);
  return axis === "cols"
    ? { ...f, xTop: clampFlexX(100 - f.xTop), xBottom: clampFlexX(100 - f.xBottom) }
    : { ...f, yLeft: clampFlexY(100 - f.yLeft), yRight: clampFlexY(100 - f.yRight) };
};

/** The one-line signature the deck logs and the tests assert on. */
export const quadFlexSignature = (flex: QuadFlexState): string => {
  const f = clampQuadFlex(flex);
  return `xTop:${Math.round(f.xTop)} xBottom:${Math.round(f.xBottom)} yLeft:${Math.round(f.yLeft)} yRight:${Math.round(f.yRight)}`;
};
