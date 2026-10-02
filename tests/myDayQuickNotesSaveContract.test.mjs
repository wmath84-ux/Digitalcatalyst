// tests/myDayQuickNotesSaveContract.test.mjs
//
// Contract for the My Day quick-notes editor (now the course player's block
// editor — see tests/myDayQuickNotesBigEditorContract.test.mjs):
//   • A note only enters its editable form when the pencil icon is explicitly
//     clicked — clicking the note card itself must NOT open the editor, and the
//     saved note always renders as the compact square card.
//   • The tick / check-mark Save button exists only in the editor view, is
//     disabled while the note is empty (or too long), and one click saves and
//     closes the editor.
//   • Save writes the note's HTML through `onAdd` / `onEdit`, which My DayApp
//     persists to the backend via persistMyDay → saveMyDayData → POST /api/myday.
//   • Delete stays a two-step act: the trash opens a confirmation, and only the
//     red confirm removes the note.
//
// Pure code-shape — no React, no DOM, no browser.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const quickNotes = fs.readFileSync("src/components/myday/QuickNotes.tsx", "utf8");
const myDay = fs.readFileSync("src/MyDayApp.tsx", "utf8");

test("the note card itself never opens the editor — only the pencil does", () => {
  // Exactly ONE startEdit(note) call site must remain: the pencil button.
  const startEditSites = quickNotes.match(/startEdit\(note\)/g) ?? [];
  assert.equal(startEditSites.length, 1, "startEdit must only be wired to the pencil button");
  assert.match(quickNotes, /onClick=\{\(\) => startEdit\(note\)\}/);
  // The collapsed card must not be a clickable button/role.
  assert.doesNotMatch(quickNotes, /role="button"/);
  // The pencil keeps its labelled, accessible trigger.
  assert.match(quickNotes, /aria-label="Edit note"/);
});

test("the tick (Save) renders only in the editor view, once, and is gated", () => {
  // One Save button, one check icon, both inside the editor branch.
  assert.equal((quickNotes.match(/data-myday-note-save/g) ?? []).length, 1);
  assert.equal((quickNotes.match(/<Check /g) ?? []).length, 1);
  assert.match(quickNotes, /aria-label="Save note"/);
  assert.match(quickNotes, /data-myday-note-cancel/);
  // It is disabled while the note is empty, and while it is over the cap.
  assert.match(quickNotes, /disabled=\{empty \|\| tooLong\}/);
  // The Save button lives AFTER the editor opens, never in the grid.
  const saveIndex = quickNotes.indexOf("data-myday-note-save");
  const gridIndex = quickNotes.indexOf("data-myday-notes-grid");
  assert.ok(saveIndex !== -1 && gridIndex !== -1);
  assert.ok(saveIndex < gridIndex, "the Save button belongs to the editor view, not the grid");
});

test("Save persists through onAdd / onEdit and closes the editor", () => {
  // Compose → onAdd with the combined HTML; edit → onEdit with the same.
  assert.match(quickNotes, /onAdd\(html\);/);
  assert.match(quickNotes, /onEdit\(editingId, html\);/);
  // …and the editor collapses straight back to the grid.
  assert.match(quickNotes, /setComposing\(false\);/);
  assert.match(quickNotes, /setEditingId\(null\);/);
  // Cancel discards instead, and marks the draft as closed so the editor's
  // unmount flush cannot write it back.
  assert.match(quickNotes, /discardingRef\.current = true;/);
  // An empty note is never written.
  assert.match(quickNotes, /if \(editingId && !isEmptyRichText\(html\)\) \{/);
});

test("My Day persists the note to the backend", () => {
  assert.match(myDay, /const handleAddNote = useCallback\(\(noteHtml: string\) => \{/);
  assert.match(myDay, /const handleEditNote = useCallback\(\(id: string, noteHtml: string\) => \{/);
  assert.match(myDay, /void persistMyDay\(\{ notes: \[note, \.\.\.notes\] \}\)/);
  assert.match(myDay, /void persistMyDay\(\{ notes: next \}\)/);
  assert.match(myDay, /await saveMyDayData\(merged, \{/);
  // The stored note keeps BOTH the rich HTML and the plain mirror the grid and
  // the global search read.
  assert.match(myDay, /const plain = richTextToPlain\(noteHtml\) \|\| "";/);
  assert.match(myDay, /html: noteHtml,/);
});

test("the editor gives the page real room and scrolls internally", () => {
  // A definite height for the card (not a max-height the flex column can
  // collapse through), the bar fixed, the page taking the rest.
  assert.match(quickNotes, /h-\[min\(72dvh,680px\)\]/);
  assert.match(quickNotes, /sm:h-\[min\(75dvh,720px\)\]/);
  assert.match(quickNotes, /className="flex shrink-0 items-center justify-between gap-2 bg-white/);
  assert.match(quickNotes, /className="relative min-h-0 flex-1">/);
  // The scrolling itself belongs to the editor's own page (`.dc-note-scroll` in
  // src/course/noteEditor/noteEditor.css) — My Day adds no second scroller
  // around it, which is what used to clip the box.
  const editorCss = fs.readFileSync("src/course/noteEditor/noteEditor.css", "utf8");
  assert.match(editorCss, /\.dc-note \.dc-note-scroll \{[^}]*overflow-y: auto;/);
  const from = quickNotes.indexOf("<NoteEditor");
  assert.doesNotMatch(quickNotes.slice(from, quickNotes.indexOf("/>", from)), /overflow-y-auto/);
});

test("delete stays a two-step act", () => {
  assert.match(quickNotes, /onClick=\{\(\) => setPendingDeleteId\(note\.id\)\}/);
  assert.match(quickNotes, /data-myday-confirm-dialog/);
  assert.match(quickNotes, /if \(pendingDeleteId\) onDelete\(pendingDeleteId\);/);
  // Cancel / backdrop never delete.
  assert.match(quickNotes, /onClick=\{\(\) => setPendingDeleteId\(null\)\}/);
});
