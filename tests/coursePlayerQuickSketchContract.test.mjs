// tests/coursePlayerQuickSketchContract.test.mjs
//
// The Quick Sketch CONTRACT — the data layer and the design, pinned in text and
// in behaviour. The runtime half (drawing, undo, erase, save, reopen) lives in
// tests/coursePlayerQuickSketchRuntime.test.mjs; this file is the part a runtime
// test cannot see or cheaply reach:
//
//   1. `firestore.rules` actually covers `users/{uid}/quickSketches` — the
//      collection every save goes to. It did not, which is why nothing a
//      learner drew was ever stored (a collection with no `match` is denied),
//      and why the hook now writes where the rules (and the learner's own
//      namespace) say;
//   2. the pure model: the document a save writes, what survives a load, the
//      eraser's geometry, the style's ranges, the options text and the SVG;
//   3. the DESIGN is the perfect-freehand editor's own — the same option names
//      (Size, Thinning, Streamline, Smoothing, Easing, Taper/Cap/Easing at each
//      end, Fill, Stroke), the same three panel buttons, the same two bars,
//      and none of the old spread-out chrome (PNG, Print, swatch rows).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MAX_QUICK_SKETCH_BOARDS,
  MAX_QUICK_SKETCH_STROKES,
  QUICK_SKETCH_COLLECTION,
  canAddQuickSketchStroke,
  clearQuickSketchDraft,
  quickSketchDraftKey,
  readQuickSketchDraft,
  eraseRadiusFor,
  eraseStrokesAt,
  distanceToSegment,
  nextQuickSketchTitle,
  quickSketchDocId,
  quickSketchLocalKey,
  quickSketchStrokesFrom,
  sameQuickSketchStrokes,
  sanitizeQuickSketchKey,
  strokeHitByPoint,
  toFirestoreQuickSketch,
  writeQuickSketchDraft,
} from "../src/utils/quickSketch.ts";
import {
  DEFAULT_QUICK_SKETCH_STYLE,
  QUICK_SKETCH_EASING_NAMES,
  QUICK_SKETCH_EASINGS,
  QUICK_SKETCH_SLIDERS,
  QUICK_SKETCH_STROKE_ENDS,
  quickSketchStrokeOptions,
  quickSketchStyleFrom,
  quickSketchStyleText,
  resetQuickSketchStyleProp,
  sameQuickSketchStyle,
  taperFromSlider,
  taperShowsCap,
  taperShowsEasing,
  taperSliderValue,
} from "../src/utils/quickSketchStyle.ts";
import {
  QUICK_SKETCH_SVG_PADDING,
  quickSketchBounds,
  quickSketchStrokePath,
  quickSketchSvgDocument,
  strokeSimulatesPressure,
} from "../src/utils/quickSketchSvg.ts";

/* ── the device ───────────────────────────────────────────────────────────── */
// `localStorage` is a browser fact; node has none, so the draft (and everything
// else the canvas remembers on the device) is exercised against this.
const device = new Map();
globalThis.localStorage = {
  getItem: (key) => (device.has(key) ? device.get(key) : null),
  setItem: (key, value) => { device.set(key, String(value)); },
  removeItem: (key) => { device.delete(key); },
  clear: () => device.clear(),
};

const read = (path) => readFileSync(path, "utf8");

const rules = read("firestore.rules");
const hook = read("src/course/usePerfectFreehandSketch.ts");
const canvas = read("src/components/PerfectFreehandSketch.tsx");
const panel = read("src/components/quickSketch/QuickSketchPanel.tsx");
const controls = read("src/components/quickSketch/QuickSketchControls.tsx");
const chrome = read("src/components/quickSketch/quickSketch.css");
const sketchPanel = read("src/course/SketchPanel.tsx");

/* ── fixtures ─────────────────────────────────────────────────────────────── */

const stroke = (id, points) => ({ id, points });
const point = (x, y, pressure = 0.5) => ({ x, y, pressure });

const line = (offset = 0) =>
  stroke(`s${offset}`, [point(10 + offset, 10 + offset), point(40 + offset, 30 + offset), point(70 + offset, 15 + offset)]);

const board = (overrides = {}) => ({
  uid: "u1",
  productId: "p1",
  moduleId: "m1",
  sketchKey: "main",
  title: "Sketch 1",
  strokes: [line()],
  resourceId: null,
  resourceName: null,
  createdAt: 10,
  updatedAt: 20,
  ...overrides,
});

/* ── 1. the rules, and the path the saves take ────────────────────────────── */

test("firestore.rules owns users/{uid}/quickSketches — owner-only, id re-derived", () => {
  const block = rules.slice(rules.indexOf("match /quickSketches/{sketchId}"));
  assert.ok(block.length > 0, "the collection has a rules block at all");
  const body = block.slice(0, block.indexOf("\n      }\n"));

  assert.equal(QUICK_SKETCH_COLLECTION, "quickSketches");
  assert.match(body, /allow read: if isOwner\(uid\) \|\| isAdmin\(\);/);
  assert.match(body, /allow create, update: if isOwner\(uid\)/);
  assert.match(body, /allow delete: if isOwner\(uid\) \|\| isAdmin\(\);/);
  assert.match(body, /request\.resource\.data\.uid == uid/);
  // The id is re-derived from the payload: `main` keeps the three-part id and
  // every other canvas gets its own key — a learner cannot pick an id that
  // lands in another namespace.
  assert.match(body, /sketchKey == 'main'/);
  assert.match(
    body,
    /sketchId == uid \+ '__' \+ request\.resource\.data\.productId \+ '__' \+ request\.resource\.data\.moduleId/,
  );
  assert.match(body, /sketchKey\.matches\('\^\[A-Za-z0-9_-\]\+\$'\)/);
  // The ceilings mirror src/utils/quickSketch.ts.
  assert.match(body, /request\.resource\.data\.strokes\.size\(\) <= 600/);
  assert.match(body, /request\.resource\.data\.title\.size\(\) <= 120/);
  assert.match(body, /!request\.resource\.data\.keys\(\)\.hasAny\(\['role', 'status'/);
  assert.equal(MAX_QUICK_SKETCH_STROKES, 600);
});

test("the hook saves under the learner's own namespace, never a root collection", () => {
  assert.match(hook, /doc\(db, "users", uid!, QUICK_SKETCH_COLLECTION, quickSketchDocId\(uid!, product, module, sketchKey\)\)/);
  assert.match(hook, /doc\(db, "users", board\.uid, QUICK_SKETCH_COLLECTION, quickSketchDocId\(/);
  assert.match(hook, /collection\(db, "users", uid!, QUICK_SKETCH_COLLECTION\)/);
  assert.ok(
    !/collection\(db, QUICK_SKETCH_COLLECTION\)/.test(hook),
    "no root-level quickSketches collection can come back",
  );
});

test("updateStrokes puts the drawing in state — the fix for vanishing strokes", () => {
  const block = hook.slice(hook.indexOf("const updateStrokes = useCallback"));
  const body = block.slice(0, block.indexOf("// ── Canvases"));
  assert.match(body, /dispatch\(\{ type: "SET_STROKES", strokes: next \}\);/);
  assert.match(body, /strokesRef\.current = next;/);
  assert.match(body, /void saveToFirestore\(\)/);
  // The device mirror is its own step (one tail for both branches)…
  assert.match(body, /scheduleLocalMirror\(\)/);
  // …and drawing works before there is anywhere to save it: a signed-in
  // learner with no module open still gets the device draft, a signed-out one
  // only gets the canvas.
  assert.match(body, /if \(!uid\) return;/);
  assert.match(body, /if \(!scoped\) \{/);
  assert.match(hook, /writeQuickSketchDraft\(uid, productId, \{/);
});

/* ── 2. the document a save writes, and what survives a load ──────────────── */

test("the stored document is Firestore-safe, rounded, capped and null-free", () => {
  const payload = toFirestoreQuickSketch(
    board({
      strokes: [stroke("s1", [point(1.23456, 2.98765, 0.55678)]), stroke("s2", [{ x: 5, y: 6 }])],
      resourceId: "res-1",
      resourceName: "Lecture 1",
    }),
  );
  assert.deepEqual(Object.keys(payload).sort(), [
    "createdAt",
    "moduleId",
    "productId",
    "resourceId",
    "resourceName",
    "sketchKey",
    "strokes",
    "title",
    "uid",
    "updatedAt",
  ]);
  assert.deepEqual(payload.strokes[0].points, [point(1.23, 2.99, 0.56)], "coordinates round to 2 decimals");
  assert.deepEqual(payload.strokes[1].points, [point(5, 6, 0.5)], "a point without pressure is a mouse's 0.5");
  assert.equal(payload.resourceId, "res-1");
  assert.equal(payload.sketchKey, "main");

  // No key is ever undefined (Firestore refuses those) and no field escapes.
  const bare = toFirestoreQuickSketch(board({ resourceId: null, resourceName: null, title: "" }));
  assert.equal(bare.resourceId, null);
  assert.equal(bare.resourceName, null);
  assert.equal(bare.title, "Sketch", "an empty title still writes a valid document");
  for (const value of Object.values(bare)) assert.notEqual(value, undefined);

  // A hand-written document can never push the canvas past the rules' ceiling.
  const flood = toFirestoreQuickSketch(board({ strokes: Array.from({ length: MAX_QUICK_SKETCH_STROKES + 50 }, (_, i) => line(i)) }));
  assert.equal(flood.strokes.length, MAX_QUICK_SKETCH_STROKES);
});

test("a load tolerates what older builds (and hand-written data) left behind", () => {
  const stored = quickSketchStrokesFrom([
    { id: "old", points: [{ x: 1, y: 2, pressure: 0.4 }], color: "#f00", size: 8, isEraser: true },
    { id: "array", points: [[3, 4, 0.7], [5, 6]] },
    { id: "empty", points: [] },
    { id: "junk", points: [{ x: "nope" }, null] },
    null,
    { id: "no-points" },
  ]);
  assert.deepEqual(stored, [
    { id: "old", points: [point(1, 2, 0.4)] },
    { id: "array", points: [point(3, 4, 0.7), point(5, 6, 0.5)] },
  ]);
  assert.deepEqual(quickSketchStrokesFrom("not a list"), []);
  assert.equal(quickSketchStrokesFrom([{ points: [point(1, 1)] }])[0].id, "stroke-0", "a stroke without an id still loads");
});

test("identity helpers keep the two id shapes the rules expect", () => {
  assert.equal(quickSketchDocId("u1", "p1", "m1"), "u1__p1__m1");
  assert.equal(quickSketchDocId("u1", "p1", "m1", "main"), "u1__p1__m1");
  assert.equal(quickSketchDocId("u1", "p1", "m1", "sk_abc"), "u1__p1__m1__sk_abc");
  assert.equal(quickSketchLocalKey("u1", "p1", "m1"), "dc.quickSketch.v1.u1.p1.m1");
  assert.equal(quickSketchLocalKey("u1", "p1", "m1", "sk_abc"), "dc.quickSketch.v1.u1.p1.m1.sk_abc");
  assert.equal(sanitizeQuickSketchKey("sk a/../b"), "skab", "only the alphabet the rules allow survives");
  assert.match(sanitizeQuickSketchKey("///"), /^sk_/);
  assert.equal(nextQuickSketchTitle([{ title: "Sketch 1" }, { title: "Sketch 2" }]), "Sketch 3");
  assert.equal(MAX_QUICK_SKETCH_BOARDS, 12);
});

/* ── 3. the eraser, in geometry ───────────────────────────────────────────── */

test("the eraser removes the strokes it touches and leaves the others alone", () => {
  const strokes = [line(0), line(200), line(400)];
  assert.equal(distanceToSegment({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 0);
  assert.equal(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3);

  const onTheLine = { x: 40, y: 30 };
  assert.equal(strokeHitByPoint(strokes[0], onTheLine, 6), true);
  assert.equal(strokeHitByPoint(strokes[1], onTheLine, 6), false);
  assert.deepEqual(eraseStrokesAt(strokes, onTheLine, 6).map((item) => item.id), ["s200", "s400"]);
  // Untouched: the very same array comes back (so no save is scheduled).
  assert.equal(eraseStrokesAt(strokes, { x: 1000, y: 1000 }, 6), strokes);
  assert.equal(eraseRadiusFor(16), 10);
  assert.equal(eraseRadiusFor(2), 6);
});

/* ── 4b. the device draft: a drawing made before a lesson is open ────────── */
// The board's identity needs a module, so an unscoped canvas has no document
// to write and no key in the module index — it used to store NOTHING, which is
// the "I draw, I let go, it vanishes" half of the report. It now writes this
// draft, in a namespace of its own, and the first EMPTY board adopts it.

test("the draft lives in its own namespace: one key per learner per course", () => {
  const key = quickSketchDraftKey("u1", "p1");
  assert.equal(key, "dc.quickSketchDraft.v1.u1.p1");
  assert.notEqual(key, quickSketchLocalKey("u1", "p1", "m1"), "never mistakable for a board's copy");
  assert.notEqual(key, quickSketchDraftKey("u1", "p2"), "another course is another draft");
  assert.notEqual(key, quickSketchDraftKey("u2", "p1"), "another learner is another draft");
  assert.equal(quickSketchDraftKey("u1", null), "dc.quickSketchDraft.v1.u1.-");
  assert.match(key, /^dc\.quickSketchDraft\./);
});

test("a draft round-trips through the device — and junk in it is dropped, never drawn", () => {
  device.clear();
  assert.equal(readQuickSketchDraft("u1", "p1"), null, "no draft, no drawing");

  assert.equal(
    writeQuickSketchDraft("u1", "p1", { title: "Before the lesson", strokes: [line(), { id: "junk", points: [{ x: "no" }] }] }),
    true,
  );
  const draft = readQuickSketchDraft("u1", "p1");
  assert.equal(draft.title, "Before the lesson");
  assert.equal(draft.strokes.length, 1, "the junk stroke is not a stroke");
  assert.equal(draft.strokes[0].id, "s0");
  assert.ok(draft.updatedAt > 0);
  assert.equal(readQuickSketchDraft("u1", "p2"), null, "and it is this course's draft only");

  // An over-long draft is capped here, so adopting it can never write a
  // document the rules would refuse.
  writeQuickSketchDraft("u1", "p1", { title: "t", strokes: Array.from({ length: MAX_QUICK_SKETCH_STROKES + 5 }, (_, index) => line(index)) });
  assert.equal(readQuickSketchDraft("u1", "p1").strokes.length, MAX_QUICK_SKETCH_STROKES);

  // A draft with nothing drawable in it is no draft at all.
  device.set(quickSketchDraftKey("u1", "p1"), "{ not json");
  assert.equal(readQuickSketchDraft("u1", "p1"), null, "a corrupt draft opens as an empty canvas");
});

test("the draft is handed over exactly once", () => {
  device.clear();
  writeQuickSketchDraft("u1", "p1", { title: "Sketch 1", strokes: [line()] });
  assert.equal(readQuickSketchDraft("u1", "p1").strokes.length, 1);
  clearQuickSketchDraft("u1", "p1");
  assert.equal(readQuickSketchDraft("u1", "p1"), null);
  // The hook adopts, writes the board's own device copy, THEN clears —
  // the order that means a crash during adoption cannot lose the strokes.
  const adopt = hook.slice(hook.indexOf("const adoptDraft = useCallback"));
  const body = adopt.slice(0, adopt.indexOf("const openBoard"));
  assert.match(body, /localStorage\.setItem\(where\.localKey/);
  assert.match(body, /clearQuickSketchDraft\(uid, where\.product\)/);
  assert.ok(
    body.indexOf("localStorage.setItem") < body.indexOf("clearQuickSketchDraft"),
    "the board's copy lands before the draft is dropped",
  );
});

/* ── 4. the style: the editor's options, exactly ──────────────────────────── */

test("the style is the editor's own option set, with its defaults and ranges", () => {
  assert.deepEqual(DEFAULT_QUICK_SKETCH_STYLE, {
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
  });
  assert.deepEqual(
    QUICK_SKETCH_SLIDERS.map((slider) => slider.key),
    ["size", "thinning", "streamline", "smoothing"],
  );
  assert.equal(QUICK_SKETCH_EASING_NAMES.length, 19);
  assert.equal(QUICK_SKETCH_EASINGS.easeOutQuad(0.5), 0.75);
  assert.equal(QUICK_SKETCH_EASINGS.easeInOutExpo(0.5), 0.5);
  assert.deepEqual(
    QUICK_SKETCH_STROKE_ENDS.map((end) => [end.taper, end.cap, end.easing]),
    [
      ["taperStart", "capStart", "easingStart"],
      ["taperEnd", "capEnd", "easingEnd"],
    ],
  );
});

test("a taper's slider, its boolean end and its two follow-up controls", () => {
  assert.equal(taperSliderValue(true), 100);
  assert.equal(taperSliderValue(false), 0);
  assert.equal(taperSliderValue(65), 65);
  assert.equal(taperFromSlider(100), true);
  assert.equal(taperFromSlider(0), 0);
  assert.equal(taperFromSlider(65), 65);
  assert.equal(taperShowsCap(0), true);
  assert.equal(taperShowsCap(false), true);
  assert.equal(taperShowsCap(65), false);
  assert.equal(taperShowsCap(true), false);
  assert.equal(taperShowsEasing(0), false);
  assert.equal(taperShowsEasing(true), true);
  assert.equal(taperShowsEasing(65), true);
});

test("getStroke receives the panel's numbers, and only they", () => {
  const options = quickSketchStrokeOptions(DEFAULT_QUICK_SKETCH_STYLE, { last: true, simulatePressure: true });
  assert.equal(options.size, 16);
  assert.equal(options.thinning, 0.5);
  assert.equal(options.streamline, 0.5);
  assert.equal(options.smoothing, 0.5);
  assert.equal(options.simulatePressure, true);
  assert.equal(options.last, true);
  assert.deepEqual(options.start, { taper: 0, cap: true, easing: QUICK_SKETCH_EASINGS.linear });
  assert.deepEqual(options.end, { taper: 0, cap: true, easing: QUICK_SKETCH_EASINGS.linear });
  assert.equal(options.easing, QUICK_SKETCH_EASINGS.linear);

  const beveled = quickSketchStrokeOptions(
    { ...DEFAULT_QUICK_SKETCH_STYLE, taperStart: true, taperEnd: 30, easingEnd: "easeOutExpo" },
    { last: false, simulatePressure: false },
  );
  assert.equal(beveled.start.taper, true);
  assert.equal(beveled.end.taper, 30);
  assert.equal(beveled.end.easing, QUICK_SKETCH_EASINGS.easeOutExpo);
  assert.equal(beveled.last, false);
});

test("a stored style is clamped, never trusted", () => {
  const style = quickSketchStyleFrom({
    size: 5000,
    thinning: -9,
    streamline: 0,
    smoothing: "wide",
    easing: "not-a-real-easing",
    taperStart: "start",
    taperEnd: true,
    capStart: "yes",
    isFilled: "no",
    fill: "red",
    stroke: "#ff5722",
    strokeWidth: -3,
  });
  assert.equal(style.size, 100);
  assert.equal(style.thinning, -0.99);
  assert.equal(style.streamline, 0.01);
  assert.equal(style.smoothing, DEFAULT_QUICK_SKETCH_STYLE.smoothing);
  assert.equal(style.easing, "linear");
  assert.equal(style.taperStart, 0);
  assert.equal(style.taperEnd, true);
  assert.equal(style.capStart, true);
  assert.equal(style.isFilled, true);
  assert.equal(style.fill, "#000000");
  assert.equal(style.stroke, "#ff5722");
  assert.equal(style.strokeWidth, 0);
  assert.deepEqual(quickSketchStyleFrom(null), DEFAULT_QUICK_SKETCH_STYLE);
  assert.equal(sameQuickSketchStyle(DEFAULT_QUICK_SKETCH_STYLE, quickSketchStyleFrom(DEFAULT_QUICK_SKETCH_STYLE)), true);
  assert.equal(sameQuickSketchStyle(DEFAULT_QUICK_SKETCH_STYLE, style), false);
  assert.equal(resetQuickSketchStyleProp({ ...DEFAULT_QUICK_SKETCH_STYLE, size: 40 }, "size").size, 16);
});

test("Copy Options prints the editor's own options object", () => {
  const text = quickSketchStyleText({ ...DEFAULT_QUICK_SKETCH_STYLE, size: 24, thinning: 0.75, taperStart: 50, taperEnd: true });
  assert.match(text, /^\{\n {2}size: 24,\n {2}thinning: 0\.75,/);
  assert.match(text, / {2}easing: \(t\) => t,/);
  assert.match(text, / {2}start: \{\n {4}taper: 50,\n {4}cap: true,\n {4}easing: \(t\) => t,\n {2}\},/);
  assert.match(text, / {2}end: \{\n {4}taper: true,\n {4}cap: true,\n {4}easing: \(t\) => t,\n {2}\},/);
});

/* ── 5. rendering and export ─────────────────────────────────────────────── */

test("a stroke becomes a closed filled path, and the live one is left unfinished", () => {
  const finished = quickSketchStrokePath(line(), DEFAULT_QUICK_SKETCH_STYLE, { last: true });
  const live = quickSketchStrokePath(line(), DEFAULT_QUICK_SKETCH_STYLE, { last: false });
  assert.match(finished, /^M /);
  assert.match(finished, /Z$/);
  assert.notEqual(finished, live, "letting go settles the ink");
  assert.equal(quickSketchStrokePath(stroke("empty", []), DEFAULT_QUICK_SKETCH_STYLE, { last: true }), "");

  // A mouse's flat 0.5 is simulated pressure; a pen's real value is not.
  assert.equal(strokeSimulatesPressure(line()), true);
  assert.equal(strokeSimulatesPressure(stroke("pen", [point(1, 1, 0.31), point(2, 2, 0.62), point(3, 3, 0.44)])), false);
});

test("Copy to SVG is a standalone document around the drawing, with padding", () => {
  const svg = quickSketchSvgDocument([line(0), line(300)], DEFAULT_QUICK_SKETCH_STYLE);
  const bounds = quickSketchBounds([line(0), line(300)]);
  assert.equal(bounds.minX, 10);
  assert.equal(bounds.maxX, 370);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="/);
  assert.match(
    svg,
    new RegExp(`viewBox="${bounds.minX - QUICK_SKETCH_SVG_PADDING} ${bounds.minY - QUICK_SKETCH_SVG_PADDING}`),
  );
  assert.equal((svg.match(/<path /g) || []).length, 2, "one path per stroke (fill, no outline)");
  assert.match(svg, /fill="#000000"/);
  assert.match(svg, /<\/svg>$/);

  // With an outline, each stroke is two paths — the editor's own pair.
  const outlined = quickSketchSvgDocument([line(0)], { ...DEFAULT_QUICK_SKETCH_STYLE, strokeWidth: 3, stroke: "#e91e63", isFilled: false });
  assert.equal((outlined.match(/<path /g) || []).length, 2);
  assert.match(outlined, /stroke="#e91e63" stroke-width="3"/);
  // The outline is the FIRST path's job; the fill path goes fully transparent
  // once there is a stroke — the editor's own pair.
  assert.match(outlined, /fill="transparent" stroke="transparent" stroke-width="0"/);
  assert.equal(quickSketchBounds([]).width, 0);
  // An empty canvas still exports a valid document (the padding is the box).
  const empty = quickSketchSvgDocument([], DEFAULT_QUICK_SKETCH_STYLE);
  assert.match(empty, /viewBox="-40 -40 80 80"/);
  assert.deepEqual(quickSketchBounds([]), { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 });
});

/* ── 6. the design is the editor's ───────────────────────────────────────── */

test("the panel is built from the editor's rows, in the editor's order", () => {
  assert.match(panel, /QUICK_SKETCH_SLIDERS\.find\(\(slider\) => slider\.key === key\)/);
  assert.match(panel, /\(\["size", "thinning", "streamline", "smoothing"\] as const\)\.map\(numericSlider\)/);
  assert.match(panel, /name="Easing"[\s\S]{0,80}options=\{QUICK_SKETCH_EASING_NAMES\}/);
  assert.match(panel, /QUICK_SKETCH_STROKE_ENDS\.map\(\(end\)/);
  assert.match(panel, /name="Fill"[\s\S]{0,60}attr="isFilled"/);
  assert.match(panel, /name="Stroke"[\s\S]{0,60}attr="strokeWidth"/);
  assert.match(panel, /taperShowsCap\(taper\)/);
  assert.match(panel, /taperShowsEasing\(taper\)/);
  // The three buttons the editor's panel ends on.
  for (const label of ["Reset Options", "Copy Options", "Copy to SVG"]) {
    assert.ok(panel.includes(label), `the panel offers "${label}"`);
  }
  // Double-clicking a label resets that one option (the editor's own trick).
  assert.match(controls, /onDoubleClick=\{onReset\}/);
  assert.match(controls, /data-quick-sketch-slider=\{attr\}/);
  assert.match(controls, /data-quick-sketch-value=\{attr\}/);
  assert.match(controls, /data-quick-sketch-checkbox=\{attr\}/);
  assert.match(controls, /data-quick-sketch-colors=\{attr\}/);
});

test("the canvas chrome is the editor's: hamburger, Draw, Undo · Redo · Clear", () => {
  assert.match(canvas, /<Menu size=\{20\} aria-hidden \/>/);
  assert.match(canvas, /dc-qsk-corner--top-left/);
  assert.match(canvas, /data-quick-sketch-tool-button="draw"[\s\S]{0,300}>\s*Draw\s*</);
  assert.match(canvas, /data-quick-sketch-tool-button="erase"[\s\S]{0,300}>\s*Erase\s*</);
  assert.match(canvas, /data-quick-sketch-undo=""/);
  assert.match(canvas, /data-quick-sketch-redo=""/);
  assert.match(canvas, /data-quick-sketch-clear=""/);
  assert.match(canvas, /data-active=\{tool === "draw" \? "true" : "false"\}/);
  // The old spread-out chrome is gone for good.
  assert.ok(!canvas.includes("Download"), "no PNG download button");
  assert.ok(!canvas.includes("Printer"), "no print button");
  assert.ok(!canvas.includes("SIZES"), "no size-swatch row");
  assert.ok(!canvas.includes("COLOURS = ["), "no colour-swatch row outside the panel");
  // jsx/css: the ported design keeps the editor's own values.
  assert.match(chrome, /background-color: rgba\(255, 255, 255, 0\.95\);/);
  assert.match(chrome, /grid-template-columns: 96px 1fr auto;/);
  assert.match(chrome, /grid-auto-rows: 32px;/);
  assert.match(chrome, /border-bottom-right-radius: 16px;/);
  assert.match(chrome, /dodgerblue/);
  assert.match(chrome, /width: min\(100%, 320px\);/);
});

test("the Sketch tab hosts Quick Sketch, and keeps Excalidraw's chrome out of it", () => {
  assert.match(sketchPanel, /import PerfectFreehandSketch from "\.\.\/components\/PerfectFreehandSketch";/);
  assert.match(sketchPanel, /const quickMode = mode === "quick-sketch";/);
  assert.match(sketchPanel, /\) : quickMode \? \(/);
  // One toggle, both bars — and no narrowing ambiguity around it.
  assert.match(sketchPanel, /data-course-sketch-mode=\{mode\}/);
  assert.match(sketchPanel, /onClick=\{\(\) => setMode\(quickMode \? "editor" : "quick-sketch"\)\}/);
  // In Quick Sketch the Excalidraw-only chrome (its own canvas list, the
  // library pill, the canvas-colour cluster) steps aside: the canvas carries
  // its own switcher and its own save state.
  assert.match(sketchPanel, /data-course-sketch-quick-bar/);
  // …and the way back is never hidden, not even in Clean Look (that sidebar is
  // Excalidraw's, and Excalidraw is not mounted in Quick Sketch).
  assert.match(sketchPanel, /\{cleanLook && !quickMode \? null : quickMode \? \(/);
  assert.match(sketchPanel, /leading=\{scoped \? \(/);
  assert.match(sketchPanel, /\{quickMode \? null : \(/);
  assert.equal(
    (sketchPanel.match(/mode === "quick-sketch"/g) || []).length,
    1,
    "the only comparison left is the one that MAKES the boolean, outside the narrowed branch",
  );
});

test("the drawing saves itself: debounce, device mirror, retry, and the flush on the way out", () => {
  assert.match(hook, /debounceTimerRef\.current = window\.setTimeout\(\(\) => \{/);
  assert.match(hook, /localMirrorTimerRef\.current = window\.setTimeout\(\(\) => \{/);
  assert.match(hook, /const flushRef = useRef\(flush\);/);
  assert.match(hook, /flushRef\.current\(\);/);
  assert.match(canvas, /data-quick-sketch-status=\{statusState\}/);
  assert.match(canvas, /data-quick-sketch-retry=""/);
  assert.match(canvas, /data-quick-sketch-new-canvas=""/);
  assert.match(hook, /export type QuickSketchSaveStatus = "idle" \| "loading" \| "ready" \| "pending" \| "saving" \| "saved" \| "error";/);
});

test("the model's own guards are the ones the canvas uses", () => {
  assert.equal(canAddQuickSketchStroke(Array.from({ length: MAX_QUICK_SKETCH_STROKES - 1 }, () => line())), true);
  assert.equal(canAddQuickSketchStroke(Array.from({ length: MAX_QUICK_SKETCH_STROKES }, () => line())), false);
  assert.equal(sameQuickSketchStrokes([line()], [line()]), true);
  assert.equal(sameQuickSketchStrokes([line()], [line(), line(200)]), false);
  assert.equal(sameQuickSketchStrokes([line()], [line(1)]), false);
  assert.match(canvas, /canAddQuickSketchStroke\(strokesRef\.current\)/);
  assert.match(canvas, /MAX_QUICK_SKETCH_STROKES\} strokes\) — clear it or open a new canvas/);
});
