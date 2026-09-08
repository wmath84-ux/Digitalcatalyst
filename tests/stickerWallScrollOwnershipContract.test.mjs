// tests/stickerWallScrollOwnershipContract.test.mjs
//
// Behavioural contract for the Home feedback wall (src/components/StickerWall.tsx):
//
//   · a finger that lands ON a sticker owns the gesture  → matter.js drags it
//     and the touch sequence is claimed (touchstart/touchmove preventDefault);
//   · a finger that lands on EMPTY wall belongs to the page → nothing is
//     prevented, so the browser pans vertically;
//   · a wheel / trackpad tick over the card is ALWAYS the page's — matter.js
//     binds `wheel` non-passively and used to preventDefault() inside it,
//     which is what froze the card for trackpad users.
//
// This mounts the REAL component (bundled with esbuild) in jsdom against the
// REAL matter-js, so the assertions run the shipped handlers rather than a
// copy of them.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { JSDOM } from "jsdom";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
// The bundle has to live INSIDE the repo so its bare `react` import resolves
// to the very same React instance react-dom uses — bundling React a second
// time gives the component its own dispatcher and every hook throws. It goes
// under node_modules/ so it is never committed.
const OUT_DIR = path.join(ROOT, "node_modules/.tmp-stickerwall-contract");
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, "StickerWall.mjs");

execFileSync(
  path.join(ROOT, "node_modules/.bin/esbuild"),
  [
    "src/components/StickerWall.tsx",
    "--bundle",
    "--format=esm",
    "--jsx=automatic",
    "--target=es2022",
    "--external:react",
    "--external:react/jsx-runtime",
    `--outfile=${OUT}`,
  ],
  { cwd: ROOT, stdio: "pipe" },
);

// ── jsdom, with the two canvas APIs the wall needs that jsdom lacks ─────────
const dom = new JSDOM(
  `<!doctype html><html><body><div id="root"></div></body></html>`,
  { pretendToBeVisual: true, url: "http://localhost/" },
);
const { window } = dom;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;

// A 2D context good enough for the wall's renderer: every draw call is a
// no-op, `measureText` returns a width so the card sizer can wrap text.
const ctxStub = new Proxy(
  { measureText: (text) => ({ width: String(text).length * 6 }) },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set() {
      return true;
    },
  },
);
window.HTMLCanvasElement.prototype.getContext = () => ctxStub;

for (const key of ["window", "document", "HTMLElement", "HTMLCanvasElement", "Element", "Node", "Event", "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver", "localStorage", "matchMedia"]) {
  globalThis[key] = window[key];
}
// `navigator` is a getter-only global on Node 22 — define, don't assign.
// `performance` is deliberately NOT overridden: jsdom's Performance delegates
// to the Node global, so replacing it recurses.
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { default: StickerWall } = await import(OUT);

const container = window.document.getElementById("root");
const root = createRoot(container);
root.render(React.createElement(StickerWall, {}));

// The wall boots through a dynamic `import("matter-js")`; wait for the canvas
// to be sized, which only happens after the engine + walls are built.
// React 19 schedules the mount, and the wall boots through a dynamic
// `import("matter-js")` — wait for the canvas to appear and then to be sized,
// which only happens once the engine, walls and seed bodies exist.
const tick = () => new Promise((r) => window.setTimeout(r, 25));
const waitUntil = async (fn, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await tick();
  }
  return false;
};
assert.ok(await waitUntil(() => Boolean(container.querySelector("canvas")), 15000), "the wall renders a canvas");
const canvas = container.querySelector("canvas");
assert.ok(await waitUntil(() => canvas.width === 480, 15000), "the wall sized its canvas (engine booted)");

/** Dispatch a synthetic touch on the canvas and report whether it was claimed. */
const touch = (type, x, y) => {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "changedTouches", {
    value: [{ identifier: 1, clientX: x, clientY: y, pageX: x, pageY: y, target: canvas }],
  });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ identifier: 1, clientX: x, clientY: y, pageX: x, pageY: y, target: canvas }],
  });
  canvas.dispatchEvent(event);
  return event.defaultPrevented;
};

const wheel = (x, y) => {
  const event = new window.Event("wheel", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "deltaY", { value: -120 });
  Object.defineProperty(event, "clientX", { value: x });
  Object.defineProperty(event, "clientY", { value: y });
  canvas.dispatchEvent(event);
  return event.defaultPrevented;
};

// jsdom hands every element a zero rect, so world coordinates == client
// coordinates on a 480×480 wall. Stickers settle along the floor, so the
// bottom band is full of bodies and the top corners are empty.
const EMPTY = { x: 4, y: 4 };

test("a finger on empty wall is the page's gesture — nothing is prevented", () => {
  assert.equal(touch("touchstart", EMPTY.x, EMPTY.y), false, "empty-area touchstart must not be claimed");
  assert.equal(touch("touchmove", EMPTY.x, EMPTY.y + 12), false, "empty-area touchmove must not be claimed");
  assert.equal(touch("touchend", EMPTY.x, EMPTY.y + 24), false, "empty-area touchend must not be claimed");
});

test("a finger on a sticker IS claimed, so the drag never scrolls the page", () => {
  // Sweep the pile: at least one point has to land on a body.
  let hit = null;
  outer: for (let y = 240; y < 470; y += 12) {
    for (let x = 20; x < 460; x += 12) {
      touch("touchend", x, y); // clear any previous drag
      if (touch("touchstart", x, y)) {
        hit = { x, y };
        break outer;
      }
      touch("touchend", x, y);
    }
  }
  assert.ok(hit, "a sticker was found under the sweep");
  assert.equal(touch("touchmove", hit.x + 8, hit.y + 8), true, "the drag's touchmove stays claimed");
  touch("touchend", hit.x + 8, hit.y + 8);
  // …and the very next empty-area gesture goes straight back to the page.
  assert.equal(touch("touchstart", EMPTY.x, EMPTY.y), false, "the page owns the gesture after a drag");
});

test("the page owns every wheel tick over the card (trackpad / mouse wheel)", () => {
  assert.equal(wheel(EMPTY.x, EMPTY.y), false, "wheel over empty wall must scroll the page");
  // Even directly over the pile: a wheel is never the wall's gesture.
  let overPile = null;
  outer: for (let y = 240; y < 470; y += 12) {
    for (let x = 20; x < 460; x += 12) {
      touch("touchend", x, y);
      if (touch("touchstart", x, y)) {
        overPile = { x, y };
        break outer;
      }
      touch("touchend", x, y);
    }
  }
  assert.ok(overPile, "a sticker was found under the sweep");
  touch("touchend", overPile.x, overPile.y);
  assert.equal(wheel(overPile.x, overPile.y), false, "wheel over a sticker must still scroll the page");
});

after(() => {
  // matter.js runs its engine on requestAnimationFrame, and jsdom backs that
  // with a timer — without this the process would never exit.
  root.unmount();
  window.close();
});

test("the card advertises vertical panning, not `touch-action: none`", () => {
  const css = fs.readFileSync(path.join(ROOT, "src/index.css"), "utf8");
  const src = fs.readFileSync(path.join(ROOT, "src/components/StickerWall.tsx"), "utf8");
  assert.match(css, /\[data-home-sticker-wall\] canvas \{\s*touch-action: pan-y;/);
  assert.match(src, /touchAction: 'pan-y'/);
  assert.doesNotMatch(src, /touchAction: 'none'/);
});
