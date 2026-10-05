// tests/courseSketchScene.test.mjs
//
// The Course Player's SKETCH scene model — the pure half of the Excalidraw
// integration. Everything here runs with no React, no Firestore and no
// Excalidraw bundle: `utils/sketchScene.js` is deliberately dependency-free
// so the storage rules can be proved in milliseconds.
//
// The contract this file defends, in one line each:
//   · a scene is stored as STRUCTURE, never as a picture;
//   · Firestore forbids nested arrays, so the scene travels as a JSON string;
//   · a corrupt / hostile payload opens as an empty board instead of throwing;
//   · a runaway board is trimmed to fit the document limit, drawing last;
//   · one learner's board can never be addressed with another's id.

import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_SKETCH_ELEMENTS,
  MAX_SKETCH_FILE_CHARS,
  MAX_SKETCH_SCENE_CHARS,
  SKETCH_COLLECTION,
  SKETCH_DEFAULT_KEY,
  SKETCH_SCENE_VERSION,
  createSketchScene,
  isSketchScene,
  parseSketchScene,
  sanitizeSketchAppState,
  sanitizeSketchElements,
  sanitizeSketchFiles,
  sanitizeSketchKey,
  serializeSketchScene,
  sketchDocId,
  sketchElementCount,
  sketchSceneIsEmpty,
  sketchSceneSignature,
  toFirestoreSketch,
} from "../utils/sketchScene.js";

/** A freehand stroke, shaped like the real thing: `points` is NESTED arrays. */
const stroke = (id, version = 1) => ({
  id,
  type: "freedraw",
  x: 12,
  y: 34,
  width: 100,
  height: 50,
  version,
  versionNonce: 1234 + version,
  seed: 7,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  points: [
    [0, 0],
    [10, 12],
    [20, 30],
  ],
});

// ---------------------------------------------------------------------------
// The shape itself
// ---------------------------------------------------------------------------

test("a new board is an empty, versioned scene — not a blank image", () => {
  const scene = createSketchScene();
  assert.equal(scene.version, SKETCH_SCENE_VERSION);
  assert.deepEqual(scene.elements, []);
  assert.deepEqual(scene.appState, {});
  assert.deepEqual(scene.files, {});
  assert.equal(isSketchScene(scene), true);
  assert.equal(sketchSceneIsEmpty(scene), true);
  assert.equal(sketchElementCount(scene), 0);
  // No screenshot field exists anywhere in the model, by construction.
  assert.equal(Object.keys(scene).sort().join(","), "appState,elements,files,version");
});

test("the scene survives a full round trip with its nested point arrays intact", () => {
  const scene = { ...createSketchScene(), elements: [stroke("a"), stroke("b")] };
  const json = serializeSketchScene(scene);
  assert.equal(typeof json, "string");
  const back = parseSketchScene(json);
  assert.equal(back.elements.length, 2);
  // The drawing data itself — this is what makes it a scene and not a PNG.
  assert.deepEqual(back.elements[0].points, [
    [0, 0],
    [10, 12],
    [20, 30],
  ]);
  assert.equal(back.elements[1].id, "b");
});

test("the stored document carries the scene as a STRING (Firestore bans nested arrays)", () => {
  const payload = toFirestoreSketch(
    { ...createSketchScene(), elements: [stroke("a")] },
    { uid: "u1", productId: "p1", moduleId: "m1", updatedAt: 1000, createdAt: 900 },
  );
  assert.equal(typeof payload.scene, "string");
  // Nothing in the document is an array at all, at any depth: that is the
  // whole reason the scene is serialised instead of stored as a map.
  const walk = (value, path = "$") => {
    assert.equal(Array.isArray(value), false, `${path} is an array`);
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
    }
  };
  walk(payload);
  // …and the envelope the security rules validate.
  assert.equal(payload.uid, "u1");
  assert.equal(payload.productId, "p1");
  assert.equal(payload.moduleId, "m1");
  assert.equal(payload.sketchKey, SKETCH_DEFAULT_KEY);
  assert.equal(payload.version, SKETCH_SCENE_VERSION);
  assert.equal(payload.elementCount, 1);
  assert.equal(payload.updatedAt, 1000);
  assert.equal(payload.createdAt, 900);
  // The lecture association is optional and absent when there is none.
  assert.equal("resourceId" in payload, false);
  assert.equal("resourceName" in payload, false);
});

test("the optional resource association is recorded, trimmed, when one exists", () => {
  const payload = toFirestoreSketch(createSketchScene(), {
    uid: "u1",
    productId: "p1",
    moduleId: "m1",
    resourceId: "file-9",
    resourceName: "x".repeat(400),
  });
  assert.equal(payload.resourceId, "file-9");
  assert.equal(payload.resourceName.length, 200);
});

// ---------------------------------------------------------------------------
// Scope: one board per learner, per course, per module
// ---------------------------------------------------------------------------

test("the document id is derived from uid + course + module, so boards cannot collide", () => {
  const a = sketchDocId("u1", "p1", "mod-a");
  const b = sketchDocId("u1", "p1", "mod-b");
  const other = sketchDocId("u2", "p1", "mod-a");
  assert.equal(a, "u1__p1__mod-a");
  assert.notEqual(a, b, "two modules must not share a board");
  assert.notEqual(a, other, "two learners must not share a board");
  // The default key is implicit; a named board appends its slug.
  assert.equal(sketchDocId("u1", "p1", "mod-a", "main"), "u1__p1__mod-a");
  assert.equal(sketchDocId("u1", "p1", "mod-a", "Diagram 2"), "u1__p1__mod-a__diagram2");
  // The separator is `__`, which firestore.rules re-derives character for
  // character — a learner cannot hand-craft an id into another namespace.
  assert.equal(sketchDocId("u1", "p1", "m1"), "u1" + "__" + "p1" + "__" + "m1");
  // A board key can never smuggle a path segment into the id.
  assert.equal(sanitizeSketchKey("../../admin"), "admin");
  assert.equal(sanitizeSketchKey(""), SKETCH_DEFAULT_KEY);
  assert.equal(sanitizeSketchKey("A".repeat(80)).length, 40);
  assert.equal(SKETCH_COLLECTION, "sketches");
});

// ---------------------------------------------------------------------------
// Hostile / corrupt input
// ---------------------------------------------------------------------------

test("a corrupt payload opens as an empty board instead of throwing", () => {
  for (const bad of [undefined, null, "", "{nope", "[]", 42, true, { scene: "{nope" }, { elements: "no" }]) {
    const scene = parseSketchScene(bad);
    assert.equal(isSketchScene(scene), true, `parse failed for ${JSON.stringify(bad)}`);
    assert.equal(scene.elements.length, 0);
  }
  // The stored document shape is understood directly.
  const stored = { scene: JSON.stringify({ elements: [stroke("a")] }) };
  assert.equal(parseSketchScene(stored).elements.length, 1);
});

test("deleted elements and junk rows never reach storage", () => {
  const kept = sanitizeSketchElements([
    stroke("a"),
    { ...stroke("b"), isDeleted: true },
    null,
    "nope",
    [1, 2],
    stroke("c"),
  ]);
  assert.deepEqual(kept.map((element) => element.id), ["a", "c"]);
});

test("appState is whitelisted — ephemeral UI state is not persisted", () => {
  const saved = sanitizeSketchAppState({
    theme: "dark",
    viewBackgroundColor: "#121212",
    scrollX: -40,
    scrollY: 12.5,
    zoom: { value: 99 },
    currentItemStrokeColor: "#ff0000",
    // …and the things that must NOT survive a reload:
    collaborators: { a: 1 },
    selectedElementIds: { x: true },
    draggingElement: { id: "x" },
    editingTextElement: { id: "x" },
    cursorButton: "down",
    openMenu: "shape",
    isLoading: true,
  });
  assert.equal(saved.theme, "dark");
  assert.equal(saved.scrollX, -40);
  assert.equal(saved.scrollY, 12.5);
  assert.equal(saved.currentItemStrokeColor, "#ff0000");
  // Zoom is clamped into Excalidraw's own legal range.
  assert.deepEqual(saved.zoom, { value: 30 });
  assert.deepEqual(sanitizeSketchAppState({ zoom: { value: 0 } }).zoom, { value: 0.1 });
  for (const key of [
    "collaborators",
    "selectedElementIds",
    "draggingElement",
    "editingTextElement",
    "cursorButton",
    "openMenu",
    "isLoading",
  ]) {
    assert.equal(key in saved, false, `${key} must not be persisted`);
  }
  assert.deepEqual(sanitizeSketchAppState(null), {});
});

// ---------------------------------------------------------------------------
// Size: a runaway board must never start failing every write
// ---------------------------------------------------------------------------

test("images are kept smallest-first inside their budget, and the rest are reported", () => {
  const file = (chars) => ({ mimeType: "image/png", dataURL: "d".repeat(chars) });
  const { files, dropped } = sanitizeSketchFiles(
    { big: file(900), small: file(100), mid: file(300) },
    1000,
  );
  assert.deepEqual(Object.keys(files).sort(), ["mid", "small"]);
  assert.equal(dropped, 1);
  // Anything that is not a data URL is not a file.
  assert.deepEqual(sanitizeSketchFiles({ a: { mimeType: "image/png" } }).files, {});
  assert.equal(MAX_SKETCH_FILE_CHARS < MAX_SKETCH_SCENE_CHARS, true);
});

test("an oversized board drops its images before it ever drops the drawing", () => {
  const elements = Array.from({ length: 50 }, (_, index) => stroke(`e${index}`));
  const huge = {
    ...createSketchScene(),
    elements,
    files: { a: { mimeType: "image/png", dataURL: "d".repeat(MAX_SKETCH_SCENE_CHARS) } },
  };
  const json = serializeSketchScene(huge);
  assert.equal(json.length <= MAX_SKETCH_SCENE_CHARS, true);
  const back = JSON.parse(json);
  assert.deepEqual(back.files, {}, "the picture goes first");
  assert.equal(back.elements.length, 50, "the drawing survives");
});

test("an impossibly large drawing is trimmed to fit rather than refused", () => {
  // One element padded out past the ceiling on its own.
  const fat = Array.from({ length: 40 }, (_, index) => ({
    ...stroke(`e${index}`),
    pad: "x".repeat(30000),
  }));
  const json = serializeSketchScene({ ...createSketchScene(), elements: fat });
  assert.equal(json.length <= MAX_SKETCH_SCENE_CHARS, true);
  const back = JSON.parse(json);
  assert.equal(back.elements.length > 0, true);
  assert.equal(back.elements.length < 40, true);
});

test("the element cap matches the number the security rules enforce", () => {
  const many = Array.from({ length: MAX_SKETCH_ELEMENTS + 50 }, (_, index) => stroke(`e${index}`));
  assert.equal(sanitizeSketchElements(many).length, MAX_SKETCH_ELEMENTS);
  const payload = toFirestoreSketch({ ...createSketchScene(), elements: many }, {
    uid: "u1",
    productId: "p1",
    moduleId: "m1",
  });
  assert.equal(payload.elementCount, MAX_SKETCH_ELEMENTS);
  assert.equal(payload.elementCount <= 1500, true, "firestore.rules caps elementCount at 1500");
  assert.equal(payload.scene.length <= 900000, true, "firestore.rules caps scene at 900000 chars");
});

// ---------------------------------------------------------------------------
// The change signature — what stops a write-per-pointer-event
// ---------------------------------------------------------------------------

test("the signature ignores noise and changes for a real edit", () => {
  const base = [stroke("a", 1), stroke("b", 1)];
  // Excalidraw fires onChange for hovers, selections and menu opens: the same
  // elements, with the same versions, must produce the same signature.
  assert.equal(sketchSceneSignature(base), sketchSceneSignature([stroke("a", 1), stroke("b", 1)]));
  // A new stroke changes it…
  assert.notEqual(sketchSceneSignature(base), sketchSceneSignature([...base, stroke("c", 1)]));
  // …and so does editing one in place (Excalidraw bumps `version`).
  assert.notEqual(sketchSceneSignature(base), sketchSceneSignature([stroke("a", 2), stroke("b", 1)]));
  assert.equal(sketchSceneSignature(null), 0);
  assert.equal(sketchSceneSignature([null, "x"]), 2);
});

// ---------------------------------------------------------------------------
// Multiple boards per module (the Sketch tab's "+") — 2026-10-05
// ---------------------------------------------------------------------------

const boards = await import("../utils/sketchScene.js");

test("createSketchKey: unique, rule-safe, never `main`, never an existing key", () => {
  const taken = ["main"];
  for (let index = 0; index < 200; index += 1) {
    const key = boards.createSketchKey(taken);
    assert.match(key, /^[a-z0-9-]{1,40}$/, "matches the firestore.rules sketchKey pattern");
    assert.notEqual(key, "main");
    assert.equal(taken.includes(key), false, "never collides with an existing board");
    assert.equal(boards.sanitizeSketchKey(key), key, "stable through sanitisation");
    taken.push(key);
  }
});

test("a non-default board gets its own document id — the first board's id is untouched", () => {
  assert.equal(boards.sketchDocId("u", "p", "m"), "u__p__m");
  assert.equal(boards.sketchDocId("u", "p", "m", "c-abc"), "u__p__m__c-abc");
});

test("nextSketchTitle numbers past the highest default name", () => {
  assert.equal(boards.nextSketchTitle([]), "Canvas 1");
  assert.equal(boards.nextSketchTitle(["Canvas 1"]), "Canvas 2");
  assert.equal(boards.nextSketchTitle(["Canvas 1", "Canvas 5"]), "Canvas 6");
  assert.equal(boards.nextSketchTitle(["Canvas 1", "Doubts", "Formulae"]), "Canvas 4");
});

test("the board title rides on the payload, bounded", () => {
  const payload = boards.toFirestoreSketch(boards.createSketchScene(), {
    uid: "u", productId: "p", moduleId: "m", sketchKey: "c-1", title: `  ${"x".repeat(200)}  `,
  });
  assert.equal(payload.title.length, boards.MAX_SKETCH_TITLE_CHARS);
  assert.equal(payload.sketchKey, "c-1");
  const untitled = boards.toFirestoreSketch(boards.createSketchScene(), { uid: "u", productId: "p", moduleId: "m" });
  assert.equal("title" in untitled, false, "no empty title field is written");
});

test("mergeSketchScenes keeps every element of both sides; the newer version of a shared id wins", () => {
  const el = (id, version) => ({ id, type: "rectangle", version, versionNonce: version });
  const cloud = { elements: [el("a", 1), el("b", 5)], appState: { theme: "dark" }, files: { f1: { dataURL: "data:1" } } };
  const live = { elements: [el("b", 3), el("c", 1)], appState: { theme: "light" }, files: { f2: { dataURL: "data:2" } } };
  const merged = boards.mergeSketchScenes(cloud, live);
  assert.deepEqual(merged.elements.map((e) => `${e.id}@${e.version}`), ["a@1", "b@5", "c@1"]);
  assert.equal(merged.appState.theme, "light", "what is on screen keeps its view state");
  assert.deepEqual(Object.keys(merged.files).sort(), ["f1", "f2"]);
  // Corrupt input on either side never throws.
  assert.deepEqual(boards.mergeSketchScenes("{nope", live).elements.map((e) => e.id), ["b", "c"]);
});
