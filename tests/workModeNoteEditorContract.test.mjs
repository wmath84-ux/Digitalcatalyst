// tests/workModeNoteEditorContract.test.mjs
//
// Work Mode's Note Editor is the Course Player's updated Note Editor — the
// same NotesPanel/NoteEditor component, never a Work fork — with Work's own
// device-only storage and shell chrome around it:
//
//   1. no conventional header over the editor (Work's page header drops too) —
//      and no corner buttons either: nothing sits at the top of a notes page;
//   2. the library is the ONE side panel, opened from the read pill;
//   3. the reference editing pill at the bottom in edit mode, with the black
//      Read capsule pinned at its front;
//   4. the reference bottom navigation in read mode (library · prev · next |
//      new · edit | home — the 3-dot drawer button is gone);
//   5. existing text formatting untouched (same BlockNote building blocks);
//   6. rename from the editor's side panel, saved through Work's onEdit;
//   7. the Work footer navigation hides while the editor is open and
//      returns on the notes library.
//
// The editor's own chrome is pinned by noteEditorReferenceChromeContract and
// its runtime behaviour by workModeNoteEditorRuntime; this file pins the
// Work wiring that carries it.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const app = source("src/work/WorkApp.tsx");
const page = source("src/work/pages/WorkPageSurface.tsx");
const overlay = source("src/course/CourseOverlay.tsx");
const notesPanel = source("src/course/NotesPanel.tsx");

const editorBranch = notesPanel.slice(
  notesPanel.indexOf("if (editorOpen)"),
  notesPanel.indexOf('data-course-notes-mode="home"'),
);

test("Work mounts the exact Course NotesPanel — the editor is shared, never forked", () => {
  assert.match(overlay, /import NotesPanel from "\.\/NotesPanel";/);
  assert.match(page, /const NotesPanel = lazy\(\(\) => import\("\.\.\/\.\.\/course\/NotesPanel"\)\);/);
  // No Work-owned editor or toolbar: Work renders the player's component and
  // lets it own the whole editor design.
  assert.doesNotMatch(page, /NoteEditor|NoteDockedToolbar|data-note-dock|data-note-read-nav/);
  // Work identity stays Work's: device-only storage, Work theme, Work notes.
  assert.match(app, /useCourseNotes\(\{ uid: WORK_DEVICE_UID, productId: WORK_PRODUCT_ID, storageOnly: true \}\)/);
  assert.match(page, /<NotesPanel[\s\S]*?notes=\{notes\.notes\}[\s\S]*?onAdd=\{notes\.add\}[\s\S]*?onEdit=\{notes\.edit\}[\s\S]*?onDelete=\{notes\.remove\}/);
  assert.match(page, /storageOnly\s+themeOverride=\{theme\}\s+onEditorOpenChange=\{setNotesEditorOpen\}/);
});

test("the editor design has no storage-only fork: same chrome in Work and Course", () => {
  // 1 — no conventional header, and NO top chrome at all: the corner-button row
  // is gone (nothing in a notes page may open a side panel from a header).
  assert.doesNotMatch(editorBranch, /<header/);
  assert.doesNotMatch(editorBranch, /data-note-editor-chrome/);
  assert.doesNotMatch(editorBranch, /data-note-open-left-panel|data-note-open-right-panel|PanelLeft|PanelRight/);
  // 2 — the ONE side panel is reached from the read pill's library button.
  // (Its markup is its own element, shared by both notes pages, so it is
  // pinned on the panel rather than inside the editor branch.)
  assert.match(editorBranch, /data-note-read-library[\s\S]{0,200}?openLibrary\("self"\)/);
  assert.match(notesPanel, /data-note-left-panel/);
  assert.match(notesPanel, /w-\[calc\(100%-2\.5rem\)\]/, "almost the full page, a thin strip left visible");
  assert.match(notesPanel, /data-note-panel-scrim/, "the visible strip is the way out");
  // 4 — read mode's bottom navigation; 3 — it swaps out for the editing pill,
  // whose FIRST control is the black Read capsule.
  assert.match(editorBranch, /\{readView \? \([\s\S]{0,1200}?data-note-read-nav/);
  assert.match(editorBranch, /data-note-view-mode=\{readView \? "read" : "edit"\}/);
  assert.ok(notesPanel.includes("data-note-edit-read-float"), "the floating Read capsule keeps edit mode escapable");
  assert.ok(notesPanel.includes("onClick={enterReadMode}"));
  // …and the removed 3-dot drawer button is nowhere.
  assert.doesNotMatch(editorBranch, /data-note-read-more|MoreHorizontal/);
  // 5 — formatting stays the shared BlockNote document in both modes.
  assert.match(editorBranch, /<NoteEditor[\s\S]*?readOnly=\{readView\}/);
  // The only storageOnly differences inside the editor are status wording —
  // never different chrome, tools or save semantics.
  assert.match(editorBranch, /storageOnly \? "Device save needs attention" : "Note sync needs attention"/);
});

test("rename rides the library panel's long-press menu into Work's device-only onEdit", () => {
  assert.match(notesPanel, /data-note-left-panel[\s\S]*?<BranchedMenu\s+items=\{selfTree\}/);
  // Rows carry NO pencil / trash buttons in this library: both actions live in
  // the row's long-press popup, and rename still writes through onEdit.
  assert.match(notesPanel, /leafActionMenu="long-press"/);
  assert.match(notesPanel, /onRename: \(nextTitle\) => renameNote\(note, nextTitle\)/);
  assert.ok(notesPanel.includes("onEdit(note.id, combineHtml(nextTitle, body));"));
  assert.ok(notesPanel.includes("onDelete: () => setPendingDeleteId(note.id),"));
  // Nothing in the editor saves explicitly: Work saving is the player's.
  assert.doesNotMatch(notesPanel, /data-course-note-edit-save|data-course-notes-save/);
});

test("Work header and footer follow the editor boundary and restore on the library", () => {
  // The panel reports the boundary; the Work surface turns it into chrome.
  assert.match(notesPanel, /useEffect\(\(\) => \{ onEditorOpenChange\?\.\(editorOpen\); \}\);/);
  assert.match(page, /\(page === "notes" && notesEditorOpen\)/);
  assert.match(page, /\{showHeader \? \(\s+<header[\s\S]*?data-work-header-area=\{page\}/);
  assert.match(page, /onImmersiveChange\?\.\(slotKey, immersive\);/);
  // Any immersive slot hides the shared Work footer; the library restores it.
  assert.match(app, /const anyImmersive = Object\.values\(immersiveSlots\)\.some\(Boolean\);/);
  assert.match(app, /\{\(page === "myday" && myDayView === "editor"\) \|\| anyImmersive \? null : \(\s+<WorkFooterNav/);
  // Work chrome state never leaks into the Course Player session: neither
  // file imports it or writes a notes session view. (Work's own local
  // `setNotesEditorOpen` state setter is WorkPageSurface's, not the course
  // session's — the import check is what keeps them apart.)
  assert.doesNotMatch(page, /coursePanelSession|setNotesSessionView/);
  assert.doesNotMatch(app, /coursePanelSession|setNotesSessionView/);
  assert.doesNotMatch(page, /from "[^"]*coursePanelSession"/);
  assert.doesNotMatch(app, /from "[^"]*coursePanelSession"/);
});
