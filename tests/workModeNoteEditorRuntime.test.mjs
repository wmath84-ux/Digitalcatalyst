// tests/workModeNoteEditorRuntime.test.mjs
//
// RUNTIME proof that Work Mode's Note Editor IS the Course Player's updated
// Note Editor — the same real NotesPanel + NoteEditor (BlockNote) the player
// mounts, driven here inside the real WorkPageSurface in jsdom:
//
//   1. the Work notes tab opens on the headless HOME page (New note ·
//      My Library · Course Library) and keeps Work's own header there;
//   2. My Library opens the ONE side panel — nearly a page wide, MASTER / SELF
//      top-centre, exactly one button at the bottom (New note), rows with NO
//      pencil / trash buttons;
//   3. a row opens its note in READ mode first, and that drops the Work header
//      (headless) and reports the slot immersive — the signal that hides the
//      shared Work footer navigation;
//   4. read mode's bottom pill carries library · prev · next | new · edit |
//      home (the 3-dot drawer button is gone); Edit flips the SAME document to
//      editable and the editing pill takes the bottom — the EYE tile pinned at
//      its front, in the same design as every tool beside it, and the tools in
//      their own sliding tray;
//   5. saving is AUTOMATIC: bolding the body stores the note through Work's
//      device-only onEdit with no Save anywhere;
//   6. a long press on a row opens Rename / Delete, and Rename turns that
//      row's own name into an input that writes through Work's onEdit;
//   7. the eye tile returns to the read view; ONE tap on the page hides read
//      mode's bottom tray and the next tap brings it back; Home returns to the
//      notes home page, where the Work header and footer come back.
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
/** ONE tap on the page itself — never on the chrome it carries. */
const tapPage = async () => {
  const page = panel();
  assert.ok(page, "expected the writing page to tap");
  await act(async () => {
    page.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await sleep(10);
  });
  await act(async () => {
    page.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await sleep(40);
  });
};

/** A finger held on a row: pointerdown, a pause past the long-press window, up. */
const longPress = async (element) => {
  assert.ok(element, "expected a row to press");
  const down = new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
  Object.defineProperty(down, "pointerType", { value: "touch" });
  await act(async () => {
    element.dispatchEvent(down);
    await sleep(520);
  });
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("pointerup", { bubbles: true }));
    await sleep(40);
  });
};

/* ── the flow ─────────────────────────────────────────────────────────────── */

test("Work Note Editor: headless pages, ONE library panel, read-first notes, automatic save", async () => {
  const mounted = await fixture.mountWorkNotes();
  await settle(80);

  /* Home: the headless page with its three centred buttons. Work's own header
     stays (the page is not immersive yet) and the footer is reported visible. */
  assert.ok(workHeader(), "the Work header is present on the notes home");
  assert.equal(panel()?.getAttribute("data-course-notes-mode"), "home");
  assert.equal(surface()?.getAttribute("data-work-immersive"), "false");
  assert.equal($("[data-course-page-header]"), null, "no notes page header anywhere");
  for (const hook of ["[data-notes-home-new]", "[data-notes-home-library]", "[data-notes-home-course]"]) {
    assert.ok($(hook), `${hook} is one of the home page's three buttons`);
  }

  /* The library IS the one side panel: nearly a page wide, MASTER / SELF at its
     top centre, ONE button at the bottom, and no pencil / trash on the rows. */
  await click($("[data-notes-home-library]"), "My Library");
  await settle(60);
  const library = $("[data-note-library-panel]");
  assert.ok(library, "the library opens as the ONE side panel");
  const head = library.querySelector("[data-note-library-head]");
  assert.ok(head, "the panel's head is present");
  assert.match(head.className, /justify-center/, "and the filter sits at the TOP CENTRE");
  // Work Mode is device-only: it has no MASTER collection, so its head names
  // the collection instead of offering a tab that could not go anywhere. The
  // shared MASTER / SELF control heads this same panel wherever both
  // collections exist (the Course Player — pinned by coursePageHeaderContract).
  assert.match(head.textContent, /My notes/);
  assert.equal(head.querySelector("[data-master-self-control]"), null, "no dead MASTER tab in a device-only scope");
  assert.equal(head.querySelector("button"), null, "the head carries no button at all");
  const footButtons = library.querySelectorAll("[data-note-library-foot] button");
  assert.equal(footButtons.length, 1, "the panel's foot carries exactly one button");
  assert.ok(footButtons[0].hasAttribute("data-note-panel-new"), "…and it is New note");
  assert.equal(
    library.querySelectorAll("[data-branched-rename-button], [data-branched-delete]").length,
    0,
    "no pencil / trash buttons on the library rows",
  );

  /* A row opens its note: the panel closes behind it and the note is READ. */
  await click($("[data-course-note-open][data-note-id='w1']"), "the Alpha note row");
  await settle(120);
  assert.equal(panel()?.getAttribute("data-course-notes-mode"), "edit");
  assert.equal(panel()?.getAttribute("data-note-view-mode"), "read", "a saved note opens as a read view");
  assert.equal($("[data-note-library-panel]"), null, "the panel closed behind the note");

  /* 3 — no conventional header, and no top chrome at all. */
  assert.equal(workHeader(), null, "the Work header is gone while the note is open");
  assert.equal(surface()?.getAttribute("data-work-immersive"), "true");
  assert.ok(
    immersiveReports().includes("immersive:secondary:notes:true"),
    "the slot reports immersive — the signal that hides the Work footer navigation",
  );
  assert.equal(panel()?.querySelector("header"), null, "no conventional header bar inside the editor");
  assert.equal($("[data-note-status-chip]")?.querySelectorAll("button").length, 0, "the page's only top element holds no button");
  assert.equal(
    $("[data-note-editor-chrome], [data-note-open-left-panel], [data-note-open-right-panel]"),
    null,
    "nothing sits at the top of the page either — no corner buttons, no panels to open",
  );

  /* 4 — read mode's bottom navigation. */
  const readNav = $("[data-note-read-nav]");
  assert.ok(readNav, "read mode's bottom navigation");
  for (const hook of ["data-note-read-library", "data-note-read-prev", "data-note-read-next", "data-note-read-new", "data-note-read-edit", "data-note-read-home"]) {
    assert.ok(readNav.querySelector(`[${hook}]`), `${hook} in the read navigation`);
  }
  assert.equal($("[data-note-read-more]"), null, "the 3-dot drawer button is gone");
  assert.equal($("[data-note-dock]"), null, "no editing toolbar in read mode");

  /* 4b — ONE tap on the page hides the tray (the side-panel button and the
        rest); the next tap brings it straight back. */
  await tapPage();
  assert.equal($("[data-note-read-nav]"), null, "a tap on the page hides read mode's tray");
  assert.equal($("[data-note-read-library]"), null, "…including the side-panel button");
  await tapPage();
  assert.ok($("[data-note-read-nav]"), "and the next tap shows it again");

  /* 5 — Edit flips the SAME document; the editing pill takes the bottom with
        the black Read capsule pinned at its front. */
  await click($("[data-note-read-edit]"), "the read pill's pencil");
  await settle(60);
  assert.equal(panel()?.getAttribute("data-note-view-mode"), "edit");
  assert.equal($("[data-note-read-nav]"), null, "the read navigation swaps out in edit mode");
  await focus($(".bn-editor"));
  const dock = $("[data-note-dock]");
  assert.ok(dock, "the editing pill is up once the note has a cursor");
  const readEye = dock.querySelector("[data-note-edit-read]");
  const tools = dock.querySelector("[data-note-dock-tools]");
  assert.ok(readEye, "the read control leads the pill");
  assert.ok(tools, "the tools have a tray of their own");
  assert.ok(
    (readEye.compareDocumentPosition(tools) & window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    "Read is pinned before the sliding tray, so it can never scroll away",
  );
  // The SAME design as every tool next to it: BlockNote's own toolbar button
  // (the class the dock sizes to a 36px round tile), an icon and no label —
  // the black "Read" capsule is gone.
  assert.ok(readEye.classList.contains("bn-ak-button"), "the read control is a toolbar tile like the rest");
  assert.equal(readEye.getAttribute("aria-label"), "Read mode");
  assert.ok(readEye.querySelector("svg"), "…with the eye for its glyph");
  assert.equal(readEye.textContent.trim(), "", "…and no text capsule beside it");
  assert.ok(!readEye.classList.contains("dc-note-dock-read"), "the black Read capsule is gone");
  const toolLabels = Array.from(tools.querySelectorAll(".bn-ak-button")).map(
    (button) => button.getAttribute("aria-label") || button.textContent.trim(),
  );
  for (const tool of ["Undo", "Redo", "Bold", "Italic", "Strike", "Highlight", "Code", "Quote", "Bulleted list", "Numbered list", "Checklist", "Indent", "Outdent"]) {
    assert.ok(toolLabels.includes(tool), `the editing pill carries ${tool}`);
  }

  /* 5 — formatting + the AUTOMATIC save: bolding the body stores the note
        through Work's device-only onEdit, with no Save button anywhere. */
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
  await click(tools.querySelector('.bn-ak-button[aria-label="Bold"]'), "the Bold tool");
  // The autosave pause (AUTOSAVE_IDLE_MS = 1200 in NotesPanel): nobody saves.
  await settle(1700);
  assert.match(lastEdit() ?? "", /edit:w1:/, "Work's onEdit stored the open note on its own");
  assert.match(lastEdit() ?? "", /<strong>Alpha body words here\.<\/strong>/, "the Bold formatting is in the saved HTML");

  /* Leaving edit mode for the read view is a save point as well. */
  await click(readEye, "the tray's eye tile");
  await settle(80);
  assert.equal(panel()?.getAttribute("data-note-view-mode"), "read", "Read returns to the read view");
  assert.ok($("[data-note-read-nav]"), "the read tray is back");

  /* 6 — the read tray's library button opens the panel; a LONG PRESS on a row
        opens Rename / Delete, and Rename edits the row's own name in place. */
  await click($("[data-note-read-library]"), "the read pill's library button");
  await settle(60);
  const sidePanel = $("[data-note-left-panel]");
  assert.ok(sidePanel, "the side panel opens from the read tray");
  const row = sidePanel.querySelector("[data-course-note-open][data-note-id='w1']");
  assert.ok(row, "the Alpha note row is in the panel");
  await longPress(row);
  const popup = sidePanel.querySelector("[data-branched-menu-popup]");
  assert.ok(popup, "a long press opens the row's actions popup");
  assert.ok(popup.querySelector("[data-branched-menu-rename]"), "Rename is in the popup");
  assert.ok(popup.querySelector("[data-branched-menu-delete]"), "Delete is in the popup");
  await click(popup.querySelector("[data-branched-menu-rename]"), "Rename");
  await settle(40);
  const renameInput = sidePanel.querySelector("[data-branched-rename-input]");
  assert.ok(renameInput, "the row's own name area became the editor input");
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setValue.call(renameInput, "Alpha renamed");
    renameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
    await sleep(10);
  });
  await act(async () => {
    renameInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await sleep(40);
  });
  assert.match(lastEdit() ?? "", /Alpha renamed/, "the rename saved through Work's onEdit");
  assert.ok(sidePanel.textContent.includes("Alpha renamed"), "the side panel shows the new title");

  /* The popup's Delete is the same two-step act it has always been. */
  await longPress($("[data-course-note-open][data-note-id='w1']"));
  await click($("[data-branched-menu-delete]"), "Delete");
  await settle(40);
  assert.ok($("[data-course-confirm-delete]"), "Delete asks before anything is removed");
  assert.equal(workLog.some((entry) => entry.startsWith("remove:")), false, "the first tap deletes nothing");
  await click($("[data-course-confirm-cancel]"), "Cancel");
  await settle(40);
  assert.equal($("[data-course-confirm-delete]"), null, "Cancel closes the question");
  assert.ok($("[data-course-note-open][data-note-id='w1']"), "and the note is still in the panel");

  await click($("[data-note-panel-scrim]"), "the strip of page beside the panel");
  await settle(40);
  assert.equal($("[data-note-left-panel]"), null, "the side panel closes");

  /* 7 — home: the Work header + footer restore. */
  await click($("[data-note-read-home]"), "the read pill's Home button");
  await settle(60);
  assert.equal(panel()?.getAttribute("data-course-notes-mode"), "home");
  assert.ok(workHeader(), "the Work header returns on the notes home");
  assert.equal(surface()?.getAttribute("data-work-immersive"), "false");
  assert.equal(
    immersiveReports().at(-1),
    "immersive:secondary:notes:false",
    "the slot reports non-immersive again — the Work footer navigation is restored",
  );

  /* 8 — New note opens the simple page: still headless, and leaving an empty
        one behind returns to the home page (there is nothing to store). */
  await click($("[data-notes-home-new]"), "New note");
  await settle(140);
  assert.equal(panel()?.getAttribute("data-course-notes-mode"), "compose");
  assert.equal(workHeader(), null, "no Work header over the composer");
  const leaveNew = $("[data-note-edit-read]") || $("[data-note-edit-read-float]");
  assert.ok(leaveNew, "the composer carries the same way back to the read view");
  await click(leaveNew, "Read on an empty new note");
  await settle(80);
  assert.equal(panel()?.getAttribute("data-course-notes-mode"), "home", "an empty new note leaves nothing behind");
  assert.ok(workHeader(), "the Work header returns on the notes home");

  await mounted.unmount();
});
