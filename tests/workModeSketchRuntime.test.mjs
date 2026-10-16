// tests/workModeSketchRuntime.test.mjs
//
// RUNTIME proof that Work Mode's Sketch Editor is the Course Player's
// updated Full Editor (the same SketchPanel) with Work's shell rules
// around it, driven here inside the real WorkPageSurface +
// WorkSketchSurface in jsdom:
//
//   1. the page is headless — no header at all, just the quiet save chip;
//   2. the canvases are the panel's rows: a row switches canvas, the panel's
//      own foot button creates one, and a row's long press renames it in
//      place (through Work's device-only store);
//   3. the panel opens from the bottom tray's button and hides on any
//      outside click (canvas included) or Escape;
//   4. drawing persists through Work's device-only store: a change the
//      editor reports lands as "Saved on this device";
//   5. the sketch slot is immersive from the first frame — the signal
//      that hides the Work footer navigation (and the Work header).
//
// Excalidraw itself needs a real canvas, so the `@excalidraw/excalidraw`
// module is stubbed with a probe that records the props SketchPanel hands
// it (view-mode, onChange) and renders a host box; every panel behaviour
// around it — the tray, the panel, saving — is the real code. The
// real-canvas drawing suites live in the Chromium harness.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import "fake-indexeddb/auto";

const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vite/package.json"));
const { build } = viteRequire("esbuild");

const ROOT = process.cwd();
const DIR = path.join(ROOT, "node_modules", ".tmp-work-sketch-runtime");
fs.mkdirSync(DIR, { recursive: true });

/* ── DOM + globals (before the bundle is imported) ────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="host"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/#/work/sketch",
});
const { window } = dom;
const define = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
define("localStorage", window.localStorage);
// indexedDB comes from fake-indexeddb/auto — jsdom's window has none, and
// copying it across would overwrite the fake with undefined.
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── fixture: the real Work sketch page, mounted ──────────────────────────── */

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
export async function mountWorkSketch() {
  if (!root) root = createRoot(document.getElementById("host"));
  await act(async () => {
    root.render(
      <div style={{ height: "800px" }}>
        <WorkPageSurface
          page="sketch"
          slotKey="secondary:sketch"
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

const EXCALIDRAW_STUB = `
import * as React from "react";
const probe = (globalThis.__workSketchExcalidraw ??= { renders: 0, props: null });
export function Excalidraw(props) {
  probe.renders += 1;
  probe.props = props;
  // The page's own trays are Excalidraw's CHILDREN (they rest on the canvas's
  // bottom edge), so the probe renders them the way the editor does.
  return React.createElement(
    "div",
    { "data-excalidraw-stub": "", "data-view-mode": props.viewModeEnabled ? "true" : "false" },
    props.children,
  );
}
export function useHandleLibrary() {}
// The tray's Clear is ONE undoable step, exactly like Excalidraw's own action.
export const CaptureUpdateAction = { IMMEDIATELY: "immediately", NEVER: "never", EVENTUALLY: "eventually" };
const Null = () => null;
export function MainMenu({ children }) {
  return React.createElement(React.Fragment, null, children);
}
MainMenu.DefaultItems = {
  LoadScene: Null,
  SaveToActiveFile: Null,
  Export: Null,
  SaveAsImage: Null,
  SearchMenu: Null,
  Help: Null,
  ClearCanvas: Null,
  ChangeCanvasBackground: Null,
};
MainMenu.Separator = Null;
export function Sidebar({ children }) {
  return React.createElement("div", { "data-excalidraw-sidebar-stub": "" }, children);
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
      name: "excalidraw-stub",
      setup(b) {
        b.onResolve({ filter: /^@excalidraw\/excalidraw$/ }, () => ({ path: "excalidraw", namespace: "excalidraw-stub" }));
        b.onLoad({ filter: /.*/, namespace: "excalidraw-stub" }, () => ({ contents: EXCALIDRAW_STUB, loader: "tsx", resolveDir: ROOT }));
      },
    },
    {
      // Work's storageOnly scope never calls Firebase, but the sketch hooks
      // import it at module level; stub the boundary (real cloud paths are
      // covered by the course sketch suites).
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
      // Only the Sketch page is under test; Work's other lazy pages are
      // covered by their own suites and are never rendered here.
      name: "work-other-pages",
      setup(b) {
        b.onResolve({ filter: /(NotesPanel|WorkMindMapSurface|WorkAiSurface|WorkMyDayPage|WorkRevisionApp)$/ }, (args) => ({
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
const $$ = (selector) => Array.from(window.document.querySelectorAll(selector));
const surface = () => $("[data-work-page-surface='sketch']");
// The quiet save chip is the page's only top chrome (there is no header).
const chip = () => $("[data-course-sketch-status]");
const status = () => chip()?.getAttribute("data-course-sketch-status");
const rows = () => $$("[data-course-sketch-canvas-row]");
const rowKey = (row) => row.getAttribute("data-course-sketch-canvas-row");
const probe = () => globalThis.__workSketchExcalidraw;

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
// The side panel listens for document mousedown, exactly like a real tap
// landing on the canvas.
const outsidePress = async (element) => {
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await sleep(30);
  });
};

// BranchedMenu's long press: a touch press held past its threshold opens the
// row's own actions menu (rename / delete) instead of selecting the row.
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

const RECTANGLE = {
  id: "rect-1",
  type: "rectangle",
  x: 10,
  y: 20,
  width: 120,
  height: 80,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  index: "a0",
  roundness: { type: 3 },
  seed: 42,
  version: 1,
  versionNonce: 7,
  isDeleted: false,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
  customData: null,
};

/* ── the flow ─────────────────────────────────────────────────────────────── */

test("Work Sketch Editor: headless page, tray doors, panel canvases, drawing save, footer hidden", async () => {
  const mounted = await fixture.mountWorkSketch();
  await settle(250);

  /* 6 — immersive from the first frame: no Work header, footer signal on. */
  assert.equal($("[data-work-header-area]"), null, "no Work header over the sketch editor");
  assert.equal(surface()?.getAttribute("data-work-immersive"), "true");
  assert.ok(
    workLog.includes("immersive:secondary:sketch:true"),
    "the slot reports immersive — the signal that hides the Work footer navigation",
  );

  /* 1 — headless: no page header, no pages tray, one quiet chip. */
  assert.equal($("[data-course-sketch-status-bar]"), null, "the old header is gone");
  assert.equal(Boolean(chip()), true, "the quiet save chip is mounted");
  assert.equal($("[data-course-sketch-pages-tray]"), null, "the pages tray under the header is gone");
  assert.equal($("[data-course-sketch-side-panel-toggle]"), null);
  assert.equal($("[data-course-sketch-new-canvas]"), null);
  assert.equal(
    $("[data-course-sketch-panel]")?.getAttribute("data-work-storage-only"),
    "true",
    "Work's device-only scope",
  );

  /* 2 — READ FIRST: the canvas takes no marks, and the tray carries the doors. */
  assert.equal(probe().props.viewModeEnabled, true, "the canvas opens view-only");
  assert.equal($("[data-course-sketch-panel]")?.getAttribute("data-sketch-editing"), "false");
  const readTray = $("[data-course-sketch-read-tray]");
  assert.equal(Boolean(readTray), true, "read mode's tray is mounted");
  assert.equal(Boolean(readTray.querySelector("[data-course-sketch-read-panel]")), true, "the tray's panel button");
  assert.equal(Boolean(readTray.querySelector("[data-course-sketch-read-edit]")), true, "the tray's pencil");
  assert.equal($("[data-course-sketch-edit-tray]"), null, "the editing tray is not mounted while reading");

  /* 3 — the panel opens from that tray button and hides on an outside click. */
  await click($("[data-course-sketch-read-panel]"), "the tray's panel button");
  await settle(40);
  const sidePanel = $("[data-course-sketch-side-panel]");
  assert.equal(Boolean(sidePanel), true, "the ONE side panel opens from the tray button");
  assert.equal(rows().length, 1, "one canvas to start");
  assert.equal(sidePanel.querySelector("[data-course-sketch-canvas-row]").getAttribute("data-active"), "", "it is the open canvas");
  await outsidePress($("[data-course-sketch-host]"));
  assert.equal(Boolean($("[data-course-sketch-side-panel]")), false, "an outside click on the canvas hides the side panel");
  await click($("[data-course-sketch-read-panel]"), "the tray's panel button again");
  await settle(40);
  assert.equal(Boolean($("[data-course-sketch-side-panel]")), true, "the side panel reopens");
  await act(async () => {
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(30);
  });
  assert.equal(Boolean($("[data-course-sketch-side-panel]")), false, "Escape hides the side panel too");

  /* 4 — the panel's own foot button creates a canvas. */
  await click($("[data-course-sketch-read-panel]"), "the tray's panel button");
  await settle(40);
  const firstKey = rowKey(rows()[0]);
  await click($("[data-course-sketch-panel-new]"), "New sketch in the panel");
  await settle(140);
  await click($("[data-course-sketch-read-panel]"), "the tray's panel button");
  await settle(60);
  assert.equal(rows().length, 2, "the new canvas joins the panel's list");
  const second = rows().find((row) => rowKey(row) !== firstKey);
  assert.ok(second, "the new canvas row");
  assert.equal(second.getAttribute("data-active"), "", "the new canvas opens, like a normal editor");

  /* 4b — a row's long press offers Rename, and rename edits that row in place. */
  await longPress(second);
  const popup = $("[data-branched-menu-popup]");
  assert.equal(Boolean(popup), true, "a long press opens the row's own actions");
  await click(popup.querySelector("[data-branched-menu-rename]"), "Rename");
  await settle(40);
  const renameInput = $("[data-branched-rename-input]");
  assert.equal(Boolean(renameInput), true, "Rename turns the row's own name into an input");
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setValue.call(renameInput, "Renamed work canvas");
    renameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
    await sleep(20);
  });
  await act(async () => {
    renameInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await sleep(80);
  });
  assert.ok(
    rows().some((row) => row.textContent.includes("Renamed work canvas")),
    "the renamed canvas shows its new name in the panel",
  );

  /* 5 — selecting a row switches canvas; the first is still the default one. */
  await click(rows().find((row) => rowKey(row) === firstKey), "the first canvas row");
  await settle(140);
  await click($("[data-course-sketch-read-panel]"), "the tray's panel button");
  await settle(60);
  assert.equal(
    rows().find((row) => rowKey(row) === firstKey).getAttribute("data-active"),
    "",
    "the panel's rows switch canvas back",
  );

  /* 6 — the pencil unlocks the canvas, and the editing tray is the page's bar.
        (The panel is closed first: while it is open the whole page belongs to
        it, and a tap on the canvas is deliberately not a tap.) */
  await click($("[data-course-sketch-read-panel]"), "the tray's panel button — closing it");
  await settle(40);
  await click($("[data-course-sketch-read-edit]"), "the tray's pencil");
  await settle(80);
  assert.equal($("[data-course-sketch-panel]")?.getAttribute("data-sketch-editing"), "true");
  assert.equal(probe().props.viewModeEnabled, false, "the pencil switches the canvas to drawing");
  const editTray = $("[data-course-sketch-edit-tray]");
  assert.equal(Boolean(editTray), true, "the editing tray replaces the read tray");
  assert.equal(Boolean($("[data-course-sketch-read-tray]")), false);
  for (const hook of [
    "data-course-sketch-edit-panel",
    "data-course-sketch-edit-read",
    "data-course-sketch-edit-draw",
    "data-course-sketch-edit-erase",
    "data-course-sketch-edit-undo",
    "data-course-sketch-edit-redo",
    "data-course-sketch-edit-clear",
    "data-course-sketch-edit-colour",
  ]) {
    assert.equal(Boolean(editTray.querySelector(`[${hook}]`)), true, `the editing tray carries ${hook}`);
  }
  assert.equal(Boolean(editTray.querySelector("[data-course-sketch-mode]")), true, "…and the Full Editor / Quick Sketch switch");

  /* 7 — drawing + saving: a reported drawing lands in Work's device-only store. */
  await act(async () => {
    probe().props.onChange([RECTANGLE], { viewBackgroundColor: "#ffffff" }, {});
    await sleep(30);
  });
  await settle(1100);
  assert.equal(status(), "saved", "the drawing reached the saved state");
  assert.ok(
    chip().textContent.includes("Saved on this device"),
    "the chip says where it saved — this device only",
  );

  /* 8 — the eye returns to reading, and ONE tap on the canvas hides the whole
        tray (the panel button included); the next tap brings it back. */
  await click($("[data-course-sketch-edit-read]"), "the tray's eye");
  await settle(80);
  assert.equal(probe().props.viewModeEnabled, true, "the eye takes the canvas back to view-only");
  assert.equal(Boolean($("[data-course-sketch-read-tray]")), true, "…with its read tray");
  await click($("[data-course-sketch-canvas]"), "the canvas");
  await settle(40);
  assert.equal(Boolean($("[data-course-sketch-read-tray]")), false, "one tap hides the whole tray");
  await click($("[data-course-sketch-canvas]"), "the canvas again");
  await settle(40);
  assert.equal(Boolean($("[data-course-sketch-read-tray]")), true, "the next tap restores it");

  /* 9 — the drawing survives a canvas round-trip (it was saved, not just shown). */
  await click($("[data-course-sketch-read-panel]"), "the tray's panel button");
  await settle(60);
  await click(rows().find((row) => rowKey(row) !== firstKey), "the other canvas row");
  await settle(160);
  await click($("[data-course-sketch-read-panel]"), "the tray's panel button");
  await settle(60);
  await click(rows().find((row) => rowKey(row) === firstKey), "back to the drawn canvas");
  await settle(200);
  const elements = probe().props.initialData?.elements ?? [];
  assert.ok(
    elements.some((element) => element.id === "rect-1"),
    "the drawing survived a canvas round-trip (it was saved, not just shown)",
  );

  await mounted.unmount();
});
