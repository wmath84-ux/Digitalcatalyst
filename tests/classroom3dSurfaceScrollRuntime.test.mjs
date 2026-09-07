// tests/classroom3dSurfaceScrollRuntime.test.mjs
//
// RUNTIME proof for the classroom's scroll engine (src/classroom3d/
// surfaceScroll.ts) — the source-shape contract lives in
// classroom3dSurfaceRenderingContract.test.mjs, but "does a finger actually
// move the board" deserves to be executed, not pattern-matched.
//
// The module is plain TypeScript with no JSX and no React, so it is
// transpiled with the TypeScript compiler already in devDependencies and run
// against a jsdom document. jsdom has no layout engine, so every scroll box
// in here is defined explicitly — which is fine: the engine only ever reads
// scrollHeight / clientHeight / computed overflow, all of which are stubbed
// exactly as a real scroller reports them.
//
// Covered:
//   1. a drag moves the nearest scroller 1:1 and stops at the ends
//   2. a tap is still a tap; a drag swallows its trailing click
//   3. gestures that belong to something else are left alone
//   4. press-and-hold accelerates, and cancelling stops it dead

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

/* ── build: TS → CJS, no bundler needed (the module has no imports) ──────── */

const source = fs.readFileSync(path.join(ROOT, "src/classroom3d/surfaceScroll.ts"), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const CACHE = path.join(ROOT, "node_modules", ".cache", "classroom-surface-scroll");
fs.mkdirSync(CACHE, { recursive: true });
const bundlePath = path.join(CACHE, "surfaceScroll.cjs");
fs.writeFileSync(bundlePath, js);

/* ── DOM ──────────────────────────────────────────────────────────────────── */

const dom = new JSDOM(
  `<!doctype html><html><body>
     <div id="panel">
       <div id="scroller" style="overflow-y:auto">
         <div id="row">lesson</div>
         <button id="pick">pick</button>
         <div id="own" data-no-surface-scroll><span id="handle">drag me</span></div>
         <textarea id="write"></textarea>
       </div>
     </div>
   </body></html>`,
  { pretendToBeVisual: true, url: "http://localhost/" },
);
const { window } = dom;

const define = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
for (const key of [
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
]) {
  define(key, window[key]);
}
// The engine asks for reduced motion; jsdom has no matchMedia.
define("matchMedia", () => ({ matches: false }));
window.matchMedia = globalThis.matchMedia;

const { attachDragScroll, startHoldScroll, findScrollable, findScrollableWithin } =
  require(pathToFileURL(bundlePath).pathname);

const $ = (id) => window.document.getElementById(id);
const panel = $("panel");
const scroller = $("scroller");

/** jsdom has no layout: hand the scroller a box that actually overflows. */
Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
Object.defineProperty(scroller, "scrollHeight", { value: 2000, configurable: true });
Object.defineProperty(scroller, "clientWidth", { value: 600, configurable: true });
Object.defineProperty(scroller, "scrollWidth", { value: 600, configurable: true });

const detach = attachDragScroll(panel);

/** A pointer event jsdom can dispatch (it has no PointerEvent constructor). */
function pointer(type, y, { target = $("row"), x = 100, pointerType = "touch", pointerId = 1 } = {}) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  target.dispatchEvent(event);
  return event;
}

function reset() {
  scroller.scrollTop = 0;
}

/* ── 1. the drag ──────────────────────────────────────────────────────────── */

test("a finger drag moves the nearest scroller 1:1", () => {
  reset();
  pointer("pointerdown", 300);
  // Under the threshold nothing moves — a thumb resting on the board is not
  // a scroll gesture.
  pointer("pointermove", 297);
  assert.equal(scroller.scrollTop, 0, "a 3 px wobble is not a scroll");
  // Past it, the content follows the finger exactly.
  pointer("pointermove", 200);
  assert.equal(scroller.scrollTop, 100, "dragging up scrolls down by the same distance");
  pointer("pointermove", 150);
  assert.equal(scroller.scrollTop, 150);
  pointer("pointerup", 150);
});

test("the scroller clamps at both ends instead of running away", () => {
  reset();
  pointer("pointerdown", 300);
  pointer("pointermove", -5000);
  assert.equal(scroller.scrollTop, 1600, "clamped to scrollHeight - clientHeight");
  pointer("pointerup", -5000);

  reset();
  pointer("pointerdown", 300);
  pointer("pointermove", 5000);
  assert.equal(scroller.scrollTop, 0, "never scrolls above the top");
  pointer("pointerup", 5000);
});

/* ── 2. a drag is not a tap ───────────────────────────────────────────────── */

test("a tap still clicks; a drag swallows its trailing click", () => {
  reset();
  let clicks = 0;
  const pick = $("pick");
  pick.addEventListener("click", () => {
    clicks += 1;
  });

  // A clean tap on a lesson row opens it.
  pointer("pointerdown", 300, { target: pick });
  pointer("pointerup", 300, { target: pick });
  pick.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(clicks, 1, "a tap reaches the row");

  // A drag that happens to end on the row must NOT open it.
  pointer("pointerdown", 300, { target: pick });
  pointer("pointermove", 120, { target: pick });
  pointer("pointerup", 120, { target: pick });
  pick.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(clicks, 1, "the click that ends a drag is swallowed");

  // …and only that one click: the next tap works again.
  pointer("pointerdown", 300, { target: pick });
  pointer("pointerup", 300, { target: pick });
  pick.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(clicks, 2, "click suppression is armed exactly once");
});

/* ── 3. gestures that belong to somebody else ─────────────────────────────── */

test("opted-out subtrees and text entry keep their own pointer stream", () => {
  reset();
  pointer("pointerdown", 300, { target: $("handle") });
  pointer("pointermove", 100, { target: $("handle") });
  assert.equal(scroller.scrollTop, 0, "[data-no-surface-scroll] is never drag-scrolled");
  pointer("pointerup", 100, { target: $("handle") });

  reset();
  pointer("pointerdown", 300, { target: $("write") });
  pointer("pointermove", 100, { target: $("write") });
  assert.equal(scroller.scrollTop, 0, "a textarea keeps its caret and selection");
  pointer("pointerup", 100, { target: $("write") });
});

test("a panel with nothing to scroll is inert", () => {
  reset();
  Object.defineProperty(scroller, "scrollHeight", { value: 400, configurable: true });
  pointer("pointerdown", 300);
  pointer("pointermove", 100);
  assert.equal(scroller.scrollTop, 0, "content that fits never moves");
  pointer("pointerup", 100);
  Object.defineProperty(scroller, "scrollHeight", { value: 2000, configurable: true });
});

test("the scroller is resolved from the press target, not hard-wired", () => {
  assert.equal(findScrollable($("row"), panel)?.element, scroller);
  assert.equal(findScrollableWithin(panel), scroller);
});

/* ── 4. press and hold ────────────────────────────────────────────────────── */

test("holding a scroll key keeps the board moving, and release stops it", async () => {
  reset();
  const stop = startHoldScroll(() => scroller, 1);
  const frame = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

  await frame();
  await frame();
  const early = scroller.scrollTop;
  assert.ok(early > 0, "the board starts moving on press");

  for (let i = 0; i < 8; i += 1) await frame();
  const later = scroller.scrollTop;
  assert.ok(later > early, "it keeps moving while held");

  stop();
  const atRelease = scroller.scrollTop;
  await frame();
  await frame();
  assert.equal(scroller.scrollTop, atRelease, "release cancels the loop");
});

test("holding the other key travels the other way", async () => {
  scroller.scrollTop = 800;
  const stop = startHoldScroll(() => scroller, -1);
  const frame = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  await frame();
  await frame();
  assert.ok(scroller.scrollTop < 800, "up means up");
  stop();
});

test.after(() => {
  detach();
  dom.window.close();
});
