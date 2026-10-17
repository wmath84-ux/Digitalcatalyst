// tests/workModeMindMapRuntime.test.mjs
//
// RUNTIME proof that Work Mode's Mind Map Editor is the Course Player's
// updated mind map surface with Work's shell rules around it, driven here
// inside the real WorkPageSurface + WorkMindMapSurface in jsdom:
//
//   1. a map opens in PREVIEW/read mode — double-tap / double-click and
//      plain taps on nodes never unlock editing there;
//   2. nodes are not draggable in preview (no `draggable` node wrappers);
//      entering edit mode explicitly (Map options → Edit map) makes them
//      draggable and brings up the bottom editing toolbar;
//   3. the top corner buttons (map library / map options) are the only top
//      chrome on the canvas, and the map renames from the right side panel
//      into Work's device-only store;
//   4. while the canvas is up, the slot reports immersive — the signal that
//      hides the Work footer navigation — and the library restores it.
//
// The toolbar's opaque-pill geometry (bottom, solid surface, Note-Editor
// sizing) is CSS, pinned by courseMindMapReferenceChromeContract; the drag
// physics are React Flow's, exercised in real browsers by the harness
// suites. This file proves the mode gates and the Work wiring.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vite/package.json"));
const { build } = viteRequire("esbuild");

const ROOT = process.cwd();
const DIR = path.join(ROOT, "node_modules", ".tmp-work-mindmap-runtime");
fs.mkdirSync(DIR, { recursive: true });

/* ── DOM + globals (before the bundle is imported) ────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="host"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/#/work/mindmap",
});
const { window } = dom;
const define = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
define("localStorage", window.localStorage);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of [
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "SVGElement",
  "Element",
  "Node",
  "Event",
  "CustomEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "FocusEvent",
  "MutationObserver",
  "IntersectionObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
  "DOMParser",
  "Range",
  "NodeFilter",
]) {
  if (window[key] !== undefined) define(key, window[key]);
}
window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
};
window.Range.prototype.getClientRects = () => [];
window.Range.prototype.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 });

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
define("ResizeObserver", NoopObserver);
define("IntersectionObserver", NoopObserver);

// React Flow reads the canvas zoom back through DOMMatrixReadOnly; jsdom has
// none. Only the matrix fields are ever read.
class DOMMatrixReadOnlyStub {
  constructor(transform) {
    let a = 1, b = 0, c = 0, d = 1, e = 0, f = 0;
    if (typeof transform === "string") {
      const match = transform.match(/matrix\(([^)]+)\)/);
      if (match) [a, b, c, d, e, f] = match[1].split(",").map((part) => Number(part) || 0);
    }
    Object.assign(this, {
      a, b, c, d, e, f,
      m11: a, m12: b, m21: c, m22: d, m41: e, m42: f,
      m13: 0, m14: 0, m23: 0, m24: 0, m31: 0, m32: 0, m33: 1, m34: 0, m43: 0, m44: 1,
      is2D: true,
      isIdentity: a === 1 && d === 1 && !b && !c && !e && !f,
    });
  }
}
define("DOMMatrixReadOnly", DOMMatrixReadOnlyStub);
window.DOMMatrixReadOnly = DOMMatrixReadOnlyStub;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── fixture: the real Work mind map page, mounted ────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import WorkPageSurface from "./src/work/pages/WorkPageSurface";

export { act };
export const workLog = [];

const idleNotes = {
  notes: [],
  status: "ready",
  errorMessage: null,
  lastSavedAt: null,
  loading: false,
  synced: true,
  flush: () => undefined,
  reload: () => undefined,
  link: () => undefined,
  commit: () => undefined,
  add: () => null,
  edit: () => undefined,
  remove: () => undefined,
};

let root = null;
export async function mountWorkMindMap() {
  if (!root) root = createRoot(document.getElementById("host"));
  await act(async () => {
    root.render(
      <div style={{ height: "800px" }}>
        <WorkPageSurface
          page="mindmap"
          slotKey="secondary:mindmap"
          theme="light"
          orientation="column"
          notes={idleNotes}
          onExit={() => undefined}
          onToggleTheme={() => undefined}
          onImmersiveChange={(slotKey, immersive) => workLog.push("immersive:" + slotKey + ":" + immersive)}
        />
      </div>,
    );
  });
  return { unmount: () => act(async () => root.render(null)) };
}
`;

await build({
  stdin: { contents: FIXTURE, resolveDir: ROOT, loader: "tsx" },
  outfile: path.join(DIR, "fixture.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  target: "node20",
  logLevel: "silent",
  plugins: [
    {
      name: "css",
      setup(b) {
        b.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: "css-stub" }));
        b.onLoad({ filter: /.*/, namespace: "css-stub" }, () => ({ contents: "", loader: "js" }));
      },
    },
    {
      // The mind map hook imports Firebase at module level even though
      // Work's storageOnly scope never calls it. Stub the boundary so the
      // bundle stays pure ESM for jsdom (the real cloud paths are covered
      // by courseMindMapCloudSyncRuntime).
      name: "firebase-stub",
      setup(b) {
        b.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: "firestore", namespace: "firebase-stub" }));
        b.onResolve({ filter: /(^|\/)firebase$/ }, () => ({ path: "app", namespace: "firebase-stub" }));
        b.onLoad({ filter: /.*/, namespace: "firebase-stub" }, (args) =>
          args.path === "firestore"
            ? {
                contents: `
export const doc = (_db, ...parts) => ({ path: parts.join("/") });
export const collection = doc;
export const where = (field, op, value) => ({ field, op, value });
export const query = (ref, ...filters) => ({ ...ref, filters });
export const getDoc = async () => ({ exists: () => false, data: () => undefined });
export const getDocs = async () => ({ docs: [] });
export const setDoc = async () => undefined;
export const deleteDoc = async () => undefined;
`,
                loader: "js",
              }
            : {
                contents: "export const auth = { currentUser: null }; export const db = {};",
                loader: "js",
              },
        );
      },
    },
    {
      // Only the Mind Map page is under test; Work's other lazy pages are
      // covered by their own suites and are never rendered here.
      name: "work-other-pages",
      setup(b) {
        b.onResolve({ filter: /(NotesPanel|WorkSketchSurface|WorkAiSurface|WorkMyDayPage|WorkRevisionApp)$/ }, (args) => ({
          path: args.path,
          namespace: "work-page-stub",
        }));
        b.onLoad({ filter: /.*/, namespace: "work-page-stub" }, () => ({
          contents: "export default function WorkPageStub() { return null; }",
          loader: "js",
        }));
      },
    },
  ],
});

const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")).href);
const { act, workLog } = fixture;

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
  fs.rmSync(DIR, { recursive: true, force: true });
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

const $ = (selector) => window.document.querySelector(selector);
const surface = () => $("[data-work-page-surface='mindmap']");
const shell = () => $("[data-course-mindmap]");
const workHeader = () => $("[data-work-header-area='mindmap']");
const mode = () => shell()?.getAttribute("data-mindmap-mode");
const flowNodes = () => Array.from(window.document.querySelectorAll(".react-flow__node"));
const immersiveReports = () => workLog.filter((entry) => entry.startsWith("immersive:"));

const settle = async (ms = 40) => {
  await act(async () => {
    await sleep(ms);
  });
};
const click = async (element, label) => {
  assert.ok(element, `expected ${label || "element"} to exist`);
  await act(async () => {
    element.click();
    await sleep(30);
  });
};
/** ONE tap on the canvas itself (never on the chrome it carries). */
const tapCanvas = async (element) => {
  assert.ok(element, "expected the canvas to tap");
  await act(async () => {
    element.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }));
    element.dispatchEvent(new window.PointerEvent("click", { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }));
    await sleep(40);
  });
};
/** A finger held on a row: pointerdown, a pause past the long-press window, up. */
const longPress = async (element) => {
  assert.ok(element, "expected a row to press");
  const down = new window.PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
  Object.defineProperty(down, "pointerType", { value: "touch" });
  await act(async () => {
    element.dispatchEvent(down);
    await sleep(520);
  });
  await act(async () => {
    element.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await sleep(60);
  });
};

const tapNode = async (element) => {
  await act(async () => {
    element.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }));
    element.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }));
    await sleep(20);
  });
};

/* ── the flow ─────────────────────────────────────────────────────────────── */

test("Work Mind Map Editor: headless home, ONE panel, read-first maps, the eye, the tray", async () => {
  const mounted = await fixture.mountWorkMindMap();
  await settle(120);

  /* 1 — the page IS the canvas now: the EMPTY viewer page, headless, with
        Work's own header gone (the map page is the page). There is no start
        screen any more (owner, 2026-10-17). */
  assert.equal(workHeader(), null, "no Work header over the map page");
  assert.equal($("[data-course-mindmap-home]"), null, "no start screen any more");
  assert.equal($("[data-course-mindmap-library]"), null, "no library panel until it is asked for");
  assert.equal(mode(), "read", "the empty canvas is read-only");
  assert.equal(surface()?.getAttribute("data-work-immersive"), "true");
  assert.ok($("[data-mindmap-empty-hint]"), "the empty page says what it is");

  /* 2 — the tray's library button opens the ONE panel: the FULL-PAGE main
        area, exactly one button at the very bottom. */
  await click($("[data-mindmap-read-library]"), "the tray's library button");
  await settle(60);
  const panel = $("[data-mindmap-left-panel]");
  assert.ok(panel, "the ONE side panel opens");
  assert.ok(panel.hasAttribute("data-course-mindmap-library"), "…and it IS the map library");
  assert.ok(panel.classList.contains("inset-0"), "the panel is the full-page main area");
  const head = panel.querySelector("[data-mindmap-panel-head]");
  assert.ok(head, "the panel has its head");
  assert.ok(head.querySelector("[data-mindmap-panel-back]"), "…and the way back");
  // Work is device-only: there is no MASTER collection to switch to, so the
  // head names the scope instead of offering a tab that leads nowhere.
  assert.match(head.textContent, /My mind maps/);
  const footButtons = Array.from(panel.querySelectorAll("[data-mindmap-panel-foot] button"));
  assert.equal(footButtons.length, 1, "exactly ONE button at the bottom of the panel");
  assert.ok(footButtons[0].hasAttribute("data-mindmap-panel-new"), "…and it is New mind map");
  assert.equal(panel.querySelector("[data-mindmap-panel-library]"), null, "the old \"Open full library\" button is gone");
  assert.equal(panel.querySelector("[data-mindmap-close-left-panel]"), null, "and so is the panel's X — the strip closes it");
  const row = panel.querySelector("[data-course-mindmap-open-map='main']");
  assert.ok(row, "the saved map is a row in the panel");
  assert.equal(row.querySelector("[data-branched-rename-button], [data-branched-delete]"), null, "rows carry no pencil / trash");

  /* 3 — a row opens the map READ-first, headless and immersive. */
  await click(row, "the saved map row");
  await settle(180);
  assert.equal($("[data-mindmap-left-panel]"), null, "the panel closes over the canvas");
  assert.equal(mode(), "read", "a map opens as a preview, not in edit mode");
  assert.equal(workHeader(), null, "no Work header over the canvas");
  assert.ok(
    immersiveReports().includes("immersive:secondary:mindmap:true"),
    "the slot reports immersive — the signal that hides the Work footer navigation",
  );

  /* 4 — read mode's tray: the note page's read navigation, and the map page's
        ONLY chrome (no header, no corner buttons, no options drawer). */
  const tray = $("[data-mindmap-read-tray]");
  assert.ok(tray, "read mode's bottom tray is up");
  for (const hook of ["data-mindmap-read-library", "data-mindmap-read-new", "data-mindmap-read-edit"]) {
    assert.ok(tray.querySelector(`[${hook}]`), `${hook} in the tray`);
  }
  // No home button any more (owner, 2026-10-17).
  assert.equal(tray.querySelector("[data-mindmap-read-home]"), null, "no home button in the tray");
  assert.equal($("[data-course-mindmap-status]"), null, "no editing toolbar in read mode");
  assert.equal(
    $("[data-mindmap-open-left-panel], [data-mindmap-open-right-panel], [data-mindmap-editor-chrome], [data-mindmap-right-panel]"),
    null,
    "nothing in the page's chrome opens a panel, and the options drawer is gone",
  );

  /* 1+2 — a tap and a double-tap never unlock editing, and nodes cannot drag. */
  const node = $("[data-mind-node]");
  assert.ok(node, "the root node rendered");
  await tapNode(node);
  await tapNode(node);
  await act(async () => {
    node.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    $("[data-course-mindmap-canvas]").dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    await sleep(30);
  });
  assert.equal(mode(), "read", "double-tap on the preview never enters edit mode");
  assert.equal($("[data-mind-node-input]"), null, "no inline node editor opened in preview");
  assert.ok(flowNodes().length > 0, "React Flow nodes are mounted");
  assert.ok(
    flowNodes().every((element) => !element.classList.contains("draggable")),
    "nodes are not draggable in preview/read mode",
  );

  /* 5 — ONE tap on the canvas hides the tray (the side-panel button and the
        rest); the next tap brings it straight back. */
  const canvas = $("[data-course-mindmap-canvas]");
  await tapCanvas(canvas);
  assert.equal($("[data-mindmap-read-tray]"), null, "a tap on the canvas hides read mode's tray");
  await tapCanvas(canvas);
  assert.ok($("[data-mindmap-read-tray]"), "and the next tap shows it again");

  /* 6 — the tray's pencil enters edit mode; the EYE at the front of the toolbar
        — the same design as every tool beside it — goes back to reading. */
  await click($("[data-mindmap-read-edit]"), "the tray's pencil");
  await settle(90);
  assert.equal(mode(), "edit", "the tray's pencil enters edit mode explicitly");
  const strip = $("[data-course-mindmap-status]");
  assert.ok(strip, "the bottom editing toolbar is mounted in edit mode");
  const eye = strip.querySelector("[data-mindmap-edit-read]");
  assert.ok(eye, "the eye leads the editing toolbar");
  assert.ok(eye.classList.contains("mm-tool"), "…in the same design as every other tool on the bar");
  assert.ok(eye.querySelector("svg"), "…with the eye for its glyph");
  assert.equal(eye.textContent.trim(), "", "…and no text capsule");
  assert.equal(strip.firstElementChild, eye, "it is the FIRST control of the bar");
  assert.ok(
    flowNodes().some((element) => element.classList.contains("draggable")),
    "nodes are draggable only in edit mode",
  );
  await click(eye, "the eye — back to reading");
  await settle(80);
  assert.equal(mode(), "read", "the eye returns to the read view");
  assert.ok($("[data-mindmap-read-tray]"), "…with its tray");

  /* 7 — the tray's library button opens the panel again; a LONG PRESS on a row
        offers Rename, and Rename turns that row's own name into an input that
        writes through Work's device-only store. */
  await click($("[data-mindmap-read-library]"), "the tray's library button");
  await settle(60);
  const panelAgain = $("[data-mindmap-left-panel]");
  assert.ok(panelAgain, "the tray's library button opens the ONE panel");
  await longPress(panelAgain.querySelector("[data-course-mindmap-open-map='main']"));
  const popup = $("[data-branched-menu-popup]");
  assert.ok(popup, "a long press opens the row's actions");
  await click(popup.querySelector("[data-branched-menu-rename]"), "Rename");
  await settle(40);
  const renameInput = $("[data-branched-rename-input]");
  assert.ok(renameInput, "Rename turns the row's own name into an input");
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setValue.call(renameInput, "Renamed work map");
    renameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
    await sleep(20);
  });
  await act(async () => {
    renameInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await sleep(80);
  });
  const mirror = window.localStorage.getItem("dc.mindMap.v1.work-device.workbench.personal-workspace.main");
  assert.ok(mirror && mirror.includes("Renamed work map"), "the rename persisted to the Work device mirror");

  /* 8 — the scrim closes the panel, and Escape leaves the map: the page goes
        back to the EMPTY canvas (there is no home button and no start screen
        any more). */
  await click($("[data-mindmap-panel-scrim]"), "the scrim");
  await settle(60);
  assert.equal($("[data-mindmap-left-panel]"), null, "tapping the scrim closes the panel");
  await act(async () => {
    $("[data-course-mindmap-canvas]").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(80);
  });
  assert.ok($("[data-mindmap-empty-hint]"), "back on the empty canvas page");
  assert.equal(workHeader(), null, "the Work header stays away — the map page is the page");
  assert.equal(surface()?.getAttribute("data-work-immersive"), "true");

  await mounted.unmount();
});
