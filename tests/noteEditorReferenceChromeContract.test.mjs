// tests/noteEditorReferenceChromeContract.test.mjs
//
// Pins the Note Editor chrome taken from the reference design
// (recreate-obsidian-notes-design.zip), as the owner asked:
//
//   1. no conventional header when a note opens;
//   2. a top-left button that opens the left side panel;
//   3. a top-right button that opens the right side panel;
//   4+5+6. an editing toolbar at the bottom whose design, size and buttons —
//      and their functionality — are the reference pill's;
//   7+8. read mode gets its own bottom navigation, and the bottom chrome
//      switches with the mode;
//   9. the existing text formatting keeps working (same BlockNote building
//      blocks, same slash commands, same style engine);
//  10. a note can be renamed from the editor's side panel.
//
// Behaviour that predates the redesign (explicit Save / Cancel semantics,
// status labels, the caret rule) stays pinned by noteEditorContract.test.mjs.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const notesPanel = read("src/course/NotesPanel.tsx");
const toolbar = read("src/course/NoteEditorToolbar.tsx");
const css = read("src/course/noteEditor/noteEditor.css");

// The editor branch of NotesPanel (from its early return to the list return).
const editorBranch = notesPanel.slice(notesPanel.indexOf("if (editorOpen)"), notesPanel.indexOf('data-course-notes-mode="list"'));

test("1 — a note opens with no conventional header: no status/action bar strip", () => {
  assert.doesNotMatch(notesPanel, /data-course-notes-bar/, "the old top bar is gone entirely");
  // The only top chrome is a borderless 44px corner-button row.
  const chromeRow = editorBranch.match(/<div className="flex h-11 shrink-0 items-center justify-between px-2" data-note-editor-chrome>/);
  assert.ok(chromeRow, "the slim corner-button row");
  assert.doesNotMatch(editorBranch, /data-note-editor-chrome>[\s\S]{0,80}?border/, "no border on the chrome row");
});

test("2+3 — corner buttons open the left and right side panels", () => {
  assert.match(editorBranch, /data-note-open-left-panel[\s\S]{0,200}?setSidePanel\("left"\)/);
  assert.match(editorBranch, /<PanelLeft size=\{18\}/);
  assert.match(editorBranch, /data-note-open-right-panel[\s\S]{0,200}?setSidePanel\("right"\)/);
  assert.match(editorBranch, /<PanelRight size=\{18\}/);
  // Both drawers exist, on their own sides, above the page.
  assert.match(editorBranch, /data-note-left-panel/);
  assert.match(editorBranch, /absolute inset-y-0 left-0 z-40 flex w-\[280px\]/);
  assert.match(editorBranch, /data-note-right-panel/);
  assert.match(editorBranch, /absolute inset-y-0 right-0 z-40 flex w-\[300px\]/);
  // A scrim dismisses them, and Escape does too.
  assert.match(editorBranch, /data-note-panel-scrim/);
  assert.match(editorBranch, /event\.key === "Escape" && sidePanel/);
});

test("10 — the left panel lists the learner's notes and renames from inside the editor", () => {
  assert.match(editorBranch, /data-note-left-panel[\s\S]*?<BranchedMenu\s+items={selfTree}/);
  assert.match(editorBranch, /data-note-left-panel-menu/);
  assert.match(editorBranch, /if \(note\) startEdit\(note\);/);
  // Rename rides the same library-menu item the list has always used.
  assert.match(notesPanel, /onRename: \(nextTitle\) => \{[\s\S]{0,300}?onEdit\(note\.id, combineHtml\(nextTitle/);
  assert.match(editorBranch, /data-note-panel-new[\s\S]{0,120}?openComposer\(\)/);
});

test("right panel — status, the read/edit switch, Save / Cancel, Delete", () => {
  assert.match(editorBranch, /data-note-right-panel[\s\S]*?<NoteStatus editing={editing} dirty={dirty} tooLong={tooLong}/);
  assert.match(editorBranch, /data-note-mode-edit[\s\S]{0,160}?enterEditMode\(\)/);
  assert.match(editorBranch, /data-note-mode-read[\s\S]{0,160}?enterReadMode\(\)/);
  // The explicit save/cancel hooks survive verbatim, so the save semantics
  // (and every test that drives them) are untouched.
  assert.match(editorBranch, /"data-course-note-edit-save": true/);
  assert.match(editorBranch, /"data-course-notes-save": true/);
  assert.match(editorBranch, /"data-course-note-edit-cancel": true/);
  assert.match(editorBranch, /"data-course-notes-cancel": true/);
  assert.match(editorBranch, /disabled={empty \|\| tooLong}/);
  // Delete asks through the same two-step dialog, shared with the library.
  assert.match(editorBranch, /data-note-delete[\s\S]{0,160}?setPendingDeleteId\(editingId\)/);
  assert.equal((notesPanel.match(/\{deleteDialog\}/g) || []).length, 2, "one dialog element, both branches");
});

test("7+8 — read mode's bottom navigation, swapped for the editing pill in edit mode", () => {
  assert.match(editorBranch, /data-note-read-nav/);
  for (const hook of ["data-note-read-back", "data-note-read-prev", "data-note-read-next", "data-note-read-new", "data-note-read-edit", "data-note-read-more"]) {
    assert.match(editorBranch, new RegExp(hook), hook);
  }
  // It is rendered only for the read view; prev/next walk the SELF collection.
  assert.match(editorBranch, /\{readView \? \([\s\S]{0,900}?data-note-read-nav/);
  assert.match(editorBranch, /if \(prevNote\) startEdit\(prevNote\)/);
  assert.match(editorBranch, /if \(nextNote\) startEdit\(nextNote\)/);
  assert.match(editorBranch, /data-note-read-edit onClick={enterEditMode}/);
  // The mode also still flips by the established gestures.
  assert.match(notesPanel, /useDoubleTapToEdit\(Boolean\(editingId && selfReadOnly\), enterEditMode\)/);
  assert.match(editorBranch, /data-note-view-mode={editing && selfReadOnly \? "read" : "edit"}/);
});

test("4+5+6 — the editing pill: reference order, every button wired to the document", () => {
  const dock = toolbar.slice(toolbar.indexOf("export function NoteDockedToolbar"));
  const order = [
    'direction="undo"',
    'direction="redo"',
    "<BlockTypeSelect",
    'basicTextStyle="bold"',
    'basicTextStyle="italic"',
    'basicTextStyle="strike"',
    "<HighlightButton",
    'basicTextStyle="code"',
    'command="quote"',
    "<CreateLinkButton",
    'command="bulletList"',
    'command="numberedList"',
    'command="checklist"',
    'direction="indent"',
    'direction="outdent"',
  ];
  let last = -1;
  for (const needle of order) {
    const at = dock.indexOf(needle);
    assert.ok(at > last, `${needle} appears in the reference order`);
    last = at;
  }
  // Functionality, not decoration: block commands run the note's own slash
  // commands, highlight toggles the schema's background-colour style, and
  // indent/outdent nest the live block.
  assert.match(toolbar, /onClick=\{\(\) => runSlashCommand\(editor, command\)\}/);
  assert.match(toolbar, /editor\.toggleStyles\(\{ backgroundColor: "yellow" \}\)/);
  assert.match(toolbar, /live\.getActiveStyles\(\)\.backgroundColor/);
  assert.match(toolbar, /editor\.nestBlock\(\)/);
  assert.match(toolbar, /editor\.unnestBlock\(\)/);
  // The floating selection toolbar keeps the full inline set (underline too).
  assert.match(toolbar, /const InlineActions = \(\) => \([\s\S]*?basicTextStyle="underline"/);
  assert.match(toolbar, /<InlineActions \/>/);
});

test("5 — the pill's geometry is the reference's: bottom-left, round, 36px buttons", () => {
  assert.match(css, /\.dc-note \.dc-note-dock \{[^}]*position: absolute;[^}]*left: 0\.5rem;/);
  assert.match(css, /\.dc-note \.dc-note-dock \.dc-note-dock-bar \{[^}]*border-radius: 999px;[^}]*box-shadow: 0 10px 25px/);
  assert.match(css, /\.dc-note \.dc-note-dock \.bn-ak-button \{[^}]*height: 2\.25rem;[^}]*border-radius: 999px;/);
  assert.match(css, /\.dc-note \.dc-note-dock-sep \{[^}]*height: 1\.25rem;/);
  // Group separators split the pill into the reference's four groups.
  assert.equal((css.match(/dc-note-dock-sep/g) || []).length >= 1, true);
  assert.equal((toolbar.match(/<DockSeparator/g) || []).length, 3, "history | inline | link | lists");
});

test("the MASTER viewer is headerless too, keeping its back + read-only hooks", () => {
  const viewer = notesPanel.slice(notesPanel.indexOf("function MasterNoteViewer"), notesPanel.indexOf("export default function NotesPanel"));
  assert.doesNotMatch(viewer, /<header/);
  assert.match(viewer, /data-course-master-note-back/);
  assert.match(viewer, /data-master-note-readonly/);
  assert.match(viewer, /data-note-editor-chrome/);
});
