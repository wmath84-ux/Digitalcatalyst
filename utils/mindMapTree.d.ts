// Type declarations for `utils/mindMapTree.js`. The runtime lives in the
// sibling `.js` file so the Node test runner can import it without a TS
// toolchain. The React editor (`src/course/MindMapPanel.tsx`) and the
// persistence hook (`src/course/useCourseMindMap.ts`) import the runtime
// from this file.

export const MIND_MAP_VERSION: 1;
export const MAX_MIND_MAP_NODES: number;
export const MAX_TOPIC_LENGTH: number;

/** Which side of the centre a root-level branch hangs off. */
export type MindMapSide = "left" | "right" | null;

/**
 * One node record. The root is implicit (`parentId: null`, id `"root"`).
 * `fx`/`fy` are the node's MANUAL position (top-left, flow coordinates) from
 * a hand drag — `null` means "ride the automatic tidy-tree layout".
 */
export interface MindMapNode {
  id: string;
  topic: string;
  parentId: string | null;
  side: MindMapSide;
  collapsed: boolean;
  fx: number | null;
  fy: number | null;
}

/** A whole mind map, as stored in Firestore and as held in editor state. */
export interface MindMap {
  version: number;
  title: string;
  rootTopic: string;
  /** Manual position of the centre box, or null when it rides the layout. */
  rootX?: number | null;
  rootY?: number | null;
  nodes: MindMapNode[];
}

export interface MeasureOptions {
  fontSize?: number;
  charWidthRatio?: number;
  paddingX?: number;
  paddingY?: number;
  lineHeight?: number;
  minWidth?: number;
  maxWidth?: number;
}

export interface TopicBox {
  width: number;
  height: number;
  lines: number;
}

export interface LayoutOptions extends MeasureOptions {
  hGap?: number;
  vGap?: number;
  minNodeHeight?: number;
  measure?: MeasureOptions;
}

/** One positioned box from `layoutMindMap`, in React Flow's top-left space. */
export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  side: MindMapSide;
  collapsed: boolean;
  childCount: number;
  isRoot: boolean;
  /** True when this box sits at a hand-dragged position, not the auto tree. */
  manual: boolean;
}

export interface LaidOutEdge {
  id: string;
  source: string;
  target: string;
  side: MindMapSide;
}

export interface MindMapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface MindMapLayout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  bounds: MindMapBounds;
}

/** Metadata written alongside the map so a doc is self-describing. */
export interface MindMapMeta {
  uid?: string | number | null;
  productId?: string | number | null;
  moduleId?: string | number | null;
  /** Which of the module's maps this document holds (default `"main"`). */
  mapKey?: string | null;
  updatedAt?: number;
}

/** The exact Firestore-safe object handed to `setDoc`. */
export interface StoredMindMap {
  version: number;
  title: string;
  rootTopic: string;
  rootX: number | null;
  rootY: number | null;
  nodes: MindMapNode[];
  nodeCount: number;
  updatedAt: number;
  uid: string | null;
  productId: string | null;
  moduleId: string | null;
  mapKey: string;
}

// ── Construction ──────────────────────────────────────────────────────────
export function createMindMap(rootTopic?: string, title?: string): MindMap;
export function isMindMap(value: unknown): value is MindMap;
export function nextNodeId(mind: MindMap): string;

// ── Text ──────────────────────────────────────────────────────────────────
export function sanitizeTopic(value: unknown): string;
export function sanitizeTitle(value: unknown): string;

// ── Queries ───────────────────────────────────────────────────────────────
export function allNodes(mind: MindMap): MindMapNode[];
export function findNode(mind: MindMap, id: string | number): MindMapNode | null;
export function rootId(): string;
export function childrenOf(mind: MindMap, id: string | number): MindMapNode[];
export function countNodes(mind: MindMap): number;
export function hasChildren(mind: MindMap, id: string | number): boolean;
export function maxDepth(mind: MindMap): number;
export function collectSubtreeIds(mind: MindMap, id: string | number): string[];

// ── Mutations ─────────────────────────────────────────────────────────────
export function addChildNode(
  mind: MindMap,
  parentId: string | number,
  topic?: string,
  options?: { id?: string; side?: "left" | "right" },
): { mind: MindMap; nodeId: string | null };
export function addChildNodes(
  mind: MindMap,
  parentId: string | number,
  topics?: string[],
): { mind: MindMap; nodeIds: string[] };
export function setNodeTopic(mind: MindMap, id: string | number, topic: string): MindMap;
/**
 * Pin a node (root included) to a hand-dragged position. Non-finite
 * coordinates are refused; finite ones are rounded and clamped.
 */
export function setNodePosition(mind: MindMap, id: string | number, x: number, y: number): MindMap;
export function removeNode(mind: MindMap, id: string | number): MindMap;
export function toggleCollapsed(mind: MindMap, id: string | number): MindMap;
export function setCollapsed(mind: MindMap, id: string | number, collapsed: boolean): MindMap;
export function setBranchSide(mind: MindMap, id: string | number, side: "left" | "right"): MindMap;
export function moveNode(mind: MindMap, id: string | number, newParentId: string | number): MindMap;

// ── Measurement + layout ──────────────────────────────────────────────────
export const DEFAULT_MEASURE: Readonly<Required<MeasureOptions>>;
export const DEFAULT_LAYOUT: Readonly<{ hGap: number; vGap: number; minNodeHeight: number }>;
export function measureTopic(topic: string, measure?: MeasureOptions): TopicBox;
export function layoutMindMap(mind: MindMap, options?: LayoutOptions): MindMapLayout;

// ── One-click auto arrange ────────────────────────────────────────────────
/** Re-balance the root's branches between the two wings. */
export function rebalanceBranchSides(mind: MindMap): MindMap;
/**
 * ONE-CLICK CLEAN-UP: drop every hand-dragged position and re-balance the
 * wings, handing the whole diagram back to the tidy-tree layout.
 */
export function autoArrangeMindMap(mind: MindMap): MindMap;
/** True while any node (or the centre) still sits at a hand-dragged spot. */
export function hasManualPositions(mind: MindMap): boolean;

// ── Multiple maps per module ──────────────────────────────────────────────
export const MIND_MAP_DEFAULT_KEY: "main";
export const MAX_MAPS_PER_MODULE: number;
export function sanitizeMapKey(value: unknown): string;
export function createMapKey(takenKeys?: string[]): string;
export function mindMapDisplayTitle(mind: MindMap, fallback?: string): string;
/** Set a map's display name (shown in the map list). */
export function setMindMapTitle(mind: MindMap, title: string): MindMap;

// ── Persistence ───────────────────────────────────────────────────────────
export function mindMapDocId(
  uid: string | number,
  productId: string | number,
  moduleId: string | number,
  mapKey?: string,
): string;
export function parseMindMap(raw: unknown): MindMap;
export function toFirestoreMindMap(mind: MindMap, meta?: MindMapMeta): StoredMindMap;
