// tests/coursePlayerSplitExtraPanesRuntime.test.mjs
//
// Runtime proof for the owner's 2026-10-14 brief:
//
//   "Course player ke andar jo divider hai, uspe click karne par ek-do aur
//    option dikhni chahiye — abhi sirf simple 2-screen splitting hota hai.
//    Tablet ki badi screen size aur desktop ke liye hi yah button dikhna
//    chahiye. Ek button left ke actual content area ko ek aur part mein
//    split kar de, dusra right side wale ko bhi. Jab zyada parts hote hain to
//    koi bhi part empty nahi rahega. Jitni bhi divider hongi, sabhi par swap
//    ka option aana chahiye, aur split mode change karne ka bhi."
//
// This file drives the REAL Split Deck in a real DOM:
//
//   1. on a wide stage a tap on the divider reveals the SPLIT controls beside
//      the switch, and on a narrow stage it does not;
//   2. "split the lesson area" grows a third part INSIDE the lesson region,
//      and the added part is never an empty box (it renders the pane the
//      player handed down);
//   3. the same control on the study side grows the deck to four parts;
//   4. EVERY divider carries both controls — swap and the split/merge pair;
//   5. the added part has its own divider, and merging removes just that part;
//   6. the arrangement is remembered per course + axis, and a phone-sized
//      stage never invents one.
//
// The source shape of all of this is pinned by
// tests/coursePlayerSplitExtraPanesContract.test.mjs.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the real Split Deck, with a stage width we control ─────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { SplitDeck } from ${JSON.stringify(path.join(ROOT, "src/course/studyPanels.tsx"))};
import { BookOpen } from "lucide-react";

export function mountDeck(host, options = {}) {
  const axis = options.axis || "row";
  const root = createRoot(host);
  const renderExtraPane = (region, tab, setTab) => (
    React.createElement("div", { "data-extra-node": region, "data-extra-tab": tab },
      React.createElement("button", { type: "button", "data-extra-switch": region, onClick: () => setTab("paid") }, tab))
  );
  act(() => {
    root.render(
      React.createElement(SplitDeck, {
        axis,
        orientation: axis === "row" ? "landscape" : "portrait",
        courseId: options.courseId || "course-1",
        accent: "#FFBE0B",
        studyIcon: BookOpen,
        lesson: React.createElement("div", { "data-fake-lesson": "" }),
        study: React.createElement("div", { "data-fake-study": "" }),
        renderExtraPane,
        extraPaneTab: () => "modules",
      }),
    );
  });
  return { unmount: () => act(() => root.unmount()) };
}

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-split-extra-runtime");

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

/* ── the DOM ─────────────────────────────────────────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="deck"></div></body></html>`, {
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
  "HTMLButtonElement",
  "SVGElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "PointerEvent",
  "KeyboardEvent",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
  "MutationObserver",
  "localStorage",
]) {
  define(key, window[key]);
}
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}
define("matchMedia", window.matchMedia);
define("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});
window.ResizeObserver = globalThis.ResizeObserver;
window.Element.prototype.getBoundingClientRect = () => ({
  x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}),
});
window.Element.prototype.setPointerCapture = () => undefined;
window.Element.prototype.releasePointerCapture = () => undefined;

/**
 * The deck measures ITSELF (`clientWidth`) to decide whether the split
 * controls belong on this stage — jsdom lays nothing out, so the width is
 * handed in explicitly and the deck's own rule is what gets tested.
 */
let stageWidth = 1400;
Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get() {
    return stageWidth;
  },
});

const fixture = require(bundle);
const { act } = fixture;

/* ── helpers ─────────────────────────────────────────────────────────────── */

const settle = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const deckEl = () => window.document.querySelector("[data-course-split-deck]");
const dividers = () => [...window.document.querySelectorAll("[data-course-split-divider]")];
const mainDivider = () => window.document.querySelector('[data-course-split-divider][data-divider-kind="main"]');
const nestedDivider = () => window.document.querySelector('[data-course-split-divider][data-divider-kind="nested"]');
const lessonPane = () => window.document.querySelector("[data-course-lesson-pane]");
const studyPane = () => window.document.querySelector("[data-course-study-pane]");
const regions = () => [...window.document.querySelectorAll("[data-course-region]")];
const extraNodes = () => [...window.document.querySelectorAll("[data-extra-node]")];
const actionEls = (scope) => [
  ...(scope ?? window.document).querySelectorAll("[data-course-split-action]"),
];
const actionIds = (scope) => actionEls(scope).map((button) => button.getAttribute("data-course-split-action"));
const swapEl = (scope) => (scope ?? window.document).querySelector("[data-course-split-swap]");

const pressDivider = async (element, { from = [500, 400], to = from } = {}) => {
  assert.ok(element, "the divider is on screen");
  await act(async () => {
    element.dispatchEvent(new window.PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, clientX: from[0], clientY: from[1], pointerId: 7, isPrimary: true, button: 0, buttons: 1,
    }));
  });
  if (to[0] !== from[0] || to[1] !== from[1]) {
    await act(async () => {
      element.dispatchEvent(new window.PointerEvent("pointermove", {
        bubbles: true, cancelable: true, clientX: to[0], clientY: to[1], pointerId: 7, isPrimary: true, buttons: 1,
      }));
    });
  }
  await act(async () => {
    element.dispatchEvent(new window.PointerEvent("pointerup", {
      bubbles: true, cancelable: true, clientX: to[0], clientY: to[1], pointerId: 7, isPrimary: true, button: 0, buttons: 0,
    }));
  });
  await settle(8);
};

const clickAction = async (id, scope) => {
  const button = (scope ?? window.document).querySelector(`[data-course-split-action="${id}"]`);
  assert.ok(button, `the "${id}" control is on screen`);
  await act(async () => {
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
  });
  await settle(320);
};

/** Tap the divider line, then press one of the revealed controls. */
const useDivider = async (element, id) => {
  await pressDivider(element);
  await clickAction(id, element);
};

const mountDeck = async (options = {}) => {
  const host = window.document.getElementById("deck");
  host.innerHTML = "";
  const mounted = fixture.mountDeck(host, options);
  await settle(4);
  return mounted;
};

/* --------------------------------------------------------------------------- */
/* 1. The split controls are a WIDE-stage affordance                            */
/* --------------------------------------------------------------------------- */

test("a phone-sized stage keeps the bare switch: no split controls are offered", async () => {
  window.localStorage.clear();
  stageWidth = 420;
  const mounted = await mountDeck();

  await pressDivider(mainDivider());
  assert.equal(Boolean(swapEl(mainDivider())), true, "the switch is still there on a phone");
  assert.deepEqual(actionIds(mainDivider()), [], "…and no split control is");

  mounted.unmount();
  stageWidth = 1400;
});

test("a wide stage offers one split control per region beside the switch", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  await pressDivider(mainDivider());
  assert.equal(Boolean(swapEl(mainDivider())), true, "the switch is there");
  assert.deepEqual(actionIds(mainDivider()), ["split-lesson", "split-study"], "both sides can grow");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 2. "Left content area splits into one more part"                             */
/* --------------------------------------------------------------------------- */

test("splitting the lesson area adds a third part inside that region", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  assert.equal(regions().length, 0, "two panes at rest: no region is a pair");
  await useDivider(mainDivider(), "split-lesson");

  const region = window.document.querySelector('[data-course-region="lesson"]');
  assert.ok(region, "the lesson region became a pair");
  assert.equal(regions().length, 1, "exactly one region is split");
  assert.ok(lessonPane().contains(region), "…and it lives inside the lesson pane");
  assert.equal(extraNodes().length, 1, "the added part is on screen");
  assert.equal(extraNodes()[0].getAttribute("data-extra-node"), "lesson");
  assert.equal(extraNodes()[0].getAttribute("data-extra-tab"), "modules", "it opens on a real tab, never empty");
  assert.ok(nestedDivider(), "the added part has its own divider");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 3. …and the right side too, up to four parts                                 */
/* --------------------------------------------------------------------------- */

test("splitting the other region grows the deck to four parts", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  await useDivider(mainDivider(), "split-lesson");
  await useDivider(mainDivider(), "split-study");

  assert.deepEqual(regions().map((node) => node.getAttribute("data-course-region")), ["lesson", "study"]);
  assert.equal(extraNodes().length, 2, "both added parts are on screen");
  assert.equal(dividers().length, 3, "four parts, three dividers");
  // The main divider no longer offers a side that already has its part.
  await pressDivider(mainDivider());
  assert.deepEqual(actionIds(mainDivider()), [], "nothing left to split from the middle");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 4. EVERY divider carries swap + split-mode, as the owner asked               */
/* --------------------------------------------------------------------------- */

test("every divider offers the switch and the split-mode control", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  await useDivider(mainDivider(), "split-lesson");

  // The region's own divider: swap, merge, and the other side's split.
  assert.ok(nestedDivider(), "the region divider exists");
  await pressDivider(nestedDivider());
  assert.equal(Boolean(swapEl(nestedDivider())), true, "the region divider carries its own switch");
  assert.deepEqual(
    actionIds(nestedDivider()),
    ["merge-lesson", "split-study"],
    "…and its split-mode controls",
  );

  mounted.unmount();
});

test("merging takes the added part away and leaves the pair alone", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  await useDivider(mainDivider(), "split-lesson");
  assert.equal(extraNodes().length, 1);

  await useDivider(nestedDivider(), "merge-lesson");
  assert.equal(regions().length, 0, "the region is a single pane again");
  assert.equal(extraNodes().length, 0);
  assert.equal(dividers().length, 1, "back to the two-pane deck");
  assert.ok(lessonPane() && studyPane());

  mounted.unmount();
});

test("the region's switch trades its two parts and never remounts them", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  await useDivider(mainDivider(), "split-lesson");
  const region = window.document.querySelector('[data-course-region="lesson"]');
  const before = region.querySelector('[data-region-pane="primary"]');
  assert.equal(region.getAttribute("data-region-swapped"), "false");

  await pressDivider(nestedDivider());
  const button = swapEl(nestedDivider());
  assert.ok(button, "the region switch is revealed");
  await act(async () => {
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
  });
  await settle(8);

  const after = window.document.querySelector('[data-course-region="lesson"]');
  assert.equal(after.getAttribute("data-region-swapped"), "true", "the parts traded places");
  assert.equal(
    after.querySelector('[data-region-pane="primary"]'),
    before,
    "the lesson pane is the same DOM node — nothing was remounted",
  );

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 5. The extra part has a tab of its own                                       */
/* --------------------------------------------------------------------------- */

test("the added part can change its own tab without touching the main one", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  await useDivider(mainDivider(), "split-study");
  const extra = extraNodes()[0];
  assert.equal(extra.getAttribute("data-extra-tab"), "modules");

  await act(async () => {
    extra.querySelector("[data-extra-switch]").dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
  });
  await settle(8);

  assert.equal(extraNodes()[0].getAttribute("data-extra-tab"), "paid", "the part changed its own tab");
  assert.ok(window.document.querySelector("[data-fake-study]"), "the main study pane is untouched");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 6. Remembered per course + axis; a phone never invents a third part          */
/* --------------------------------------------------------------------------- */

test("the arrangement comes back with the course and stays per axis", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  let mounted = await mountDeck({ courseId: "course-a" });
  await useDivider(mainDivider(), "split-study");
  assert.equal(extraNodes().length, 1);
  mounted.unmount();

  // Same course: the added part is back.
  mounted = await mountDeck({ courseId: "course-a" });
  assert.equal(extraNodes().length, 1, "the extra part is remembered");
  mounted.unmount();

  // Another course starts on the plain two-pane deck.
  mounted = await mountDeck({ courseId: "course-b" });
  assert.equal(extraNodes().length, 0, "another course never inherits the layout");
  mounted.unmount();

  // The other axis has its own layout.
  mounted = await mountDeck({ courseId: "course-a", axis: "column" });
  assert.equal(extraNodes().length, 0, "the portrait axis keeps its own arrangement");
  mounted.unmount();
});

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});
