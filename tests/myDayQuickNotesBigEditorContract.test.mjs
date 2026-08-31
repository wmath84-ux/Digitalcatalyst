// tests/myDayQuickNotesBigEditorContract.test.mjs
//
// Contract for the My Day Quick Notes "big editor" upgrade:
//
//   • The note editor opens BIG and ALWAYS the same size — a 200px floor
//     that grows with the content up to 55dvh — instead of sizing itself
//     off the note's length. (That length-dependent sizing is what made the
//     box "kabhi pura dikhta hai, kabhi nahi".)
//   • While editing, the big editor REPLACES the notes list, so it always
//     gets the maximum card area and can never be clipped by the list's own
//     scroll box (the second cause of the half-visible editor).
//   • Opening the editor scrolls it into view and focuses it explicitly —
//     no silent autoFocus failure can leave a half-shown box.
//   • Next to Delete / Cancel there is a CHECKBOX-style Save button: one
//     click saves the note and closes the editor.
//   • The new-note composer expands into the same big editor on focus, and
//     its Cancel collapses it back without losing the draft.
//
// Pure code-shape — no React, no DOM, no browser.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const quickNotes = fs.readFileSync("src/components/myday/QuickNotes.tsx", "utf8");

test("the editor opens big and consistent — floor + viewport cap, not note length", () => {
  assert.match(quickNotes, /const EDITOR_MIN_HEIGHT_PX = 200;/);
  assert.match(quickNotes, /const EDITOR_MAX_HEIGHT_DVH = 55;/);
  assert.match(quickNotes, /min-h-\[200px\]/);
  assert.match(quickNotes, /max-h-\[55dvh\]/);
  assert.match(quickNotes, /rows=\{6\}/);
  assert.match(quickNotes, /overflow-y-auto/);
});

test("the editor auto-grows with the content between the floor and the cap", () => {
  // Auto-grow: height resets, then follows scrollHeight capped at the
  // 55dvh budget (never below the 200px floor).
  assert.match(quickNotes, /el\.style\.height = "auto";/);
  assert.match(quickNotes, /Math\.min\(el\.scrollHeight, cap\)/);
  assert.match(quickNotes, /Math\.max\(EDITOR_MIN_HEIGHT_PX, Math\.round\(window\.innerHeight \* \(EDITOR_MAX_HEIGHT_DVH \/ 100\)\)\)/);
  assert.match(quickNotes, /onInput=\{resize\}/);
});

test("editing REPLACES the list so the editor always gets the maximum area", () => {
  // The note being edited resolves to the big editor branch, not into the
  // list's max-h-80 scroll container that used to clip it.
  assert.match(quickNotes, /const editingNote = editingId \? notes\.find\(\(n\) => n\.id === editingId\) \?\? null : null;/);
  assert.match(quickNotes, /data-myday-note-edit-card/);
  assert.match(quickNotes, /data-myday-note-editor/);
  assert.match(quickNotes, /data-myday-note-editor-kind=\{kind\}/);
  // The list's own scroll box only lives in the non-editing branch.
  const listIndex = quickNotes.indexOf('className="max-h-80 space-y-2.5 overflow-y-auto');
  const editCardIndex = quickNotes.indexOf("data-myday-note-edit-card");
  assert.ok(listIndex !== -1 && editCardIndex !== -1, "both branches must exist");
  assert.ok(editCardIndex < listIndex, "the editor branch must come before the list branch");
});

test("opening the editor scrolls it fully into view and focuses it explicitly", () => {
  // The intermittent "box half visible" bug also came from the editor
  // mounting inside a scroll area without being brought into view, and
  // from autoFocus silently failing. The explicit bring-into-view + focus
  // frame makes the FULL box reliably visible.
  assert.match(quickNotes, /el\.scrollIntoView\(\{ block: "nearest", behavior: "smooth" \}\)/);
  assert.match(quickNotes, /requestAnimationFrame\(\(\) => \{/);
  assert.match(quickNotes, /el\.focus\(\);/);
  assert.match(quickNotes, /el\.setSelectionRange\(end, end\)/);
});

test("a checkbox-style Save sits next to Delete/Cancel and closes the editor on click", () => {
  // The action row: Delete (edit only) + Cancel + the checkbox Save.
  assert.match(quickNotes, /data-myday-note-editor-delete/);
  assert.match(quickNotes, /data-myday-note-editor-cancel/);
  assert.match(quickNotes, /data-myday-note-save/);
  // The checkbox look: an emerald square with the tick inside.
  assert.match(quickNotes, /border-2 border-emerald-500/);
  // Exactly one "Save note" label (edit state only; the composer passes
  // "Add note"), disabled while empty.
  const saveButtons = quickNotes.match(/saveAriaLabel="Save note"/g) ?? [];
  assert.equal(saveButtons.length, 1, "the Save checkbox must exist exactly once (edit state only)");
  assert.match(quickNotes, /disabled=\{!value\.trim\(\)\}/);
  assert.match(quickNotes, /title=\{kind === "edit" \? "Save note & close editor" : "Save note & close"\}/);
});

test("clicking the checkbox saves through onEdit and closes the editor", () => {
  // The edit editor's checkbox is wired to saveEdit, which persists through
  // the parent and immediately returns to the compact list.
  assert.match(quickNotes, /onSave=\{saveEdit\}/);
  assert.match(quickNotes, /onEdit\(editingId, editText\.trim\(\)\)/);
  assert.match(quickNotes, /setEditingId\(null\)/);
  assert.match(quickNotes, /next\.delete\(editingId\)/);
});

test("deleting from inside the editor removes the note and returns to the list", () => {
  assert.match(quickNotes, /onDelete=\{\(\) => deleteEditingNote\(editingNote\)\}/);
  assert.match(quickNotes, /const deleteEditingNote = \(note: QuickNote\) => \{/);
  assert.match(quickNotes, /onDelete\(note\.id\);/);
});

test("the composer expands into the same big editor on focus", () => {
  // Tap into the compact strip → the big editor replaces it, with its own
  // checkbox-save; Cancel collapses back WITHOUT losing the draft.
  assert.match(quickNotes, /onFocus=\{\(\) => setComposerExpanded\(true\)\}/);
  // The shared editor is parameterised by kind; the composer passes
  // "compose" and the edit view passes "edit".
  assert.match(quickNotes, /data-myday-note-editor-kind=\{kind\}/);
  assert.match(quickNotes, /saveAriaLabel="Add note"/);
  assert.match(quickNotes, /saveAriaLabel="Save note"/);
  assert.match(quickNotes, /onCancel=\{\(\) => setComposerExpanded\(false\)\}/);
  assert.match(quickNotes, /onSave=\{submit\}/);
});

test("the big editor supports multi-line writing with explicit save shortcuts", () => {
  // Enter = new line (no more accidental Enter-submit while writing);
  // Ctrl/Cmd+Enter saves; Escape cancels.
  assert.match(quickNotes, /\(event\.ctrlKey \|\| event\.metaKey\) && event\.key === "Enter"/);
  assert.match(quickNotes, /event\.key === "Escape"/);
  assert.match(quickNotes, /onCancel\(\);/);
});
