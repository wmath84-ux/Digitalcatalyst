// tests/footerDockSmoothDragRuntime.test.mjs
//
// Runtime proof for the owner's 2026-09-28 brief:
//
//   "Home page per footer navigation drag-scroll karne per animation lag
//    karta hai … course player / My Day per nahin. Vaise hi design karo taki
//    super smooth scroll animation ho."
//
// tests/footerDockSmoothDragContract.test.mjs pins the shape and re-derives
// the geometry; this file drives the REAL GlassDock in a real DOM and asserts
// the three per-frame costs that made Home stutter are actually gone:
//
//   1. a drag takes NO layout reads — `getBoundingClientRect` is called once
//      per gesture (on pointerdown), not once per item per frame;
//   2. a drag writes NO layout property — the plates' inline `width`/`height`
//      are byte-identical before and after the wave, while their `transform`
//      and the capsule's `padding-top` do move (the wave is alive);
//   3. a drag publishes NO footer height — `--dc-footer-nav-h` is frozen while
//      `data-dc-dock-gesture` is up, and the settled value goes out once it
//      drops, which is what stopped the per-frame root style recalculation
//      that scaled with the size of the page under the dock.
//
// Plus the behaviour the drag must not lose: swiping across the dock and
// lifting the finger still selects the plate under it.
//
// The fixture is the real component, bundled with the repo's own esbuild and
// mounted into jsdom, exactly like tests/useDragScrollRuntime.test.mjs.
// jsdom has no layout engine, so the plates' resting boxes, the capsule's
// padding and `document.elementsFromPoint` are stubbed — the code under test
// (measure, the transforms, the springs, the gesture flag) is not.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the real dock, eight tabs like Home's mobile footer ─────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import GlassDock from ${JSON.stringify(path.join(ROOT, "src/components/glass-dock/GlassDock.tsx"))};
import { initFooterNavSpace } from ${JSON.stringify(path.join(ROOT, "src/utils/footerNavSpace.ts"))};

const Icon = ({ size = 22, style }) => <svg width={size} height={size} style={style} />;

export const selected: string[] = [];

export function mountDock(host: HTMLElement) {
  const items = Array.from({ length: 8 }, (_, i) => ({
    id: \`tab-\${i}\`,
    label: \`Tab \${i}\`,
    color: "#FFBE0B",
    icon: Icon,
    active: i === 0,
  }));
  const root = createRoot(host);
  act(() => {
    root.render(
      <GlassDock siteFooter items={items} onSelect={(id) => selected.push(id)} />,
    );
  });
  return { unmount: () => act(() => root.unmount()) };
}

export { initFooterNavSpace, act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "footer-dock-runtime");

function buildFixture() {
  fs.mkdirSync(CACHE, { recursive: true });
  const entry = path.join(CACHE, "fixture.tsx");
  const out = path.join(CACHE, "fixture.cjs");
  fs.writeFileSync(entry, FIXTURE);
  // esbuild's `bin/esbuild` is the platform binary itself, so it is executed
  // directly rather than through node. The repo tsconfig supplies the `@/*`
  // alias GlassMaterial imports (`@/lib/glassDocs`).
  execFileSync(
    require.resolve("esbuild/bin/esbuild"),
    [
      entry,
      "--bundle",
      "--format=cjs",
      "--platform=node",
      "--jsx=automatic",
      "--target=node20",
      `--tsconfig=${path.join(ROOT, "tsconfig.json")}`,
      `--outfile=${out}`,
      "--log-level=error",
    ],
    { cwd: ROOT, stdio: "pipe" },
  );
  return out;
}

const bundle = buildFixture();

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
  "MutationObserver",
]) {
  define(key, window[key]);
}

/* ── the layout jsdom cannot give us ──────────────────────────────────────── */

const PLATE = 44;
const GAP = 8;
const LEFT = 20;
/** Resting centre X of plate `i` — what measure() is allowed to read. */
const centreOf = (i) => LEFT + i * (PLATE + GAP) + PLATE / 2;

/** Every getBoundingClientRect the dock makes, counted. */
const reads = { count: 0 };

/** ResizeObserver: jsdom has none, and footerNavSpace needs one to watch. */
const resizeObservers = [];
class StubResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    resizeObservers.push(this);
  }
  observe(target) {
    this.targets.add(target);
  }
  unobserve(target) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  fire() {
    this.callback([], this);
  }
}
define("ResizeObserver", StubResizeObserver);
window.ResizeObserver = StubResizeObserver;

const fixture = require(bundle);
fixture.mountDock(window.document.getElementById("host"));

const dock = () => window.document.querySelector("[data-glass-dock]");
const plates = () => Array.from(window.document.querySelectorAll("[data-glass-dock-item]"));
const buttons = () => plates().map((item) => item.querySelector("button"));

// Resting boxes: a real browser would lay the row out; here each plate
// reports the box it was designed with, and every read is counted.
plates().forEach((item, i) => {
  item.getBoundingClientRect = () => {
    reads.count += 1;
    return {
      left: LEFT + i * (PLATE + GAP),
      right: LEFT + i * (PLATE + GAP) + PLATE,
      top: 700,
      bottom: 700 + PLATE,
      width: PLATE,
      height: PLATE,
      x: LEFT + i * (PLATE + GAP),
      y: 700,
      toJSON() {
        return {};
      },
    };
  };
});

// Hit-testing for the release-to-select path (jsdom has no layout, so it
// cannot answer elementsFromPoint on its own).
window.document.elementsFromPoint = (x) => {
  let best = null;
  let bestDistance = Infinity;
  plates().forEach((item, i) => {
    const distance = Math.abs(centreOf(i) - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  });
  return bestDistance <= PLATE ? [best.querySelector("button"), best] : [];
};

function pointer(type, x, { pointerType = "touch", target = dock() } = {}) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 720,
    button: 0,
  });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  Object.defineProperty(event, "pointerId", { value: 1 });
  target.dispatchEvent(event);
  return event;
}

const nextFrame = () =>
  new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
const settle = (ms = 320) => new Promise((resolve) => setTimeout(resolve, ms));

/** Drag from `from` to `to`, one coalesced update per frame, like a finger. */
async function drag(from, to, steps = 14) {
  pointer("pointerdown", from);
  for (let s = 1; s <= steps; s += 1) {
    pointer("pointermove", from + ((to - from) * s) / steps);
    await nextFrame();
  }
}

/* ── 1 + 2. no layout reads, no layout writes, and the wave still runs ───── */

test("a drag across the dock takes no layout read and writes no layout property", async () => {
  const before = reads.count;
  await drag(centreOf(1), centreOf(6));

  // ONE measure pass for the whole gesture — the eight plates, read once on
  // pointerdown while they were still at rest. The old wave read all eight
  // again on every single frame.
  assert.equal(reads.count - before, 8, "one measure() pass, then nothing");

  // The plates' boxes are the tap targets: they never animate.
  for (const button of buttons()) {
    assert.equal(button.style.width, `${PLATE}px`, "plate width is fixed");
    assert.equal(button.style.height, `${PLATE}px`, "plate height is fixed");
  }

  // …and the wave is very much alive: plates magnify on the compositor.
  const transforms = buttons().map((button) => button.style.transform);
  assert.ok(
    transforms.some((transform) => /scale\(1\.[2-5]/.test(transform)),
    `no plate magnified: ${JSON.stringify(transforms)}`,
  );
  // The neighbours part (the flex row's push) — that one rides on the item
  // column, so the plate's tooltip travels with its plate.
  const columns = plates().map((item) => item.style.transform);
  assert.ok(
    columns.some((transform) => /translateX\(-?\d+(\.\d+)?px\)/.test(transform)),
    `no neighbour push: ${JSON.stringify(columns)}`,
  );

  // The capsule carries the envelope change, through its own padding.
  const padTop = parseFloat(dock().style.paddingTop);
  assert.ok(padTop > 12, `the capsule did not grow (padding-top: ${dock().style.paddingTop})`);
  const padInline = parseFloat(dock().style.paddingInline);
  assert.ok(padInline > 16, `the capsule did not widen (padding-inline: ${dock().style.paddingInline})`);
});

/* ── 3. the footer height is not re-published mid-drag ───────────────────── */

test("the footer height holds while a gesture is live, then publishes once", async () => {
  // The previous test's drag is still settling, so its gesture flag is up —
  // wait for the dock to be at rest before measuring the footer.
  delete window.document.documentElement.dataset.dcDockGesture;
  await settle(60);

  const nav = window.document.createElement("nav");
  nav.setAttribute("data-site-footer-nav", "");
  window.document.body.appendChild(nav);
  let navHeight = 68;
  nav.getBoundingClientRect = () => ({
    height: navHeight,
    width: 348,
    top: 700,
    left: 20,
    right: 368,
    bottom: 700 + navHeight,
    x: 20,
    y: 700,
    toJSON() {
      return {};
    },
  });

  fixture.initFooterNavSpace();
  await settle(40);
  assert.equal(
    window.document.documentElement.style.getPropertyValue("--dc-footer-nav-h"),
    "80px",
    "the measured footer height + the 12px lift",
  );

  // A gesture is live and the capsule is mid-spring (taller than it settles).
  window.document.documentElement.dataset.dcDockGesture = "true";
  navHeight = 92;
  for (const observer of resizeObservers) observer.fire();
  await settle(60);
  assert.equal(
    window.document.documentElement.style.getPropertyValue("--dc-footer-nav-h"),
    "80px",
    "nothing may be published on <html> while the dock is mid-gesture",
  );

  // The gesture ends: the settled height goes out, once.
  delete window.document.documentElement.dataset.dcDockGesture;
  await settle(60);
  assert.equal(
    window.document.documentElement.style.getPropertyValue("--dc-footer-nav-h"),
    "104px",
    "the settled height is published the moment the gesture drops",
  );
});

/* ── the gesture flag the dock itself publishes ──────────────────────────── */

test("the dock raises data-dc-dock-gesture for the length of the drag only", async () => {
  delete window.document.documentElement.dataset.dcDockGesture;
  await settle(40);

  pointer("pointerdown", centreOf(0));
  pointer("pointermove", centreOf(2));
  await nextFrame();
  assert.equal(
    window.document.documentElement.dataset.dcDockGesture,
    "true",
    "the gesture is published once, on the first move",
  );

  pointer("pointerup", centreOf(2));
  assert.equal(
    window.document.documentElement.dataset.dcDockGesture,
    "true",
    "it stays up while the springs settle",
  );
  await settle(420);
  assert.equal(
    window.document.documentElement.dataset.dcDockGesture,
    undefined,
    "and drops once the dock is at rest",
  );
});

/* ── behaviour the drag must not lose ────────────────────────────────────── */

test("swiping across the dock and lifting the finger still selects that plate", async () => {
  fixture.selected.length = 0;
  await drag(centreOf(0), centreOf(5));
  pointer("pointerup", centreOf(5));
  assert.deepEqual(fixture.selected, ["tab-5"], "the plate under the finger is the one chosen");

  // …and the wave comes home afterwards. The spring needs its full settle
  // (~450ms here) before the capsule is back to its resting box.
  pointer("pointerleave", centreOf(5));
  await settle(1200);
  // A spring's last hundredth of a pixel is not worth waiting for; what
  // matters is that the capsule comes all the way home.
  const padTop = parseFloat(dock().style.paddingTop);
  const padInline = parseFloat(dock().style.paddingInline);
  assert.ok(Math.abs(padTop - 12) < 0.25, `the capsule did not settle (padding-top ${padTop})`);
  assert.ok(Math.abs(padInline - 16) < 0.25, `the capsule did not settle (padding-inline ${padInline})`);
});

/* ── the regression this file exists to catch ────────────────────────────── */

test("gesture after gesture reaches the SAME capsule — the dock cannot ratchet", async () => {
  // measure() reads the capsule's padding with getComputedStyle, which
  // reports the value the wave itself wrote. Reading it mid-spring would take
  // the magnified capsule for the resting one, and every gesture would leave
  // the footer a little taller than the last. This drove the drag twice and
  // compares the peaks.
  const peaks = [];
  for (let run = 0; run < 2; run += 1) {
    await drag(centreOf(1), centreOf(6));
    peaks.push(parseFloat(dock().style.paddingTop));
    pointer("pointerup", centreOf(6));
    await settle(1200);
  }
  assert.ok(
    Math.abs(peaks[0] - peaks[1]) < 0.5,
    `the capsule grew between gestures: ${peaks[0]} -> ${peaks[1]}`,
  );
  const padTop = parseFloat(dock().style.paddingTop);
  assert.ok(Math.abs(padTop - 12) < 0.25, `the capsule did not come home (${padTop})`);
});
