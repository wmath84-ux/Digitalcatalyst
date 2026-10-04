// tests/courseSketchToolbarRuntime.test.mjs
//
// The Sketch tab's TOOLBAR, for real. The other three sketch files prove the
// scene model, the persistence and the integration's shape in text; this one
// mounts the actual `SketchPanel` — and through it the actual, INSTALLED
// `@excalidraw/excalidraw` editor — in jsdom, so the toolbar can be read as
// DOM instead of as a claim.
//
// What it proves, in behaviour rather than in text:
//   1. the STICKY NOTE tool — the colourful "card" button the toolbar was
//      missing — is in the editor's main toolbar (its own `data-testid`, its
//      own accessible name), and it is not hidden in a menu;
//   2. clicking it activates the note tool inside the editor's own appState,
//      which is what draws a note;
//   3. the panel's canvas control really drives the editor: the White swatch
//      puts `theme: "light"` + `#ffffff` into Excalidraw's appState and the
//      editor reports it back through `onChange` — the exact chain the
//      persistence hook hangs off;
//   4. the pencil icon opens the full-RGB picker.
//
// jsdom has no canvas, no fonts and no layout, so the browser APIs Excalidraw
// needs are stubbed below and the 2D context answers without painting. The
// toolbar and appState are real: that is the part under test.

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
const DIR = path.join(ROOT, "node_modules", ".tmp-course-sketch-toolbar");
fs.mkdirSync(DIR, { recursive: true });

/* ── fixture: the REAL panel, mounted ────────────────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import SketchPanel from "./src/course/SketchPanel";

export { act };
export const latest: { changes: any[]; marked: number } = { changes: [], marked: 0 };

const scene = () => ({ version: 1, elements: [], appState: {}, files: {} });

export function mount(target: HTMLElement, uid: string) {
  function Harness() {
    return (
      <SketchPanel
        getScene={scene}
        sceneKey={"u1__p1__m1#0"}
        loading={false}
        status={"ready"}
        errorMessage={null}
        pendingSync={false}
        scoped
        boardName={"Module 1"}
        uid={uid}
        onChange={(elements: any, appState: any, files: any) => {
          latest.changes.push({ elements, appState, files });
        }}
        markSceneChanged={() => {
          latest.marked += 1;
        }}
      />
    );
  }
  const root = createRoot(target);
  act(() => {
    root.render(<Harness />);
  });
  return root;
}
`;

await build({
  stdin: { contents: FIXTURE, resolveDir: ROOT, loader: "tsx" },
  outfile: path.join(DIR, "fixture.mjs"),
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  target: "chrome96",
  // `production` so the package's exports map resolves to its prod entry and
  // stylesheet — the same files Vite picks for a build.
  conditions: ["production"],
  loader: { ".css": "empty" },
  define: { "process.env.NODE_ENV": '"development"' },
  absWorkingDir: ROOT,
  logLevel: "silent",
});

/* ── Node's own timers ───────────────────────────────────────────────────────
   The bundled editor schedules a few long-lived things (idle detection,
   autosave bookkeeping) on Node's timers rather than jsdom's, which would
   otherwise keep the runtime alive long after the last assertion. Every handle
   created from here on is recorded and released on the way out. */

const nodeTimers = new Set();
for (const name of ["setTimeout", "setInterval"]) {
  const original = globalThis[name];
  globalThis[name] = (...args) => {
    const handle = original(...args);
    nodeTimers.add(handle);
    return handle;
  };
}
const releaseTimers = () => {
  for (const handle of nodeTimers) {
    clearTimeout(handle);
    clearInterval(handle);
  }
  nodeTimers.clear();
};

/* ── DOM + the browser APIs the editor expects ───────────────────────────── */

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
define("localStorage", window.localStorage);
define("sessionStorage", window.sessionStorage);
define("devicePixelRatio", 1);
// React 19's act() wants the flag; the editor's own updates then stay quiet.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of [
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "KeyboardEvent",
  "PointerEvent",
  "DOMRect",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
]) {
  if (window[key] !== undefined) define(key, window[key]);
}

/** jsdom has no ResizeObserver; the editor observes its own container. */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
define("ResizeObserver", ResizeObserverStub);
window.ResizeObserver = ResizeObserverStub;

define("requestIdleCallback", (callback) =>
  setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0),
);
window.requestIdleCallback = globalThis.requestIdleCallback;
define("cancelIdleCallback", (handle) => clearTimeout(handle));
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
}
define("matchMedia", window.matchMedia);

/** Fonts are fetched from a path that does not exist here; the editor copes. */
class FontFaceStub {
  constructor(family, source, descriptors) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;
    this.status = "loaded";
  }

  load() {
    return Promise.resolve(this);
  }
}
define("FontFace", FontFaceStub);
window.FontFace = FontFaceStub;
if (!window.document.fonts) {
  Object.defineProperty(window.document, "fonts", {
    value: { add() {}, delete() {}, clear() {}, has: () => false, ready: Promise.resolve() },
    configurable: true,
  });
}

/** `Path2D.roundRect` is patched in by the editor's own polyfill at import. */
class Path2DStub {
  addPath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  arc() {}
  arcTo() {}
  ellipse() {}
  rect() {}
  roundRect() {}
  closePath() {}
}
define("Path2D", Path2DStub);
window.Path2D = Path2DStub;
if (window.DOMMatrix === undefined) {
  window.DOMMatrix = class DOMMatrixStub {};
  define("DOMMatrix", window.DOMMatrix);
}

/**
 * A 2D context that answers every question and paints nothing. Only the
 * toolbar DOM and the appState are under test — never a pixel.
 */
const makeContext = () => {
  const own = {};
  return new Proxy(own, {
    get(_target, property) {
      if (property === "measureText") {
        return () => ({
          width: 10,
          actualBoundingBoxAscent: 8,
          actualBoundingBoxDescent: 2,
          fontBoundingBoxAscent: 8,
          fontBoundingBoxDescent: 2,
        });
      }
      if (property === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      if (property === "createLinearGradient" || property === "createRadialGradient") {
        return () => ({ addColorStop() {} });
      }
      if (property === "canvas") return null;
      if (property in own) return own[property];
      return () => undefined;
    },
    set(_target, property, value) {
      own[property] = value;
      return true;
    },
  });
};
window.HTMLCanvasElement.prototype.getContext = (kind) =>
  kind === "webgl" || kind === "webgl2" || kind === "bitmaprenderer" ? null : makeContext();
window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,";
if (window.OffscreenCanvas === undefined) {
  window.OffscreenCanvas = class OffscreenCanvasStub {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }

    getContext() {
      return makeContext();
    }

    convertToBlob() {
      return Promise.resolve({ type: "image/png", size: 0 });
    }

    transferToImageBitmap() {
      return {};
    }
  };
  define("OffscreenCanvas", window.OffscreenCanvas);
}
if (!window.SVGElement.prototype.getBBox) {
  window.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
}
window.URL.createObjectURL = () => "blob:stub";
window.URL.revokeObjectURL = () => {};

/* ── mount ───────────────────────────────────────────────────────────────── */

const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")).href);
const { act } = fixture;
const host = window.document.getElementById("host");
const root = fixture.mount(host, "u1");
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 400));
});

const find = (selector) => host.querySelector(selector);
const click = (element) => {
  act(() => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
};

after(() => {
  releaseTimers();
  window.close();
  // React's scheduler MessageChannel would otherwise hold the loop open.
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
  fs.rmSync(DIR, { recursive: true, force: true });
});

/* ── 1. the toolbar the learner sees ─────────────────────────────────────── */

test("the panel hosts the real editor, with its real toolbar", () => {
  assert.equal(Boolean(find("[data-course-sketch-panel]")), true, "the panel mounted");
  assert.equal(Boolean(find("[data-course-sketch-host]")), true, "…with the editor in its host box");
  // The editor's own tools, rendered by the editor's own toolbar.
  for (const tool of ["selection", "rectangle", "freedraw", "text", "eraser"]) {
    assert.equal(Boolean(find(`[data-testid="toolbar-${tool}"]`)), true, `${tool} is in the toolbar`);
  }
});

test("the STICKY NOTE tool — the colourful card that was missing — is in the toolbar", () => {
  const button = find('[data-testid="toolbar-stickynote"]');
  assert.equal(Boolean(button), true, "the sticky note button is rendered");
  assert.equal(button.getAttribute("aria-label"), "Sticky note");
  // A main-toolbar plate, not an entry buried in the "More tools" menu.
  const toolbar = find(".App-toolbar");
  assert.equal(Boolean(toolbar), true, "the editor's own toolbar is mounted");
  assert.equal(toolbar.contains(button), true, "…and the note plate is one of its tools");
  assert.equal(button.closest(".dropdown-menu") === null, true, "…not hidden in a dropdown");
  // Its letter shortcut is the tool's own (`N`), which the badge shows.
  assert.equal((button.textContent || "").includes("N") || button.getAttribute("aria-keyshortcuts") !== null, true);
});

test("clicking the sticky note tool really arms the note tool inside the editor", async () => {
  const button = find('[data-testid="toolbar-stickynote"]');
  click(button);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  const state = fixture.latest.changes.at(-1)?.appState;
  assert.equal(state?.activeTool?.type, "stickynote", "the editor's active tool is the sticky note");
  assert.equal(button.getAttribute("aria-pressed"), "true", "…and the plate reads as pressed");
});

/* ── 2. the canvas colour, end to end ────────────────────────────────────── */

test("the canvas row is there: Canvas, White, Dark and the pencil", () => {
  assert.equal(Boolean(find("[data-course-sketch-canvas-controls]")), true);
  assert.equal(Boolean(find('[data-canvas-quick="white"]')), true, "the white canvas is one click");
  assert.equal(Boolean(find('[data-canvas-quick="dark"]')), true);
  assert.equal(Boolean(find("[data-course-sketch-canvas-pencil]")), true);
  assert.equal(Boolean(find("[data-course-sketch-canvas-picker]")), false, "the picker starts closed");
});

test("the pencil opens the full-RGB picker, and White repaints the canvas through the editor's own API", async () => {
  click(find("[data-course-sketch-canvas-pencil]"));
  const picker = find("[data-course-sketch-canvas-picker]");
  assert.equal(Boolean(picker), true, "the pencil opened the picker");
  assert.equal(Boolean(find("[data-course-sketch-canvas-rgb]")), true, "with the RGB channels");
  assert.equal(Boolean(find('[data-canvas-channel="r"]')), true);
  assert.equal(Boolean(find('[data-canvas-channel="g"]')), true);
  assert.equal(Boolean(find('[data-canvas-channel="b"]')), true);
  assert.equal(Boolean(find("[data-canvas-hex]")), true, "…and a hex field");
  for (const preset of ["dark", "white", "paper", "sky", "mint", "grey"]) {
    assert.equal(Boolean(find(`[data-canvas-preset="${preset}"]`)), true, `${preset} is a preset`);
  }

  // The white swatch: Excalidraw must end up in the light theme with a white
  // canvas — the pair that renders #ffffff — and must report it back to us,
  // because that report is what the sketch hook persists.
  fixture.latest.changes.length = 0;
  fixture.latest.marked = 0;
  click(find('[data-canvas-quick="white"]'));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
  });

  const reported = fixture.latest.changes.at(-1)?.appState;
  assert.equal(reported?.theme, "light", "the editor switched to the theme a white canvas needs");
  assert.equal(reported?.viewBackgroundColor, "#ffffff");
  assert.equal(fixture.latest.marked >= 1, true, "…and the panel asked for it to be saved");

  // Back to the dark default: the scene value is the one Excalidraw's dark
  // filter renders as #121212, which is the board's original look.
  click(find('[data-canvas-quick="dark"]'));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  const dark = fixture.latest.changes.at(-1)?.appState;
  assert.equal(dark?.theme, "dark");
  assert.equal(dark?.viewBackgroundColor, "#ffffff");
});

test("a colour picked on the sliders reaches the editor, and the learner's choice is remembered", async () => {
  const hex = find("[data-canvas-hex]");
  assert.equal(Boolean(hex), true);
  act(() => {
    // What the learner's browser hands us when they type into the field.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(hex, "#f6f3e7");
    hex.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  const reported = fixture.latest.changes.at(-1)?.appState;
  assert.equal(reported?.theme, "light");
  assert.equal(reported?.viewBackgroundColor, "#f6f3e7");
  // The remembered preference is what carries the choice to the NEXT board.
  const stored = window.localStorage.getItem("dc.sketchCanvas.v1.u1");
  assert.equal(Boolean(stored), true, "the choice is remembered on this device");
  assert.equal(JSON.parse(stored).color, "#f6f3e7");
});
