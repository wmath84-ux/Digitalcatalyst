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
const tapNode = async (element) => {
  await act(async () => {
    element.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }));
    element.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }));
    await sleep(20);
  });
};

/* ── the flow ─────────────────────────────────────────────────────────────── */

test("Work Mind Map Editor: preview locks, edit unlocks, rename saves, footer follows", async () => {
  const mounted = await fixture.mountWorkMindMap();
  await settle(120);

  /* Library: Work header on, no canvas yet, footer reported visible. */
  assert.ok(workHeader(), "the Work header is present on the map library");
  assert.ok($("[data-course-mindmap-library]"), "the map library is the home screen");
  assert.equal(surface()?.getAttribute("data-work-immersive"), "false");

  /* Open the device map → the canvas in PREVIEW/read mode. */
  await click($("[data-course-mindmap-open-map='main']"), "the saved map row");
  await settle(150);
  assert.equal($("[data-course-mindmap-library]"), null, "the library drawer closed over the canvas");
  assert.equal(mode(), "read", "a map opens as a preview, not in edit mode");
  assert.equal(workHeader(), null, "no Work header over the canvas");
  assert.ok(
    immersiveReports().includes("immersive:secondary:mindmap:true"),
    "the slot reports immersive — the signal that hides the Work footer navigation",
  );

  /* 5 — the only top chrome: left (library) + right (options) corner buttons. */
  assert.ok($("[data-mindmap-open-left-panel]"), "top-left side-panel button");
  assert.ok($("[data-mindmap-open-right-panel]"), "top-right side-panel button");
  assert.equal($("[data-mindmap-editor-chrome]")?.querySelectorAll("button").length, 2);

  /* 1+2 — preview interactions: taps and double-taps never unlock editing,
        and nodes cannot be dragged. */
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
  assert.equal($("[data-course-mindmap-status]"), null, "no editing toolbar in preview");

  /* Enter edit mode explicitly from Map options. */
  await click($("[data-mindmap-open-right-panel]"), "the map options button");
  await settle(50);
  assert.ok($("[data-mindmap-right-panel]"), "the right side panel opens");

  /* 6 — rename from the side panel, saved into the device-only store. */
  const renameInput = $("[data-mindmap-rename-input]");
  assert.ok(renameInput, "the side panel's rename field");
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setValue.call(renameInput, "Renamed work map");
    renameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
    await sleep(10);
  });
  await click($("[data-mindmap-rename-save]"), "the rename Save button");
  await settle(60);
  assert.ok(
    $("[data-mindmap-right-panel]").textContent.includes("Renamed work map"),
    "the panel shows the renamed map",
  );
  const mirror = window.localStorage.getItem("dc.mindMap.v1.work-device.workbench.personal-workspace.main");
  assert.ok(mirror && mirror.includes("Renamed work map"), "the rename persisted to the Work device mirror");

  /* Edit mode: toolbar up, nodes draggable. */
  await click($("[data-course-mindmap-edit]"), "Edit map in the side panel");
  await settle(80);
  assert.equal(mode(), "edit", "Edit map enters edit mode explicitly");
  assert.ok($("[data-course-mindmap-status]"), "the bottom editing toolbar is mounted in edit mode");
  assert.ok(
    flowNodes().some((element) => element.classList.contains("draggable")),
    "nodes are draggable only in edit mode",
  );

  /* Back to reading view, then the library: Work chrome + footer restore. */
  await click($("[data-mindmap-open-right-panel]"), "the map options button");
  await settle(40);
  await click($("[data-mindmap-panel-read]"), "Reading view in the side panel");
  await settle(60);
  assert.equal(mode(), "read", "Reading view returns to preview");
  await click($("[data-mindmap-open-left-panel]"), "the map library button");
  await settle(40);
  await click($("[data-mindmap-panel-library]"), "Open full library in the side panel");
  await settle(80);
  assert.ok($("[data-course-mindmap-library]"), "back on the map library");
  assert.ok(workHeader(), "the Work header returns on the library");
  assert.equal(surface()?.getAttribute("data-work-immersive"), "false");
  assert.equal(
    immersiveReports().at(-1),
    "immersive:secondary:mindmap:false",
    "the slot reports non-immersive again — the Work footer navigation is restored",
  );

  await mounted.unmount();
});
