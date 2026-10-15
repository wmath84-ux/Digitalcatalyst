// tests/workModeNoteEditorRuntime.test.mjs
//
// RUNTIME proof that Work Mode's Note Editor IS the Course Player's updated
// Note Editor — the same real NotesPanel + NoteEditor (BlockNote) the player
// mounts, driven here inside the real WorkPageSurface in jsdom:
//
//   1. the Work library keeps its Work header; opening a note drops that
//      conventional header (headless) and reports the slot immersive, which
//      is what hides the shared Work footer navigation;
//   2. the editor's only top chrome is the reference corner row — top-left
//      notes-panel button, top-right options button, no header bar;
//   3. read mode shows the reference bottom navigation pill; Edit flips the
//      SAME document to editable and the reference editing pill (the docked
//      formatting toolbar) takes the bottom;
//   4. formatting is functional: select-all + Bold lands in the saved HTML
//      through Work's own device-only onEdit;
//   5. a note renames from the editor's left side panel;
//   6. back on the library, the Work header returns and the slot reports
//      non-immersive again (footer restored) — and a fresh compose + cancel
//      round-trips the same way.
//
// The toolbar's full tool set/geometry and the keyboard rules are pinned by
// tests/coursePlayerNoteToolbarCaretRuntime.test.mjs and
// tests/noteEditorReferenceChromeContract.test.mjs; this file proves the
// Work wiring around the identical editor.

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
const DIR = path.join(ROOT, "node_modules", ".tmp-work-note-editor-runtime");
fs.mkdirSync(DIR, { recursive: true });

/* ── DOM + globals (before the bundle is imported) ────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="host"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/#/work/notes",
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

// jsdom has no DOMRect; BlockNote's selection UI constructs one as soon as a
// real text selection exists (the caret-only suites never create one).
class DOMRectStub {
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.left = x;
    this.top = y;
    this.right = x + width;
    this.bottom = y + height;
  }
  toJSON() {
    return {};
  }
}
define("DOMRect", DOMRectStub);
define("DOMRectReadOnly", DOMRectStub);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── fixture: the real Work notes page, mounted ───────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act, useState } from "react";
import WorkPageSurface from "./src/work/pages/WorkPageSurface";

export { act };

export const workLog = [];
const seed = [
  { id: "w1", text: "Alpha title", html: "<h1>Alpha title</h1><hr><p>Alpha body words here.</p>", createdAt: 1000 },
  { id: "w2", text: "Beta title", html: "<h1>Beta title</h1><hr><p>Beta body.</p>", createdAt: 2000 },
];
let currentNotes = seed;
export const getWorkNotes = () => currentNotes;

function Harness() {
  const [notes, setNotes] = useState(seed);
  currentNotes = notes;
  const controller = {
    notes,
    status: "ready",
    errorMessage: null,
    lastSavedAt: null,
    loading: false,
    synced: true,
    flush: () => undefined,
    reload: () => undefined,
    link: () => undefined,
    commit: () => undefined,
    add: (html) => {
      const note = { id: "w" + Date.now(), text: "New note", html, createdAt: Date.now() };
      workLog.push("add:" + html);
      setNotes((list) => [note, ...list]);
      return note;
    },
    edit: (id, html) => {
      workLog.push("edit:" + id + ":" + html);
      setNotes((list) => list.map((note) => (note.id === id ? { ...note, html } : note)));
    },
    remove: (id) => {
      workLog.push("remove:" + id);
      setNotes((list) => list.filter((note) => note.id !== id));
    },
  };
  return (
    <div style={{ height: "800px" }}>
      <WorkPageSurface
        page="notes"
        slotKey="secondary:notes"
        theme="light"
        orientation="column"
        notes={controller}
        onExit={() => undefined}
        onToggleTheme={() => undefined}
        onImmersiveChange={(slotKey, immersive) => workLog.push("immersive:" + slotKey + ":" + immersive)}
      />
    </div>
  );
}

let root = null;
export async function mountWorkNotes() {
  if (!root) root = createRoot(document.getElementById("host"));
  await act(async () => {
    root.render(<Harness />);
  });
  return {
    unmount: () => act(async () => root.render(null)),
  };
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
      // The editor and panels import stylesheets; jsdom has no CSS pipeline.
      name: "css",
      setup(b) {
        b.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: "css-stub" }));
        b.onLoad({ filter: /.*/, namespace: "css-stub" }, () => ({ contents: "", loader: "js" }));
      },
    },
    {
      // Only the Notes page is under test; Work's other lazy pages (Mind Map,
      // Sketch, AI, My Day, Revision) are covered by their own suites and are
      // never rendered here.
      name: "work-other-pages",
      setup(b) {
        b.onResolve({ filter: /(WorkMindMapSurface|WorkSketchSurface|WorkAiSurface|WorkMyDayPage|WorkRevisionApp)$/ }, (args) => ({
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
const surface = () => $("[data-work-page-surface='notes']");
const panel = () => $("[data-course-notes-panel]");
const workHeader = () => $("[data-work-header-area='notes']");
const immersiveReports = () => workLog.filter((entry) => entry.startsWith("immersive:"));
const lastEdit = () => [...workLog].reverse().find((entry) => entry.startsWith("edit:"));

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
const focus = async (element) => {
  assert.ok(element, "expected a focusable editor element");
  await act(async () => {
    element.focus();
    await sleep(20);
  });
};

/* ── the flow ─────────────────────────────────────────────────────────────── */

test("Work Note Editor: exact Course editor design, formatting, save, rename, chrome restore", async () => {
  const mounted = await fixture.mountWorkNotes();
  await settle(80);

  /* Library: Work identity header on, list showing, footer reported visible. */
  assert.ok(workHeader(), "the Work header is present on the notes library");
  assert.equal(panel()?.getAttribute("data-course-notes-mode"), "list");
  assert.equal(surface()?.getAttribute("data-work-immersive"), "false");

  /* Open the note → the read view of the SAME BlockNote document. */
  await click($("[data-course-note-open][data-note-id='w1']"), "the Alpha note row");
  await settle(120);
  assert.equal(panel()?.getAttribute("data-course-notes-mode"), "edit");
  assert.equal(panel()?.getAttribute("data-note-view-mode"), "read", "a saved note opens as a read view");

  /* 1 — no conventional header: neither Work's nor a notes action bar. */
  assert.equal(workHeader(), null, "the Work header is gone while the editor is open");
  assert.equal(surface()?.getAttribute("data-work-immersive"), "true");
  assert.ok(
    immersiveReports().includes("immersive:secondary:notes:true"),
    "the slot reports immersive — the signal that hides the Work footer navigation",
  );
  assert.equal(panel()?.querySelector("header"), null, "no conventional header bar inside the editor");

  /* 2 — the only top chrome: left + right side-panel corner buttons. */
  const chrome = $("[data-note-editor-chrome]");
  assert.ok(chrome, "the reference corner-button row");
  assert.ok(chrome.querySelector("[data-note-open-left-panel]"), "top-left notes-panel button");
  assert.ok(chrome.querySelector("[data-note-open-right-panel]"), "top-right options button");
  assert.equal(chrome.querySelectorAll("button").length, 2, "nothing else lives on the top row");

  /* 4 (read half) — the reference bottom navigation pill. */
  const readNav = $("[data-note-read-nav]");
  assert.ok(readNav, "read mode's bottom navigation");
  for (const hook of ["data-note-read-back", "data-note-read-prev", "data-note-read-next", "data-note-read-new", "data-note-read-edit", "data-note-read-more"]) {
    assert.ok(readNav.querySelector(`[${hook}]`), `${hook} in the read navigation`);
  }
  assert.equal($("[data-note-dock]"), null, "no editing toolbar in read mode");

  /* 3 — Edit flips the same document; the editing pill takes the bottom. */
  await click($("[data-note-read-edit]"), "the read pill's Edit button");
  await settle(60);
  assert.equal(panel()?.getAttribute("data-note-view-mode"), "edit");
  assert.equal($("[data-note-read-nav]"), null, "the read navigation swaps out in edit mode");
  await focus($(".bn-editor"));
  const dock = $("[data-note-dock]");
  assert.ok(dock, "the reference editing pill is up once the note has a cursor");
  const toolLabels = Array.from(dock.querySelectorAll(".bn-ak-button")).map(
    (button) => button.getAttribute("aria-label") || button.textContent.trim(),
  );
  for (const tool of ["Undo", "Redo", "Bold", "Italic", "Strike", "Highlight", "Code", "Quote", "Bulleted list", "Numbered list", "Checklist", "Indent", "Outdent"]) {
    assert.ok(toolLabels.includes(tool), `editing pill carries ${tool}`);
  }

  /* 5 — formatting + saving: select the body, Bold it, save from the right
        panel; Work's device-only onEdit receives the formatted HTML. */
  const bodyEl = $(".bn-editor");
  const walker = window.document.createTreeWalker(bodyEl, window.NodeFilter.SHOW_TEXT);
  let bodyText = null;
  while (walker.nextNode()) {
    if (walker.currentNode.textContent.includes("Alpha body")) {
      bodyText = walker.currentNode;
      break;
    }
  }
  assert.ok(bodyText, "the note body text is in the editor");
  await act(async () => {
    const range = window.document.createRange();
    range.selectNodeContents(bodyText);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    window.document.dispatchEvent(new window.Event("selectionchange"));
    await sleep(30);
  });
  await click(dock.querySelector('.bn-ak-button[aria-label="Bold"]'), "the Bold tool");
  await click($("[data-note-open-right-panel]"), "the options corner button");
  await settle(40);
  assert.ok($("[data-note-right-panel]"), "the right side panel opens");
  await click($("[data-course-note-edit-save]"), "Save in the right panel");
  await settle(60);
  assert.match(lastEdit() ?? "", /edit:w1:/, "Work's onEdit saved the open note");
  assert.match(lastEdit() ?? "", /<strong>Alpha body words here\.<\/strong>/, "the Bold formatting is in the saved HTML");
  assert.equal(panel()?.getAttribute("data-note-view-mode"), "read", "after Save the same note is a read view again");

  /* 6 — rename from the editor's left side panel. */
  await click($("[data-note-open-left-panel]"), "the notes corner button");
  await settle(40);
  const leftPanel = $("[data-note-left-panel]");
  assert.ok(leftPanel, "the left side panel opens");
  await click(leftPanel.querySelector('[aria-label="Rename Alpha title"]'), "the note's rename button");
  await settle(30);
  const renameInput = leftPanel.querySelector("[data-branched-rename-input]");
  assert.ok(renameInput, "the inline rename field");
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setValue.call(renameInput, "Alpha renamed");
    renameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
    await sleep(10);
  });
  await act(async () => {
    renameInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await sleep(30);
  });
  assert.match(lastEdit() ?? "", /Alpha renamed/, "the rename saved through Work's onEdit");
  assert.ok(leftPanel.textContent.includes("Alpha renamed"), "the side panel shows the new title");
  await click($("[data-note-panel-scrim]"), "the panel scrim");
  await settle(30);
  assert.equal($("[data-note-left-panel]"), null, "the side panel closes");

  /* 7 — back on the library: Work header + footer restore. */
  await click($("[data-note-read-back]"), "the read pill's back button");
  await settle(60);
  assert.equal(panel()?.getAttribute("data-course-notes-mode"), "list");
  assert.ok(workHeader(), "the Work header returns on the library");
  assert.equal(surface()?.getAttribute("data-work-immersive"), "false");
  assert.equal(
    immersiveReports().at(-1),
    "immersive:secondary:notes:false",
    "the slot reports non-immersive again — the Work footer navigation is restored",
  );

  /* A fresh compose is an editor too: headless in, chrome back on cancel. */
  await click($("[data-course-notes-add]"), "the new-note button");
  await settle(120);
  assert.equal(panel()?.getAttribute("data-course-notes-mode"), "compose");
  assert.equal(workHeader(), null, "no Work header over the composer");
  await click($("[data-note-open-right-panel]"), "the composer options button");
  await settle(40);
  await click($("[data-course-notes-cancel]"), "Cancel in the right panel");
  await settle(60);
  assert.equal(panel()?.getAttribute("data-course-notes-mode"), "list");
  assert.ok(workHeader(), "the Work header returns after cancel");

  await mounted.unmount();
});
