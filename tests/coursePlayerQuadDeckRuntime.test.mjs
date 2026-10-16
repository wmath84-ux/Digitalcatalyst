// tests/coursePlayerQuadDeckRuntime.test.mjs
//
// RUNTIME proof of the owner's plus deck (2026-10-16 brief), bundled with
// esbuild and driven in jsdom — no browser needed:
//
//   · the whole area is FOUR blocks in a `+` (one vertical + one horizontal
//     divider, never four dividers), with the owner's own mapping:
//     c11 = player, c12 = notes, c21 = resource library, c22 = mind map;
//   · BOTH dividers always drag (the drag writes the ratio straight to the
//     deck's CSS variables and reports the settled value upward);
//   · every divider draws TWO half segments, each with a dot at its exact
//     centre — four dots on the cross, the owner's "click exactly at the
//     center of the segment";
//   · a dot opens ONE cluster: two swaps, the four c11/c12/c21/c22 blocks
//     (a closed block reads "c22+") and every grid shape, scrollable;
//   · outside click closes it, and so does pressing a swap / block / shape;
//   · the grid shapes rearrange the blocks exactly as named;
//   · the Course view settings reach the deck (zoom + the four segment
//     switches) — and a hidden segment still drags.
//
// The pure model (quadLayout.ts) and the navigation's placement rule
// (footerNavigationPlacement.ts) are asserted in the same bundle, because the
// deck's rules are only as good as the model behind them.

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
import {
  QUAD_FORMAT_ORDER,
  QUAD_FORMATS,
  QUAD_MIN_SCREEN_PX,
  QUAD_MEDIA_QUERY,
  clampQuadCol,
  clampQuadRow,
  loadQuadLayout,
  quadPaneButtons,
  quadRows,
  quadSetFormat,
  quadTogglePane,
  saveQuadLayout,
} from ${JSON.stringify(path.join(ROOT, "src/course/quadLayout.ts"))};
import {
  FOOTER_NAVIGATION_HEIGHT_PX,
  FOOTER_NAVIGATION_PLACEMENT_MEDIA_QUERY,
  FOOTER_NAVIGATION_SIZE_STEP_PX,
  footerNavigationMenuSide,
  footerNavigationSizeVars,
  getFooterNavigationPlacement,
  setFooterNavigationPlacement,
} from ${JSON.stringify(path.join(ROOT, "src/utils/footerNavigationPlacement.ts"))};

const DEFAULT_STATE = { format: "quad", closed: [], col: 50, row: 50, swappedCols: false, swappedRows: false };
const DEFAULT_VIEW = { zoom: 100, dividers: { vTop: true, vBottom: true, hLeft: true, hRight: true } };

export const baseState = () => ({ ...DEFAULT_STATE, dividers: undefined });
export { QUAD_FORMAT_ORDER, QUAD_FORMATS, QUAD_MIN_SCREEN_PX, QUAD_MEDIA_QUERY, clampQuadCol, clampQuadRow,
  loadQuadLayout, quadPaneButtons, quadRows, quadSetFormat, quadTogglePane, saveQuadLayout,
  FOOTER_NAVIGATION_HEIGHT_PX, FOOTER_NAVIGATION_PLACEMENT_MEDIA_QUERY, FOOTER_NAVIGATION_SIZE_STEP_PX,
  footerNavigationMenuSide, footerNavigationSizeVars, getFooterNavigationPlacement, setFooterNavigationPlacement };

export function mountDeck(host, options = {}) {
  const root = createRoot(host);
  const api = { seen: [], state: { ...DEFAULT_STATE, ...(options.state || {}) } };
  const view = options.view || DEFAULT_VIEW;
  const panes = {
    player: React.createElement("div", { "data-fake": "player" }, "player"),
    notes: React.createElement("div", { "data-fake": "notes" }, "notes"),
    resources: React.createElement("div", { "data-fake": "resources" }, "resources"),
    mindmap: React.createElement("div", { "data-fake": "mindmap" }, "mindmap"),
  };
  if (options.study) panes.study = React.createElement("div", { "data-fake": "study" }, "study");
  if (options.resourcesFooter) panes.resourcesFooter = React.createElement("div", { "data-fake": "nav" }, "nav");

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
      view: options.view || DEFAULT_VIEW,
      navSide: options.navSide || "header",
      reveal: options.reveal || null,
      ...panes,
    });
  }
  act(() => { root.render(React.createElement(Harness)); });
  api.unmount = () => act(() => root.unmount());
  return api;
}

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-quad-deck-runtime");

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

/* jsdom has no layout: every box reads as 1000×800 at the origin, which is all
 * the drag mathematics reads. */
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
const { act, baseState } = fixture;

/* ── helpers ─────────────────────────────────────────────────────────────── */

const settle = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

let hostCount = 0;
/** Every mounted deck, so a failing test can never leak one into the next. */
const live = [];

/*
 * Every query in this file reads the whole document, so one leftover deck
 * would answer the next test's question. Each test ends with `done()`, and this
 * belt-and-braces pass clears anything a FAILED test left behind.
 */
beforeEach(() => {
  while (live.length) live.pop()();
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
  return { ...api, host, done: finish };
}

const query = (selector, scope) => (scope ?? window.document).querySelector(selector);
const queryAll = (selector, scope) => [...(scope ?? window.document).querySelectorAll(selector)];
const deckEl = () => query("[data-course-quad-deck]");
const paneEl = (pane) => query(`[data-quad-pane="${pane}"]`);
const dividerEl = (axis) => query(`[data-course-quad-divider="${axis}"]`);
const dotEl = (segment) => query(`[data-course-quad-dot][data-quad-dot-segment="${segment}"]`);
const menuEl = () => query("[data-course-quad-menu]");

const click = async (element, label = "the element to press") => {
  // Never hand a jsdom element to `assert`: on failure node walks the whole
  // object graph and the process is killed. Booleans only, always.
  assert.equal(Boolean(element), true, `${label} exists`);
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  // The cluster animates out; let the exit finish before reading the DOM.
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

/** Drag a divider from one point to another, capture-faithful. */
const dragTo = async (element, from, to, pointerId = 11) => {
  assert.equal(Boolean(element), true, "the divider is on screen");
  await fireAt(element, "pointerdown", from[0], from[1], pointerId);
  const owner = captured.get(pointerId) ?? element;
  await fireAt(owner, "pointermove", to[0], to[1], pointerId);
  await fireAt(owner, "pointerup", to[0], to[1], pointerId);
  await settle(10);
};

const outsideClick = async () => {
  await act(async () => {
    window.document.body.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    window.document.body.dispatchEvent(pointerEvent("pointerdown", 5, 5, 99));
  });
  // The cluster animates out; wait for the exit before reading the DOM.
  await settle(300);
};

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});

/* ── 1 · the four blocks, in the owner's own order ───────────────────────── */

test("the deck is a + of four blocks: player, notes, resources, mind map", async () => {
  const deck = await mount();
  assert.equal(deckEl().getAttribute("data-quad-rows"), "c11+c12/c21+c22", "two rows of two blocks");
  assert.equal(deckEl().getAttribute("data-quad-cross"), "true", "the two dividers cross");
  assert.equal(paneEl("c11").getAttribute("data-quad-slot"), "player");
  assert.equal(paneEl("c12").getAttribute("data-quad-slot"), "notes");
  assert.equal(paneEl("c21").getAttribute("data-quad-slot"), "resources");
  assert.equal(paneEl("c22").getAttribute("data-quad-slot"), "mindmap");
  assert.ok(query('[data-fake="player"]', paneEl("c11")), "the main content lives in c11");
  assert.ok(query('[data-fake="notes"]', paneEl("c12")), "the notes block is c12");
  assert.ok(query('[data-fake="resources"]', paneEl("c21")), "the resource library block is c21");
  assert.ok(query('[data-fake="mindmap"]', paneEl("c22")), "the mind map block is c22");
  // Exactly TWO dividers — one vertical, one horizontal. Never four.
  assert.equal(queryAll("[data-course-quad-divider]").length, 2);
  assert.equal(queryAll('[data-course-quad-divider="v"]').length, 1);
  assert.equal(queryAll('[data-course-quad-divider="h"]').length, 1);
  // The 50/50 cross is what the templates carry.
  const rows = queryAll("[data-quad-row-index]");
  assert.equal(rows.length, 2);
  assert.match(rows[0].getAttribute("data-quad-row-panes"), /^c11\+c12$/);
  assert.equal(rows[0].style.gridTemplateColumns.replace(/\s+/g, " ").trim(), "minmax(0, 50fr) minmax(0, 50fr)");
  deck.done();
});

test("the two segment dots sit on each divider — four in all", async () => {
  const deck = await mount();
  assert.equal(queryAll("[data-course-quad-dot]").length, 4, "two halves per divider");
  for (const segment of ["vTop", "vBottom", "hLeft", "hRight"]) {
    assert.ok(dotEl(segment), `${segment} has its own dot`);
  }
  deck.done();
});

/* ── 2 · the cluster a dot opens ─────────────────────────────────────────── */

test("a dot opens ONE cluster: swaps, the four blocks and every grid shape", async () => {
  const deck = await mount();
  assert.equal(Boolean(menuEl()), false, "nothing floats over the deck at rest");
  await click(dotEl("vTop"));
  const menu = menuEl();
  assert.equal(Boolean(menu), true, "the cluster opened");
  assert.equal(menu.getAttribute("data-quad-menu-segment"), "vTop");
  assert.equal(queryAll("[data-quad-swap]", menu).length, 2, "left↔right and top↔bottom");
  assert.equal(queryAll("[data-quad-pane-button]", menu).length, 4, "c11 · c12 · c21 · c22");
  assert.equal(queryAll("[data-quad-format]", menu).length, 7, "every grid shape, including the 2-pane one and the 3-column one");
  assert.equal(Boolean(query("[data-quad-menu-scroll]", menu)), true, "the cluster scrolls instead of overflowing");
  assert.equal(Boolean(query("[data-quad-dot]", menu)), true, "every button carries its guide dot");
  deck.done();
});

test("outside click closes the cluster — no second divider tap needed", async () => {
  const deck = await mount();
  await click(dotEl("hLeft"));
  assert.equal(Boolean(menuEl()), true, "open first");
  await outsideClick();
  assert.equal(Boolean(menuEl()), false, "a click anywhere else put it away");
  deck.done();
});

test("a swap press swaps and closes the cluster", async () => {
  const deck = await mount();
  await click(dotEl("vTop"));
  await click(query('[data-quad-swap="cols"]'));
  assert.equal(Boolean(menuEl()), false, "the cluster closed itself after the swap");
  assert.equal(deckEl().getAttribute("data-quad-rows"), "c12+c11/c22+c21", "left ↔ right really swapped");
  await click(dotEl("hRight"));
  await click(query('[data-quad-swap="rows"]'));
  // The two swaps compose: left↔right mirrored every row, then top↔bottom
  // reversed the rows — a half turn, block for block.
  assert.equal(deckEl().getAttribute("data-quad-rows"), "c22+c21/c12+c11", "top ↔ bottom swapped the mirrored rows");
  deck.done();
});

/* ── 3 · the four block buttons, the "+" reading, and the shapes ─────────── */

test("closing c22 hides that block; its button then reads c22+ and reopens it", async () => {
  const deck = await mount();
  await click(dotEl("vTop"));
  const closeButton = query('[data-quad-pane-button="c22"]');
  assert.equal(closeButton.textContent.includes("c22"), true);
  assert.equal(closeButton.textContent.includes("c22+"), false, "shown blocks read plainly");
  await click(closeButton);
  assert.equal(Boolean(paneEl("c22")), false, "the mind map block is gone");
  assert.equal(deckEl().getAttribute("data-quad-rows"), "c11+c12/c21", "the rest keep their places");
  await click(dotEl("vTop"));
  const reopen = query('[data-quad-pane-button="c22"]');
  assert.equal(reopen.getAttribute("data-quad-pane-open"), "false");
  assert.equal(reopen.textContent.includes("c22+"), true, "a closed block reads c22+");
  await click(reopen);
  assert.equal(Boolean(paneEl("c22")), true, "and pressing it brings the block back");
  deck.done();

  // Nothing can empty the deck: with a single block left its button is
  // refused — and with no divider on screen the little door still reaches the
  // cluster, so the closed blocks are always one press away.
  const single = await mount({ state: { format: "quad", closed: ["c12", "c21", "c22"], col: 50, row: 50, swappedCols: false, swappedRows: false } });
  assert.equal(Boolean(dotEl("vTop")), false, "no divider is left to press");
  const door = query("[data-course-quad-menu-button]");
  assert.equal(Boolean(door), true, "the cluster keeps a door of its own");
  await click(door);
  assert.equal(Boolean(menuEl()), true, "and it opens the same cluster");
  assert.equal(query('[data-quad-pane-button="c11"]').disabled, true, "the last block cannot be closed");
  await click(query('[data-quad-pane-button="c22"]'));
  assert.equal(Boolean(paneEl("c22")), true, "while the closed blocks come straight back");
  // Two rows of ONE block have no vertical divider, so there is still no cross
  // to press — the door stays until the cross is really back.
  assert.equal(deckEl().getAttribute("data-quad-cross"), "false");
  assert.equal(Boolean(query("[data-course-quad-menu-button]")), true, "the door stays while the cross is away");
  // Each press puts the cluster away, so the door is opened again for the
  // next block — the same rhythm the learner follows.
  await click(query("[data-course-quad-menu-button]"), "the door");
  await click(query('[data-quad-pane-button="c12"]'), "the c12 button");
  // With two rows and a two-block row the cross is back on screen, so the
  // divider's own dot is the way in again (and the door has gone with the
  // cross — asserted below).
  assert.equal(Boolean(query("[data-course-quad-menu-button]")), false, "the door left as soon as the cross returned");
  await click(dotEl("hLeft"), "the horizontal divider's dot");
  await click(query('[data-quad-pane-button="c21"]'), "the c21 button");
  assert.equal(deckEl().getAttribute("data-quad-rows"), "c11+c12/c21+c22", "all four blocks are back");
  assert.equal(deckEl().getAttribute("data-quad-cross"), "true");
  assert.equal(Boolean(query("[data-course-quad-menu-button]")), false, "and no door is needed with the cross up");
  single.done();
});

test("the grid shapes rearrange the blocks exactly as they are named", async () => {
  const deck = await mount();
  const shape = async (format) => {
    await click(dotEl("vTop"));
    await click(query(`[data-quad-format="${format}"]`));
    return deckEl().getAttribute("data-quad-rows");
  };
  assert.equal(await shape("top1"), "c11/c21+c12+c22", "1 upar · 3 niche");
  assert.equal(await shape("bottom1"), "c21+c12+c22/c11", "3 upar · 1 niche");
  assert.equal(await shape("top2"), "c11+c21/c12", "2 upar · 1 niche (the owner's most important one)");
  assert.equal(await shape("bottom2"), "c11/c21+c12", "1 upar · 2 niche");
  assert.equal(await shape("quad"), "c11+c12/c21+c22", "and the way back to four blocks");
  deck.done();
});

test("the single-divider shape puts the navigation under the Resource Library", async () => {
  const deck = await mount({ resourcesFooter: true });
  assert.equal(Boolean(query("[data-quad-pane-nav]")), false, "no strip in the four-block shape");
  await click(dotEl("vTop"));
  await click(query('[data-quad-format="pair"]'));
  assert.equal(deckEl().getAttribute("data-quad-rows"), "c11+c21", "one divider, two screens");
  assert.equal(Boolean(dividerEl("h")), false, "and only the vertical divider is left");
  const strip = query("[data-quad-pane-nav]");
  assert.equal(Boolean(strip), true, "the navigation sits under the resource library");
  assert.equal(Boolean(query('[data-fake="nav"]', strip)), true, "and it is the navigation itself");
  assert.equal(queryAll("[data-course-quad-dot]").length, 1, "one divider, one centre dot");
  deck.done();
});

/* ── 4 · every divider always drags ──────────────────────────────────────── */

test("the vertical divider drags and reports its settled value", async () => {
  const deck = await mount();
  assert.equal(deckEl().getAttribute("data-quad-col"), "50");
  await dragTo(dividerEl("v"), [500, 400], [620, 400]);
  assert.equal(deckEl().getAttribute("data-quad-col"), "62", "100px of 1000 = +12%");
  assert.equal(dividerEl("v").getAttribute("aria-valuenow"), "62", "and the separator announces it");
  assert.equal(deck.seen.length >= 1, true, "the settled value went upward");
  assert.equal(deck.seen[deck.seen.length - 1].col, 62);
  deck.done();
});

test("the horizontal divider drags too, and the panes never leave the band", async () => {
  const deck = await mount();
  await dragTo(dividerEl("h"), [500, 400], [500, 700]);
  assert.equal(deckEl().getAttribute("data-quad-row"), "85", "clamped at the owner's 15–85 band");
  await dragTo(dividerEl("h"), [500, 700], [500, 120]);
  assert.equal(deckEl().getAttribute("data-quad-row"), "15");
  deck.done();
});

test("dragging one divider leaves the other divider independent — both axes drag on their own (2026-10-16)", async () => {
  const deck = await mount();
  // Baseline: every divider sits on its starting percent, and the deck
  // reports it owns none of them yet.
  assert.equal(deckEl().getAttribute("data-quad-dragging"), "none", "no divider is live yet");
  assert.equal(deckEl().getAttribute("data-quad-col"), "50", "vertical starts at 50%");
  assert.equal(deckEl().getAttribute("data-quad-row"), "50", "horizontal starts at 50%");

  // Pull the VERTICAL divider right by 120px (the deck is 1000x800). Only the
  // column changes; the row stays put. The deck tags which axis is live so the
  // CSS can disable the OTHER axis's pointer events.
  await fireAt(dividerEl("v"), "pointerdown", 500, 400);
  assert.equal(deckEl().getAttribute("data-quad-dragging"), "v", "the deck reports the vertical divider is live");
  await fireAt(dividerEl("v"), "pointermove", 620, 400);
  await fireAt(dividerEl("v"), "pointerup", 620, 400);
  await settle(10);
  assert.equal(deckEl().getAttribute("data-quad-col"), "62", "vertical → 62%");
  assert.equal(deckEl().getAttribute("data-quad-row"), "50", "row untouched");
  assert.equal(deckEl().getAttribute("data-quad-dragging"), "none", "the live divider is released");

  // Now pull the HORIZONTAL divider down by 300px. The row climbs to 85% while
  // the column stays at 62%. A drag of one divider MUST NOT resize the other
  // axis's blocks.
  await fireAt(dividerEl("h"), "pointerdown", 500, 400);
  assert.equal(deckEl().getAttribute("data-quad-dragging"), "h", "the deck reports the horizontal divider is live");
  await fireAt(dividerEl("h"), "pointermove", 500, 700);
  await fireAt(dividerEl("h"), "pointerup", 500, 700);
  await settle(10);
  assert.equal(deckEl().getAttribute("data-quad-row"), "85", "horizontal → 85%");
  assert.equal(deckEl().getAttribute("data-quad-col"), "62", "column untouched");
  assert.equal(deckEl().getAttribute("data-quad-dragging"), "none");

  // And the round-trip: row back to 50%, column back to 50%, again without
  // the other axis moving — so both drags are independent end to end. The
  // drag is DELTA-based (no jump under the finger), so each pull starts from
  // where the divider really is: the row clamped at 85% = y 680 of 800, not
  // at the 700 the previous pointer stopped on past the clamp.
  await dragTo(dividerEl("v"), [620, 400], [500, 400]);
  await dragTo(dividerEl("h"), [500, 680], [500, 400]);
  assert.equal(deckEl().getAttribute("data-quad-col"), "50", "vertical divider back to centre");
  assert.equal(deckEl().getAttribute("data-quad-row"), "50", "horizontal divider back to centre");

  deck.done();
});

test("a squeezed divider keeps a wider gap and ONE small icon — press it and it returns", async () => {
  const deck = await mount();
  // Roomy first: the vertical divider settles at 62.
  await dragTo(dividerEl("v"), [500, 400], [620, 400]);
  assert.equal(deckEl().getAttribute("data-quad-col"), "62");
  assert.equal(deckEl().getAttribute("data-quad-squeezed"), "none", "roomy blocks are not squeezed");
  assert.equal(query("[data-course-quad-restore]"), null, "no icon until the blocks are pressed together");

  // Now press the two blocks together: the divider sits on its own clamp.
  await dragTo(dividerEl("v"), [620, 400], [50, 400]);
  assert.equal(deckEl().getAttribute("data-quad-col"), "20", "clamped at the owner's 20–80 band");
  assert.equal(deckEl().getAttribute("data-quad-squeezed"), "v");
  const restore = query('[data-course-quad-restore="v"]');
  assert.ok(restore, "the gap carries the way back");
  assert.equal(dividerEl("v").style.getPropertyValue("--quad-hit"), "18px", "the gap stays visible (18px vs the usual 10px)");
  // The THIN white strip between the two blocks (owner, 2026-10-16 — asked
  // back): exactly one, inside THIS divider, and it is the 6px rail.
  const strips = queryAll('[data-course-quad-strip]', dividerEl("v"));
  assert.equal(strips.length, 1, "one thin strip on the squeezed vertical divider");
  assert.equal(strips[0].style.width, "", "the width comes from the stylesheet (var(--quad-strip))");
  assert.equal(deckEl().style.getPropertyValue("--quad-strip"), "6px", "a THIN 6px strip, never a plate");
  assert.equal(restore.getAttribute("title"), "Back to the previous size");

  // ONE press → back to the size these blocks had before the squeeze (62),
  // never a default.
  await click(restore, "the squeeze icon");
  assert.equal(deckEl().getAttribute("data-quad-col"), "62");
  assert.equal(deckEl().getAttribute("data-quad-squeezed"), "none");
  assert.equal(query("[data-course-quad-restore]"), null);
  deck.done();
});

test("the horizontal divider squeezes the same way — and its own icon brings it back", async () => {
  const deck = await mount();
  // Dragging the horizontal divider DOWN grows the row value (it is measured
  // from the bottom edge), so this lands at 78 of 85.
  await dragTo(dividerEl("h"), [500, 400], [500, 620]);
  assert.equal(deckEl().getAttribute("data-quad-row"), "78");
  await dragTo(dividerEl("h"), [500, 620], [500, 770]);
  assert.equal(deckEl().getAttribute("data-quad-row"), "85", "clamped at 15–85");
  const restore = query('[data-course-quad-restore="h"]');
  assert.ok(restore, "the horizontal gap carries its own way back");
  assert.equal(queryAll('[data-course-quad-strip]', dividerEl("h")).length, 1, "the horizontal gap wears the same thin strip");
  await click(restore, "the horizontal squeeze icon");
  assert.equal(deckEl().getAttribute("data-quad-row"), "78");
  deck.done();
});

/* ── 6 · the owner's third ask: three blocks side by side ─────────────────
 * "teen screen side by side" — player | notes | mind map in three even
 * columns, full height, with the fourth block off until the cluster brings it
 * back. Three blocks in ONE row means TWO vertical dividers, both draggable. */

test("three blocks side by side: three even columns and TWO draggable vertical dividers", async () => {
  const deck = await mount();
  await click(dotEl("vTop"));
  await click(query('[data-quad-format="triple"]', menuEl()), "the 3-column shape button");
  const last = deck.seen[deck.seen.length - 1];
  assert.equal(last.format, "triple");
  // Player | Notes | Mind map — the owner's own reading, and the 4th block off.
  assert.deepEqual(fixture.quadRows(last), [["c11", "c12", "c22"]]);
  // Three EQUAL columns on arrival (33 · 34 · 33 — never a default that leans).
  assert.equal(last.col, 33);
  assert.equal(last.col2, 67);

  const row = query("[data-quad-row-panes]");
  assert.equal(row.getAttribute("data-quad-row-panes"), "c11+c12+c22");
  assert.equal(row.style.gridTemplateColumns, "minmax(0, 33fr) minmax(0, 34fr) minmax(0, 33fr)");
  assert.equal(deckEl().getAttribute("data-quad-col2"), "67");
  assert.equal(deckEl().style.getPropertyValue("--quad-col2"), "67%");

  // Exactly two lines, both vertical — never one per block, never four.
  const dividers = queryAll("[data-course-quad-divider]");
  assert.equal(dividers.length, 2);
  assert.equal(Boolean(dividerEl("v")), true, "the first vertical divider");
  assert.equal(Boolean(dividerEl("v2")), true, "the second vertical divider");
  assert.equal(dividerEl("h"), null, "one row, so no horizontal divider");
  assert.equal(queryAll("[data-course-quad-dot]").length, 2, "one dot on the vertical divider, one on the second");
  assert.equal(Boolean(dotEl("v2")), true, "the second divider carries its own dot");

  // The fourth block is off, and its button in the cluster brings the 2×2 back
  // (with the block reopened) — the deck never leaves a block unreachable.
  assert.equal(Boolean(paneEl("c21")), false);
  assert.equal(paneEl("c11") && paneEl("c11").getAttribute("data-quad-pane-nav"), null);
  await click(dotEl("v2"));
  await click(query('[data-quad-pane-button="c21"]', menuEl()), "c21+");
  const back = deck.seen[deck.seen.length - 1];
  assert.equal(back.format, "quad");
  assert.deepEqual(fixture.quadRows(back).flat().sort(), ["c11", "c12", "c21", "c22"]);
  deck.done();
});

test("the second vertical divider drags on its own, squeezes, and never crosses the first", async () => {
  const deck = await mount({ state: { format: "triple", col: 33, col2: 67 } });
  assert.equal(Boolean(paneEl("c22")), true, "the three-column shape is on screen");

  // Roomy: the second divider lands where it was dragged (67 → 85).
  await dragTo(dividerEl("v2"), [670, 400], [850, 400]);
  assert.equal(deckEl().getAttribute("data-quad-col2"), "85");
  assert.equal(deckEl().getAttribute("data-quad-col"), "33", "the first divider did not move");

  // Pressed onto its clamp: the wider gap and ONE small icon of its own.
  await dragTo(dividerEl("v2"), [850, 400], [990, 400]);
  assert.equal(deckEl().getAttribute("data-quad-col2"), "92", "clamped at the second divider's own 26–92 band");
  assert.equal(deckEl().getAttribute("data-quad-squeezed"), "v");
  const restore = query('[data-course-quad-restore="v2"]');
  assert.ok(restore, "the second gap carries its own way back");
  assert.equal(queryAll('[data-course-quad-strip]', dividerEl("v2")).length, 1, "the second gap wears the thin strip too");
  await click(restore, "the second squeeze icon");
  assert.equal(deckEl().getAttribute("data-quad-col2"), "85", "the last ROOMY value, never a default");

  // The two verticals can touch the same gap rule but never cross: dragged
  // left, the second stops 8% right of the first.
  await dragTo(dividerEl("v2"), [850, 400], [150, 400]);
  assert.equal(deckEl().getAttribute("data-quad-col2"), "41", "first divider 33 + the owner's 8% gap");
  // …and the first divider stops 8% LEFT of the second.
  await dragTo(dividerEl("v"), [330, 400], [900, 400]);
  assert.equal(deckEl().getAttribute("data-quad-col"), "33");
  assert.equal(deckEl().getAttribute("data-quad-col2"), "41");
  deck.done();
});

test("a hidden divider segment still drags (Course view never locks the layout)", async () => {
  const deck = await mount({
    view: { zoom: 100, dividers: { vTop: false, vBottom: true, hLeft: true, hRight: true } },
  });
  const segment = query('[data-course-quad-segment="vTop"]');
  assert.equal(segment.getAttribute("data-visible"), "false", "the line is switched off");
  assert.equal(Boolean(dotEl("vTop")), true, "but its dot is still there");
  await dragTo(dividerEl("v"), [500, 300], [560, 300]);
  assert.equal(deckEl().getAttribute("data-quad-col"), "56", "and the boundary still resizes");
  deck.done();
});

/* ── 5 · Course view: zoom + the tab that has no block of its own ────────── */

test("the Course view zoom scales the whole deck and carries across shapes", async () => {
  const deck = await mount({ view: { zoom: 125, dividers: { vTop: true, vBottom: true, hLeft: true, hRight: true } } });
  assert.equal(deckEl().getAttribute("data-quad-zoom"), "125");
  const layer = query("[data-quad-zoom-layer]");
  assert.equal(layer.style.transform, "scale(1.25)");
  await click(dotEl("vTop"));
  await click(query('[data-quad-format="bottom2"]'));
  assert.equal(deckEl().getAttribute("data-quad-rows"), "c11/c21+c12", "the shape changed");
  assert.equal(deckEl().getAttribute("data-quad-zoom"), "125", "and the zoom carried with it");
  deck.done();
});

test("a tab without a block borrows the main one while the player stays mounted", async () => {
  const deck = await mount({ study: true });
  const playerFace = query("[data-quad-player-face]");
  const studyFace = query("[data-quad-study-face]");
  assert.equal(Boolean(playerFace), true, "the player face is still mounted");
  assert.equal(playerFace.hasAttribute("hidden"), true, "hidden, not unmounted — a playing video keeps playing");
  assert.equal(Boolean(query('[data-fake="player"]', playerFace)), true, "with the main content inside");
  assert.equal(Boolean(studyFace), true, "and the borrowed tab shows in its place");
  assert.equal(Boolean(query('[data-fake="study"]', studyFace)), true, "with the tab's own body inside");
  deck.done();
});

/* ── 6 · the model behind the deck ───────────────────────────────────────── */

test("the model: the gate is 768px and the ratios stay in their bands", () => {
  assert.equal(fixture.QUAD_MIN_SCREEN_PX, 768);
  assert.equal(fixture.QUAD_MEDIA_QUERY, "(min-width: 768px)");
  assert.equal(fixture.clampQuadCol(5), 20);
  assert.equal(fixture.clampQuadCol(95), 80);
  assert.equal(fixture.clampQuadRow(-20), 15);
  assert.equal(fixture.clampQuadRow(200), 85);
  assert.equal(fixture.QUAD_FORMAT_ORDER.length, 7, "four blocks + five named shapes, deduplicated");
});

test("the model: closing keeps the learner's choices, the last block stays", () => {
  let state = baseState();
  assert.deepEqual(fixture.quadRows(state), [["c11", "c12"], ["c21", "c22"]]);
  state = fixture.quadTogglePane(state, "c12");
  assert.deepEqual(state.closed, ["c12"]);
  assert.deepEqual(fixture.quadRows(state), [["c11"], ["c21", "c22"]]);
  state = fixture.quadTogglePane(state, "c12");
  assert.deepEqual(state.closed, []);
  // Closing every block one by one stops at the last one.
  for (const pane of ["c12", "c21", "c22", "c11"]) state = fixture.quadTogglePane(state, pane);
  assert.deepEqual(state.closed, ["c12", "c21", "c22"], "c11 — the last block — refuses to close");
  const buttons = fixture.quadPaneButtons(state);
  assert.equal(buttons.find((button) => button.pane === "c11").lastOne, true);
  assert.equal(buttons.find((button) => button.pane === "c12").text, "c12+");
});

test("the model: shapes drop what they cannot hold and never empty the deck", () => {
  const state = baseState();
  let pair = fixture.quadSetFormat(state, "pair");
  assert.deepEqual(fixture.quadRows(pair), [["c11", "c21"]], "the single-divider shape");
  // A shape with everything closed reopens its own first block.
  const allClosed = { ...state, closed: ["c11", "c12", "c21", "c22"], format: "top2" };
  const reopened = fixture.quadSetFormat(allClosed, "top2");
  assert.equal(reopened.closed.includes("c11"), false, "the deck never renders nothing");
  assert.equal(fixture.quadRows(reopened).length, 1);
});

test("the model persists per course and restores the learner's shape", () => {
  window.localStorage.clear();
  assert.equal(fixture.loadQuadLayout("course-x").format, "quad", "a fresh course opens on the four blocks");
  fixture.saveQuadLayout("course-x", { format: "bottom1", closed: ["c22"], col: 62, row: 38, swappedCols: true, swappedRows: false });
  const back = fixture.loadQuadLayout("course-x");
  assert.equal(back.format, "bottom1");
  assert.equal(back.col, 62);
  assert.equal(back.swappedCols, true);
  assert.equal(back.swappedRows, false);
  assert.deepEqual(back.closed, ["c22"]);
  assert.equal(fixture.loadQuadLayout("course-y").format, "quad", "another course starts fresh");
  // Junk in storage never breaks the player.
  window.localStorage.setItem("dc.course.quadLayout.v1.course-z", "{not json");
  assert.equal(fixture.loadQuadLayout("course-z").format, "quad");
  window.localStorage.setItem(
    "dc.course.quadLayout.v1.course-z",
    JSON.stringify({ format: "nonsense", closed: ["c99", "c11"], col: 400, row: -5, swappedCols: "yes" }),
  );
  const sanitized = fixture.loadQuadLayout("course-z");
  assert.equal(sanitized.format, "quad");
  assert.deepEqual(sanitized.closed, ["c11"]);
  assert.equal(sanitized.col, 80);
  assert.equal(sanitized.row, 15);
  assert.equal(sanitized.swappedCols, false);
  window.localStorage.clear();
});

/* ── 7 · the navigation's placement rules ────────────────────────────────── */

test("the placement dropdown always opens toward the free space", () => {
  assert.equal(fixture.footerNavigationMenuSide("header"), "down", "top → down");
  assert.equal(fixture.footerNavigationMenuSide("bottom"), "up", "bottom → up");
  assert.equal(fixture.footerNavigationMenuSide("left"), "right", "left → right");
  assert.equal(fixture.footerNavigationMenuSide("right"), "left", "right → left");
  assert.equal(fixture.FOOTER_NAVIGATION_PLACEMENT_MEDIA_QUERY, "(min-width: 768px)", "tablet/desktop only");
});

test("the navigation's box comes down by exactly the owner's 6px", () => {
  // 44px plate (the course strip) minus 6 = 38px, and the header variant uses
  // the same rhythm. The store's numbers are the ones the CSS sets.
  assert.equal(fixture.FOOTER_NAVIGATION_SIZE_STEP_PX, 6);
  assert.equal(fixture.FOOTER_NAVIGATION_HEIGHT_PX, 38);
  const vars = fixture.footerNavigationSizeVars();
  assert.equal(vars["--work-nav-h"], "38px");
  assert.equal(vars["--work-nav-h"].replace("px", ""), "38");
  assert.equal(vars["--dc-header-nav-h"], "38px");
});

test("the placement sticks, defaults to the header, and refuses junk", () => {
  window.localStorage.clear();
  assert.equal(fixture.getFooterNavigationPlacement(), "header", "the navigation lives in the header by default");
  fixture.setFooterNavigationPlacement("right");
  assert.equal(fixture.getFooterNavigationPlacement(), "right");
  window.localStorage.setItem("dc-footer-navigation-placement", "somewhere");
  assert.equal(fixture.getFooterNavigationPlacement(), "header");
  window.localStorage.clear();
});
