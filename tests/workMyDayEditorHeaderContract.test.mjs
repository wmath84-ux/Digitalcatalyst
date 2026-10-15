// tests/workMyDayEditorHeaderContract.test.mjs
//
// Source contract for the My Day Editor's single header.
//
// The brief: remove the two old rows (the page's editor header AND the
// labelled meta/chips rows) and put ONE header over the editor —
//   · three selectable boxes in it, the chosen value showing on the box's
//     own face (no captions beside them),
//   · the header's background matching the page background (--workspace-bg,
//     transparent over the page shell — no surface band, no divider),
//   · a side-panel button,
//   · exactly one toggle: pencil in read mode, tick (save + finish) while
//     editing — and no separate Save button,
//   · the Note Editor (shared Course design + toolbar) below, unchanged;
//   · all existing editing/save behaviour preserved — the header boxes write
//     through the same controller.updateItem paths the meta row used, and
//     finishing still runs saveItem().
//
// Runtime behaviour: tests/workMyDayEditorRuntime.test.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(path.join(ROOT, "src/work/myday/WorkMyDayPage.tsx"), "utf8");
const editor = fs.readFileSync(path.join(ROOT, "src/work/myday/WorkMyDayEditor.tsx"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "src/work/myday/work-myday.css"), "utf8");
const headerStart = page.indexOf("data-work-myday-editor-header");
const headerRegion = page.slice(headerStart, page.indexOf("</header>", headerStart));

test("the editor has ONE header — the old rows are gone", () => {
  assert.match(page, /data-work-myday-editor-header/, "one editor header marker");
  assert.equal(page.match(/data-work-header-area/g).length, 1 + 1, "header areas: the library's + the editor's single one");
  assert.equal(page.match(/data-work-myday-edit-toggle/g).length, 1, "exactly one edit toggle");
  assert.doesNotMatch(page, /Save on this device/, "no separate Save button");
  assert.doesNotMatch(editor, /work-myday-editor-meta/, "the labelled meta row is gone from the editor");
  assert.doesNotMatch(editor, /work-myday-editor-readmeta/, "the read-mode chips row is gone from the editor");
  assert.doesNotMatch(editor, /KIND_OPTIONS/, "the kind select lives in the header now, not the editor");
  assert.doesNotMatch(editor, /notebooks/, "the editor no longer owns the notebook field");
  assert.doesNotMatch(headerRegion, /work-myday-title-block|Open My Day navigation/, "no title block, no old navigation button in the editor header");
});

test("the header carries three selectable boxes with their chosen values on their faces", () => {
  for (const name of ["type", "notebook", "due"]) {
    assert.match(headerRegion, new RegExp(`data-work-myday-box="${name}"`), `the ${name} box`);
  }
  assert.match(headerRegion, /value=\{currentItem\.kind\}/, "the type box shows the current kind");
  assert.match(headerRegion, /value=\{currentItem\.notebookId \|\| ""\}/, "the notebook box shows the current notebook");
  assert.match(headerRegion, /value=\{currentItem\.allDay \? localDateValue\(currentItem\.dueAt\) : localDateTimeValue\(currentItem\.dueAt\)\}/, "the due box shows the scheduled value");
  assert.match(headerRegion, /disabled=\{!editing\}/, "the boxes display but do not edit in read mode");
  assert.match(css, /\.work-myday-box \{[^}]*border: 1px solid var\(--border-color\)[^}]*background: var\(--surface-bg\)/, "boxes render as one value-bearing box each");
  assert.doesNotMatch(headerRegion, /<span>(Type|Notebook|Due|Repeat)<\/span>/, "no field captions beside the boxes");
});

test("the header's background is the page's background", () => {
  assert.match(page, /className="work-myday-header work-myday-editor-header"/, "the editor header layer over the shared header shell");
  assert.match(css, /\.work-myday-editor-header \{\s*background: transparent;\s*border-bottom: none;\s*\}/, "no surface band, no divider — the page background shows through");
  assert.match(page, /className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-\[var\(--workspace-bg\)\]/, "the page itself is --workspace-bg, so the transparent header matches it");
});

test("one toggle: pencil to edit, tick to save and finish — and finish still saves", () => {
  assert.match(headerRegion, /editing \? <Check size=\{17\} aria-hidden="true" \/> : <PencilLine size=\{16\} aria-hidden="true" \/>/, "pencil in read mode, tick while editing");
  assert.match(headerRegion, /aria-label=\{editing \? "Save and finish editing" : "Edit this item"\}/, "one button, two states");
  assert.match(page, /if \(await saveItem\(\)\) onEditingChange\(false\)/, "the tick runs the existing saveItem() and only finishes when it succeeds");
  assert.match(headerRegion, /data-work-myday-side-panel-button/, "the side-panel button opens the drawer");
  assert.match(headerRegion, /onClick=\{\(\) => setDrawerOpen\(true\)\}/, "the side-panel button is wired to the drawer");
});

test("the boxes write through the same updateItem paths; the Note Editor below is unchanged", () => {
  assert.match(page, /const setKind = \(value: string\)/, "the kind writer survives");
  assert.match(page, /patchCurrent\(\{ kind \}\)/, "type box patches kind through updateItem");
  assert.match(headerRegion, /onChange=\{\(event\) => patchCurrent\(\{ notebookId: event\.target\.value \|\| undefined \}\)\}/, "notebook box patches notebookId");
  assert.match(page, /const setDueAt = \(value: string\)/, "the due writer survives");
  assert.match(page, /const setRepeat = \(value: string\)/, "the repeat writer survives");
  assert.match(editor, /import NoteEditor, \{ type NoteEditorHandle \} from "\.\.\/\.\.\/course\/NoteEditor";/, "the shared Note Editor is the body");
  assert.match(editor, /readOnly=\{!editing\}/, "the note surface stays read-only until editing");
  assert.match(editor, /dataAttribute="data-work-myday-note"/, "the note surface keeps its My Day identity");
  assert.match(page, /onEdit=\{\(\) => onEditingChange\(true\)\}/, "the editing state stays page-owned");
});
