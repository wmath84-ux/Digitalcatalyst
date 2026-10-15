// tests/workModeSketchRuntime.test.mjs
//
// RUNTIME proof that Work Mode's Sketch Editor is the Course Player's
// updated Full Editor (the same SketchPanel) with Work's shell rules
// around it, driven here inside the real WorkPageSurface +
// WorkSketchSurface in jsdom:
//
//   1. the Full Editor's clean header (side-panel button · save state ·
//      New canvas · Edit · mode switch — no canvas dropdown in the header);
//   2. the horizontal sketch tray directly under the header; selecting a
//      chip switches canvas, and the header's New canvas creates one;
//   3. the side panel opens from the header button and hides on any
//      outside click (canvas included) or Escape;
//   4. drawing persists through Work's device-only store: a change the
//      editor reports lands as "Saved on this device";
//   5. the sketch slot is immersive from the first frame — the signal
//      that hides the Work footer navigation (and the Work header).
//
// Excalidraw itself needs a real canvas, so the `@excalidraw/excalidraw`
// module is stubbed with a probe that records the props SketchPanel hands
// it (view-mode, onChange) and renders a host box; every panel behaviour
// around it — header, tray, side panel, saving — is the real code. The
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
  return React.createElement("div", {
    "data-excalidraw-stub": "",
    "data-view-mode": props.viewModeEnabled ? "true" : "false",
  });
}
export function useHandleLibrary() {}
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
const header = () => $("[data-course-sketch-status]");
const status = () => header()?.getAttribute("data-course-sketch-status");
const trayChips = () => $$("[data-course-sketch-page]");
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

test("Work Sketch Editor: clean header, tray, new canvas, side panel, drawing save, footer hidden", async () => {
  const mounted = await fixture.mountWorkSketch();
  await settle(250);

  /* 6 — immersive from the first frame: no Work header, footer signal on. */
  assert.equal($("[data-work-header-area]"), null, "no Work header over the sketch editor");
  assert.equal(surface()?.getAttribute("data-work-immersive"), "true");
  assert.ok(
    workLog.includes("immersive:secondary:sketch:true"),
    "the slot reports immersive — the signal that hides the Work footer navigation",
  );

  /* 1 — the Full Editor's clean header. */
  assert.ok(header(), "the sketch header is mounted");
  assert.ok(header().querySelector("[data-course-sketch-side-panel-toggle]"), "side-panel button in the header");
  assert.ok(header().querySelector("[data-course-sketch-new-canvas]"), "New canvas in the header");
  assert.ok(header().querySelector("[data-course-sketch-edit-toggle]"), "Edit toggle in the header");
  assert.ok(header().querySelector("[data-course-sketch-mode]"), "Full Editor / Quick Sketch switch in the header");
  assert.equal(
    header().querySelector("[data-course-sketch-boards]"),
    null,
    "the canvas switcher dropdown is NOT in the header (tray + side panel own it)",
  );
  assert.equal($("[data-course-sketch-panel]")?.getAttribute("data-work-storage-only"), "true", "Work's device-only scope");

  /* 2 — the horizontal tray under the header, and canvas selection. */
  const tray = $("[data-course-sketch-pages-tray]");
  assert.ok(tray, "the sketch pages tray sits under the header");
  assert.equal(trayChips().length, 1, "one canvas to start");
  assert.equal(trayChips()[0].getAttribute("data-active"), "true");

  /* 3 — side panel: header button opens it; outside click hides it. */
  await click($("[data-course-sketch-side-panel-toggle]"), "the side-panel button");
  await settle(40);
  const sidePanel = $("[data-course-sketch-side-panel]");
  assert.ok(sidePanel, "the side panel opens from the header button");
  assert.ok(sidePanel.querySelector("[data-course-sketch-boards]"), "the canvas list lives in the side panel");
  await outsidePress($("[data-course-sketch-host]"));
  assert.equal($("[data-course-sketch-side-panel]"), null, "an outside click on the canvas hides the side panel");
  await click($("[data-course-sketch-side-panel-toggle]"), "the side-panel button again");
  await settle(40);
  assert.ok($("[data-course-sketch-side-panel]"), "the side panel reopens");
  await act(async () => {
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(30);
  });
  assert.equal($("[data-course-sketch-side-panel]"), null, "Escape hides the side panel too");

  /* 2b — New canvas from the header, then tray selection back. */
  const firstKey = trayChips()[0].getAttribute("data-course-sketch-page");
  await click($("[data-course-sketch-new-canvas]"), "New canvas in the header");
  await settle(120);
  assert.equal(trayChips().length, 2, "the new canvas joins the tray");
  const second = trayChips().find((chip) => chip.getAttribute("data-course-sketch-page") !== firstKey);
  assert.ok(second, "the new canvas chip");
  assert.equal(second.getAttribute("data-active"), "true", "the new canvas opens, like a normal editor");
  await click(trayChips().find((chip) => chip.getAttribute("data-course-sketch-page") === firstKey), "the first canvas chip");
  await settle(120);
  assert.equal(
    trayChips().find((chip) => chip.getAttribute("data-course-sketch-page") === firstKey).getAttribute("data-active"),
    "true",
    "tray selection switches back to the first canvas",
  );

  /* 4 — drawing + saving: view mode first, Edit unlocks the canvas, and a
        reported drawing lands in Work's device-only store. */
  assert.equal(probe().props.viewModeEnabled, true, "the canvas opens in view mode");
  await click($("[data-course-sketch-edit-toggle]"), "Edit sketch");
  await settle(60);
  assert.equal($("[data-course-sketch-panel]")?.getAttribute("data-sketch-editing"), "true");
  assert.equal(probe().props.viewModeEnabled, false, "Edit switches the canvas to drawing");
  await act(async () => {
    probe().props.onChange([RECTANGLE], { viewBackgroundColor: "#ffffff" }, {});
    await sleep(30);
  });
  await settle(1100);
  assert.equal(status(), "saved", "the drawing reached the saved state");
  assert.ok(header().textContent.includes("Saved on this device"), "the save line says where it saved — this device only");

  /* The drawn element is still there after switching canvas away and back. */
  await click(second, "the second canvas chip");
  await settle(150);
  await click(trayChips().find((chip) => chip.getAttribute("data-course-sketch-page") === firstKey), "back to the drawn canvas");
  await settle(200);
  const elements = probe().props.initialData?.elements ?? [];
  assert.ok(
    elements.some((element) => element.id === "rect-1"),
    "the drawing survived a canvas round-trip (it was saved, not just shown)",
  );

  await mounted.unmount();
});
