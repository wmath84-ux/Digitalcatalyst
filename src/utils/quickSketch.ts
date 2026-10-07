// src/utils/quickSketch.ts
//
// The Quick Sketch DATA layer — the shapes the Course Player's freehand canvas
// stores, and the pure rules that guard them. No React, no Firebase, no DOM:
// `src/course/usePerfectFreehandSketch.ts` owns persistence and
// `src/components/PerfectFreehandSketch.tsx` owns the canvas, both on top of
// this file, and `tests/coursePlayerQuickSketchRuntime.test.mjs` drives them.
//
// ── One stroke is geometry, nothing else ─────────────────────────────────
// A stroke is `{ id, points }`. Its look — size, thinning, taper, colour,
// fill — is the DRAWING's style (see `quickSketchStyle.ts`), exactly like the
// perfect-freehand editor (perfectfreehand.com) the canvas follows: changing
// "Thinning" restyles every stroke on the board, live, and the change is one
// undo step. Colour and size therefore never live on a stroke, which is also
// why a stroke stored by an older build (which kept `color` / `size` /
// `isEraser` per stroke) still loads: the extra keys are simply ignored.
//
// ── Firestore-safe by construction ───────────────────────────────────────
// Points are OBJECTS (`{x, y, pressure}`), never nested arrays — Firestore
// rejects `[[x, y], …]` outright, which is why the Excalidraw scene next door
// has to travel as a JSON string. A list of maps is fine, so the strokes can
// live in the document as data, coordinates rounded to 2 decimals (a hand
// drawn point never needs more, and the rounding keeps a long board well away
// from the 1 MB document limit).
//
// Storage: `users/{uid}/quickSketches/{uid}__{productId}__{moduleId}` for the
// first canvas of a module and `…__{sketchKey}` for every further canvas —
// the same composite id shape the Excalidraw boards use, re-derived by
// firestore.rules so one learner can never write into another's namespace.

// ── Types ─────────────────────────────────────────────────────────────────

/** One sampled point of a freehand stroke. `pressure` 0.5 = a mouse. */
export interface QuickSketchPoint {
  x: number;
  y: number;
  pressure: number;
}

/** One freehand stroke: an id (for React keys and erase) and its points. */
export interface QuickSketchStroke {
  id: string;
  points: QuickSketchPoint[];
}

/** One canvas of a module, as stored in `quickSketches`. */
export interface QuickSketchBoardDoc {
  uid: string;
  productId: string;
  moduleId: string;
  sketchKey: string;
  title: string;
  strokes: QuickSketchStroke[];
  resourceId: string | null;
  resourceName: string | null;
  createdAt: number;
  updatedAt: number;
}

/** One row of the module's canvas list — enough for the switcher. */
export interface QuickSketchBoardSummary {
  sketchKey: string;
  title: string;
  strokeCount: number;
  updatedAt: number;
  createdAt: number;
}

// ── Constants (firestore.rules mirrors every number that matters) ─────────

export const QUICK_SKETCH_COLLECTION = "quickSketches";

/** The first canvas of a module keeps the legacy three-part document id. */
export const QUICK_SKETCH_DEFAULT_KEY = "main";

/** Canvases a module may hold — the same ceiling the Excalidraw boards use. */
export const MAX_QUICK_SKETCH_BOARDS = 12;

/**
 * Strokes one canvas may hold. A stroke averages ~40 points (~2 KB of JSON),
 * so 600 strokes stays far below Firestore's 1 MB document limit while still
 * being more than a lecture's worth of writing. Mirrored in firestore.rules;
 * the hook refuses to grow past it instead of writing a document that the
 * rules would reject.
 */
export const MAX_QUICK_SKETCH_STROKES = 600;

/** Canvas titles are the learner's own words; the rules cap them here. */
export const MAX_QUICK_SKETCH_TITLE = 120;

/** Keys are generated here, so a key is always URL/id safe. */
export const QUICK_SKETCH_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;

// ── Identity ──────────────────────────────────────────────────────────────

/**
 * `{uid}__{productId}__{moduleId}` for the first canvas, `…__{key}` for the
 * rest — byte-for-byte the shape `firestore.rules` re-derives, so a document
 * can never masquerade as another canvas (or another learner's).
 */
export function quickSketchDocId(
  uid: string,
  productId: string,
  moduleId: string,
  sketchKey: string = QUICK_SKETCH_DEFAULT_KEY,
): string {
  const base = `${uid}__${productId}__${moduleId}`;
  return sketchKey === QUICK_SKETCH_DEFAULT_KEY ? base : `${base}__${sketchKey}`;
}

/** The device-side mirror of one canvas (and of the module's canvas index). */
export function quickSketchLocalKey(
  uid: string,
  productId: string,
  moduleId: string,
  sketchKey: string = QUICK_SKETCH_DEFAULT_KEY,
): string {
  const base = `dc.quickSketch.v1.${uid}.${productId}.${moduleId}`;
  return sketchKey === QUICK_SKETCH_DEFAULT_KEY ? base : `${base}.${sketchKey}`;
}

export function quickSketchIndexKey(uid: string, productId: string, moduleId: string): string {
  return `dc.quickSketchIndex.v1.${uid}.${productId}.${moduleId}`;
}

export function quickSketchActiveKey(uid: string, productId: string, moduleId: string): string {
  return `dc.quickSketchActive.v1.${uid}.${productId}.${moduleId}`;
}

/** The learner's own style, remembered per learner on this device. */
export function quickSketchStyleStorageKey(uid: string | null | undefined): string {
  return `dc.quickSketchStyle.v1.${uid || "anon"}`;
}

/**
 * The DEVICE-only draft of a drawing made before a lesson was open.
 *
 * A board's identity is `{uid, productId, moduleId, sketchKey}`, so a canvas
 * with no module has no board to save into — there is no document id the rules
 * could accept and no key in the module's index. Refusing to store anything at
 * all meant such a drawing was only ever in the tab's memory: it was gone the
 * moment the Sketch tab unmounted, which is exactly the "I draw, I let go, it
 * vanishes" report the canvas has to answer for. So an unscoped canvas writes
 * this draft instead — the learner's own device, one key per learner per
 * course, never the cloud — and the hook hands it to the first board that
 * opens afterwards. It is deliberately NOT under a `dc.quickSketch.v1.*` key:
 * nothing else may mistake it for a real board.
 */
export function quickSketchDraftKey(uid: string, productId?: string | number | null): string {
  return `dc.quickSketchDraft.v1.${uid || "anon"}.${String(productId ?? "") || "-"}`;
}

/** The draft as stored (its own title, its own creation time). */
export interface QuickSketchDraft {
  title: string;
  strokes: QuickSketchStroke[];
  createdAt: number;
  updatedAt: number;
}

/** The device's draft for this learner + course, or null when there is none. */
export function readQuickSketchDraft(
  uid: string,
  productId?: string | number | null,
): QuickSketchDraft | null {
  try {
    const raw = localStorage.getItem(quickSketchDraftKey(uid, productId));
    if (!raw) return null;
    const row = JSON.parse(raw) as Record<string, unknown>;
    const strokes = quickSketchStrokesFrom(row?.strokes);
    if (strokes.length === 0) return null;
    return {
      title: typeof row?.title === "string" && row.title ? row.title.slice(0, MAX_QUICK_SKETCH_TITLE) : "Sketch 1",
      strokes,
      createdAt: typeof row?.createdAt === "number" ? row.createdAt : 0,
      updatedAt: typeof row?.updatedAt === "number" ? row.updatedAt : 0,
    };
  } catch {
    // A corrupt draft is "no draft": the board opens empty instead of crashing.
    return null;
  }
}

/** Returns false when the device refused the write (quota, private mode). */
export function writeQuickSketchDraft(
  uid: string,
  productId: string | number | null | undefined,
  draft: { title: string; strokes: QuickSketchStroke[]; createdAt?: number; updatedAt?: number },
): boolean {
  try {
    const payload: QuickSketchDraft = {
      title: (draft.title || "Sketch 1").slice(0, MAX_QUICK_SKETCH_TITLE),
      strokes: quickSketchStrokesFrom(draft.strokes),
      createdAt: Math.round(draft.createdAt || Date.now()),
      updatedAt: Math.round(draft.updatedAt || Date.now()),
    };
    localStorage.setItem(quickSketchDraftKey(uid, productId), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/** The draft has been handed to a real board — it must not be adopted twice. */
export function clearQuickSketchDraft(uid: string, productId?: string | number | null): void {
  try {
    localStorage.removeItem(quickSketchDraftKey(uid, productId));
  } catch {
    /* private mode — an unreadable device has no draft either */
  }
}

export function createQuickSketchKey(): string {
  return `sk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Never let a chosen key leave the alphabet the rules accept. */
export function sanitizeQuickSketchKey(key: string): string {
  const clean = key.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return clean || createQuickSketchKey();
}

/** `Sketch 1`, `Sketch 2`, … — the first title no canvas of the module holds. */
export function nextQuickSketchTitle(boards: QuickSketchBoardSummary[]): string {
  const used = new Set(boards.map((board) => board.title));
  for (let index = 1; index < 100; index += 1) {
    const title = `Sketch ${index}`;
    if (!used.has(title)) return title;
  }
  return `Sketch ${Date.now()}`;
}

// ── Reading what the device / the cloud hands back ────────────────────────

const round2 = (value: number) => Math.round(value * 100) / 100;

const pressureOf = (value: unknown) => {
  const pressure = typeof value === "number" && Number.isFinite(value) ? value : 0.5;
  return Math.min(1, Math.max(0, round2(pressure)));
};

/**
 * One stored point → a real point, or null when it is not a point at all.
 * Tolerates both the object shape this build writes and the `[x, y, pressure]`
 * array shape an older build (or a hand-written document) might hold.
 */
export function quickSketchPointFrom(value: unknown): QuickSketchPoint | null {
  if (Array.isArray(value)) {
    const [x, y, pressure] = value as unknown[];
    if (typeof x !== "number" || typeof y !== "number") return null;
    return { x: round2(x), y: round2(y), pressure: pressureOf(pressure) };
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    if (typeof row.x !== "number" || typeof row.y !== "number") return null;
    return { x: round2(row.x), y: round2(row.y), pressure: pressureOf(row.pressure) };
  }
  return null;
}

/** One stored stroke → a real stroke, or null when there is no geometry in it. */
export function quickSketchStrokeFrom(value: unknown, fallbackId: string): QuickSketchStroke | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const rawPoints = Array.isArray(row.points) ? row.points : [];
  const points = rawPoints
    .map((point) => quickSketchPointFrom(point))
    .filter((point): point is QuickSketchPoint => point !== null);
  if (points.length === 0) return null;
  const id = typeof row.id === "string" && row.id ? row.id : fallbackId;
  return { id, points };
}

/**
 * A stored canvas (`strokes` plus the board's identity) → the strokes the
 * canvas can draw. Junk rows are dropped rather than trusted, and the list is
 * capped at `MAX_QUICK_SKETCH_STROKES` so a hand-written document can never
 * push the editor past what the rules would accept on the next save.
 */
export function quickSketchStrokesFrom(value: unknown): QuickSketchStroke[] {
  if (!Array.isArray(value)) return [];
  const strokes: QuickSketchStroke[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (strokes.length >= MAX_QUICK_SKETCH_STROKES) break;
    const stroke = quickSketchStrokeFrom(value[index], `stroke-${index}`);
    if (stroke) strokes.push(stroke);
  }
  return strokes;
}

/** The exact document `setDoc` must write — rounded, capped, null-free. */
export function toFirestoreQuickSketch(board: QuickSketchBoardDoc): QuickSketchBoardDoc {
  return {
    uid: board.uid,
    productId: String(board.productId),
    moduleId: String(board.moduleId),
    sketchKey: sanitizeQuickSketchKey(board.sketchKey),
    title: (board.title || "Sketch").slice(0, MAX_QUICK_SKETCH_TITLE),
    strokes: quickSketchStrokesFrom(board.strokes),
    resourceId: board.resourceId ? String(board.resourceId).slice(0, 200) : null,
    resourceName: board.resourceName ? String(board.resourceName).slice(0, 200) : null,
    createdAt: Math.round(board.createdAt || Date.now()),
    updatedAt: Math.round(board.updatedAt || Date.now()),
  };
}

// ── Erasing ───────────────────────────────────────────────────────────────

/** Distance from a point to the segment `a`–`b` — the eraser's whole test. */
export function distanceToSegment(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/**
 * True when the pointer is on (or within `radius` of) a stroke's line. The
 * eraser removes whole strokes — dragging it across a line rubs that line out,
 * exactly like the perfect-freehand editor's own eraser — so the radius only
 * has to cover the ink's width.
 */
export function strokeHitByPoint(
  stroke: QuickSketchStroke,
  point: { x: number; y: number },
  radius: number,
): boolean {
  const { points } = stroke;
  if (points.length === 0) return false;
  if (points.length === 1) return Math.hypot(points[0].x - point.x, points[0].y - point.y) <= radius;
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(point, points[index - 1], points[index]) <= radius) return true;
  }
  return false;
}

/** Drop every stroke the eraser touched. Same array back when it touched none. */
export function eraseStrokesAt(
  strokes: QuickSketchStroke[],
  point: { x: number; y: number },
  radius: number,
): QuickSketchStroke[] {
  const kept = strokes.filter((stroke) => !strokeHitByPoint(stroke, point, radius));
  return kept.length === strokes.length ? strokes : kept;
}

/** The eraser's reach: half the ink plus a finger's worth of slack. */
export function eraseRadiusFor(size: number): number {
  return Math.max(6, size / 2 + 2);
}

// ── Small predicates ──────────────────────────────────────────────────────

export function quickSketchStrokeId(existing: Set<string>): string {
  let id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  while (existing.has(id)) id = `s_${Math.random().toString(36).slice(2, 10)}`;
  return id;
}

/** True when the canvas has room for one more stroke. */
export function canAddQuickSketchStroke(strokes: QuickSketchStroke[]): boolean {
  return strokes.length < MAX_QUICK_SKETCH_STROKES;
}

export function sameQuickSketchStrokes(a: QuickSketchStroke[], b: QuickSketchStroke[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) continue;
    if (a[index].id !== b[index].id) return false;
    const pointsA = a[index].points;
    const pointsB = b[index].points;
    if (pointsA.length !== pointsB.length) return false;
    for (let point = 0; point < pointsA.length; point += 1) {
      if (
        pointsA[point].x !== pointsB[point].x ||
        pointsA[point].y !== pointsB[point].y ||
        pointsA[point].pressure !== pointsB[point].pressure
      ) {
        return false;
      }
    }
  }
  return true;
}
