// utils/sketchScene.js
//
// Course Player SKETCH — the pure scene model.
//
// NO Firestore, NO React, NO Excalidraw import. The Node test runner imports
// this file directly (`tests/courseSketchScene.test.mjs`); the React hook
// (`src/course/useCourseSketch.ts`) imports the runtime through
// `utils/sketchScene.d.ts`. This mirrors exactly how `utils/mindMapTree.js`
// backs the Mind Map tab.
//
// ── What a sketch is ──────────────────────────────────────────────────────
// Excalidraw owns the editor and the scene FORMAT; this file owns how that
// scene is scoped, trimmed and stored:
//
//   { version, elements: [...], appState: {…}, files: {…} }
//
// ── Why the scene is stored as a STRING ───────────────────────────────────
// Excalidraw's linear elements carry `points: [[x, y], …]` — a NESTED array,
// which Firestore cannot store in a document field at all. Rather than
// flattening (and re-inflating) every element, the whole scene is serialised
// to JSON and written as one string field, exactly the way Excalidraw itself
// persists scenes to a `.excalidraw` file. One field, no nesting rules to
// trip over, and the firestore.rules check stays a simple size cap.
//
// ── Caps ──────────────────────────────────────────────────────────────────
// A Firestore document is hard-capped at 1 MB. Everything here is sized so a
// payload this file produced can never be rejected for size:
//
//   · MAX_SKETCH_ELEMENTS   — a runaway freedraw session cannot wedge saves;
//   · MAX_SKETCH_FILE_CHARS — embedded images (data URLs) have their own
//     budget, and anything above it stays in the DEVICE copy only, so pasting
//     a huge screenshot degrades to "this image is on this device" instead of
//     breaking every future save of the drawing;
//   · MAX_SKETCH_SCENE_CHARS — the final string cap the rules also enforce.

/** Bumped when the stored shape changes so old docs can be migrated. */
export const SKETCH_SCENE_VERSION = 1;

/** Firestore subcollection under `users/{uid}` — one doc per course module. */
export const SKETCH_COLLECTION = "sketches";

/** A module holds ONE sketch board today; the key leaves room for more. */
export const SKETCH_DEFAULT_KEY = "main";

/** Hard stop so a runaway drawing can never wedge the document. */
export const MAX_SKETCH_ELEMENTS = 1500;

/** Embedded image budget (characters of data URL) for the CLOUD copy. */
export const MAX_SKETCH_FILE_CHARS = 420000;

/** The serialised scene's cap — the rules enforce the same number. */
export const MAX_SKETCH_SCENE_CHARS = 760000;

/** The appState keys worth remembering. Everything else is ephemeral UI. */
const APP_STATE_KEYS = [
  // canvas
  "viewBackgroundColor",
  "theme",
  "gridSize",
  "gridModeEnabled",
  "zenModeEnabled",
  "objectsSnapModeEnabled",
  // viewport — reopening the board where the learner left it
  "scrollX",
  "scrollY",
  // the pen the learner last drew with
  "currentItemStrokeColor",
  "currentItemBackgroundColor",
  "currentItemFillStyle",
  "currentItemStrokeWidth",
  "currentItemStrokeStyle",
  "currentItemRoughness",
  "currentItemOpacity",
  "currentItemFontFamily",
  "currentItemFontSize",
  "currentItemTextAlign",
  "currentItemRoundness",
  "currentItemArrowType",
  "currentItemStartArrowhead",
  "currentItemEndArrowhead",
];

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const clampNumber = (value, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** A brand-new, empty board. */
export const createSketchScene = () => ({
  version: SKETCH_SCENE_VERSION,
  elements: [],
  appState: {},
  files: {},
});

/** True for anything shaped like a sketch scene (not necessarily valid). */
export const isSketchScene = (value) =>
  isPlainObject(value) && Array.isArray(value.elements);

/** True when the learner has drawn nothing at all. */
export const sketchSceneIsEmpty = (scene) =>
  !isSketchScene(scene) || scene.elements.length === 0;

/** How many elements the board holds. */
export const sketchElementCount = (scene) =>
  isSketchScene(scene) ? scene.elements.length : 0;

/**
 * A CHEAP change signature, the same idea as Excalidraw's own
 * `getSceneVersion`: the sum of every element's version plus the count. Two
 * scenes with the same signature are the same drawing, so the save queue can
 * ignore the `onChange` calls that only moved a cursor or opened a menu —
 * without importing the (heavy) Excalidraw bundle into the hook.
 */
export const sketchSceneSignature = (elements) => {
  const rows = Array.isArray(elements) ? elements : [];
  let total = rows.length;
  for (const element of rows) {
    if (!isPlainObject(element)) continue;
    total += clampNumber(element.version, 0);
    // `versionNonce` separates "undo back to the same version" from a real
    // edit, exactly as Excalidraw's reconciler uses it.
    total += clampNumber(element.versionNonce, 0) % 1000;
  }
  return total;
};

/** Keep only the appState worth restoring, and only in sane types. */
export const sanitizeSketchAppState = (raw) => {
  if (!isPlainObject(raw)) return {};
  const out = {};
  for (const key of APP_STATE_KEYS) {
    const value = raw[key];
    if (value == null) continue;
    const type = typeof value;
    if (type === "string") {
      if (value.length <= 200) out[key] = value;
    } else if (type === "number") {
      if (Number.isFinite(value)) out[key] = value;
    } else if (type === "boolean") {
      out[key] = value;
    }
  }
  // Zoom is `{ value: number }` in Excalidraw's appState.
  const zoom = raw.zoom;
  if (isPlainObject(zoom) && Number.isFinite(zoom.value)) {
    out.zoom = { value: Math.min(30, Math.max(0.1, Number(zoom.value))) };
  }
  return out;
};

/**
 * Elements, trimmed for storage: plain objects only, deleted ones dropped
 * (Excalidraw keeps tombstones for undo/collab — the saved board does not
 * need them), and never more than the cap.
 */
export const sanitizeSketchElements = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const element of raw) {
    if (!isPlainObject(element)) continue;
    if (element.isDeleted === true) continue;
    out.push(element);
    if (out.length >= MAX_SKETCH_ELEMENTS) break;
  }
  return out;
};

/**
 * Image payloads, within a budget. Files are kept smallest-first so a board
 * with one huge screenshot still syncs its small images; whatever does not
 * fit is reported through `dropped` so the UI can say "image kept on this
 * device" instead of silently losing it.
 */
export const sanitizeSketchFiles = (raw, budget = MAX_SKETCH_FILE_CHARS) => {
  if (!isPlainObject(raw)) return { files: {}, dropped: 0 };
  const rows = Object.entries(raw)
    .filter(([, file]) => isPlainObject(file) && typeof file.dataURL === "string")
    .map(([id, file]) => ({ id, file, size: file.dataURL.length }))
    .sort((a, b) => a.size - b.size);
  const files = {};
  let used = 0;
  let dropped = 0;
  for (const row of rows) {
    if (used + row.size > budget) {
      dropped += 1;
      continue;
    }
    used += row.size;
    files[row.id] = row.file;
  }
  return { files, dropped };
};

/**
 * Parse whatever came back from Firestore / localStorage into a usable scene.
 * Accepts the stored document (`{ scene: "<json>" }`), a raw JSON string, or
 * an already-parsed scene object. Never throws: a corrupt payload opens as an
 * EMPTY board rather than crashing the editor — and the caller can tell the
 * difference, because a corrupt parse reports zero elements.
 */
export const parseSketchScene = (raw) => {
  if (raw == null) return createSketchScene();
  let source = raw;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return createSketchScene();
    }
  }
  if (isPlainObject(source) && typeof source.scene === "string") {
    try {
      source = JSON.parse(source.scene);
    } catch {
      return createSketchScene();
    }
  }
  if (!isPlainObject(source)) return createSketchScene();
  const { files } = sanitizeSketchFiles(source.files);
  return {
    version: SKETCH_SCENE_VERSION,
    elements: sanitizeSketchElements(source.elements),
    appState: sanitizeSketchAppState(source.appState),
    files,
  };
};

/**
 * The scene as ONE JSON string (the field Firestore stores). If the drawing
 * is still too large with its images, the images are dropped before the
 * elements are — losing a pasted picture from the CLOUD copy is recoverable,
 * losing the drawing is not.
 */
export const serializeSketchScene = (scene) => {
  const safe = parseSketchScene(scene);
  let json = JSON.stringify(safe);
  if (json.length <= MAX_SKETCH_SCENE_CHARS) return json;
  json = JSON.stringify({ ...safe, files: {} });
  if (json.length <= MAX_SKETCH_SCENE_CHARS) return json;
  // Last resort: keep as many elements as fit, oldest first.
  let elements = safe.elements;
  while (elements.length > 0) {
    elements = elements.slice(0, Math.floor(elements.length * 0.8));
    json = JSON.stringify({ ...safe, files: {}, elements });
    if (json.length <= MAX_SKETCH_SCENE_CHARS) return json;
  }
  return JSON.stringify({ ...createSketchScene() });
};

/**
 * Document id for ONE learner's board inside one course module. Scoping by
 * uid + product + module means two students never share a document and each
 * module keeps its own board — the same composite-id rule `mindMapDocId()`
 * uses, so firestore.rules can re-derive (and therefore verify) the id.
 * Firestore ids may not contain `/`, so the separators are fixed.
 */
export const sketchDocId = (uid, productId, moduleId, sketchKey = SKETCH_DEFAULT_KEY) => {
  const base = `${String(uid).trim()}__${String(productId).trim()}__${String(moduleId).trim()}`;
  const key = sanitizeSketchKey(sketchKey);
  return key === SKETCH_DEFAULT_KEY ? base : `${base}__${key}`;
};

/** Keys are lowercase slugs, so they are always safe inside a document id. */
export const sanitizeSketchKey = (value) => {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
  return text || SKETCH_DEFAULT_KEY;
};

/**
 * The Firestore payload. Every field the rules validate is produced here, so
 * a write this function built can never be refused for shape — including the
 * optional resource association (which lecture the board was drawn beside).
 */
export const toFirestoreSketch = (scene, meta = {}) => {
  const safe = parseSketchScene(scene);
  const now = Date.now();
  const payload = {
    uid: String(meta.uid ?? "").trim(),
    productId: String(meta.productId ?? "").trim(),
    moduleId: String(meta.moduleId ?? "").trim(),
    sketchKey: sanitizeSketchKey(meta.sketchKey),
    version: SKETCH_SCENE_VERSION,
    scene: serializeSketchScene(safe),
    elementCount: safe.elements.length,
    updatedAt: clampNumber(meta.updatedAt, now),
    createdAt: clampNumber(meta.createdAt, clampNumber(meta.updatedAt, now)),
  };
  // Optional lecture association — "drawn while studying this resource".
  const resourceId = String(meta.resourceId ?? "").trim();
  if (resourceId) payload.resourceId = resourceId.slice(0, 200);
  const resourceName = String(meta.resourceName ?? "").trim();
  if (resourceName) payload.resourceName = resourceName.slice(0, 200);
  return payload;
};
