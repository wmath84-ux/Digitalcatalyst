// tests/homeFooterDockFillRuntime.test.mjs
//
// Runtime proof for the owner's brief (2026-09-28):
//
//   "Home screen per footer navigation ka size thoda bada karo — matlab side
//    mein jitna area khali hai vah sab cover ho jaaye … ekadam pura hi na ho
//    jaaye ki sat jaaye ekadam edge se, lekin aur bada ho jaaye icon vagaira
//    jisse."
//
// tests/homeFooterDockFillContract.test.mjs pins the shape (the constants, the
// CSS single source, the inline-only handover). This file mounts the REAL
// SiteFooterNav — eight tabs like Home's mobile footer, then seven like every
// other screen — and asserts what the dock actually renders:
//
//   1. at a 390 px phone the plates are BIGGER than the old compact fit
//      (39 > 38), the capsule fills the width the nav leaves it, and the
//      gutter never drops below the nav's own padding + the fill's reserve —
//      so the dock covers the empty side space without touching the edge;
//   2. at 768 px the plates reach the 60 px cap and the leftover width goes to
//      the GAPS, so the capsule still covers the screen instead of floating in
//      the middle;
//   3. the glyph grows with the plate (half of it, floor 20) — the icons get
//      bigger, not just the capsule;
//   4. a dock with seven tabs (Store, My Day, Revision, Cart, …) renders
//      byte-for-byte the dock it always did: 44 px plates, no inline rhythm;
//   5. a resize re-solves the fill, so rotating a phone or resizing a window
//      lands on the new numbers.
//
// The fixture is the real component, bundled with the repo's own esbuild and
// mounted into jsdom, exactly like tests/footerDockSmoothDragRuntime.test.mjs.
// jsdom has no layout engine and no cascade, so the two things the fill reads
// from the page — the nav's content width and the eight-tab dock's resting
// rhythm published by src/index.css — are stubbed to the values the real page
// produces at that width. The code under test (measurement, the solver, the
// props it renders with) is not.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the real SiteFooterNav, eight tabs / seven tabs ─────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import SiteFooterNav from ${JSON.stringify(path.join(ROOT, "src/components/SiteFooterNav.tsx"))};

const Icon = ({ size = 22, style }) => <svg width={size} height={size} style={style} />;

const items = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: \`tab-\${i}\`,
    label: \`Tab \${i}\`,
    color: "#FFBE0B",
    icon: Icon,
    active: i === 0,
  }));

export function mount(host, count) {
  const root = createRoot(host);
  act(() => {
    root.render(
      <SiteFooterNav
        label="Primary"
        items={items(count)}
        onSelect={() => undefined}
        dataAttrs={{ "data-dock-count": String(count) }}
      />,
    );
  });
  return { unmount: () => act(() => root.unmount()) };
}

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "home-footer-fill-runtime");

function buildFixture() {
  fs.mkdirSync(CACHE, { recursive: true });
  const entry = path.join(CACHE, "fixture.tsx");
  const out = path.join(CACHE, "fixture.cjs");
  fs.writeFileSync(entry, FIXTURE);
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
  "MutationObserver",
]) {
  define(key, window[key]);
}

/* ── the two things the fill reads from the page ──────────────────────────── */

/** The viewport the stubs below report. */
const viewport = { width: 390 };

/**
 * The eight-tab (Home) dock's resting rhythm as src/index.css declares it, and
 * the nav's own gutter, per band — the values the real cascade resolves to.
 */
const rhythmFor = (width) =>
  width <= 349
    ? { gap: 2, padInline: 4, padBlock: 8, navPad: 8 }
    : width <= 379
      ? { gap: 2, padInline: 6, padBlock: 10, navPad: 8 }
      : width <= 479
        ? { gap: 4, padInline: 8, padBlock: 10, navPad: 12 }
        : { gap: 8, padInline: 16, padBlock: 12, navPad: 12 };

window.getComputedStyle = (element) => {
  const rhythm = rhythmFor(viewport.width);
  const isNav = typeof element.hasAttribute === "function" && element.hasAttribute("data-site-footer-nav");
  return {
    justifyContent: "flex-start",
    paddingLeft: `${isNav ? rhythm.navPad : 0}px`,
    paddingRight: `${isNav ? rhythm.navPad : 0}px`,
    paddingTop: "0px",
    paddingBottom: "0px",
    getPropertyValue: (name) =>
      ({
        "--dc-home-dock-gap": `${rhythm.gap}px`,
        "--dc-home-dock-pad": `${rhythm.padInline}px`,
        "--dc-home-dock-pad-block": `${rhythm.padBlock}px`,
      })[name] ?? "",
  };
};
define("getComputedStyle", window.getComputedStyle);

// `nav.clientWidth` is the width the footer is given (the app frame's content
// box); jsdom answers 0 for everything.
Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get() {
    return typeof this.hasAttribute === "function" && this.hasAttribute("data-site-footer-nav")
      ? viewport.width
      : 0;
  },
});

// The fit queries: the same bands SiteFooterNav's own matchMedia list uses.
window.matchMedia = (query) => {
  const max = /\(max-width:\s*(\d+(?:\.\d+)?)px\)/.exec(query);
  const matches = max ? viewport.width <= parseFloat(max[1]) : false;
  return {
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
};
define("matchMedia", window.matchMedia);

const fixture = require(bundle);
const host = window.document.getElementById("host");

const nextFrame = () =>
  new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

/**
 * Let the dock settle: the fill's PLATE is a render prop (correct in the very
 * first commit), while the capsule's padding is a framer motion value, so its
 * DOM write lands on the next frame — in a browser that is still before the
 * first paint, here it just needs one rAF.
 */
const settled = async () => {
  await nextFrame();
  await nextFrame();
};

/* ── helpers ──────────────────────────────────────────────────────────────── */

const nav = () => window.document.querySelector("[data-site-footer-nav]");
const dock = () => window.document.querySelector("[data-glass-dock]");
const buttons = () => Array.from(window.document.querySelectorAll("[data-glass-dock-item] button"));
const glyph = () => buttons()[0].querySelector("svg, img").getAttribute("width");

/** The capsule's resting width as the dock renders it, from the DOM alone. */
function capsuleWidth() {
  const plate = parseFloat(buttons()[0].style.width);
  const gap = parseFloat(dock().style.gap);
  const padInline = parseFloat(dock().style.paddingInline);
  return buttons().length * plate + (buttons().length - 1) * gap + 2 * padInline;
}

/* ── 1 + 3. a phone: bigger plates, glyphs that follow, an edge margin ────── */

test("Home's eight-tab dock fills a 390px phone without reaching the edge", async () => {
  viewport.width = 390;
  const mounted = fixture.mount(host, 8);
  await settled();

  // Bigger than the old compact fit (38) — the whole point of the brief.
  assert.equal(buttons().length, 8);
  assert.equal(buttons()[0].style.width, "39px", "the plate grew past the compact 38px");
  assert.equal(dock().style.gap, "4px", "the rhythm stays the CSS band's, now inline");

  // …and the glyph follows the plate (half of it, floor 20) rather than
  // staying at the compact 20 while the plate grows.
  assert.equal(glyph(), "20");

  // The capsule covers the width the nav left it, minus the reserve: the nav
  // is 390 wide with a 12px gutter, the fill keeps 4px more each side.
  const available = 390 - 2 * 12 - 2 * 4;
  const capsule = capsuleWidth();
  assert.ok(
    capsule <= available + 0.01,
    `the capsule (${capsule}) may not exceed the width it was given (${available})`,
  );
  assert.ok(
    capsule > available - 8,
    `the capsule (${capsule}) must fill the width it was given (${available})`,
  );
  const gutter = (390 - capsule) / 2;
  assert.ok(gutter > 12, `the capsule must keep the nav's gutter clear (gutter ${gutter})`);
  assert.ok(gutter < 40, `the capsule must actually use the empty side space (gutter ${gutter})`);

  // The block padding breathes with the plate too (10 → 11), so the dock does
  // not read as a wide flat strip.
  assert.equal(dock().style.paddingBottom, "11px");

  mounted.unmount();
});

test("a 430px phone gets the standard 44px plates and a wider glyph", async () => {
  viewport.width = 430;
  const mounted = fixture.mount(host, 8);
  await settled();

  // 430 is still the compact band, but the fill grows the plate to the size
  // the seven-tab footers already use on the same screen.
  assert.equal(buttons()[0].style.width, "44px", "the plate reaches the standard 44px");
  assert.equal(glyph(), "22", "the glyph grows with the plate");
  assert.equal(dock().style.gap, "4px");

  mounted.unmount();
});

/* ── 2. a wide screen: plates cap, the leftover goes to the gaps ──────────── */

test("at 768px the plates cap at 60px and the gaps take the leftover width", async () => {
  viewport.width = 768;
  const mounted = fixture.mount(host, 8);
  await settled();

  assert.equal(buttons()[0].style.width, "60px", "the plate cap is 60px");
  assert.equal(glyph(), "30", "the glyph is half the plate");
  assert.equal(dock().style.gap, "32px", "the empty side space became spacing, not nothing");
  assert.equal(dock().style.paddingBottom, "16px");

  const available = 768 - 2 * 12 - 2 * 4;
  const capsule = capsuleWidth();
  assert.ok(capsule <= available + 0.01, `capsule ${capsule} > ${available}`);
  assert.ok(capsule > available - 12, `capsule ${capsule} should fill ${available}`);

  mounted.unmount();
});

/* ── 4. every other footer is untouched ──────────────────────────────────── */

test("a seven-tab footer keeps the dock it always had — no fill, no inline rhythm", async () => {
  viewport.width = 390;
  const mounted = fixture.mount(host, 7);
  await settled();

  assert.equal(buttons().length, 7);
  assert.equal(buttons()[0].style.width, "44px", "seven tabs still ride the 44px plates");
  assert.equal(glyph(), "22");
  assert.equal(dock().style.gap, "", "the CSS rhythm is untouched when there is no fill");
  assert.equal(dock().style.paddingBottom, "", "the class padding is untouched");

  mounted.unmount();
});

/* ── 4b. the wave still runs inside a filled dock ────────────────────────── */

test("a drag across the filled dock still magnifies, and the plates stay fixed", async () => {
  viewport.width = 430;
  const mounted = fixture.mount(host, 8);
  await settled();

  const plate = parseFloat(buttons()[0].style.width);
  const gap = parseFloat(dock().style.gap);
  const restingPad = parseFloat(dock().style.paddingInline);

  // jsdom has no layout engine: give the plates the resting boxes the fill
  // just solved (this is the layout `measure()` reads once per gesture).
  const LEFT = 20;
  Array.from(window.document.querySelectorAll("[data-glass-dock-item]")).forEach((item, i) => {
    const left = LEFT + i * (plate + gap);
    item.getBoundingClientRect = () => ({
      left,
      right: left + plate,
      top: 700,
      bottom: 700 + plate,
      width: plate,
      height: plate,
      x: left,
      y: 700,
      toJSON: () => ({}),
    });
  });

  const event = (type, x) => {
    const pointerEvent = new window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: 720,
      button: 0,
    });
    Object.defineProperty(pointerEvent, "pointerType", { value: "touch" });
    Object.defineProperty(pointerEvent, "pointerId", { value: 1 });
    dock().dispatchEvent(pointerEvent);
  };

  // A finger on the third plate, then a couple of frames of spring.
  event("pointerdown", 100);
  event("pointermove", 120);
  await nextFrame();
  await nextFrame();
  await nextFrame();
  await nextFrame();

  for (const button of buttons()) {
    assert.equal(button.style.width, `${plate}px`, "the tap target never resizes");
    assert.equal(button.style.height, `${plate}px`);
  }
  const transforms = buttons().map((button) => button.style.transform);
  assert.ok(
    transforms.some((transform) => /scale\(1\.[0-9]/.test(transform)),
    `no plate magnified inside the fill: ${JSON.stringify(transforms)}`,
  );
  const pad = parseFloat(dock().style.paddingInline);
  assert.ok(pad > restingPad, `the capsule did not grow (padding-inline ${pad})`);

  event("pointerup", 120);
  mounted.unmount();
});

/* ── 5. a resize re-solves the fill ──────────────────────────────────────── */

test("a resize re-solves the fill instead of freezing the first viewport", async () => {
  viewport.width = 390;
  const mounted = fixture.mount(host, 8);
  assert.equal(buttons()[0].style.width, "39px");

  viewport.width = 768;
  fixture.act(() => {
    window.dispatchEvent(new window.Event("resize"));
  });
  await settled();

  assert.equal(buttons()[0].style.width, "60px", "the plate followed the viewport");
  assert.equal(dock().style.gap, "32px", "the gaps followed the viewport");

  mounted.unmount();
});
