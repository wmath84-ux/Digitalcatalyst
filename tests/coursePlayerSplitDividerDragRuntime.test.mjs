// tests/coursePlayerSplitDividerDragRuntime.test.mjs
//
// Runtime proof that EVERY divider of the shared split deck drags — the
// main divider and both nested ones, in both axes — under
// BROWSER-FAITHFUL pointer capture.
//
// Why this suite exists: the older split suites stub setPointerCapture as
// a no-op and dispatch move/up straight onto the divider. In a real
// browser, pointer capture RETARGETS every move/up to the element that
// took capture — so when the nested region captured on its CONTAINER
// while the handlers lived on the child divider, nested drags (and the
// tap that reveals the nested toolbar) silently did nothing, and no test
// could see it. Here capture really reroutes: after pointerdown, all
// further events go to the captured element, exactly like a browser.
//
// Covered: main + nested drags (both regions, both axes), gesture
// direction, drag independence (one divider never moves another's
// ratio), tap-vs-drag, cancel-restore, the 15–85 nested band, keyboard
// resizing, the glass toolbar's size, the parked-edge placement, Work
// Mode's full-range configuration, and per-course persistence.

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

export function mountDeck(host, options = {}) {
  const axis = options.axis || "row";
  const root = createRoot(host);
  const renderExtraPane = (region, tab) => (
    React.createElement("div", { "data-extra-node": region, "data-extra-tab": tab }, tab)
  );
  const props = {
    axis,
    orientation: axis === "row" ? "landscape" : "portrait",
    courseId: options.courseId || "course-drag",
    accent: "#FFBE0B",
    lesson: React.createElement("div", { "data-fake-lesson": "" }),
    study: React.createElement("div", { "data-fake-study": "" }),
  };
  if (!options.work) {
    props.renderExtraPane = renderExtraPane;
    props.extraPaneTab = () => "modules";
  } else {
    props.restRatio = 100;
    props.fullRange = true;
    props.railAtEdge = false;
  }
  act(() => { root.render(React.createElement(SplitDeck, props)); });
  return { unmount: () => act(() => root.unmount()) };
}

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-split-divider-drag-runtime");

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

/* jsdom has no layout: every box reads as 1000×800 at the origin, which is
 * all the drag mathematics reads. */
window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return {
    x: 0, y: 0, top: 0, left: 0, right: 1000, bottom: 800, width: 1000, height: 800,
    toJSON: () => ({}),
  };
};

/* Pointer capture, emulated the way a browser behaves: the element that
 * takes capture receives every later move/up/cancel for that pointer. */
const captured = new Map();
const captureLog = [];
window.Element.prototype.setPointerCapture = function setPointerCapture(pointerId) {
  captured.set(pointerId, this);
  captureLog.push(this);
};
window.Element.prototype.releasePointerCapture = function releasePointerCapture(pointerId) {
  if (captured.get(pointerId) === this) captured.delete(pointerId);
};
window.Element.prototype.hasPointerCapture = function hasPointerCapture(pointerId) {
  return captured.get(pointerId) === this;
};

/* The deck measures itself (clientWidth) to decide whether split controls
 * belong on the stage — jsdom lays nothing out, so hand the width in. */
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
const nestedDivider = (regionName) =>
  regionEl(regionName)?.querySelector('[data-course-split-divider][data-divider-kind="nested"]') ?? null;
const regionEl = (regionName) =>
  window.document.querySelector(`[data-course-region="${regionName}"][data-region-split="on"]`);
const paneIn = (scope, kind) => scope.querySelector(`[data-region-pane="${kind}"]`);
const lessonPane = () => window.document.querySelector("[data-course-lesson-pane]");
const studyPane = () => window.document.querySelector("[data-course-study-pane]");
const swapEl = (scope) => (scope ?? window.document).querySelector("[data-course-split-swap]");
const ratioKey = (courseId, axis) => `dc.splitDeck.ratio.v1:${courseId}:${axis}`;
const extrasKey = (courseId, axis) => `dc.splitDeck.extras.v1:${courseId}:${axis}`;
const storedRatio = (courseId = "course-drag", axis = "row") =>
  window.localStorage.getItem(ratioKey(courseId, axis));
const storedExtras = (courseId = "course-drag", axis = "row") => {
  const raw = window.localStorage.getItem(extrasKey(courseId, axis));
  return raw ? JSON.parse(raw) : {};
};
const share = (element) => Number.parseFloat(element.style.flexGrow);

const pointerEvent = (type, x, y, pointerId) =>
  new window.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId,
    isPrimary: true,
    button: 0,
    buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
  });

const fireAt = async (element, type, x, y, pointerId = 7) => {
  await act(async () => {
    element.dispatchEvent(pointerEvent(type, x, y, pointerId));
  });
};

/**
 * A browser-faithful gesture: the press lands on the divider; every later
 * event goes to whichever element CAPTURED the pointer (retargeting),
 * never assumed to be the divider itself.
 */
const gesture = async (element, { from, moves = [], end = "up", pointerId = 7 } = {}) => {
  assert.ok(element, "the divider is on screen");
  await fireAt(element, "pointerdown", from[0], from[1], pointerId);
  const captureOwner = captured.get(pointerId) ?? null;
  const target = captureOwner ?? element;
  for (const [x, y] of moves) {
    await fireAt(target, "pointermove", x, y, pointerId);
    await settle(2);
  }
  const last = moves.length ? moves[moves.length - 1] : from;
  await fireAt(target, end === "cancel" ? "pointercancel" : "pointerup", last[0], last[1], pointerId);
  captured.delete(pointerId);
  await settle(360);
  return captureOwner;
};

/** A tap: press and release in place (reveals the divider's toolbar). */
const tap = (element, at = [500, 400]) => gesture(element, { from: at });

const dragTo = (element, from, to, options = {}) =>
  gesture(element, { from, moves: [to], ...options });

const clickAction = async (id, scope) => {
  const button = (scope ?? window.document).querySelector(`[data-course-split-action="${id}"]`);
  assert.ok(button, `the "${id}" control is on screen`);
  await act(async () => {
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
  });
  await settle(360);
};

/** Press one of the divider's controls the way a person would: tap the
 *  line first only if the toolbar is not already revealed there. */
const useDivider = async (element, id) => {
  if (!element.querySelector(`[data-course-split-action="${id}"]`)) await tap(element);
  await clickAction(id, element);
  await settle(120);
};

const mountDeck = async (options = {}) => {
  window.document.body.innerHTML = '<div id="deck"></div>';
  const mounted = fixture.mountDeck(window.document.getElementById("deck"), options);
  await settle(520); // the entry spring lands
  return mounted;
};

/* --------------------------------------------------------------------------- */
/* 1. The main divider drags and persists (row axis)                           */
/* --------------------------------------------------------------------------- */

test("the main divider drags in the row axis and persists its ratio", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  await dragTo(mainDivider(), [550, 400], [300, 400]);
  assert.equal(storedRatio(), "70", "the settled study share reached storage");
  assert.ok(Math.abs(share(studyPane()) - 70) < 0.6, "the study pane wears the dragged share");
  assert.ok(Math.abs(share(lessonPane()) - 30) < 0.6, "the lesson pane takes the rest");
  assert.equal(mainDivider().getAttribute("aria-valuenow"), "30", "the slider reads the first pane's share");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 2. The nested divider drags — capture on the DIVIDER, percent oriented      */
/* --------------------------------------------------------------------------- */

test("the nested divider drags with capture on the divider itself and persists its percent", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  await useDivider(mainDivider(), "split-lesson");
  const lessonRegion = regionEl("lesson");
  assert.ok(lessonRegion, "the lesson region is split");
  assert.equal(storedExtras().lesson.percent, 40, "the added part opened at the entry share");

  captureLog.length = 0;
  const captureOwner = await dragTo(nestedDivider("lesson"), [600, 400], [700, 400]);
  assert.equal(captureOwner, nestedDivider("lesson"), "capture belongs to the divider, never a container");
  assert.equal(storedExtras().lesson.percent, 30, "the pair settled where the finger left it (added pane shrank)");
  assert.ok(Math.abs(share(paneIn(lessonRegion, "extra")) - 30) < 0.6, "the added pane wears 30");
  assert.ok(Math.abs(share(paneIn(lessonRegion, "primary")) - 70) < 0.6, "the primary wears the rest");
  assert.equal(nestedDivider("lesson").getAttribute("aria-valuenow"), "70", "the nested slider reads the primary's share");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 3. Dividers are independent                                                 */
/* --------------------------------------------------------------------------- */

test("dragging one divider never moves another divider's ratio", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  await useDivider(mainDivider(), "split-lesson");
  await useDivider(mainDivider(), "split-study");
  assert.equal(dividers().length, 3, "four parts, three dividers");

  await dragTo(mainDivider(), [550, 400], [300, 400]); // main → 70
  await dragTo(nestedDivider("lesson"), [600, 400], [700, 400]); // lesson pair → 30
  await dragTo(nestedDivider("study"), [600, 400], [400, 400]); // study pair → 60

  assert.equal(storedRatio(), "70", "the main split kept its own drag");
  assert.equal(storedExtras().lesson.percent, 30, "the lesson pair kept its own drag");
  assert.equal(storedExtras().study.percent, 60, "the study pair kept its own drag");
  assert.ok(Math.abs(share(paneIn(regionEl("study"), "extra")) - 60) < 0.6, "the study pair wears 60");

  // …and re-dragging the main divider leaves both nested pairs untouched.
  await dragTo(mainDivider(), [300, 400], [500, 400]); // main → 50
  assert.equal(storedRatio(), "50", "the main divider still drags");
  assert.equal(storedExtras().lesson.percent, 30, "the lesson pair did not move");
  assert.equal(storedExtras().study.percent, 60, "the study pair did not move");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 4. Tap ≠ drag on the nested divider                                         */
/* --------------------------------------------------------------------------- */

test("a tap reveals the nested toolbar without resizing; a drag never reveals it", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  await useDivider(mainDivider(), "split-study");
  assert.equal(storedExtras().study.percent, 40, "the added part opened at 40");

  // A drag first: the pair moves, the toolbar stays away.
  await dragTo(nestedDivider("study"), [600, 400], [500, 400]); // → 50
  assert.equal(storedExtras().study.percent, 50, "the drag resized the pair");
  assert.equal(Boolean(swapEl(nestedDivider("study"))), false, "a drag never opens the toolbar");

  // A tap: the toolbar opens and the pair does not move.
  await tap(nestedDivider("study"), [500, 400]);
  assert.equal(Boolean(swapEl(nestedDivider("study"))), true, "the tap opened the toolbar");
  assert.equal(storedExtras().study.percent, 50, "the tap changed no ratio");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 5. Cancel restores the pre-drag share and commits nothing                   */
/* --------------------------------------------------------------------------- */

test("pointer cancel restores the pre-drag share and commits nothing", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  await useDivider(mainDivider(), "split-lesson");
  assert.equal(storedExtras().lesson.percent, 40, "the pair starts at 40");

  await gesture(nestedDivider("lesson"), { from: [600, 400], moves: [[900, 400]], end: "cancel" });
  assert.equal(storedExtras().lesson.percent, 40, "cancel wrote nothing new");
  assert.ok(
    Math.abs(share(paneIn(regionEl("lesson"), "extra")) - 40) < 0.6,
    "the visible share returns to where the press began",
  );
  assert.equal(nestedDivider("lesson").getAttribute("data-dragging"), "false", "the drag state is cleaned up");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 6. The nested band holds at both ends                                       */
/* --------------------------------------------------------------------------- */

test("the nested drag respects the 15–85 band at both ends", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  await useDivider(mainDivider(), "split-lesson");

  await dragTo(nestedDivider("lesson"), [600, 400], [990, 400]);
  assert.equal(storedExtras().lesson.percent, 15, "the added pane keeps its floor");
  await dragTo(nestedDivider("lesson"), [990, 400], [10, 400]);
  assert.equal(storedExtras().lesson.percent, 85, "the added pane keeps its cap");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 7. Column axis: main and nested drags read the pointer vertically           */
/* --------------------------------------------------------------------------- */

test("in the column axis the main and nested dividers drag vertically", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck({ axis: "column", courseId: "course-column" });

  await dragTo(mainDivider(), [500, 440], [500, 240]);
  assert.equal(storedRatio("course-column", "column"), "70", "the main divider followed the finger up");

  await useDivider(mainDivider(), "split-lesson");
  await dragTo(nestedDivider("lesson"), [500, 400], [500, 600]);
  assert.equal(
    storedExtras("course-column", "column").lesson.percent,
    25,
    "the nested divider followed the finger down (added pane shrank)",
  );

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 8. Keyboard resizing still works on both divider kinds                      */
/* --------------------------------------------------------------------------- */

test("the keyboard resizes both divider kinds and persists", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  await useDivider(mainDivider(), "split-lesson");
  assert.equal(storedExtras().lesson.percent, 40, "the pair starts at 40");

  const key = async (element, name) => {
    await act(async () => {
      element.focus();
      element.dispatchEvent(new window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
    });
    await settle(60);
  };

  await key(nestedDivider("lesson"), "ArrowRight");
  assert.equal(storedExtras().lesson.percent, 45, "an arrow key steps the nested pair");
  await key(nestedDivider("lesson"), "End");
  assert.equal(storedExtras().lesson.percent, 85, "End takes the pair to its cap");

  const before = Number(storedRatio());
  await key(mainDivider(), "ArrowDown");
  assert.equal(Math.abs(Number(storedRatio()) - before), 5, "an arrow key steps the main split by 5");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 9. The redesigned toolbar: glass pill, real targets, no glow                */
/* --------------------------------------------------------------------------- */

test("the divider toolbar is one glass pill of 36px buttons with 16px icons", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  await tap(mainDivider());
  const button = swapEl(mainDivider());
  assert.ok(button, "the tap revealed the toolbar");
  assert.equal(button.style.width, "36px", "the button is a 36px target");
  assert.equal(button.style.height, "36px", "…in both dimensions");
  const icon = button.querySelector("svg");
  assert.ok(icon, "the button carries an icon");
  assert.equal(icon.getAttribute("width"), "16", "the icon is 16px");
  assert.match(button.getAttribute("aria-label") || "", /swap/i, "the button keeps its accessible name");

  const pill = mainDivider().querySelector("[data-course-split-cluster]");
  assert.ok(pill, "the toolbar is one pill");
  assert.match(pill.className, /rounded-full/, "the pill is rounded");
  assert.doesNotMatch(pill.className, /flex-col/, "the pill is a horizontal row even on a vertical divider");
  assert.match(pill.getAttribute("style") || "", /--dc-chrome-glass/, "the pill wears the chrome glass");
  assert.notEqual(button.style.color, "rgb(255, 190, 11)", "no yellow-on-dark chip styling survives");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 10. Work Mode: full range, parked rest, no peek rail, own storage           */
/* --------------------------------------------------------------------------- */

test("Work Mode keeps full-range parking with no peek rail and its own storage", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck({ courseId: "work", work: true });

  assert.equal(window.document.querySelector("[data-course-peek-rail]"), null, "Work has no peek rails");
  assert.ok(Math.abs(share(studyPane()) - 100) < 0.6, "the deck rests parked at the top (100)");

  // At the parked edge the revealed toolbar steps INSIDE the deck. (The
  // tap lands at the parked line itself — the deck's left edge.)
  await tap(mainDivider(), [8, 400]);
  const button = swapEl(mainDivider());
  assert.ok(button, "the parked divider still wakes its toolbar");
  const shell = button.closest("span")?.parentElement;
  assert.match(shell?.getAttribute("style") || "", /translate\(calc\(50% \+ 8px\), -50%\)/, "the pill sits inside, never clipped by the edge");

  await dragTo(mainDivider(), [990, 400], [600, 400]);
  assert.equal(storedRatio("work"), "40", "Work's drag persists under its own id, full-range");
  assert.equal(window.localStorage.getItem(ratioKey("course-drag", "row")), null, "no other surface's storage was touched");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 11. Persistence is per-course: nothing is inherited across surfaces         */
/* --------------------------------------------------------------------------- */

test("a dragged ratio belongs to its course alone", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const first = await mountDeck({ courseId: "course-a" });
  await dragTo(mainDivider(), [550, 400], [300, 400]);
  assert.equal(storedRatio("course-a"), "70", "course-a saved 70");
  first.unmount();

  const second = await mountDeck({ courseId: "course-b" });
  assert.equal(mainDivider().getAttribute("aria-valuenow"), "55", "course-b starts at the default (study 45), untouched");
  assert.equal(storedRatio("course-b"), null, "mounting wrote nothing for course-b");
  second.unmount();

  const back = await mountDeck({ courseId: "course-a" });
  assert.equal(mainDivider().getAttribute("aria-valuenow"), "30", "course-a restores its own 70 (study share)");
  back.unmount();
});

/* --------------------------------------------------------------------------- */
/* 12. The collapsed edge: a clean gap with ONE small icon (no white strip)     */
/* --------------------------------------------------------------------------- */

/** Press a plain button the way a person would. */
const clickEl = async (element) => {
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
  });
  await settle(420);
};

test("dragging to an edge leaves a clean gap, a thin white strip, one small icon — press restores the previous size", async () => {
  window.localStorage.clear();
  stageWidth = 1400;
  const mounted = await mountDeck();

  // A roomy split first: study 60 / lesson 40.
  await dragTo(mainDivider(), [500, 400], [400, 400]);
  const previous = share(lessonPane());
  assert.ok(Math.abs(previous - 40) < 0.8, `expected a 40% lesson pane, got ${previous}`);

  // Drag it to the far edge → the study pane compresses into the gap.
  await dragTo(mainDivider(), [600, 400], [980, 400]);
  await settle(620);
  const rail = window.document.querySelector('[data-course-peek-rail][data-peek-side="study"]');
  assert.ok(rail, "the collapsed pane leaves its seam");

  // 1 · The rail element itself stays unpainted (a plate across the whole gap
  // is what the owner rejected) — but the THIN white strip is back, as its own
  // 6px child running the gap's whole length, between the two panes.
  assert.equal(rail.style.background, "", "the rail element carries no plate");
  assert.equal(rail.style.boxShadow, "");
  assert.equal(rail.style.backdropFilter, "");
  const strips = rail.querySelectorAll("[data-peek-strip]");
  assert.equal(strips.length, 1, "exactly ONE thin strip in the gap");
  const strip = strips[0];
  assert.equal(strip.style.width, "6px", "a THIN strip — 6px, never the 28px plate");
  assert.equal(strip.style.top, "0px");
  assert.equal(strip.style.bottom, "0px");
  assert.equal(strip.style.left, "50%");
  assert.notEqual(strip.style.background, "", "the strip carries the frosted glass");
  assert.notEqual(strip.style.boxShadow, "", "…and the same rim the rest of the chrome wears");
  // The small icon sits ON the strip: it comes after it in the DOM and carries
  // its own z-index, so the strip shows above and below the icon.
  assert.equal(strip.compareDocumentPosition(rail.querySelector("[data-course-peek-icon]")) & 4, 4, "the icon is drawn after the strip");
  // 2 · The gap shows ONE small icon, centred in it.
  assert.equal(rail.className.includes("items-center"), true, "the icon is centred on the cross axis");
  assert.equal(rail.className.includes("justify-center"), true, "the icon is centred along the seam");
  const icons = rail.querySelectorAll("[data-course-peek-icon]");
  assert.equal(icons.length, 1, "exactly one small icon in the gap");
  assert.ok(Number.parseFloat(icons[0].style.width) <= 26, `a SMALL icon, got ${icons[0].style.width}`);
  // The accent hairline still marks the edge the divider used to sit on.
  assert.ok(rail.querySelector("[data-peek-glow]"), "the accent hairline stays");

  // 3 · One press and the pane is back at its PREVIOUS size — not a default.
  await clickEl(rail);
  assert.equal(window.document.querySelector("[data-course-peek-rail]"), null, "the pane is open again");
  const restored = share(lessonPane());
  assert.ok(Math.abs(restored - previous) < 1.5, `back to the previous ${previous}%, got ${restored}`);

  mounted.unmount();
});

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});
