// src/utils/quickSketchStyle.ts
//
// The Quick Sketch STYLE — every option the perfect-freehand editor exposes
// (perfectfreehand.com), and the rules that turn them into `getStroke`
// options. The canvas in the Course Player follows that editor's design and
// its model: there is ONE style for the whole drawing, changing it restyles
// every stroke at once, and the numbers are first-class — `size` is the
// stroke's diameter, `thinning` how much pressure eats into it, and so on.
//
// `perfect-freehand` reads the very options named here, so what the panel
// shows and what the renderer does can never drift.
//
// Pure and node-testable: no React, no DOM. `quickSketchStyleText()` is the
// editor's own "Copy Options" payload, i.e. the object a learner pastes into
// their own code, and `quickSketchStrokeOptions()` is the only place that
// decides how a style becomes a stroke.

import type { StrokeOptions } from "perfect-freehand";

// ── Easing ────────────────────────────────────────────────────────────────

/** The nineteen easings the perfect-freehand editor offers, in its order. */
export const QUICK_SKETCH_EASING_NAMES = [
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInQuart",
  "easeOutQuart",
  "easeInOutQuart",
  "easeInQuint",
  "easeOutQuint",
  "easeInOutQuint",
  "easeInSine",
  "easeOutSine",
  "easeInOutSine",
  "easeInExpo",
  "easeOutExpo",
  "easeInOutExpo",
] as const;

export type QuickSketchEasing = (typeof QUICK_SKETCH_EASING_NAMES)[number];

/** The functions themselves — the editor's own table, digit for digit. */
export const QUICK_SKETCH_EASINGS: Record<QuickSketchEasing, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => --t * t * t + 1,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - --t * t * t * t,
  easeInOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t),
  easeInQuint: (t) => t * t * t * t * t,
  easeOutQuint: (t) => 1 + --t * t * t * t * t,
  easeInOutQuint: (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t),
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  easeOutExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutExpo: (t) =>
    t <= 0
      ? 0
      : t >= 1
        ? 1
        : t < 0.5
          ? Math.pow(2, 20 * t - 10) / 2
          : (2 - Math.pow(2, -20 * t + 10)) / 2,
};

/** The same table as source text — what "Copy Options" prints. */
export const QUICK_SKETCH_EASING_STRINGS: Record<QuickSketchEasing, string> = {
  linear: "(t) => t",
  easeInQuad: "(t) => t * t",
  easeOutQuad: "(t) => t * (2 - t)",
  easeInOutQuad: "(t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t)",
  easeInCubic: "(t) => t * t * t",
  easeOutCubic: "(t) => --t * t * t + 1",
  easeInOutCubic: "(t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1",
  easeInQuart: "(t) => t * t * t * t",
  easeOutQuart: "(t) => 1 - --t * t * t * t",
  easeInOutQuart: "(t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t",
  easeInQuint: "(t) => t * t * t * t * t",
  easeOutQuint: "(t) => 1 + --t * t * t * t * t",
  easeInOutQuint: "(t) => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t",
  easeInSine: "(t) => 1 - Math.cos((t * Math.PI) / 2)",
  easeOutSine: "(t) => Math.sin((t * Math.PI) / 2)",
  easeInOutSine: "(t) => -(Math.cos(Math.PI * t) - 1) / 2",
  easeInExpo: "(t) => t <= 0 ? 0 : Math.pow(2, 10 * t - 10)",
  easeOutExpo: "(t) => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)",
  easeInOutExpo:
    "(t) => t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2",
};

export const isQuickSketchEasing = (value: unknown): value is QuickSketchEasing =>
  typeof value === "string" && (QUICK_SKETCH_EASING_NAMES as readonly string[]).includes(value);

// ── Style ─────────────────────────────────────────────────────────────────

/** The style of the whole drawing — one object, exactly the editor's. */
export interface QuickSketchStyle {
  /** The stroke's diameter, the base every other option modulates. */
  size: number;
  /** How much pressure thins the stroke: 0 = a constant-width marker. */
  thinning: number;
  /** How much the line is pulled towards a smooth average of its points. */
  streamline: number;
  /** How much the line's edges are softened. */
  smoothing: number;
  /** The pressure easing applied along the stroke. */
  easing: QuickSketchEasing;
  /** Taper to the start: `0` none, `true` full, a number a distance. */
  taperStart: number | boolean;
  taperEnd: number | boolean;
  capStart: boolean;
  capEnd: boolean;
  easingStart: QuickSketchEasing;
  easingEnd: QuickSketchEasing;
  /** Filled ink (a real pen) or an outline (the fill colour is the stroke). */
  isFilled: boolean;
  fill: string;
  stroke: string;
  /** > 0 draws an outline of this width around the filled stroke. */
  strokeWidth: number;
}

/** The editor's defaults — the values its own "Reset Options" restores. */
export const DEFAULT_QUICK_SKETCH_STYLE: QuickSketchStyle = {
  size: 16,
  thinning: 0.5,
  streamline: 0.5,
  smoothing: 0.5,
  easing: "linear",
  taperStart: 0,
  taperEnd: 0,
  capStart: true,
  capEnd: true,
  easingStart: "linear",
  easingEnd: "linear",
  isFilled: true,
  fill: "#000000",
  stroke: "#000000",
  strokeWidth: 0,
};

/** The editor's own colour row: seven swatches, black first. */
export const QUICK_SKETCH_COLOURS = [
  "#000000",
  "#ffc107",
  "#ff5722",
  "#e91e63",
  "#673ab7",
  "#00bcd4",
  "#efefef",
] as const;

/** The numeric rows, in the order the panel shows them. */
export const QUICK_SKETCH_SLIDERS = [
  { key: "size", label: "Size", min: 1, max: 100, step: 1 },
  { key: "thinning", label: "Thinning", min: -0.99, max: 0.99, step: 0.01 },
  { key: "streamline", label: "Streamline", min: 0.01, max: 0.99, step: 0.01 },
  { key: "smoothing", label: "Smoothing", min: 0.01, max: 0.99, step: 0.01 },
] as const;

export type QuickSketchSliderKey = (typeof QUICK_SKETCH_SLIDERS)[number]["key"];

/** The two ends of a stroke, both spelled the same way. */
export const QUICK_SKETCH_STROKE_ENDS = [
  {
    end: "start",
    taper: "taperStart",
    cap: "capStart",
    easing: "easingStart",
    taperLabel: "Taper Start",
    capLabel: "Cap Start",
    easingLabel: "Easing Start",
  },
  {
    end: "end",
    taper: "taperEnd",
    cap: "capEnd",
    easing: "easingEnd",
    taperLabel: "Taper End",
    capLabel: "Cap End",
    easingLabel: "Easing End",
  },
] as const;

// ── Turning a style into the numbers `getStroke` reads ────────────────────

/** The sliders' own range for a taper: `true` shows as its far end (100). */
export function taperSliderValue(taper: number | boolean): number {
  if (taper === true) return 100;
  if (taper === false) return 0;
  return Math.max(0, Math.min(100, taper));
}

/** A picked slider value → a taper: 100 means "taper the whole line". */
export function taperFromSlider(value: number): number | boolean {
  return value === 100 ? true : value;
}

/** Which controls a taper lets the panel show (the editor's own rule). */
export function taperShowsCap(taper: number | boolean): boolean {
  return taper === false || taper === 0;
}

export function taperShowsEasing(taper: number | boolean): boolean {
  return taper === true || (typeof taper === "number" && taper > 0);
}

export function quickSketchStrokeOptions(
  style: QuickSketchStyle,
  options: { last: boolean; simulatePressure: boolean },
): StrokeOptions {
  return {
    size: style.size,
    thinning: style.thinning,
    streamline: style.streamline,
    smoothing: style.smoothing,
    easing: QUICK_SKETCH_EASINGS[style.easing],
    start: {
      taper: style.taperStart,
      cap: style.capStart,
      easing: QUICK_SKETCH_EASINGS[style.easingStart],
    },
    end: {
      taper: style.taperEnd,
      cap: style.capEnd,
      easing: QUICK_SKETCH_EASINGS[style.easingEnd],
    },
    simulatePressure: options.simulatePressure,
    // `last` is what makes a finished stroke settle: perfect-freehand runs its
    // final pass, so the ink the learner let go of is the ink that stays.
    last: options.last,
  };
}

/** One option back to the editor's default — the panel's double-click. */
export function resetQuickSketchStyleProp<K extends keyof QuickSketchStyle>(
  style: QuickSketchStyle,
  prop: K,
): QuickSketchStyle {
  return { ...style, [prop]: DEFAULT_QUICK_SKETCH_STYLE[prop] };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, number));
}

function clampColour(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : fallback;
}

/**
 * Anything (a stored device preference, a hand-written object) → a style the
 * canvas can draw with. Every field is range-checked, so a corrupt preference
 * can never wedge the renderer.
 */
export function quickSketchStyleFrom(value: unknown): QuickSketchStyle {
  const row = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const easing = isQuickSketchEasing(row.easing) ? row.easing : DEFAULT_QUICK_SKETCH_STYLE.easing;
  const easingStart = isQuickSketchEasing(row.easingStart)
    ? row.easingStart
    : DEFAULT_QUICK_SKETCH_STYLE.easingStart;
  const easingEnd = isQuickSketchEasing(row.easingEnd) ? row.easingEnd : DEFAULT_QUICK_SKETCH_STYLE.easingEnd;
  const taper = (input: unknown, fallback: number | boolean): number | boolean => {
    if (input === true || input === false) return input;
    if (typeof input === "number" && Number.isFinite(input)) return clampNumber(input, 0, 100, 0);
    return fallback;
  };
  return {
    size: clampNumber(row.size, 1, 100, DEFAULT_QUICK_SKETCH_STYLE.size),
    thinning: clampNumber(row.thinning, -0.99, 0.99, DEFAULT_QUICK_SKETCH_STYLE.thinning),
    streamline: clampNumber(row.streamline, 0.01, 0.99, DEFAULT_QUICK_SKETCH_STYLE.streamline),
    smoothing: clampNumber(row.smoothing, 0.01, 0.99, DEFAULT_QUICK_SKETCH_STYLE.smoothing),
    easing,
    taperStart: taper(row.taperStart, DEFAULT_QUICK_SKETCH_STYLE.taperStart),
    taperEnd: taper(row.taperEnd, DEFAULT_QUICK_SKETCH_STYLE.taperEnd),
    capStart: typeof row.capStart === "boolean" ? row.capStart : DEFAULT_QUICK_SKETCH_STYLE.capStart,
    capEnd: typeof row.capEnd === "boolean" ? row.capEnd : DEFAULT_QUICK_SKETCH_STYLE.capEnd,
    easingStart,
    easingEnd,
    isFilled: typeof row.isFilled === "boolean" ? row.isFilled : DEFAULT_QUICK_SKETCH_STYLE.isFilled,
    fill: clampColour(row.fill, DEFAULT_QUICK_SKETCH_STYLE.fill),
    stroke: clampColour(row.stroke, DEFAULT_QUICK_SKETCH_STYLE.stroke),
    strokeWidth: clampNumber(row.strokeWidth, 0, 100, DEFAULT_QUICK_SKETCH_STYLE.strokeWidth),
  };
}

export function sameQuickSketchStyle(a: QuickSketchStyle, b: QuickSketchStyle): boolean {
  return (
    a.size === b.size &&
    a.thinning === b.thinning &&
    a.streamline === b.streamline &&
    a.smoothing === b.smoothing &&
    a.easing === b.easing &&
    a.taperStart === b.taperStart &&
    a.taperEnd === b.taperEnd &&
    a.capStart === b.capStart &&
    a.capEnd === b.capEnd &&
    a.easingStart === b.easingStart &&
    a.easingEnd === b.easingEnd &&
    a.isFilled === b.isFilled &&
    a.fill === b.fill &&
    a.stroke === b.stroke &&
    a.strokeWidth === b.strokeWidth
  );
}

/**
 * The "Copy Options" payload: the options object a learner can paste straight
 * into their own `getStroke(points, { … })` call — the editor's own text, with
 * its easings printed as anonymous functions.
 */
export function quickSketchStyleText(style: QuickSketchStyle): string {
  return `{
  size: ${style.size},
  thinning: ${style.thinning},
  streamline: ${style.streamline},
  smoothing: ${style.smoothing},
  easing: ${QUICK_SKETCH_EASING_STRINGS[style.easing]},
  start: {
    taper: ${style.taperStart},
    cap: ${style.capStart},
    easing: ${QUICK_SKETCH_EASING_STRINGS[style.easingStart]},
  },
  end: {
    taper: ${style.taperEnd},
    cap: ${style.capEnd},
    easing: ${QUICK_SKETCH_EASING_STRINGS[style.easingEnd]},
  },
}`;
}
