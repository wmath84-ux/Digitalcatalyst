// tests/workMyDayEditorRuntime.test.mjs
//
// RUNTIME proof for the My Day Editor's single header, driven inside the
// real WorkMyDayPage + WorkMyDayEditor (with the real Note Editor) in
// jsdom:
//
//   · the editor has ONE header — the old page header row and the labelled
//     meta/readmeta rows are gone;
//   · the header carries three selectable boxes (type · notebook · due,
//     with its repeat/all-day modifiers) whose own faces show the chosen
//     values, with no field captions;
//   · one toggle does everything: pencil enters edit mode, the tick saves
//     and finishes (the same saveItem path as before); there is NO
//     separate Save button;
//   · below the header the body is the Note Editor itself: read-only until
//     editing, its docked formatting toolbar up while editing;
//   · box changes and the final save land through controller.updateItem.
//
// The header's page-matching background is CSS, pinned by
// workMyDayEditorHeaderContract.

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
const DIR = path.join(ROOT, "node_modules", ".tmp-work-myday-editor-runtime");
fs.mkdirSync(DIR, { recursive: true });

/* ── DOM + globals (before the bundle is imported) ────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="host"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/#/work/myday",
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
  "HTMLSelectElement",
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
class DOMRectStub {
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x; this.y = y; this.width = width; this.height = height;
    this.left = x; this.top = y; this.right = x + width; this.bottom = y + height;
  }
  toJSON() { return {}; }
}
define("DOMRect", DOMRectStub);
define("DOMRectReadOnly", DOMRectStub);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── fixture: the real My Day editor page, mounted ────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act, useRef, useState } from "react";
import WorkMyDayPage from "./src/work/myday/WorkMyDayPage";

export { act };
export const patchLog = [];

const item0 = {
  id: "i1",
  ownerId: "work-device",
  kind: "task",
  title: "Plan revision",
  bodyHtml: "<p>Revise cells</p>",
  bodyText: "Revise cells",
  notebookId: "nb1",
  dueAt: Date.now() + 3600000,
  allDay: false,
  schedule: { timeZone: "Asia/Kolkata", recurrence: { freq: "daily" } },
  createdAt: 1,
  updatedAt: 1,
};

function Harness() {
  const [item, setItem] = useState(item0);
  const [editing, setEditing] = useState(false);
  const itemRef = useRef(item);
  itemRef.current = item;
  const controller = {
    items: [item],
    notebooks: [
      { id: "nb1", title: "Biology" },
      { id: "nb2", title: "Physics" },
    ],
    loading: false,
    error: null,
    updateItem: async (id, patch) => {
      patchLog.push(JSON.stringify(patch));
      setItem((current) => ({ ...current, ...patch }));
    },
    getItem: async () => itemRef.current,
    toggleComplete: async () => undefined,
    createItem: async () => itemRef.current,
    createNotebook: async () => ({ id: "nb3", title: "New" }),
    deleteNotebook: async () => undefined,
    removeItem: async () => undefined,
  };
  return (
    <div style={{ height: "800px" }}>
      <WorkMyDayPage
        slotKey="secondary:myday"
        theme="light"
        orientation="column"
        controller={controller}
        view="editor"
        selectedItemId="i1"
        editing={editing}
        showEditorFooter={false}
        onOpenItem={() => undefined}
        onCreateItem={() => undefined}
        onBack={() => undefined}
        onDelete={() => undefined}
        onEditingChange={setEditing}
        onExit={() => undefined}
        onToggleTheme={() => undefined}
      />
    </div>
  );
}

let root = null;
export async function mountMyDayEditor() {
  if (!root) root = createRoot(document.getElementById("host"));
  await act(async () => {
    root.render(<Harness />);
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
  ],
});

const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")).href);
const { act, patchLog } = fixture;

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
  fs.rmSync(DIR, { recursive: true, force: true });
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

const $ = (selector) => window.document.querySelector(selector);
const header = () => $("[data-work-myday-editor-header]");
const box = (name) => $(`[data-work-myday-box="${name}"]`);
const toggle = () => $("[data-work-myday-edit-toggle]");
const editorBody = () => $(".bn-editor");

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
const setControlValue = async (element, value, prototype, eventType) => {
  const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new window.Event(eventType, { bubbles: true }));
    await sleep(30);
  });
};

/* ── the flow ─────────────────────────────────────────────────────────────── */

test("My Day Editor: single header, three boxes, pencil/tick toggle, saves preserved", async () => {
  const mounted = await fixture.mountMyDayEditor();
  await settle(150);

  /* ONE header; the old second rows are gone. */
  assert.ok(header(), "the single editor header");
  assert.equal(window.document.querySelectorAll("[data-work-header-area]").length, 1, "exactly one header row over the editor");
  assert.equal($(".work-myday-editor-meta"), null, "the labelled meta row is gone");
  assert.equal($(".work-myday-editor-readmeta"), null, "the read-mode chips row is gone");
  assert.equal(header().querySelector("h1"), null, "no title text block in the header — the note itself carries it");

  /* Header contents: side-panel button + three boxes + one toggle. */
  assert.ok($("[data-work-myday-side-panel-button]"), "the side-panel (drawer) button in the header");
  for (const name of ["type", "notebook", "due"]) {
    assert.ok(box(name), `the ${name} box`);
    assert.equal(box(name).closest("label"), null, `the ${name} box has no caption label`);
  }
  // The chosen values show on the boxes' own faces.
  assert.equal(box("type").value, "task");
  assert.equal(box("notebook").value, "nb1");
  assert.equal(box("notebook").selectedOptions[0].textContent, "Biology");
  assert.match(box("due").value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "the due box shows the date/time itself");
  assert.equal(box("repeat").value, "daily", "the repeat modifier shows its value too");
  // Read mode: the boxes display, they do not edit.
  assert.equal(box("type").disabled, true);
  assert.equal(box("notebook").disabled, true);
  assert.equal(box("due").disabled, true);

  /* One toggle only; no separate Save button anywhere in the header. */
  assert.ok(toggle(), "the single edit toggle");
  assert.equal(toggle().getAttribute("aria-label"), "Edit this item");
  assert.equal(header().querySelector('[aria-label="Save on this device"]'), null, "no separate Save button");
  assert.equal(header().querySelectorAll("button").length, 2, "header buttons: side panel + toggle only");

  /* The body below is the Note Editor, read-only until editing. */
  assert.ok($("[data-work-myday-note]") || editorBody(), "the Note Editor body");
  assert.equal(editorBody()?.getAttribute("contenteditable"), "false", "read mode is read-only");

  /* Pencil → edit mode: boxes unlock, the document becomes editable, and
     the Note Editor's own docked toolbar comes up with a cursor. */
  await click(toggle(), "the pencil toggle");
  await settle(80);
  assert.equal(toggle().getAttribute("aria-label"), "Save and finish editing", "the same button is now the tick");
  assert.equal(box("type").disabled, false);
  assert.equal(editorBody()?.getAttribute("contenteditable"), "true", "edit mode edits the same document");
  const titleField = $("[data-course-note-heading-input]");
  assert.ok(titleField, "the Note Editor title field");
  await act(async () => {
    titleField.focus();
    await sleep(30);
  });
  assert.ok($("[data-note-dock]"), "the Note Editor's docked formatting toolbar is up while editing");

  /* The boxes write through the same updateItem as always. */
  patchLog.length = 0;
  await setControlValue(box("type"), "reminder", window.HTMLSelectElement.prototype, "change");
  assert.ok(patchLog.some((entry) => entry.includes('"kind":"reminder"')), "type box patches the kind");
  await setControlValue(box("notebook"), "nb2", window.HTMLSelectElement.prototype, "change");
  assert.ok(patchLog.some((entry) => entry.includes('"notebookId":"nb2"')), "notebook box patches the notebook");

  /* Tick → save + finish: the draft lands through the editor's save, the
     toast confirms, and the page is back in read mode. */
  patchLog.length = 0;
  await click(toggle(), "the tick toggle");
  await settle(120);
  assert.ok(
    patchLog.some((entry) => entry.includes('"title":"Plan revision"')),
    "finishing through the tick saved the note draft",
  );
  assert.ok($(".work-myday-toast")?.textContent.includes("Saved on this device"), "the saved toast confirms it");
  assert.equal(toggle().getAttribute("aria-label"), "Edit this item", "back to the pencil after saving");
  assert.equal(editorBody()?.getAttribute("contenteditable"), "false", "read mode again after save");

  await mounted.unmount();
});
