// tests/myDayQuickNotesSaveContract.test.mjs
//
// Contract for the My Day Quick Notes enhancement:
//   • A note only enters its larger editable form when the pencil icon is
//     explicitly clicked — clicking the note card itself must NOT open the
//     editor, and the collapsed note always renders as the compact,
//     non-editable display state.
//   • The tick / check-mark Save button appears ONLY in the expanded edit
//     state (never in the collapsed card).
//   • Pressing Save writes the note through `onEdit` (My DayApp persists it
//     to the backend via saveMyDayData → POST /api/myday) and immediately
//     minimizes the note back to its compact display state.
//   • The edit box offers ample room and scrolls internally for long
//     content.
//
// Pure code-shape — no React, no DOM, no browser.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const quickNotes = fs.readFileSync("src/components/myday/QuickNotes.tsx", "utf8");
const myDay = fs.readFileSync("src/MyDayApp.tsx", "utf8");

test("the note card itself never opens the editor — only the pencil does", () => {
  // Exactly ONE startEdit(note) call site must remain: the pencil button.
  // (The whole-card onClick used to be the second one.)
  const startEditSites = quickNotes.match(/startEdit\(note\)/g) ?? [];
  assert.equal(startEditSites.length, 1, "startEdit must only be wired to the pencil button");
  // The collapsed card must not be a clickable button/role.
  assert.doesNotMatch(quickNotes, /role="button"/);
  // The pencil keeps its labelled, accessible trigger.
  assert.match(quickNotes, /aria-label="Edit note"/);
});

test("the tick (Save) renders only in the expanded edit state", () => {
  // Exactly one Save button and one Check icon in the whole component —
  // both live inside the `isEditing` branch.
  const saveButtons = quickNotes.match(/aria-label="Save note"/g) ?? [];
  assert.equal(saveButtons.length, 1, "the Save button must exist exactly once (edit state only)");
  const checkIcons = quickNotes.match(/<Check /g) ?? [];
  assert.equal(checkIcons.length, 1, "the check icon must exist exactly once (edit state only)");
  // The collapsed view only shows pencil + delete actions.
  const collapsed = quickNotes.slice(quickNotes.indexOf("aria-label=\"Edit note\""));
  assert.doesNotMatch(collapsed, /aria-label="Save note"/);
});

test("Save persists through onEdit and minimizes the note back to its compact state", () => {
  // The handler writes the trimmed text back through the parent (My DayApp's
  // handleEditNote persists to the backend).
  assert.match(quickNotes, /onEdit\(editingId, editText\.trim\(\)\)/);
  // Saving collapses the editor...
  assert.match(quickNotes, /setEditingId\(null\)/);
  // ...and removes the expand flag so the note returns to its truncated,
  // compact display state after saving.
  assert.match(quickNotes, /next\.delete\(editingId\)/);
  assert.match(quickNotes, /setExpandedIds\(\(prev\) => \{\s*if \(!prev\.has\(editingId\)\) return prev;/);
});

test("My Day persists edited notes to the backend", () => {
  // The parent's edit handler mirrors the change to the cloud through the
  // secure server endpoint.
  assert.match(myDay, /const handleEditNote = useCallback\(\(id: string, noteText: string\) =>/);
  assert.match(myDay, /persistMyDay\(\{ notes: next \}\)/);
  assert.match(myDay, /saveMyDayData\(merged/);
});

test("the edit box gives ample room and scrolls internally", () => {
  // The expanded textarea keeps a generous height budget and scrolls its
  // own content when the pasted text exceeds it.
  assert.match(quickNotes, /rows=\{4\}/);
  assert.match(quickNotes, /max-h-\[45vh\]/);
  assert.match(quickNotes, /overflow-y-auto/);
});
