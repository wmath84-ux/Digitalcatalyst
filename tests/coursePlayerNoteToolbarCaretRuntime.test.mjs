// tests/coursePlayerNoteToolbarCaretRuntime.test.mjs
//
// RUNTIME proof of the owner's report, with the REAL note editor:
//
//   "Course player toolbar is loading but only when the keyboard is opened…
//    if the user is on a big tablet with the app in desktop view, clicking a
//    text field and getting a cursor must show the toolbar instantly — and it
//    must sit just above the footer navigation, and cope when the footer
//    navigation is off."
//
// tests/noteEditorContract.test.mjs pins the rule in the source;
// tests/coursePlayerNoteToolbarFooterRuntime.test.mjs runs the footer maths
// and its hook. This file mounts the actual `NoteEditor`
// (src/course/NoteEditor.tsx — BlockNote, ProseMirror, ariakit, the lot) in
// real React 19 inside jsdom and drives focus, which is what the rule reads.
//
// No soft keyboard exists anywhere in this environment — there is no
// `visualViewport`, no viewport resize, no keyboard provider — so every
// toolbar that appears here appears for ONE reason: a cursor.
//
//   1. no cursor → no toolbar;
//   2. a cursor in the TITLE field → the toolbar is there immediately (the
//      desktop / big-tablet-in-desktop-view / floating-window case that was
//      broken: those never open a keyboard);
//   3. the caret moving title → body keeps the SAME toolbar mounted (no
//      unmount/remount flicker on the hand-off);
//   4. the caret leaving the note takes the toolbar away;
//   5. focus on a toolbar control keeps it mounted;
//   6. read-only never gets one;
//   7. with the footer navigation present, the toolbar publishes the lift that
//      puts it just above the footer — and with the footer hidden (the
//      player's keyboard rule) or absent, it publishes nothing.

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
const DIR = path.join(ROOT, "node_modules", ".tmp-note-toolbar-caret-runtime");
fs.mkdirSync(DIR, { recursive: true });

/* ── DOM + globals (before the bundle is imported) ────────────────────────── */

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
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of [
  "HTMLElement",
  "HTMLTextAreaElement",
  "Element",
  "Node",
  "Event",
  "CustomEvent",
  "KeyboardEvent",
  "MouseEvent",
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

// jsdom does no layout. The rule reads rects (to place the toolbar against the
// footer), so boxes are pinned per element; ProseMirror additionally asks a
// Range for client rects when it scrolls to the selection.
const SHELL_BOX = { top: 0, bottom: 800, height: 800, width: 400, left: 0, right: 400, x: 0, y: 0 };
const setBox = (element, box) => {
  element.__box = box ? { width: 400, left: 0, right: 400, x: 0, y: box.top, height: box.bottom - box.top, ...box } : null;
};
window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  const box = this.__box !== undefined ? this.__box : this.closest?.(".dc-note-shell") ? SHELL_BOX : null;
  if (!box) return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
  return { height: box.bottom - box.top, ...box, toJSON: () => ({}) };
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

/* ── fixture: the real editor, mounted ────────────────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import NoteEditor from "./src/course/NoteEditor";

export { act };

let root = null;
let generation = 0;

export async function mount({ readOnly = false, autoFocus = false } = {}) {
  if (!root) root = createRoot(document.getElementById("host"));
  generation += 1;
  await act(async () => {
    root.render(
      <div style={{ height: "800px" }}>
        <NoteEditor
          key={generation}
          initialTitle="Photosynthesis"
          initialBodyHtml="<p>Plants turn light into sugar.</p>"
          ariaLabel="Note"
          readOnly={readOnly}
          autoFocus={autoFocus}
        />
      </div>,
    );
  });
  // Rendering null tears the editor down but keeps the root, so a test that
  // fails halfway can never leave a container the next mount would trip over.
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
      // The editor imports its stylesheets; jsdom has no CSS pipeline.
      name: "css",
      setup(b) {
        b.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: "css-stub" }));
        b.onLoad({ filter: /.*/, namespace: "css-stub" }, () => ({ contents: "", loader: "js" }));
      },
    },
  ],
});

const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")).href);
const { act } = fixture;

after(() => {
  dom.window.close();
  // React's scheduler drives itself through a Node MessageChannel, which keeps
  // the runner alive after the last test (same as the repo's other runtime suites).
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
  fs.rmSync(DIR, { recursive: true, force: true });
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

const shell = () => window.document.querySelector(".dc-note-shell");
const dock = () => window.document.querySelector("[data-note-dock]");
const title = () => window.document.querySelector("[data-course-note-heading-input]");
const body = () => window.document.querySelector(".bn-editor");
const docked = () => shell()?.getAttribute("data-note-docked");
const lift = () => shell()?.getAttribute("data-note-footer-inset") ?? undefined;
const published = () => shell()?.style.getPropertyValue("--dc-note-footer-inset") || "";

const focus = async (element) => {
  await act(async () => {
    element.focus();
    await sleep(20);
  });
};
const blur = async (element) => {
  await act(async () => {
    element.blur();
    window.document.body.dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
    await sleep(20);
  });
};

const clearFooters = () => {
  for (const footer of Array.from(window.document.querySelectorAll("[data-course-peek-dock], [data-course-dock]"))) {
    footer.remove();
  }
};
const addFooter = (home, box) => {
  const footer = window.document.createElement("div");
  footer.setAttribute(home, "");
  setBox(footer, box);
  window.document.body.appendChild(footer);
  return footer;
};

/** There is no soft keyboard here at all — that is the whole point. */
const noKeyboardAnywhere = () => {
  assert.equal(window.visualViewport, undefined, "this environment has no visual viewport to shrink");
  assert.equal(shell()?.closest("[data-course-keyboard]")?.getAttribute("data-course-keyboard"), undefined);
};

/* ── the rule ─────────────────────────────────────────────────────────────── */

test("no cursor, no toolbar — and there is no keyboard here to blame", async () => {
  clearFooters();
  const probe = await fixture.mount();
  noKeyboardAnywhere();
  assert.equal(docked(), "false");
  assert.equal(dock(), null);
  await probe.unmount();
});

test("a cursor in the TITLE field brings the toolbar up instantly", async () => {
  clearFooters();
  const probe = await fixture.mount();
  assert.equal(dock(), null, "nothing before the click");
  await focus(title());
  assert.equal(window.document.activeElement, title(), "the title really has the cursor");
  assert.equal(docked(), "true");
  assert.ok(dock(), "the toolbar is on screen — with no soft keyboard anywhere");
  // The one toolbar, with its full set of tools.
  assert.deepEqual(
    Array.from(dock().querySelectorAll(".bn-ak-button")).map((button) => button.getAttribute("aria-label") || button.textContent.trim()),
    ["Insert block", "Paragraph", "Bold", "Italic", "Underline", "Strike", "Code", "Undo", "Redo"],
    "the same tool set the soft-keyboard toolbar has always had",
  );
  await probe.unmount();
});

test("the caret moving title → body keeps the SAME toolbar mounted", async () => {
  clearFooters();
  const probe = await fixture.mount();
  await focus(title());
  const before = dock();
  assert.ok(before, "the toolbar is up for the title's cursor");
  await focus(body());
  assert.equal(window.document.activeElement, body(), "the cursor is in the body now");
  assert.equal(docked(), "true");
  assert.equal(dock(), before, "no unmount / remount on the hand-off — the learner sees no flicker");
  await probe.unmount();
});

test("the caret leaving the note takes the toolbar away", async () => {
  clearFooters();
  const probe = await fixture.mount();
  await focus(body());
  assert.ok(dock(), "up while the note has the cursor");
  await blur(body());
  assert.equal(docked(), "false");
  assert.equal(dock(), null, "gone once the cursor leaves the note");
  await probe.unmount();
});

test("focus on a toolbar control keeps the toolbar mounted", async () => {
  clearFooters();
  const probe = await fixture.mount();
  await focus(title());
  const undo = dock().querySelector('.bn-ak-button[aria-label="Undo"]');
  assert.ok(undo);
  await focus(undo);
  assert.equal(docked(), "true", "the control being used is never unmounted from under the learner");
  await probe.unmount();
});

test("read-only never gets a toolbar, cursor or not", async () => {
  clearFooters();
  const probe = await fixture.mount({ readOnly: true });
  await focus(title());
  assert.equal(docked(), "false");
  assert.equal(dock(), null);
  await probe.unmount();
});

/* ── and where the toolbar sits, with the footer navigation ───────────────── */

test("with the peek dock on screen the toolbar is lifted just above it", async () => {
  clearFooters();
  // The bottom-centre footer navigation: line + hit strip + padding = 48px of
  // the player's bottom, overlaying the writing surface.
  addFooter("data-course-peek-dock", { top: 752, bottom: 800, height: 48 });
  const probe = await fixture.mount();
  assert.equal(lift(), undefined, "no toolbar yet, so nothing to place");
  await focus(title());
  assert.ok(dock(), "the toolbar is up");
  assert.equal(lift(), "48", "lifted by exactly what the footer covers");
  assert.equal(published(), "48px", "published for the CSS margin that places it");
  await probe.unmount();
});

test("with the legacy in-flow dock the toolbar needs no lift", async () => {
  clearFooters();
  // The always-visible dock is the study pane's last child: it starts exactly
  // where the notes panel ends, so the toolbar already ends at it.
  addFooter("data-course-dock", { top: 800, bottom: 864, height: 64 });
  const probe = await fixture.mount();
  await focus(title());
  assert.ok(dock());
  assert.equal(lift(), undefined, "no lift — and so no gap above the footer");
  assert.equal(published(), "");
  await probe.unmount();
});

test("footer navigation OFF: the toolbar is flush with the bottom, and comes back with the footer", async () => {
  clearFooters();
  const footer = addFooter("data-course-peek-dock", { top: 752, bottom: 800, height: 48 });
  const probe = await fixture.mount();
  await focus(title());
  assert.equal(lift(), "48");

  // The player's ONE keyboard rule hides the footer completely; the toolbar
  // must drop flush instead of keeping a gap above nothing.
  await act(async () => {
    footer.classList.add("hidden");
    setBox(footer, null);
    await sleep(40);
  });
  assert.equal(lift(), undefined, "the footer is off, so the lift is gone");
  assert.equal(published(), "");
  assert.ok(dock(), "and the toolbar itself is still there — the cursor never left");

  await act(async () => {
    footer.classList.remove("hidden");
    setBox(footer, { top: 752, bottom: 800, height: 48 });
    await sleep(40);
  });
  assert.equal(lift(), "48", "the footer is back, so the toolbar is above it again");
  await probe.unmount();
});

test("no footer navigation at all: the toolbar sits at the very bottom", async () => {
  clearFooters();
  const probe = await fixture.mount();
  await focus(title());
  assert.ok(dock());
  assert.equal(lift(), undefined);
  assert.equal(published(), "");
  await probe.unmount();
});
