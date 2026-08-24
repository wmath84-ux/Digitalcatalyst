import type { ActivityWithStatus } from "../types/flowpath";
import type { CurveOverride } from "../types/curve";

export interface Point {
  x: number;
  y: number;
}

export type RowKind = "activity" | "plus";

/** Sentinel afterId meaning "insert at the very beginning of the flow". */
export const LEAD_SENTINEL = "__flowpath_start__";

export interface FlowRow {
  id: string;
  kind: RowKind;
  index: number;
  y: number;
  height: number;
  x: number;
  side: "left" | "right";
  activity?: ActivityWithStatus;
  afterId: string | null;
}

export interface LayoutConfig {
  isMobile: boolean;
  isTablet: boolean;
  centerX: number;
  amplitude: number;
  frequency: number;
  organic: number;
  activityHeight: number;
  plusHeight: number;
  cardWidth: number;
  cardGap: number;
  singleSide: boolean;
  topPad: number;
  bottomPad: number;
}

export function getLayoutConfig(width: number, curve?: CurveOverride): LayoutConfig {
  const c = curve ?? { amplitude: 1, frequency: 1, spacing: 1 };
  const isMobile = width < 640;
  const isTablet = width >= 640 && width < 1024;
  const safeWidth = Math.max(width, 280);

  const centerFrac = isMobile ? 0.33 : 0.5;
  const baseAmplitude = isMobile
    ? Math.min(20, safeWidth * 0.06)
    : isTablet
      ? Math.min(60, safeWidth * 0.1)
      : Math.min(96, safeWidth * 0.12);
  const amplitude = baseAmplitude * c.amplitude;

  const cardWidth = isMobile
    ? Math.min(198, safeWidth * 0.52)
    : isTablet
      ? Math.min(240, safeWidth * 0.32)
      : Math.min(292, safeWidth * 0.26);

  const baseActivityHeight = isMobile ? 196 : isTablet ? 222 : 244;
  const basePlusHeight = isMobile ? 92 : 108;

  return {
    isMobile,
    isTablet,
    centerX: safeWidth * centerFrac,
    amplitude,
    frequency: 0.78 * c.frequency,
    organic: 0.5,
    activityHeight: baseActivityHeight * c.spacing,
    plusHeight: basePlusHeight * c.spacing,
    cardWidth,
    cardGap: isMobile ? 16 : 24,
    singleSide: isMobile,
    topPad: isMobile ? 60 : 90,
    bottomPad: 220,
  };
}

export function curveX(config: LayoutConfig, index: number): number {
  return config.centerX + config.amplitude * Math.sin(index * config.frequency);
}

export interface BuiltLayout {
  rows: FlowRow[];
  totalHeight: number;
}

export function buildRows(items: ActivityWithStatus[], config: LayoutConfig): BuiltLayout {
  const rows: FlowRow[] = [];
  let y = config.topPad;
  let index = 0;

  if (items.length === 0) {
    for (let i = 0; i < 3; i++) {
      rows.push({
        id: `empty-plus-${i}`,
        kind: "plus",
        index,
        y,
        height: config.plusHeight * 1.4,
        x: curveX(config, index),
        side: "right",
        afterId: null,
      });
      y += config.plusHeight * 1.4;
      index++;
    }
    return { rows, totalHeight: y + config.bottomPad };
  }

  // leading plus node to insert before everything
  rows.push({
    id: "lead-plus",
    kind: "plus",
    index,
    y,
    height: config.plusHeight,
    x: curveX(config, index),
    side: "right",
    afterId: LEAD_SENTINEL,
  });
  y += config.plusHeight;
  index++;

  items.forEach((item, i) => {
    const side: "left" | "right" = config.singleSide ? "right" : i % 2 === 0 ? "right" : "left";
    rows.push({
      id: item.activity.id,
      kind: "activity",
      index,
      y,
      height: config.activityHeight,
      x: curveX(config, index),
      side,
      activity: item,
      afterId: item.activity.id,
    });
    y += config.activityHeight;
    index++;

    rows.push({
      id: `plus-after-${item.activity.id}`,
      kind: "plus",
      index,
      y,
      height: config.plusHeight,
      x: curveX(config, index),
      side: "right",
      afterId: item.activity.id,
    });
    y += config.plusHeight;
    index++;
  });

  return { rows, totalHeight: y + config.bottomPad };
}

/** Smooth vertical curve through points using midpoint bezier technique. */
export function buildSmoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midY = (prev.y + curr.y) / 2;
    d += ` C ${prev.x} ${midY}, ${curr.x} ${midY}, ${curr.x} ${curr.y}`;
  }
  return d;
}

export function chunkRows<T extends { y: number }>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    const start = Math.max(0, i - 1);
    chunks.push(rows.slice(start, i + size));
  }
  return chunks;
}
