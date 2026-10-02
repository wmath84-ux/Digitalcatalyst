// tests/myDayQuickNotesEditorRuntime.test.mjs
//
// RUNTIME proof that My Day's notes are written in the COURSE PLAYER'S editor.
//
// tests/myDayQuickNotesBigEditorContract.test.mjs pins the shape (the editor is
// imported from src/course/NoteEditor.tsx, wired like NotesPanel wires it). This
// file mounts the REAL `QuickNotes` — the real GlassCard chrome, the real lazy
// chunk, the real BlockNote editor — in React 19 inside jsdom and drives it:
//
//   1. the "+" opens the course player's block editor (`.dc-note`, `.bn-editor`,
//      the serif title field), not the old contentEditable surface;
//   2. a cursor in a text field brings the toolbar up — with NO soft keyboard
//      anywhere in the environment (the rule the owner asked for);
//   3. an existing note opens with its heading in the title and its body on the
//      page, and Save writes the SAME dialect back through `onEdit` — stored
//      HTML → blocks → serialised HTML, with the body intact;
//   4. a legacy plain-text note (no `html`) still opens and still saves;
//   5. a new note saves through `onAdd` as `<h1>title</h1>`;
//   6. Cancel writes nothing; an empty note cannot be saved;
//   7. delete stays a two-step act.

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
const DIR = path.join(ROOT, "node_modules", ".tmp-myday-notes-runtime");
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

// jsdom does no layout; the editor reads rects (to place its toolbar against
// the player's footer navigation) and ProseMirror asks a Range for client rects.
window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { top: 0, bottom: 800, left: 0, right: 400, width: 400, height: 800, x: 0, y: 0, toJSON: () => ({}) };
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

/* ── fixture: the real panel, mounted ─────────────────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import QuickNotes from "./src/components/myday/QuickNotes";

export { act };

/** Every call the panel made out to My Day, in order. */
export const calls = [];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let root = null;

export async function mount(notes) {
  // Every test starts from a clean panel: unmount the previous one instead of
  // re-rendering it, or the last test's open composer would still be on screen.
  if (root) {
    await act(async () => {
      root.unmount();
    });
    root = null;
  }
  root = createRoot(document.getElementById("host"));
  calls.length = 0;
  await act(async () => {
    root.render(
      <QuickNotes
        notes={notes}
        onAdd={(html) => calls.push({ kind: "add", html })}
        onEdit={(id, html) => calls.push({ kind: "edit", id, html })}
        onDelete={(id) => calls.push({ kind: "delete", id })}
      />,
    );
    // The editor is a lazy chunk: let it resolve before the caller asserts.
    await wait(60);
  });
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
  // The glass chrome imports through the app's "@" alias.
  alias: { "@": path.join(ROOT, "src") },
  plugins: [
    {
      // The editor and the glass chrome import stylesheets; jsdom has no CSS pipeline.
      name: "css",
      setup(b) {
        b.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: "css-stub" }));
        b.onLoad({ filter: /.*/, namespace: "css-stub" }, () => ({ contents: "", loader: "js" }));
      },
    },
  ],
});

const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")).href);
const { act, calls } = fixture;

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

const doc = () => window.document;
// Compare DOM nodes with `assert.ok(a === b, …)`, never `assert.equal(a, b)`:
// on failure Node's assert serialises both sides, and inspecting a jsdom node
// walks the whole document — it has taken the runner's memory with it.
const find = (selector) => doc().querySelector(selector);
const click = async (selector) => {
  const element = find(selector);
  assert.ok(element, `missing ${selector}`);
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await sleep(60);
  });
};
const titleField = () => find("[data-course-note-heading-input]");
const bodyText = () => find(".bn-editor")?.textContent ?? "";
const toolbar = () => find("[data-note-dock]");
const saveButton = () => find("[data-myday-note-save]");

/** Type into the note's title field the way a learner does. */
const typeTitle = async (text) => {
  const title = titleField();
  assert.ok(title, "the title field must be on the page");
  await act(async () => {
    title.focus();
    title.value = text;
    title.dispatchEvent(new window.Event("input", { bubbles: true }));
    await sleep(40);
  });
};

const note = (id, html, text = "") => ({ id, text, createdAt: 1, color: "violet", html });

/* ── 1. the editor itself ─────────────────────────────────────────────────── */

test('the "+" opens the course player\'s block editor, not the old one', async () => {
  await fixture.mount([]);
  assert.ok(find("[data-myday-notes-panel]"), "the grid is up first");
  assert.ok(find("[data-note-editor]") === null, "no editor before the tap");

  await click("[data-myday-notes-add]");
  assert.equal(find("[data-myday-notes-mode]")?.getAttribute("data-myday-notes-mode"), "compose");
  // The course player's editor, down to its own hooks.
  assert.ok(find("[data-note-editor]"), "the block editor is mounted");
  assert.ok(find(".dc-note.bn-container"), "…and it is the white block-document page");
  assert.ok(find(".dc-note .dc-note-scroll"), "…with the player's own scroll area");
  assert.ok(find(".bn-editor[contenteditable]"), "…a ProseMirror surface, not a contentEditable div");
  assert.ok(titleField(), "…and the serif title field");
  // The old editor is NOT what opened: `data-course-rich-editor` is the root the
  // legacy `RichTextEditor` paints, and it must stay off the page.
  assert.ok(find("[data-course-rich-editor]") === null, "the legacy RichTextEditor did not mount");
});

test("a cursor brings the toolbar up — with no soft keyboard anywhere", async () => {
  await fixture.mount([]);
  await click("[data-myday-notes-add]");
  assert.equal(window.visualViewport, undefined, "this environment has no keyboard to open");

  // A new note autofocuses its title, so the caret is already there — and with no
  // visualViewport in the page there is no keyboard the toolbar could be waiting on.
  assert.ok(doc().activeElement === titleField(), "a new note opens with the cursor in the title");
  assert.ok(toolbar(), "the caret alone put the toolbar on screen");

  // Take the cursor away and the toolbar goes with it.
  await act(async () => {
    titleField().blur();
    await sleep(40);
  });
  assert.ok(toolbar() === null, "no cursor, no toolbar");

  // And a caret brings it straight back.
  await typeTitle("Photosynthesis");
  assert.ok(doc().activeElement === titleField(), "the title really has the cursor");
  assert.ok(toolbar(), "the toolbar is back — the caret alone put it there");
  assert.deepEqual(
    Array.from(toolbar().querySelectorAll(".bn-ak-button")).map((b) => b.getAttribute("aria-label") || b.textContent.trim()),
    ["Insert block", "Paragraph", "Bold", "Italic", "Underline", "Strike", "Code", "Undo", "Redo"],
    "the same toolbar the course player ships",
  );
  // My Day has no footer navigation, so the toolbar needs no lift: it sits
  // flush at the bottom of the page instead of floating over a gap.
  assert.equal(find(".dc-note-shell")?.getAttribute("data-note-footer-inset"), null);
});

/* ── 2. save / edit round-trips ───────────────────────────────────────────── */

test("a new note saves through onAdd as the stored dialect", async () => {
  await fixture.mount([]);
  await click("[data-myday-notes-add]");
  assert.equal(saveButton().disabled, true, "an empty note cannot be saved");
  await typeTitle("Cell biology");
  assert.equal(saveButton().disabled, false, "a title is enough to save");
  await click("[data-myday-note-save]");
  assert.deepEqual(calls, [{ kind: "add", html: "<h1>Cell biology</h1>" }]);
  assert.ok(find("[data-myday-notes-panel]"), "and the panel is back on the grid");
});

test("an existing note opens split into title + body and saves back intact", async () => {
  const stored = "<h1>Photosynthesis</h1><hr><p>Plants turn light into sugar.</p>";
  await fixture.mount([note("n1", stored)]);
  await click("[data-myday-note-edit]");
  assert.equal(find("[data-myday-notes-mode]")?.getAttribute("data-myday-notes-mode"), "edit");
  // The heading became the title field; the rest is on the page.
  assert.equal(titleField().value, "Photosynthesis");
  assert.match(bodyText(), /Plants turn light into sugar\./);

  await typeTitle("Photosynthesis, edited");
  await click("[data-myday-note-save]");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, "edit");
  assert.equal(calls[0].id, "n1");
  // The stored dialect is unchanged: heading, divider, then the SAME body —
  // blocks in, blocks out, nothing dropped on the way through.
  assert.match(calls[0].html, /^<h1>Photosynthesis, edited<\/h1><hr>/);
  assert.match(calls[0].html, /<p>Plants turn light into sugar\.<\/p>/);
});

test("a legacy plain-text note still opens and still saves", async () => {
  // No `html` at all — the oldest notes in the store.
  await fixture.mount([{ id: "legacy", text: "Buy milk\nCall Amma", createdAt: 1, color: "violet" }]);
  await click("[data-myday-note-edit]");
  assert.match(bodyText(), /Buy milk/);
  assert.match(bodyText(), /Call Amma/);
  await typeTitle("Errands");
  await click("[data-myday-note-save]");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, "edit");
  assert.equal(calls[0].id, "legacy");
  assert.match(calls[0].html, /^<h1>Errands<\/h1><hr>/);
  assert.match(calls[0].html, /Buy milk/);
});

/* ── 3. cancel and delete ─────────────────────────────────────────────────── */

test("Cancel writes nothing and returns to the grid", async () => {
  await fixture.mount([note("n1", "<h1>Keep me</h1><hr><p>Untouched.</p>")]);
  await click("[data-myday-note-edit]");
  await typeTitle("Discard this");
  await click("[data-myday-note-cancel]");
  assert.deepEqual(calls, [], "nothing was written");
  assert.ok(find("[data-myday-notes-panel]"), "back on the grid");
});

test("delete stays a two-step act", async () => {
  await fixture.mount([note("n1", "<h1>Doomed</h1>")]);
  await click("[data-myday-note-delete]");
  assert.ok(find("[data-myday-confirm-dialog]"), "the confirmation is up");
  assert.deepEqual(calls, [], "the trash alone deletes nothing");
  await act(async () => {
    const confirm = Array.from(doc().querySelectorAll('[data-myday-confirm-dialog] button')).find(
      (button) => button.textContent?.includes("Delete note"),
    );
    assert.ok(confirm, "the confirm button must exist");
    confirm.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await sleep(40);
  });
  assert.deepEqual(calls, [{ kind: "delete", id: "n1" }]);
});
