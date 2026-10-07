// tests/coursePlayerQuickSketchRuntime.test.mjs
//
// Runtime proof for the Course Player's QUICK SKETCH canvas — the
// perfect-freehand board in the Sketch tab — after the owner's 2026-10-07
// report:
//
//   "sketch mein kuchh bhi jaise bhi main draw karta hun aur release karta hun
//    turant vah gayab ho jaate, kuchh bhi save nahin hota … sketch ka jo bahut
//    sara button hai vah sab kuchh faila hua hai, actually mein jo exact design
//    hai wahi tumhen implement karna hai"
//
// So this file drives the REAL component (and behind it the real
// `usePerfectFreehandSketch` hook and the real `getStroke` pipeline) in real
// React 19 inside jsdom, and asserts exactly those two things:
//
//   1. a stroke is on the canvas the moment the finger lifts — and stays;
//      it reaches `users/{uid}/quickSketches/{uid}__{product}__{module}`, is
//      there when the canvas reopens, and undo / redo / clear / the eraser all
//      move both the screen and the stored document;
//   2. the chrome is the perfect-freehand editor's own design: the options
//      panel (Size, Thinning, Streamline, Smoothing, Easing, Taper/Cap/Easing
//      at each end, Fill, Stroke), Reset Options / Copy Options / Copy to SVG,
//      "Draw" bottom-left and Undo · Redo · Clear bottom-right.
//
// Only Firebase I/O is replaced (an in-memory store + the app's singletons);
// jsdom's missing pointer plumbing is supplied by the test. The code under
// test — the drawing, the history, the panel, the persistence — is not stubbed
// anywhere.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vite/package.json"));
const { build } = viteRequire("esbuild");

const ROOT = process.cwd();
const DIR = path.join(ROOT, "node_modules", ".tmp-course-quick-sketch-runtime");
fs.mkdirSync(DIR, { recursive: true });

/* ── stub: an in-memory Firestore ─────────────────────────────────────────── */

const FIRESTORE_STUB = path.join(DIR, "firestoreStub.mjs");
fs.writeFileSync(
  FIRESTORE_STUB,
  `
export const store = new Map();   // "users/u1/quickSketches/<id>" -> document data
export const writes = [];         // every set() that reached the "server"
export const reads = [];          // every getDoc() path
export const state = { failWrites: null, failReads: null };

const asPath = (ref) => (typeof ref === "string" ? ref : String((ref && ref.path) || ""));
const fail = (spec) => {
  const error = new Error(spec.message || "stub failure");
  error.code = spec.code;
  return error;
};

export function collection(_db, ...segments) { return { type: "collection", path: segments.join("/") }; }
export function doc(_db, ...segments) { return { type: "doc", path: segments.join("/") }; }

export async function getDoc(ref) {
  const key = asPath(ref);
  reads.push(key);
  if (state.failReads) throw fail(state.failReads);
  const data = store.get(key);
  return { exists: () => Boolean(data), data: () => data };
}

export async function setDoc(ref, data) {
  const key = asPath(ref);
  if (state.failWrites) throw fail(state.failWrites);
  store.set(key, JSON.parse(JSON.stringify(data)));
  writes.push({ path: key, data });
}

export async function deleteDoc(ref) {
  store.delete(asPath(ref));
}

export const queries = [];
export function where(field, op, value) { return { field, op, value }; }
export function query(ref, ...filters) { return { type: "query", path: ref.path, filters }; }

export async function getDocs(q) {
  queries.push(q);
  if (state.failReads) throw fail(state.failReads);
  const prefix = q.path + "/";
  const rows = [];
  for (const [key, data] of store.entries()) {
    if (!key.startsWith(prefix) || key.slice(prefix.length).includes("/")) continue;
    if (!q.filters.every((f) => f.op === "==" && data[f.field] === f.value)) continue;
    rows.push({ id: key.slice(prefix.length), data: () => data });
  }
  return { forEach: (fn) => rows.forEach(fn), docs: rows, size: rows.length };
}

export const reset = () => {
  store.clear();
  writes.length = 0;
  reads.length = 0;
  queries.length = 0;
  state.failWrites = null;
  state.failReads = null;
};
export const paths = () => Array.from(store.keys());
export const docAt = (uid, productId, moduleId, sketchKey = "main") => {
  const base = "users/" + uid + "/quickSketches/" + uid + "__" + productId + "__" + moduleId;
  return store.get(sketchKey === "main" ? base : base + "__" + sketchKey);
};
`,
);

/* ── stub: the app's firebase singleton ───────────────────────────────────── */

const APP_STUB = path.join(DIR, "appStub.mjs");
fs.writeFileSync(APP_STUB, `export const db = { __stubDb: true };\nexport const auth = { currentUser: null };\n`);

/* ── DOM + globals (before the bundle is imported) ────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="host"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
const define = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
define("localStorage", window.localStorage);
define("sessionStorage", window.sessionStorage);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of [
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
]) {
  define(key, window[key]);
}

/** The clipboard the "Copy" buttons write into. */
const clipboard = [];
Object.defineProperty(window.navigator, "clipboard", {
  value: { writeText: async (value) => { clipboard.push(String(value)); } },
  configurable: true,
});

/* ── fixture: the real canvas, mounted ────────────────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import PerfectFreehandSketch from "./src/components/PerfectFreehandSketch";

export { act };
export const latest: { strokes: unknown[]; renders: number } = { strokes: [], renders: 0 };

export function mount(target: HTMLElement, props: Record<string, unknown>) {
  const root = createRoot(target);
  act(() => { root.render(<PerfectFreehandSketch {...props} />); });
  return { unmount() { act(() => { root.unmount(); }); } };
}
`;

await build({
  stdin: { contents: FIXTURE, resolveDir: ROOT, loader: "tsx" },
  outfile: path.join(DIR, "fixture.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  target: "node20",
  logLevel: "silent",
  loader: { ".css": "empty" },
  plugins: [
    {
      name: "quick-sketch-io-boundaries",
      setup(b) {
        b.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: FIRESTORE_STUB, external: true }));
        b.onResolve({ filter: /(?:^|\/)firebase$/ }, () => ({ path: APP_STUB, external: true }));
      },
    },
  ],
});

const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")).href);
const fsx = await import(pathToFileURL(FIRESTORE_STUB).href);
const { act } = fixture;

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
  fs.rmSync(DIR, { recursive: true, force: true });
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

const UID = "u1";
const PRODUCT = "p1";
const MODULE = "mod-a";
const DEBOUNCE = 30;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `el("data-quick-sketch-canvas")` — a bare attribute name, brackets added here. */
const selector = (attr) => (attr.startsWith("[") || attr.startsWith(".") ? attr : `[${attr}]`);
const el = (attr, root = window.document) => root.querySelector(selector(attr));
const all = (attr, root = window.document) => Array.from(root.querySelectorAll(selector(attr)));

/** Fresh world: empty cloud, empty device, a new host; keeps the last mount. */
let mounted = null;
function freshWorld({ uid = UID } = {}) {
  // Unmount FIRST: leaving the previous canvas flushes its last edits, and the
  // reset below is what makes the new world's cloud empty.
  mounted?.unmount?.();
  mounted = null;
  fsx.reset();
  window.localStorage.clear();
  clipboard.length = 0;
  const target = window.document.createElement("div");
  target.id = "host";
  window.document.body.replaceChildren(target);
  mounted = fixture.mount(target, {
    uid,
    productId: PRODUCT,
    moduleId: MODULE,
    debounceMs: DEBOUNCE,
  });
  return target;
}

/** Type into a React-controlled input the way a keyboard would. */
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

async function settle(ms = 40) {
  await act(async () => {
    await sleep(ms);
  });
}

/** One pointer event, exactly the shape the browser sends. */
function pointer(target, type, x, y, extras = {}) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    ...extras,
  });
  act(() => {
    target.dispatchEvent(event);
  });
}

const canvas = () => el("data-quick-sketch-canvas");
const strokeCount = () => all("[data-quick-sketch-stroke]").length;

/** Draw one line, point by point, and let go. */
async function drawLine(points) {
  const svg = canvas();
  pointer(svg, "pointerdown", points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) pointer(svg, "pointermove", x, y);
  pointer(svg, "pointerup", points[points.length - 1][0], points[points.length - 1][1]);
  await settle();
}

const line = (offset = 0) => [
  [10 + offset, 10 + offset],
  [40 + offset, 30 + offset],
  [70 + offset, 15 + offset],
  [95 + offset, 55 + offset],
];

// ---------------------------------------------------------------------------

test("a stroke stays on the canvas after the finger lifts, and reaches the cloud", async () => {
  freshWorld();
  await settle();

  assert.equal(strokeCount(), 0, "the canvas opens empty");
  await drawLine(line());

  // THE report: this used to be 0 — the stroke vanished the moment it was let go.
  assert.equal(strokeCount(), 1, "the stroke is still on the canvas after pointerup");
  const path = el("data-quick-sketch-stroke").querySelector("[data-quick-sketch-path]");
  assert.match(path.getAttribute("d"), /^M/, "the stroke is drawn as a real SVG path");

  await settle(DEBOUNCE + 120);
  const doc = fsx.docAt(UID, PRODUCT, MODULE);
  assert.ok(doc, "the drawing reached users/{uid}/quickSketches/{uid}__{product}__{module}");
  assert.equal(doc.uid, UID);
  assert.equal(doc.productId, PRODUCT);
  assert.equal(doc.moduleId, MODULE);
  assert.equal(doc.sketchKey, "main");
  assert.equal(doc.strokes.length, 1, "the stroke is in the stored document");
  assert.equal(doc.strokes[0].points.length, line().length, "every sampled point is stored");
  assert.deepEqual(
    Object.keys(doc.strokes[0]).sort(),
    ["id", "points"],
    "a stroke is geometry only — the style belongs to the drawing",
  );
  // The panel says so, out loud.
  await settle(DEBOUNCE);
  assert.equal(el("data-quick-sketch-status").getAttribute("data-quick-sketch-status"), "saved");
});

test("reopening the canvas shows the drawing again (cloud first, device as mirror)", async () => {
  freshWorld();
  await settle();
  await drawLine(line());
  await settle(DEBOUNCE + 120);
  assert.equal(fsx.docAt(UID, PRODUCT, MODULE).strokes.length, 1);
  mounted.unmount();
  mounted = null;

  const target = window.document.createElement("div");
  window.document.body.replaceChildren(target);
  mounted = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: MODULE, debounceMs: DEBOUNCE });
  await settle(80);
  assert.equal(strokeCount(), 1, "the saved stroke is back on the canvas");

  // And with the cloud refusing to answer, the device's own copy still opens.
  fsx.store.clear();
  mounted.unmount();
  mounted = null;
  const offline = window.document.createElement("div");
  window.document.body.replaceChildren(offline);
  mounted = fixture.mount(offline, { uid: UID, productId: PRODUCT, moduleId: MODULE, debounceMs: DEBOUNCE });
  await settle(80);
  assert.equal(strokeCount(), 1, "the device mirror never strands a drawing");
});

test("undo, redo and clear move the screen and the document together", async () => {
  freshWorld();
  await settle();
  await drawLine(line());
  await drawLine(line(120));
  await settle(DEBOUNCE + 120);
  assert.equal(strokeCount(), 2);

  el("data-quick-sketch-undo").click();
  await settle();
  assert.equal(strokeCount(), 1, "undo removes the last stroke from the canvas");
  await settle(DEBOUNCE + 120);
  assert.equal(fsx.docAt(UID, PRODUCT, MODULE).strokes.length, 1, "…and from the document");

  el("data-quick-sketch-redo").click();
  await settle();
  assert.equal(strokeCount(), 2, "redo puts it back");
  await settle(DEBOUNCE + 120);
  assert.equal(fsx.docAt(UID, PRODUCT, MODULE).strokes.length, 2, "…and the document agrees");

  el("data-quick-sketch-clear").click();
  await settle();
  assert.equal(strokeCount(), 0, "clear empties the canvas");
  await settle(DEBOUNCE + 120);
  assert.equal(fsx.docAt(UID, PRODUCT, MODULE).strokes.length, 0, "…and the document");

  el("data-quick-sketch-undo").click();
  await settle();
  assert.equal(strokeCount(), 2, "clearing is undoable — a learner cannot lose a drawing to a stray tap");
});

test("the eraser rubs whole strokes out, including a single tap's dot", async () => {
  freshWorld();
  await settle();

  // A tap leaves a dot (perfect-freehand turns one point into a real blob).
  const svg = canvas();
  pointer(svg, "pointerdown", 60, 60);
  pointer(svg, "pointerup", 60, 60);
  await settle();
  assert.equal(strokeCount(), 1, "a tap leaves a mark");

  el("data-quick-sketch-tool-button=erase").click();
  await settle();
  assert.equal(el("data-quick-sketch").getAttribute("data-quick-sketch-tool"), "erase");

  const erasing = canvas();
  pointer(erasing, "pointerdown", 60, 60);
  pointer(erasing, "pointermove", 61, 61);
  pointer(erasing, "pointerup", 61, 61);
  await settle();
  assert.equal(strokeCount(), 0, "the eraser removed the stroke it touched");

  el("data-quick-sketch-tool-button=draw").click();
  await settle();
  await drawLine(line());
  assert.equal(strokeCount(), 1, "and the pen still draws afterwards");
});

test("the panel is the perfect-freehand editor's own panel", async () => {
  freshWorld();
  await settle();

  const labels = all(".dc-qsk-label").map((node) => node.textContent);
  for (const label of [
    "Size",
    "Thinning",
    "Streamline",
    "Smoothing",
    "Easing",
    "Taper Start",
    "Taper End",
    "Fill",
    "Stroke",
  ]) {
    assert.ok(labels.includes(label), `the panel offers "${label}"`);
  }
  // Cap Start / Cap End are there while the taper is off — the editor's rule.
  assert.ok(labels.includes("Cap Start"), "Cap Start shows while there is no taper");
  assert.ok(labels.includes("Cap End"), "Cap End shows while there is no taper");

  assert.equal(el("data-quick-sketch-slider=size").getAttribute("min"), "1");
  assert.equal(el("data-quick-sketch-slider=size").getAttribute("max"), "100");
  assert.equal(el("data-quick-sketch-value=size").value, "16", "the editor's default size");
  assert.equal(el("data-quick-sketch-slider=thinning").getAttribute("min"), "-0.99");
  assert.equal(el("data-quick-sketch-select=easing").value, "linear");
  assert.equal(el("data-quick-sketch-checkbox=isFilled").checked, true);
  assert.equal(all("data-quick-sketch-colors").length, 1, "the fill colour row shows while Fill is on");

  // The three buttons the editor ends on, plus its two bars of actions.
  assert.ok(el("data-quick-sketch-reset-options"), "Reset Options");
  assert.ok(el("data-quick-sketch-copy-options"), "Copy Options");
  assert.ok(el("data-quick-sketch-copy-svg"), "Copy to SVG");
  assert.equal(el("data-quick-sketch-tool-button=draw").textContent, "Draw");
  assert.equal(el("data-quick-sketch-tool-button=draw").getAttribute("data-active"), "true");
  for (const attr of ["data-quick-sketch-undo", "data-quick-sketch-redo", "data-quick-sketch-clear"]) {
    assert.ok(el(attr), attr);
  }

  // The hamburger opens and closes the panel — the editor's own affordance.
  assert.equal(el("data-quick-sketch-panel").getAttribute("data-open"), "true");
  el("data-quick-sketch-menu").click();
  await settle();
  assert.equal(el("data-quick-sketch-panel").getAttribute("data-open"), "false");
  el("data-quick-sketch-menu").click();
  await settle();
  assert.equal(el("data-quick-sketch-panel").getAttribute("data-open"), "true");

  // The old spread-out chrome is gone: no PNG / Print buttons, no size or
  // colour swatch rows outside the panel, no board selector in the old style.
  assert.ok(!window.document.querySelector("[title='Download as PNG']"));
  assert.ok(!window.document.querySelector("[title='Print / PDF']"));
});

test("a style option restyles the whole drawing and is one undo step", async () => {
  freshWorld();
  await settle();
  await drawLine(line());
  await drawLine(line(120));
  const before = all("[data-quick-sketch-path]").map((node) => node.getAttribute("d"));

  // "Thinning" is a slider; its number field is the same option. One commit.
  const field = el("data-quick-sketch-value=thinning");
  typeInto(field, 0.9);
  act(() => {
    // React's onBlur is the native focusout; that is where this field commits.
    field.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
  });
  await settle();

  const after = all("[data-quick-sketch-path]").map((node) => node.getAttribute("d"));
  assert.notDeepEqual(after, before, "the ink changed");
  assert.equal(after.length, before.length, "both strokes were restyled — the style belongs to the drawing");

  el("data-quick-sketch-undo").click();
  await settle();
  assert.deepEqual(
    all("[data-quick-sketch-path]").map((node) => node.getAttribute("d")),
    before,
    "one undo restores the previous look",
  );
});

test("Copy Options copies the editor's own options object; Copy to SVG copies paths", async () => {
  freshWorld();
  await settle();
  await drawLine(line());

  el("data-quick-sketch-copy-options").click();
  await settle();
  const options = clipboard.at(-1);
  assert.match(options, /^\{\n {2}size: 16,/);
  assert.match(options, /thinning: 0\.5,/);
  assert.match(options, /easing: \(t\) => t,/);
  assert.match(options, /start: \{\n {4}taper: 0,\n {4}cap: true,/);
  assert.match(options, /end: \{\n {4}taper: 0,\n {4}cap: true,/);

  el("data-quick-sketch-copy-svg").click();
  await settle();
  const svg = clipboard.at(-1);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="/);
  assert.match(svg, /<path d="M/);
  assert.match(svg, /fill="#000000"/);
});

test("an unscoped board still draws — it just says the drawing has nowhere to go", async () => {
  freshWorld({ uid: null });
  await settle();
  await drawLine(line());
  assert.equal(strokeCount(), 1, "drawing works without a learner to save to");
  assert.ok(el("data-quick-sketch-unscoped"), "and the canvas says so");
  assert.equal(fsx.writes.length, 0, "nothing was written anywhere");
});

test("history belongs to one canvas: switching cannot undo across canvases", async () => {
  freshWorld();
  await settle();
  await drawLine(line());
  await settle(DEBOUNCE + 120);
  assert.equal(el("data-quick-sketch-undo").disabled, false, "the drawing can be undone");

  el("data-quick-sketch-new-canvas").click();
  await settle(60);
  assert.equal(el("data-quick-sketch-undo").disabled, true, "a fresh canvas starts with no history");
  assert.equal(el("data-quick-sketch-redo").disabled, true);
  await drawLine(line(40));
  await settle();
  el("data-quick-sketch-undo").click();
  await settle();
  assert.equal(strokeCount(), 0, "undo only ever touched this canvas");

  // Going back to the first canvas brings its own drawing — and its own (empty)
  // history, never the other canvas's steps.
  el("data-quick-sketch-canvases").click();
  await settle();
  const rows = all("[data-quick-sketch-canvas-menu] .dc-qsk-canvas-row button");
  act(() => {
    rows[0].click();
  });
  await settle(80);
  assert.equal(strokeCount(), 1, "the first canvas still holds its drawing");
  assert.equal(el("data-quick-sketch-undo").disabled, true, "…and its history was left behind");
});

test("the learner's style is remembered on this device", async () => {
  freshWorld();
  await settle();
  const field = el("data-quick-sketch-value=size");
  typeInto(field, 42);
  act(() => {
    field.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
  });
  await settle();

  const stored = JSON.parse(window.localStorage.getItem("dc.quickSketchStyle.v1." + UID));
  assert.equal(stored.size, 42, "the whole style is stored for this learner");
  assert.equal(stored.thinning, 0.5);

  // A brand-new mount opens with the learner's own numbers, not the defaults.
  mounted.unmount();
  mounted = null;
  const target = window.document.createElement("div");
  window.document.body.replaceChildren(target);
  mounted = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: MODULE, debounceMs: DEBOUNCE });
  await settle(60);
  assert.equal(el("data-quick-sketch-value=size").value, "42");
});

test("a second canvas is its own drawing, and the first one is still there", async () => {
  freshWorld();
  await settle();
  await drawLine(line());
  await settle(DEBOUNCE + 120);

  el("data-quick-sketch-new-canvas").click();
  await settle(60);
  assert.equal(strokeCount(), 0, "a new canvas opens empty");
  await drawLine(line(40));
  await settle(DEBOUNCE + 140);

  const boards = fsx.paths();
  assert.equal(boards.length, 2, "two canvases, two documents");
  assert.ok(boards.some((key) => key.endsWith("__" + MODULE)), "the first canvas keeps the legacy id");
  assert.ok(boards.some((key) => key.includes("__" + MODULE + "__")), "the second canvas gets its own key");

  el("data-quick-sketch-canvases").click();
  await settle();
  const rows = all("[data-quick-sketch-canvas-menu] .dc-qsk-canvas-row");
  assert.equal(rows.length, 2, "the chip lists both canvases");
});
