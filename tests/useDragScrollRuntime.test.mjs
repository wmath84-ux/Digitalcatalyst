// tests/useDragScrollRuntime.test.mjs
//
// Runtime contract for the mouse ↔ thumb parity fix (owner, 2026-09-06):
//
//   "when we use our mouse it is not interacting as thumb left-right scroll
//    interaction."
//
// The rails are `overflow-x-auto` with the scrollbar hidden, so a thumb swipes
// them and a desktop pointer could not move them at all. src/hooks/useDragScroll.ts
// adds the drag. Its shape is pinned by
// tests/storeChromeDockDragScrollContract.test.mjs; this file proves the
// BEHAVIOUR in a real DOM, because the failure mode it fixes is behavioural:
//
//   1. a left/right mouse drag moves the rail 1:1 with the pointer;
//   2. the click a drag ends with is swallowed once — dragging the reviews rail
//      must never open a product, dragging the chip row must never fire a
//      filter — and the very next tap still works;
//   3. touch is left to the browser (native scroll, momentum and snap beat any
//      re-implementation), so a thumb's swipe is untouched;
//   4. a rail whose content fits stays completely inert;
//   5. the wheel is never hijacked — the store's filter bar is sticky at the top
//      of a scrolling page, so turning a vertical wheel into horizontal rail
//      scroll would steal the page from the user;
//   6. the release fling honours `prefers-reduced-motion`.
//
// The fixture is real React (19) bundled with the repo's own esbuild and mounted
// into jsdom, exactly like tests/openingSplashRuntime.test.mjs does for the
// splash. jsdom has no layout engine, so the rail's `scrollWidth` / `clientWidth`
// are stubbed — `scrollLeft` itself is real, which is what the hook writes.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the hook on a rail of clickable cards ───────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { useDragScroll } from ${JSON.stringify(path.join(ROOT, "src/hooks/useDragScroll.ts"))};

export const clicks: string[] = [];

export function mount(host: HTMLElement) {
  function Rail() {
    const rail = useDragScroll<HTMLDivElement>();
    return (
      <div id="rail" ref={rail.ref} onPointerDown={rail.onPointerDown} className="overflow-x-auto">
        {Array.from({ length: 8 }, (_, i) => (
          <button key={i} id={\`card-\${i}\`} onClick={() => clicks.push(\`card-\${i}\`)}>
            card {i}
          </button>
        ))}
      </div>
    );
  }
  const root = createRoot(host);
  act(() => {
    root.render(<Rail />);
  });
  return { root, unmount: () => act(() => root.unmount()) };
}

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "drag-scroll-runtime");

function buildFixture() {
  fs.mkdirSync(CACHE, { recursive: true });
  const entry = path.join(CACHE, "fixture.tsx");
  const out = path.join(CACHE, "fixture.cjs");
  fs.writeFileSync(entry, FIXTURE);
  // esbuild's `bin/esbuild` is the platform binary itself, so it is executed
  // directly rather than through node.
  execFileSync(
    require.resolve("esbuild/bin/esbuild"),
    [
      entry,
      "--bundle",
      "--format=cjs",
      "--platform=node",
      "--jsx=automatic",
      "--target=node20",
      `--outfile=${out}`,
      "--log-level=error",
    ],
    { cwd: ROOT, stdio: "pipe" },
  );
  return out;
}

/* ── DOM + globals ────────────────────────────────────────────────────────── */

const bundle = buildFixture();

const dom = new JSDOM(`<!doctype html><html><body><div id="host"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;

// Node 22 exposes `navigator` as a getter-only global, so the jsdom one has to
// be defined rather than assigned.
const define = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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

const fixture = require(bundle);
const host = window.document.getElementById("host");
fixture.mount(host);

const rail = () => window.document.getElementById("rail");
const card = (i) => window.document.getElementById(`card-${i}`);

/** jsdom has no layout: give the rail a box that overflows (or does not). */
function setBox({ client = 320, scroll = 900 } = {}) {
  Object.defineProperty(rail(), "clientWidth", { value: client, configurable: true });
  Object.defineProperty(rail(), "scrollWidth", { value: scroll, configurable: true });
}

/** A pointer event jsdom can dispatch (it has no PointerEvent constructor). */
function pointer(type, x, { pointerType = "mouse", timeStamp, target = card(2) } = {}) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 12,
    button: 0,
  });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  if (timeStamp !== undefined) Object.defineProperty(event, "timeStamp", { value: timeStamp });
  target.dispatchEvent(event);
  return event;
}

function reset() {
  rail().scrollLeft = 0;
  rail().removeAttribute("data-drag-scrolling");
  fixture.clicks.length = 0;
}

/* ── 1. the drag itself ───────────────────────────────────────────────────── */

test("a mouse drag moves the rail 1:1 with the pointer", () => {
  setBox();
  reset();
  pointer("pointerdown", 300);
  assert.equal(rail().getAttribute("data-drag-scrolling"), "true", "the rail is marked as held");
  pointer("pointermove", 240, { target: window });
  assert.equal(rail().scrollLeft, 60, "dragging left scrolls the content left");
  pointer("pointermove", 180, { target: window });
  assert.equal(rail().scrollLeft, 120);
  pointer("pointerup", 180, { target: window });
  assert.equal(rail().hasAttribute("data-drag-scrolling"), false, "released");

  // Dragging the other way walks back, and the rail stops at its start edge.
  pointer("pointerdown", 100);
  pointer("pointermove", 260, { target: window });
  assert.equal(rail().scrollLeft, 0, "it never scrolls past the leading edge");
  pointer("pointerup", 260, { target: window });
});

test("a drag that ends on a card does not open it, and the next tap still does", () => {
  setBox();
  reset();
  pointer("pointerdown", 300);
  pointer("pointermove", 200, { target: window });
  pointer("pointerup", 200, { target: window });
  // The browser fires the click after the gesture; the rail swallows it once.
  const click = new window.MouseEvent("click", { bubbles: true, cancelable: true });
  card(2).dispatchEvent(click);
  assert.deepEqual(fixture.clicks, [], "a drag is not a tap");

  // One-shot: a clean press-and-release on the same card still activates it.
  reset();
  pointer("pointerdown", 300, { target: card(2) });
  pointer("pointerup", 300, { target: card(2) });
  card(2).dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.deepEqual(fixture.clicks, ["card-2"], "a tap still selects");
});

/* ── 2. what it must not touch ────────────────────────────────────────────── */

test("touch keeps the browser's own scrolling", () => {
  setBox();
  reset();
  pointer("pointerdown", 300, { pointerType: "touch" });
  assert.equal(rail().hasAttribute("data-drag-scrolling"), false, "no held state for a thumb");
  pointer("pointermove", 150, { pointerType: "touch", target: window });
  assert.equal(rail().scrollLeft, 0, "native touch scrolling is never double-handled");
  pointer("pointerup", 150, { pointerType: "touch", target: window });
  // And the thumb's tap still works.
  card(3).dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.deepEqual(fixture.clicks, ["card-3"]);
});

test("a rail whose content fits stays inert", () => {
  setBox({ client: 900, scroll: 900 });
  reset();
  pointer("pointerdown", 300);
  assert.equal(rail().hasAttribute("data-drag-scrolling"), false);
  pointer("pointermove", 120, { target: window });
  assert.equal(rail().scrollLeft, 0);
  pointer("pointerup", 120, { target: window });
  card(1).dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.deepEqual(fixture.clicks, ["card-1"], "clicks are untouched when there is nothing to drag");
  setBox();
});

test("the wheel is never hijacked", () => {
  setBox();
  reset();
  // The store's filter bar is sticky at the top of a scrolling page: a vertical
  // wheel over the chips belongs to the page, not to the rail.
  const wheel = new window.Event("wheel", { bubbles: true, cancelable: true });
  Object.defineProperty(wheel, "deltaY", { value: 240 });
  rail().dispatchEvent(wheel);
  assert.equal(rail().scrollLeft, 0);
  assert.equal(wheel.defaultPrevented, false, "the page keeps the gesture");
});

/* ── 3. the release fling ─────────────────────────────────────────────────── */

test("the release fling is motion, so prefers-reduced-motion stops it", () => {
  setBox();
  reset();

  // Take the frame scheduler over so the fling can be stepped deterministically.
  const realRaf = globalThis.requestAnimationFrame;
  const realCancel = globalThis.cancelAnimationFrame;
  const queue = [];
  globalThis.requestAnimationFrame = (cb) => {
    queue.push(cb);
    return queue.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  const reduced = { matches: true };
  window.matchMedia = () => reduced;

  try {
    // A fast flick: 100px in 16ms.
    pointer("pointerdown", 400, { timeStamp: 1000 });
    pointer("pointermove", 350, { timeStamp: 1008, target: window });
    pointer("pointermove", 300, { timeStamp: 1016, target: window });
    const atRelease = rail().scrollLeft;
    pointer("pointerup", 300, { timeStamp: 1016, target: window });
    assert.equal(atRelease, 100);
    assert.equal(queue.length, 0, "reduced motion: no glide frames scheduled");
    assert.equal(rail().scrollLeft, atRelease, "the rail stops where the pointer let go");

    // Same flick with motion allowed: the rail glides on after release.
    reduced.matches = false;
    reset();
    pointer("pointerdown", 400, { timeStamp: 2000 });
    pointer("pointermove", 350, { timeStamp: 2008, target: window });
    pointer("pointermove", 300, { timeStamp: 2016, target: window });
    pointer("pointerup", 300, { timeStamp: 2016, target: window });
    assert.ok(queue.length > 0, "a fling is scheduled");
    let guard = 0;
    while (queue.length && guard++ < 400) queue.shift()(guard * 16);
    assert.ok(rail().scrollLeft > 100, `the rail glided to ${rail().scrollLeft}`);
  } finally {
    globalThis.requestAnimationFrame = realRaf;
    globalThis.cancelAnimationFrame = realCancel;
    delete window.matchMedia;
  }
});
