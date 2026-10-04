// tests/coursePlayerFileDoubleTapRuntime.test.mjs
//
// Runtime proof for the owner's 2026-10-04 brief:
//
//   "Course Player ke Module page par ek new direct function add karo. Current
//    behavior: Module ki kisi file par single click karne par file upper/main
//    area mein open hoti hai — ye behavior same rehna chahiye. New behavior:
//    agar user kisi module file par double tap/double click kare to woh file
//    Split Mode ke lower/secondary area mein open ho … Single click ka current
//    behavior change nahi hona chahiye. Double tap same file par detect hona
//    chahiye. Double tap se file lower split area mein open ho. Upper area mein
//    currently open content same rehna chahiye. Scrolling ko double tap na maana
//    jaaye. Desktop mouse double-click aur touch double-tap dono work karein."
//
// tests/coursePlayerFileDoubleTapContract.test.mjs pins the source shape (the
// row's two press paths, the Course Player's split state, the pane). This file
// drives the REAL overlay's module list in a real DOM and asserts the gesture
// itself:
//
//   1. ONE click (or tap) still runs the single-click path and nothing else;
//   2. two clicks inside the window, on the SAME row, run the single path once
//      and then the split path — the pair's first press is never delayed, and
//      the upper area is put back by the player (not by the row);
//   3. two clicks spaced further apart are two single clicks — never a split;
//   4. a click whose pointer travelled is a SCROLL: it opens nothing, and it
//      does not leave a half-open pair behind either;
//   5. a tap on one row then a quick tap on another is two single clicks (the
//      gesture is per row);
//   6. the browser's own `dblclick` (which arrives right after the second
//      click) can never fire the split a second time — and it is the fallback
//      when a browser only sends one of the two clicks;
//   7. rows that are not files (the module expander) never split.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the real study overlay's module list ───────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import CourseOverlay from ${JSON.stringify(path.join(ROOT, "src/course/CourseOverlay.tsx"))};

const MODULE = {
  id: "m1",
  title: "Module one",
  accessLevel: "public",
  files: [
    { id: "f1", name: "Lecture 1", type: "youtube", url: "https://www.youtube.com/watch?v=abc", accessLevel: "public" },
    { id: "f2", name: "Chapter notes", type: "pdf", url: "https://example.com/notes.pdf", accessLevel: "public" },
  ],
};

export function mountOverlay(host, handlers) {
  const root = createRoot(host);
  const props = {
    orientation: "portrait",
    tab: "modules",
    onTabChange: (tab) => handlers.onTabChange?.(tab),
    modules: [MODULE],
    selectedFileId: "f1",
    ownedUpdateIds: new Set(),
    accessibleModuleIds: new Set(["m1"]),
    previewModuleIds: new Set(),
    updates: [],
    moduleTitleById: { m1: "Module one" },
    onSelectFile: (file) => handlers.onSelectFile?.(file),
    onSelectFileInSplit: (file) => handlers.onSelectFileInSplit?.(file),
    onBuyModule: () => undefined,
    onBuyUpdate: () => undefined,
    notes: [],
    onAddNote: () => undefined,
    onEditNote: () => undefined,
    onDeleteNote: () => undefined,
    onLinkNote: () => undefined,
    peekDock: true,
  };
  act(() => {
    root.render(
      handlers.splitPane
        ? <CourseOverlay {...props} splitPane={<div data-fake-split-pane="" />} splitPaneActive />
        : <CourseOverlay {...props} />,
    );
  });
  return { unmount: () => act(() => root.unmount()) };
}

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-file-double-tap-runtime");

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

const dom = new JSDOM(`<!doctype html><html><body><div id="overlay"></div></body></html>`, {
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

const fixture = require(bundle);
const { act } = fixture;

/* ── helpers ─────────────────────────────────────────────────────────────── */

const settle = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const rowOf = (fileId) => window.document.querySelector(`[data-course-overlay-file][data-file-id="${fileId}"]`);
const moduleRow = () => window.document.querySelector("[data-course-overlay-module]");

/**
 * A real press on a row: pointerdown (the row remembers where the finger
 * landed), then the pointerup + click a browser sends. `to` is where the
 * pointer travelled before it came up — a scroll when it is far.
 */
const press = async (element, { from = [40, 120], to = from, double = false, dblclick = false } = {}) => {
  await act(async () => {
    element.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: from[0], clientY: from[1], pointerId: 1, isPrimary: true, button: 0, buttons: 1 }));
  });
  await settle(4);
  await act(async () => {
    element.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, cancelable: true, clientX: to[0], clientY: to[1], pointerId: 1, isPrimary: true, button: 0, buttons: 0 }));
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: to[0], clientY: to[1], detail: 1 }));
    if (double) element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: to[0], clientY: to[1], detail: 2 }));
    if (dblclick) element.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: to[0], clientY: to[1], detail: 2 }));
  });
  await settle(6);
};

/** Mount the overlay over a module with two files; collect every callback. */
const mountOverlay = async (handlers = {}) => {
  const host = window.document.getElementById("overlay");
  host.innerHTML = "";
  const calls = { opened: [], split: [], tabs: [], ...handlers };
  const mounted = fixture.mountOverlay(host, {
    onSelectFile: (file) => calls.opened.push(file.id),
    onSelectFileInSplit: (file) => calls.split.push(file.id),
    onTabChange: (tab) => calls.tabs.push(tab),
    splitPane: handlers.splitPane,
  });
  if (!handlers.splitPane) assert.ok(rowOf("f1"), "the module is expanded and its files are listed");
  return { mounted, calls };
};

/* --------------------------------------------------------------------------- */
/* 1. Single click is untouched                                                */
/* --------------------------------------------------------------------------- */

test("one click on a module file runs the single-click path and nothing else", async () => {
  const { mounted, calls } = await mountOverlay();

  await press(rowOf("f1"));
  assert.deepEqual(calls.opened, ["f1"], "the file opens in the upper area");
  assert.deepEqual(calls.split, [], "…and the split gesture is untouched");

  await press(rowOf("f2"));
  assert.deepEqual(calls.opened, ["f1", "f2"], "the next file opens the same way");
  assert.deepEqual(calls.split, []);

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 2. Double tap / double click → the split path                               */
/* --------------------------------------------------------------------------- */

test("two clicks on the SAME row open the file in the lower split area", async () => {
  const { mounted, calls } = await mountOverlay();

  await press(rowOf("f2"), { double: true });

  // The FIRST click still ran the single-click path immediately — a fast single
  // click is never delayed behind a double-tap timer. The pair's second press
  // is the split, and the player puts the upper area back (see
  // `openFileInSplit`), so exactly one single press is recorded.
  assert.deepEqual(calls.opened, ["f2"], "the pair runs the single path once");
  assert.deepEqual(calls.split, ["f2"], "…and then the split path, for the same file");

  mounted.unmount();
});

test("the browser's own dblclick never fires the split a second time", async () => {
  const { mounted, calls } = await mountOverlay();

  // A real desktop double-click sends click, click AND dblclick.
  await press(rowOf("f2"), { double: true, dblclick: true });

  assert.deepEqual(calls.split, ["f2"], "the split fired exactly once");
  assert.deepEqual(calls.opened, ["f2"]);
  mounted.unmount();
});

test("a dblclick with no second click still opens the split (the fallback)", async () => {
  const { mounted, calls } = await mountOverlay();

  await press(rowOf("f2"), { dblclick: true });

  assert.deepEqual(calls.split, ["f2"], "the browser's dblclick is enough on its own");
  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 3. What is NOT a double tap                                                 */
/* --------------------------------------------------------------------------- */

test("two clicks spaced apart are two single clicks, never a split", async () => {
  const { mounted, calls } = await mountOverlay();

  await press(rowOf("f2"));
  await settle(420);
  await press(rowOf("f2"));

  assert.deepEqual(calls.opened, ["f2", "f2"], "each click opened the file the normal way");
  assert.deepEqual(calls.split, [], "the pair is over — no split");
  mounted.unmount();
});

test("a quick tap on a different row is not a double tap", async () => {
  const { mounted, calls } = await mountOverlay();

  await press(rowOf("f1"));
  await press(rowOf("f2"));

  assert.deepEqual(calls.opened, ["f1", "f2"], "both are single clicks");
  assert.deepEqual(calls.split, [], "the gesture is per row");
  mounted.unmount();
});

test("scrolling never presses a row — and never arms a double tap", async () => {
  const { mounted, calls } = await mountOverlay();

  // The finger goes down on the row and the list scrolls: the pointer comes up
  // (and the browser's click lands) far away. Nothing may open.
  await press(rowOf("f2"), { from: [40, 200], to: [40, 60] });
  assert.deepEqual(calls.opened, [], "a scroll opened nothing");
  assert.deepEqual(calls.split, [], "…and armed nothing");

  // The row is still usable straight afterwards: one clean tap opens it once.
  await press(rowOf("f2"));
  assert.deepEqual(calls.opened, ["f2"], "the next real tap is a single click");
  assert.deepEqual(calls.split, [], "…and it is not the second half of a pair");
  mounted.unmount();
});

test("module rows keep their own single-press behaviour and never split", async () => {
  const { mounted, calls } = await mountOverlay();

  await press(moduleRow(), { double: true, dblclick: true });

  assert.deepEqual(calls.split, [], "only FILE rows carry the split gesture");
  assert.deepEqual(calls.opened, [], "…and the expander never opens a file");
  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 4. The pane swap the player drives                                          */
/* --------------------------------------------------------------------------- */

test("while the split is active the pane hosts the split file, not the tab body", async () => {
  const { mounted, calls } = await mountOverlay({ splitPane: true });

  assert.ok(window.document.querySelector("[data-fake-split-pane]"), "the split file owns the pane");
  assert.equal(window.document.querySelector("[data-course-overlay-list]"), null, "the tab body stepped aside");
  assert.deepEqual(calls.tabs, [], "and nothing asked for a tab change");

  mounted.unmount();
});

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});
