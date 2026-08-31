// tests/coursePlayerDeleteConfirmationContract.test.mjs
//
// Contract tests for the two-step deletion flow in the Course Player:
//
//   * Notes delete and mind-map delete (branch via toolbar trash / double-tap,
//     whole map via the library card) ALWAYS open a confirmation overlay.
//   * The destructive action fires ONLY from the confirmation handler; the
//     first tap (trash) never deletes anything.
//   * The overlay is portalled to <body> (so the clipped player sheet cannot
//     cut it off), sits above the player chrome, is top-aligned with safe-area
//     padding and is capped to the viewport on phones / tablets / landscape.
//
// These are contract tests: they assert the wiring + the responsive class
// contract, in line with the repo's existing test convention.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const dialog = read("src/course/ConfirmDeleteDialog.tsx");
const notesPanel = read("src/course/NotesPanel.tsx");
const mindPanel = read("src/course/MindMapPanel.tsx");

// ---------------------------------------------------------------------------
// Reusable confirmation overlay — every screen size
// ---------------------------------------------------------------------------

test("the confirm overlay portals to body and never renders inside the clipped sheet", () => {
  assert.match(dialog, /createPortal\(/);
  assert.match(dialog, /document\.body/);
});

test("the confirm overlay is always above the player overlay sheet and dock", () => {
  // CourseOverlay sheet is z-40, the dock is z-50; the confirmation must be
  // the top-most layer on every device.
  assert.match(dialog, /z-\[120\]/);
});

test("the confirm overlay is top-aligned with safe-area padding on phones and tablets", () => {
  assert.match(dialog, /items-start/);
  assert.match(dialog, /safe-area-inset-top/);
  assert.match(dialog, /safe-area-inset-bottom/);
  assert.match(dialog, /safe-area-inset-left/);
  assert.match(dialog, /safe-area-inset-right/);
});

test("the confirm overlay card is width/height-capped so small screens never clip the buttons", () => {
  assert.match(dialog, /w-\[min\(100%,26rem\)\]/);
  assert.match(dialog, /maxHeight: "max\(18rem, min\(70vh, 70dvh\)\)"/);
  assert.match(dialog, /overflow-y-auto/);
  assert.match(dialog, /overscroll-contain/);
  // Buttons stack vertically on phones, side-by-side on larger screens.
  assert.match(dialog, /flex-col-reverse gap-2 sm:flex-row/);
});

test("Cancel/Escape/backdrop never delete; only the red confirm button does", () => {
  assert.match(dialog, /data-course-confirm-cancel/);
  assert.match(dialog, /data-course-confirm-delete/);
  assert.match(dialog, /event\.key === "Escape"\) onCancel\(\)/);
  assert.match(dialog, /onClick=\{onCancel\}/);
  assert.match(dialog, /onClick=\{onConfirm\}/);
  assert.match(dialog, /autoFocus/); // Cancel gets focus, so Enter is safe
});

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

test("notes delete opens the confirmation and only deletes after confirm", () => {
  // The trash button now opens the dialog, not the delete directly.
  assert.match(notesPanel, /setPendingDeleteId\(note\.id\)/);
  assert.match(notesPanel, /pendingDeleteId\) onDelete\(pendingDeleteId\)/);
  assert.match(notesPanel, /ConfirmDeleteDialog/);
  assert.match(notesPanel, /Delete this note/);
  // No unconditional onDelete call remains on the card button.
  assert.doesNotMatch(notesPanel, /onClick=\{\(\) => onDelete\(note\.id\)\}/);
});

test("the notes dialog explains the note being deleted and that it is permanent", () => {
  assert.match(notesPanel, /permanently removed from your notes/);
  assert.match(notesPanel, /This action cannot be undone/);
});

// ---------------------------------------------------------------------------
// Mind map — branch delete (toolbar trash + double-tap)
// ---------------------------------------------------------------------------

test("the mind-map branch delete is gated behind the confirmation overlay", () => {
  // Toolbar trash + the node double-tap both route through requestDelete.
  assert.match(mindPanel, /requestDelete\(selectedId\)/);
  assert.match(mindPanel, /onDelete: requestDelete/);
  // The actual removal only happens in the confirm handler.
  assert.match(mindPanel, /performDelete\(deleteTargetId\)/);
  assert.match(mindPanel, /removeNode\(current, id\)/);
  assert.match(mindPanel, /ConfirmDeleteDialog/);
  assert.match(mindPanel, /Delete this branch/);
  assert.match(mindPanel, /linked node/);
});

test("the mind-map whole-map delete is gated behind the confirmation overlay", () => {
  assert.match(mindPanel, /requestMapDelete\(entry\.mapKey\)/);
  assert.match(mindPanel, /if \(key\) onDeleteMap\?\.\(key\);/);
  assert.match(mindPanel, /Delete this mind map/);
});

test("opening another map or closing the panel drops a pending confirmation", () => {
  assert.match(mindPanel, /setDeleteTargetId\(null\)/);
  assert.match(mindPanel, /setDeleteMapKey\(null\)/);
  assert.match(mindPanel, /if \(!open\) \{/);
});
