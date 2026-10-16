// tests/coursePlayerQuadFlexRuntime.test.mjs
//
// RUNTIME proof of the plus deck's FREE-BLOCKS upgrade (the owner's
// 2026-10-16+ brief), bundled with esbuild and driven in jsdom:
//
//   · every block starts on its WHITE blank picker page listing all the
//     course player's pages — solid blue/white rectangular buttons;
//   · the 2×2 shape is the DYNAMIC CROSS: four half-dividers (top, bottom,
//     left, right), each with its OWN drag position, plus the centre joint
//     ("screen ke center mein point") that drags all four together;
//   · a page the learner opens lives in that block; picking it elsewhere
//     MOVES it (one page, one block);
//   · every block carries the top-left Back button that walks ONE page back
//     at a time — it never jumps home;
//   · the cluster a dot opens still swaps, resets blocks to blank and picks
//     any grid shape.
//
// The pure rules (geometry, persistence, the back walk, the footer rule)
// are pinned in tests/quadFlexModel.test.mjs.

import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import QuadDeck from ${JSON.stringify(path.join(ROOT, "src/course/QuadDeck.tsx"))};
import { BLOCK_PAGES } from ${JSON.stringify(path.join(ROOT, "src/course/blockPages.ts"))};
import { QUAD_DEFAULT_STATE, quadPaneButtons, quadRows, quadSetBlockPage, quadSetFormat, quadTogglePane, quadSingleSplit } from ${JSON.stringify(path.join(ROOT, "src/course/quadLayout.ts"))};
import { resetPageHistory } from ${JSON.stringify(path.join(ROOT, "src/course/pageHistory.ts"))};

export const DEFAULT_VIEW = { zoom: 100, dividers: { vTop: true, vBottom: true, hLeft: true, hRight: true } };
export const flexState = (over = {}) => ({
  ...QUAD_DEFAULT_STATE,
  flex: { xTop: 50, xBottom: 50, yLeft: 50, yRight: 50 },
  pages: { c11: null, c12: null, c21: null, c22: null },
  focus: "c11",
  ...over,
});

export { act, BLOCK_PAGES, quadPaneButtons, quadRows, quadSetBlockPage, quadSetFormat, quadTogglePane, quadSingleSplit, resetPageHistory };

export function mountDeck(host, options = {}) {
  const root = createRoot(host);
  const api = { seen: [], state: options.state || flexState() };
  const view = options.view || DEFAULT_VIEW;

  function Harness() {
    const [state, setState] = React.useState(api.state);
    api.state = state;
    api.setState = (next) => act(() => setState(next));
    const onState = (next) => {
      api.seen.push(next);
      setState(next);
    };
    return React.createElement(QuadDeck, {
      state,
      onState,
      view,
      navSide: "header",
      player: React.createElement("div", { "data-fake": "player" }, "player"),
      notes: React.createElement("div", { "data-fake": "notes" }, "notes"),
      resources: React.createElement("div", { "data-fake": "resources" }, "resources"),
      mindmap: React.createElement("div", { "data-fake": "mindmap" }, "mindmap"),
      blocks: {
        catalog: BLOCK_PAGES,
        renderPage: (page, pane) =>
          React.createElement("div", { "data-fake-page": page, "data-fake-pane": pane }, page),
      },
    });
  }
  resetPageHistory();
  act(() => { root.render(React.createElement(Harness)); });
  api.unmount = () => act(() => root.unmount());
  return api;
}
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-quad-flex-runtime");

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
   all the drag mathematics reads. */
window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return {
    x: 0, y: 0, top: 0, left: 0, right: 1000, bottom: 800, width: 1000, height: 800,
    toJSON: () => ({}),
  };
};

const captured = new Map();
window.Element.prototype.setPointerCapture = function setPointerCapture(pointerId) {
  captured.set(pointerId, this);
};
window.Element.prototype.releasePointerCapture = function releasePointerCapture(pointerId) {
  if (captured.get(pointerId) === this) captured.delete(pointerId);
};
window.Element.prototype.hasPointerCapture = function hasPointerCapture(pointerId) {
  return captured.get(pointerId) === this;
};

const fixture = require(bundle);
const { act, flexState, BLOCK_PAGES } = fixture;

/* ── helpers ─────────────────────────────────────────────────────────────── */

const settle = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

let hostCount = 0;
const live = [];
beforeEach(() => {
  while (live.length) live.pop()();
});
after(() => {
  while (live.length) live.pop()();
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});

async function mount(options = {}) {
  hostCount += 1;
  const host = window.document.createElement("div");
  host.setAttribute("data-host", String(hostCount));
  window.document.body.appendChild(host);
  const api = fixture.mountDeck(host, options);
  await settle(20);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    try {
      api.unmount();
    } catch {
      // A half-mounted deck (a failing test) still must not block the next one.
    }
    host.remove();
  };
  live.push(finish);
  // `state` reads through: the harness swaps the object every commit, so a
  // spread copy would freeze the mount-time snapshot.
  return {
    ...api,
    get state() {
      return api.state;
    },
    host,
    done: finish,
  };
}

const query = (selector, scope) => (scope ?? window.document).querySelector(selector);
const queryAll = (selector, scope) => [...(scope ?? window.document).querySelectorAll(selector)];
const blockEl = (pane) => query(`[data-quad-free="${pane}"]`);
const armEl = (arm) => query(`[data-course-quad-flex-arm="${arm}"]`);
const jointHandle = () => query("[data-quad-joint-handle]");
const pickerFor = (pane) => query(`[data-course-block-picker="${pane}"]`);
const pickButton = (pane, page) =>
  query(`[data-course-block-picker="${pane}"] [data-course-block-picker-page="${page}"]`);
const backFor = (pane) => query(`[data-course-page-back][data-surface="${pane}"]`);

const click = async (element, label = "the element to press") => {
  assert.equal(Boolean(element), true, `${label} exists`);
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await settle(260);
};

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

const fireAt = async (element, type, x, y, pointerId = 11) => {
  await act(async () => {
    element.dispatchEvent(pointerEvent(type, x, y, pointerId));
  });
};

/** Drag a strip from one point to another, capture-faithful. */
const dragTo = async (element, from, to, pointerId = 11) => {
  assert.equal(Boolean(element), true, "the strip is on screen");
  await fireAt(element, "pointerdown", from[0], from[1], pointerId);
  const owner = captured.get(pointerId) ?? element;
  await fireAt(owner, "pointermove", to[0], to[1], pointerId);
  await fireAt(owner, "pointerup", to[0], to[1], pointerId);
  await settle(10);
};

const keyDown = async (element, key) => {
  await act(async () => {
    element.dispatchEvent(
      new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
  await settle(20);
};

const outsideClick = async () => {
  await act(async () => {
    window.document.body.dispatchEvent(pointerEvent("pointerdown", 5, 5, 99));
  });
  await settle(300);
};

/* ── 1 · the blank starter pages ───────────────────────────────────────── */

test("every block starts on its white blank picker listing all the course player pages", async () => {
  const deck = await mount();
  try {
    for (const pane of ["c11", "c12", "c21", "c22"]) {
      const picker = pickerFor(pane);
      assert.equal(Boolean(picker), true, `block ${pane} shows its blank page`);
      const buttons = queryAll("[data-course-block-picker-page]", picker);
      assert.equal(buttons.length, BLOCK_PAGES.length, `block ${pane} lists every page`);
    }
    // The owner's starter-page design pins: white page, solid blue/white
    // rectangular buttons (the CSS carries the colors; the markup carries the
    // rectangular buttons and the page identity).
    assert.equal(Boolean(query(".dc-block-picker")), true);
    assert.equal(Boolean(query(".dc-block-picker__button")), true);
    // And nothing opened yet: every block is on "blank".
    assert.equal(queryAll("[data-fake-page]").length, 0);
    assert.equal(query("[data-quad-free=\"c11\"]").getAttribute("data-quad-free-page"), "blank");
  } finally {
    deck.done();
  }
});

/* ── 2 · the dynamic cross ─────────────────────────────────────────────── */

test("the 2×2 shape is the dynamic cross: four arms and the centre joint, never the old two dividers", async () => {
  const deck = await mount();
  try {
    for (const arm of ["top", "bottom", "left", "right"]) {
      assert.equal(Boolean(armEl(arm)), true, `the ${arm} arm is on screen`);
    }
    assert.equal(Boolean(jointHandle()), true, "the centre joint is on screen");
    // The cross replaces the grid dividers entirely on this shape.
    assert.equal(queryAll("[data-course-quad-divider]").length, 0);
    // Equal positions: the joint reads as the owner's single centre point.
    assert.equal(query("[data-course-quad-flex-joint]").getAttribute("data-quad-joint-size"), "point");
  } finally {
    deck.done();
  }
});

test("each arm drags on its OWN position — one drag, one value", async () => {
  const deck = await mount();
  try {
    // The top arm is the xTop line: drag it left 100px of a 1000px deck = 10%.
    await dragTo(armEl("top"), [500, 100], [400, 100]);
    const settled = deck.seen[deck.seen.length - 1];
    assert.equal(Math.round(settled.flex.xTop), 40);
    assert.equal(settled.flex.xBottom, 50, "the bottom arm did not move");
    assert.equal(settled.flex.yLeft, 50, "the left arm did not move");
    assert.equal(settled.flex.yRight, 50, "the right arm did not move");
    // The right arm is a y line: 120px down of an 800px deck = 15%.
    await dragTo(armEl("right"), [800, 400], [800, 520], 12);
    const next = deck.seen[deck.seen.length - 1];
    assert.equal(Math.round(next.flex.yRight), 65);
    assert.equal(Math.round(next.flex.xTop), 40, "the earlier drag survives");
  } finally {
    deck.done();
  }
});

test("dragging the centre joint resizes all four together", async () => {
  const deck = await mount();
  try {
    await dragTo(jointHandle(), [500, 400], [450, 460]);
    const settled = deck.seen[deck.seen.length - 1];
    // dx = -50px = -5%, dy = +60px = +7.5% → every arm travels together.
    assert.equal(Math.round(settled.flex.xTop), 45);
    assert.equal(Math.round(settled.flex.xBottom), 45);
    assert.equal(Math.round(settled.flex.yLeft), 58);
    assert.equal(Math.round(settled.flex.yRight), 58);
    // Once the arms diverge, the joint becomes a real zone to grab.
    await dragTo(armEl("bottom"), [500, 600], [700, 600], 13);
    assert.equal(query("[data-course-quad-flex-joint]").getAttribute("data-quad-joint-size"), "open");
  } finally {
    deck.done();
  }
});

test("arrow keys step one arm, Enter opens its cluster, Escape closes it", async () => {
  const deck = await mount();
  try {
    const left = armEl("left");
    left.focus?.();
    await keyDown(left, "ArrowUp");
    let settled = deck.seen[deck.seen.length - 1];
    assert.equal(Math.round(settled.flex.yLeft), 48);
    assert.equal(settled.flex.yRight, 50);
    // Enter opens the cluster on that arm's dot.
    await keyDown(left, "Enter");
    assert.equal(Boolean(query("[data-course-quad-menu]")), true);
    assert.equal(query("[data-course-quad-menu]").getAttribute("data-quad-menu-divider"), "flex");
    await keyDown(window.document, "Escape");
    await settle(300);
    assert.equal(Boolean(query("[data-course-quad-menu]")), false);
    // The joint walks every arm at once.
    await keyDown(jointHandle(), "ArrowRight");
    settled = deck.seen[deck.seen.length - 1];
    assert.equal(Math.round(settled.flex.xTop), 52);
    assert.equal(Math.round(settled.flex.xBottom), 52);
  } finally {
    deck.done();
  }
});

test("a dot opens the cluster, an outside click closes it, a swap presses and closes", async () => {
  const deck = await mount();
  try {
    await click(query('[data-course-quad-flex-arm="top"] [data-course-quad-dot]'), "the top arm's dot");
    assert.equal(Boolean(query("[data-course-quad-menu]")), true);
    await outsideClick();
    assert.equal(Boolean(query("[data-course-quad-menu]")), false);
    // The swap mirrors the arms and trades the blocks' pages — then closes.
    await click(query('[data-course-quad-flex-arm="top"] [data-course-quad-dot]'), "the top arm's dot");
    await click(query('[data-quad-swap="cols"]'), "the swap button");
    assert.equal(Boolean(query("[data-course-quad-menu]")), false);
    const settled = deck.seen[deck.seen.length - 1];
    assert.equal(settled.swappedCols, false, "the grid's mirror flags stay for the grid shapes");
  } finally {
    deck.done();
  }
});

/* ── 3 · free pages in free blocks ─────────────────────────────────────── */

test("a picker press opens that page in its block — and it stays while the block browses", async () => {
  const deck = await mount();
  try {
    await click(pickButton("c11", "lesson"), "the Lesson button");
    assert.equal(Boolean(pickerFor("c11")), false, "the blank page steps aside");
    assert.equal(Boolean(query('[data-quad-free="c11"] [data-fake-page="lesson"]')), true);
    // The header's Pages button (it lives OUTSIDE the deck) takes the block
    // back to its full page list by clearing the block's page — the exact
    // call openActiveBlockPicker makes in CoursePlayerApp.
    deck.setState(fixture.quadSetBlockPage(deck.state, "c11", null));
    await settle(20);
    assert.equal(Boolean(pickerFor("c11")), true, "the blank page's list is back");
    await click(pickButton("c11", "music"), "the Music button");
    // …and the first page STAYS MOUNTED behind it (a playing video never
    // loses its place to a page switch).
    assert.equal(Boolean(query('[data-quad-free="c11"] [data-fake-page="music"]')), true);
    assert.equal(Boolean(query('[data-quad-free="c11"] [data-fake-page="lesson"]')), true, "lesson stays mounted, hidden");
    assert.equal(query('[data-quad-free="c11"] [data-fake-page="lesson"]').closest("[data-quad-free-layer]").hidden, true);
    // Another block keeps its own page untouched.
    await click(pickButton("c12", "notes"), "the Notes button in c12");
    assert.equal(Boolean(query('[data-quad-free="c12"] [data-fake-page="notes"]')), true);
    assert.equal(Boolean(query('[data-quad-free="c11"] [data-fake-page="music"]')), true, "c11 keeps its page");
  } finally {
    deck.done();
  }
});

test("a page picked in another block MOVES there — one page, one block", async () => {
  const deck = await mount();
  try {
    await click(pickButton("c21", "mindmap"), "the Mind map button in c21");
    assert.equal(Boolean(query('[data-quad-free="c21"] [data-fake-page="mindmap"]')), true);
    // The same page picked in c22: it moves, c21 goes back to its blank page.
    await click(pickButton("c22", "mindmap"), "the Mind map button in c22");
    assert.equal(Boolean(query('[data-quad-free="c22"] [data-fake-page="mindmap"]')), true);
    assert.equal(Boolean(pickerFor("c21")), true, "c21 is back on its blank page");
  } finally {
    deck.done();
  }
});

/* ── 4 · the active block (the old Back button and switch are gone) ────── */

test("no block carries the old Back button or Pages switch — a press marks the block ACTIVE instead", async () => {
  // The owner's 2026-10-16+ revision: "vah back universal button remove kar
  // dun kyunki donon ka ek hi function tha". The header's Pages button is the
  // one replacement, and it acts on the block the learner touched LAST.
  const deck = await mount();
  try {
    assert.equal(backFor("c11"), null, "the universal Back button is gone");
    assert.equal(query("[data-course-page-back]"), null, "…from every block");
    assert.equal(query("[data-course-block-switch]"), null, "and the per-block Pages switch with it");
    // A press inside a block records it as the active one — the state the
    // header's Pages button reads to open the right selection page.
    assert.equal(deck.state.focus, "c11");
    await act(async () => {
      blockEl("c12").dispatchEvent(pointerEvent("pointerdown", 600, 100, 44));
    });
    await settle(50);
    assert.equal(deck.state.focus, "c12", "the pressed block becomes the active one");
    await act(async () => {
      blockEl("c21").dispatchEvent(pointerEvent("pointerdown", 100, 600, 45));
    });
    await settle(50);
    assert.equal(deck.state.focus, "c21", "every press moves the mark along");
  } finally {
    deck.done();
  }
});

/* ── 5 · the cluster's blocks + shapes on the cross ────────────────────── */

test("the cluster's block buttons put a block back on its blank page, and shapes still switch", async () => {
  const deck = await mount();
  try {
    await click(pickButton("c22", "music"), "the Music button");
    assert.equal(Boolean(query('[data-quad-free="c22"] [data-fake-page="music"]')), true);
    await click(query('[data-course-quad-flex-arm="left"] [data-course-quad-dot]'), "the left arm's dot");
    await click(query('[data-quad-pane-button="c22"]'), "the c22 button");
    assert.equal(Boolean(pickerFor("c22")), true, "c22 is back on its blank page");
    // A grid shape still rearranges the deck.
    await click(query('[data-course-quad-flex-arm="top"] [data-course-quad-dot]'), "the top arm's dot");
    await click(query('[data-quad-format="pair"]'), "the single-divider shape");
    assert.equal(deck.state.format, "pair");
    // …and the deck keeps rendering its blocks there too (free pages follow).
    assert.equal(Boolean(query('[data-quad-pane="c11"]')), true);
    assert.equal(Boolean(query('[data-quad-pane="c21"]')), true);
  } finally {
    deck.done();
  }
});
