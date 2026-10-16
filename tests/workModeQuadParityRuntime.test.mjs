// tests/workModeQuadParityRuntime.test.mjs
//
// Drives the REAL Work plus deck — `src/work/WorkQuadDeck.tsx`, which mounts the
// Course Player's own `QuadDeck` with Work's four blocks — in jsdom. The owner's
// 2026-10-16 brief for Work:
//
//   "Work mode mein bhi same split-screen behaviour, same footer-navigation
//    behaviour aur naye notes / mind map / sketch ke design — exactly same."
//
// What is proved here, on the running component and not on its source:
//   · the four blocks are the owner's own mapping (main · Notes · other · Mind
//     map), with the picker in a content block that has no page yet;
//   · the deck really is the player's deck (one vertical divider, one
//     horizontal, a dot at each segment's centre, the one control cluster);
//   · picking a page reports it, and a navigation press brings a closed block
//     back through the same `reveal` signal the player uses;
//   · the navigation moves under the content block in the single-divider shape
//     (the owner's "uske niche footer navigation");
//   · the zoom the shared Course-view page sets is applied by this deck too.
//
// The component is loaded through TypeScript's own transpiler with a tiny
// relative-import resolver — no build step, no fixture process.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);

const dom = new JSDOM("<!doctype html><html><body><div id='work'></div></body></html>", {
  pretendToBeVisual: true,
  url: "https://example.test/#/work/notes",
});
const { window } = dom;
const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of [
  "HTMLElement", "HTMLButtonElement", "Element", "Node", "Event", "MouseEvent", "PointerEvent",
  "KeyboardEvent", "getComputedStyle", "MutationObserver", "localStorage", "requestAnimationFrame",
  "cancelAnimationFrame", "ResizeObserver",
]) {
  if (window[key]) define(key, window[key]);
}
if (!globalThis.requestAnimationFrame) define("requestAnimationFrame", (fn) => setTimeout(() => fn(Date.now()), 0));
define("matchMedia", window.matchMedia = () => ({
  matches: false,
  media: "",
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

const ROOT = process.cwd();
const transpile = (file) =>
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

const cache = new Map();
/** Loads a repo module, resolving its own relative imports (CSS is a no-op). */
function load(file, overrides = {}) {
  const absolute = path.resolve(ROOT, file);
  if (overrides[absolute]) return overrides[absolute];
  if (cache.has(absolute)) return cache.get(absolute);
  const mod = { exports: {} };
  cache.set(absolute, mod.exports);
  const localRequire = (id) => {
    if (overrides[id]) return overrides[id];
    if (id.endsWith(".css")) return {};
    if (id.startsWith(".")) {
      const base = path.resolve(path.dirname(absolute), id);
      for (const candidate of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
        if (fs.existsSync(candidate)) return load(candidate, overrides);
      }
      return {};
    }
    return require(id);
  };
  new Function("require", "module", "exports", transpile(absolute))(localRequire, mod, mod.exports);
  cache.set(absolute, mod.exports);
  return mod.exports;
}

const WorkQuadDeck = load("src/work/WorkQuadDeck.tsx").default;

const DEFAULT_STATE = { format: "quad", closed: [], col: 50, row: 50, swappedCols: false, swappedRows: false };
const FULL_VIEW = { zoom: 100, dividers: { vTop: true, vBottom: true, hLeft: true, hRight: true } };

async function mountDeck(options = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const seen = { picks: [], states: [] };
  const api = { host, seen, state: options.state ?? DEFAULT_STATE };

  function Harness() {
    const [state, setState] = React.useState(options.state ?? DEFAULT_STATE);
    api.state = state;
    const [reveal, setReveal] = React.useState(options.reveal ?? null);
    const onState = (next) => {
      seen.states.push(next);
      act(() => setState(next));
    };
    React.useEffect(() => () => {}, []);
    api.reveal = (pane) => act(() => setReveal((current) => ({ pane, count: (current?.count ?? 0) + 1 })));
    return React.createElement(WorkQuadDeck, {
      primary: options.primary === undefined ? "myday" : options.primary,
      secondary: options.secondary === undefined ? null : options.secondary,
      onPick: (slot, page) => seen.picks.push([slot, page]),
      renderPage: (id, slotKey) =>
        React.createElement("div", { "data-work-stub-page": id, "data-work-stub-slot": slotKey }, id),
      state,
      onState,
      view: options.view ?? FULL_VIEW,
      placement: options.placement ?? "header",
      nav: React.createElement("div", { "data-work-stub-nav": "" }, "navigation"),
      reveal,
    });
  }

  await act(async () => {
    root.render(React.createElement(Harness));
  });
  api.unmount = () => act(() => root.unmount());
  return api;
}

const query = (selector) => document.querySelector(selector);
const all = (selector) => [...document.querySelectorAll(selector)];
const click = async (element) => {
  assert.ok(element, `the element to press exists (${element === null ? "missing" : "found"})`);
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
};

test("Work's four blocks are the owner's mapping, drawn by the player's own deck", async () => {
  const deck = await mountDeck();
  try {
    const pane = (id) => query(`[data-quad-pane="${id}"]`);

    // The deck itself: the Course Player's component, its two dividers and the
    // four centre dots — nothing Work-local.
    assert.ok(query("[data-course-quad-deck]"), "the player's deck is the one mounted");
    assert.equal(all('[data-course-quad-divider="v"]').length, 1, "exactly one vertical divider");
    assert.equal(all('[data-course-quad-divider="h"]').length, 1, "exactly one horizontal divider");
    assert.equal(all("[data-course-quad-dot]").length, 4, "a dot at each of the four segments' centres");

    // c11 — the main content: the page the learner is on.
    assert.equal(pane("c11").getAttribute("data-quad-slot"), "player");
    assert.equal(pane("c11").querySelector("[data-work-stub-page]").getAttribute("data-work-stub-page"), "myday");
    // c12 — Notes, the very panel the Notes page mounts.
    assert.equal(pane("c12").getAttribute("data-quad-slot"), "notes");
    assert.equal(pane("c12").querySelector("[data-work-stub-page]").getAttribute("data-work-stub-page"), "notes");
    // c21 — the second content block: empty, so it asks for a page.
    assert.equal(pane("c21").getAttribute("data-quad-slot"), "resources");
    assert.ok(pane("c21").querySelector('[data-work-quad-prompt="c21"]'), "the empty block offers pages");
    // c22 — the Mind map.
    assert.equal(pane("c22").getAttribute("data-quad-slot"), "mindmap");
    assert.equal(pane("c22").querySelector("[data-work-stub-page]").getAttribute("data-work-stub-page"), "mindmap");

    // The picker never offers the two pages that own blocks.
    const offered = all("[data-work-quad-prompt-page]").map((button) => button.getAttribute("data-work-quad-prompt-page"));
    assert.deepEqual(offered, ["myday", "sketch", "ai", "revision"]);
  } finally {
    await deck.unmount();
    deck.host.remove();
  }
});

test("an empty content block reports the page the learner picks for it", async () => {
  const deck = await mountDeck({ secondary: null });
  try {
    const pick = query('[data-quad-pane="c21"] [data-work-quad-prompt-page="sketch"]');
    await click(pick);
    assert.deepEqual(deck.seen.picks, [["c21", "sketch"]], "the pick names the block and the page");
  } finally {
    await deck.unmount();
    deck.host.remove();
  }
});

test("the navigation moves under the content block in the single-divider shape", async () => {
  const deck = await mountDeck();
  try {
    // In the four-block shape the navigation is the shell's business, not the
    // deck's.
    assert.equal(query("[data-course-quad-deck] [data-work-stub-nav]"), null);

    // Open the one control cluster from a dot, then pick the pair shape.
    await click(query('[data-course-quad-divider="v"] [data-course-quad-dot]'));
    assert.ok(query("[data-course-quad-menu]"), "the dot opens the cluster");
    await click(query('[data-quad-format="pair"]'));

    assert.equal(deck.state.format, "pair");
    assert.ok(query("[data-course-quad-deck] [data-work-stub-nav]"), "the navigation is drawn under the content");
    assert.equal(all('[data-course-quad-divider="h"]').length, 0, "one divider only");
    assert.equal(all('[data-course-quad-divider="v"]').length, 1);
  } finally {
    await deck.unmount();
    deck.host.remove();
  }
});

test("a navigation press brings a closed block back, through the player's reveal signal", async () => {
  const deck = await mountDeck({ state: { ...DEFAULT_STATE, closed: ["c22"] } });
  try {
    assert.equal(query('[data-quad-pane="c22"]'), null, "the closed block is really gone");
    await act(async () => {
      deck.reveal("c22");
    });
    assert.ok(query('[data-quad-pane="c22"]'), "the Mind map block is back");
    assert.deepEqual(deck.state.closed, [], "and the choice is remembered as open");
  } finally {
    await deck.unmount();
    deck.host.remove();
  }
});

test("the deck obeys the shared Course-view zoom", async () => {
  const deck = await mountDeck({ view: { ...FULL_VIEW, zoom: 120 } });
  try {
    const root = query("[data-course-quad-deck]");
    assert.equal(root.getAttribute("data-quad-zoom"), "120");
    const layer = query("[data-quad-zoom-layer]");
    assert.match(layer.getAttribute("style") ?? "", /scale\(1\.2\)/);
  } finally {
    await deck.unmount();
    deck.host.remove();
  }
});
