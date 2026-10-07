// src/utils/quickSketchSvg.ts
//
// Turning the Quick Sketch's strokes into SVG — the one place that asks
// `perfect-freehand` for an outline, so the canvas, the "Copy to SVG" button
// and any future export all draw the SAME ink.
//
// The canvas renders these as React elements; "Copy to SVG" serialises the
// same paths into a standalone document (a viewBox around the drawing with the
// editor's own 40px padding, so a pasted SVG is never cropped).
//
// Pure apart from the SVG string it returns: no React, no DOM, so a node test
// can prove the geometry and the export without a browser.

import { getStroke } from "perfect-freehand";
import { getSvgPathFromStroke } from "./svgPathFromStroke.ts";
import type { QuickSketchPoint, QuickSketchStroke } from "./quickSketch.ts";
import { quickSketchStrokeOptions, type QuickSketchStyle } from "./quickSketchStyle.ts";

/** How far outside the drawing a copied SVG reaches (the editor's 40px). */
export const QUICK_SKETCH_SVG_PADDING = 40;

/**
 * Whether a stroke's pressure was SIMULATED (a mouse, a finger without
 * pressure support) rather than measured (a pen). The editor decides this from
 * the points themselves: a simulated stroke carries the spec's flat 0.5
 * pressure, so thinning it by pressure would crush it to nothing.
 */
export function strokeSimulatesPressure(stroke: QuickSketchStroke): boolean {
  const points = stroke.points;
  if (points.length === 0) return true;
  const sample = points[Math.min(2, points.length - 1)];
  return sample.pressure === 0.5;
}

/** The polygon around one stroke, in canvas coordinates. */
export function quickSketchStrokeOutline(
  stroke: QuickSketchStroke,
  style: QuickSketchStyle,
  options: { last: boolean; simulatePressure?: boolean },
): number[][] {
  if (stroke.points.length === 0) return [];
  return getStroke(stroke.points, quickSketchStrokeOptions(style, {
    last: options.last,
    simulatePressure: options.simulatePressure ?? strokeSimulatesPressure(stroke),
  }));
}

/**
 * One stroke → SVG path data. `last` is false only for the stroke under the
 * learner's finger: a live stroke is deliberately left unfinished (that is
 * what makes it grow), and the moment it is let go it is re-rendered with
 * `last: true` so the finished ink settles exactly where it was released.
 */
export function quickSketchStrokePath(
  stroke: QuickSketchStroke,
  style: QuickSketchStyle,
  options: { last: boolean; simulatePressure?: boolean },
): string {
  return getSvgPathFromStroke(quickSketchStrokeOutline(stroke, style, options));
}

/** The box around every stroke, in canvas coordinates. */
export function quickSketchBounds(strokes: QuickSketchStroke[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const stroke of strokes) {
    for (const point of stroke.points as QuickSketchPoint[]) {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * The whole drawing as one standalone SVG document — what "Copy to SVG" puts
 * on the clipboard (and what a learner can paste into slides, notes or code).
 * The padding keeps the ink away from the edges, exactly like the editor's own
 * export.
 */
export function quickSketchSvgDocument(strokes: QuickSketchStroke[], style: QuickSketchStyle): string {
  const bounds = quickSketchBounds(strokes);
  const padding = QUICK_SKETCH_SVG_PADDING;
  const viewBox = [
    round(bounds.minX - padding),
    round(bounds.minY - padding),
    round(bounds.width + padding * 2),
    round(bounds.height + padding * 2),
  ].join(" ");
  const paths: string[] = [];
  for (const stroke of strokes) {
    const d = quickSketchStrokePath(stroke, style, { last: true });
    if (!d) continue;
    if (style.strokeWidth > 0) {
      paths.push(
        `<path d="${d}" fill="transparent" stroke="${escapeAttribute(style.stroke)}" stroke-width="${style.strokeWidth}" stroke-linejoin="round" stroke-linecap="round" />`,
      );
    }
    const fill = style.isFilled ? style.fill : "transparent";
    const outline = style.isFilled || style.strokeWidth > 0 ? "transparent" : "#000000";
    const outlineWidth = style.isFilled || style.strokeWidth > 0 ? 0 : 1;
    paths.push(
      `<path d="${d}" fill="${escapeAttribute(fill)}" stroke="${escapeAttribute(outline)}" stroke-width="${outlineWidth}" stroke-linejoin="round" stroke-linecap="round" />`,
    );
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${round(bounds.width)}" height="${round(bounds.height)}">`,
    ...paths,
    "</svg>",
  ].join("\n");
}

/** Two decimals — the precision a hand-drawn point can actually use. */
function round(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}
