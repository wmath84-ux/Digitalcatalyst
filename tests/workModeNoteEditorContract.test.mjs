// tests/workModeNoteEditorContract.test.mjs
//
// Work Mode's Note Editor is the Course Player's updated Note Editor — the
// same NotesPanel/NoteEditor component, never a Work fork — with Work's own
// device-only storage and shell chrome around it:
//
//   1. no conventional header over the editor (Work's page header drops too);
//   2. top-left / top-right side-panel corner buttons;
//   3. the reference editing pill at the bottom in edit mode;
//   4. the reference bottom navigation in read mode;
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
  notesPanel.indexOf('data-course-notes-mode="list"'),
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
  // 1 — no conventional header; the slim corner row is the only top chrome.
  assert.doesNotMatch(editorBranch, /<header/);
  assert.match(editorBranch, /data-note-editor-chrome/);
  // 2 — side-panel corner buttons, left and right.
  assert.match(editorBranch, /data-note-open-left-panel[\s\S]{0,200}?setSidePanel\("left"\)/);
  assert.match(editorBranch, /data-note-open-right-panel[\s\S]{0,200}?setSidePanel\("right"\)/);
  // 4 — read mode's bottom navigation; 3 — it swaps out for the editing pill.
  assert.match(editorBranch, /\{readView \? \([\s\S]{0,900}?data-note-read-nav/);
  assert.match(editorBranch, /data-note-view-mode=\{editing && selfReadOnly \? "read" : "edit"\}/);
  // 5 — formatting stays the shared BlockNote document in both modes.
  assert.match(editorBranch, /<NoteEditor[\s\S]*?readOnly=\{Boolean\(editing && selfReadOnly\)\}/);
  // The only storageOnly differences inside the editor are status wording —
  // never different chrome, tools or save semantics.
  assert.match(editorBranch, /storageOnly \? "Device save needs attention" : "Note sync needs attention"/);
});

test("rename rides the side panel into Work's device-only onEdit", () => {
  assert.match(editorBranch, /data-note-left-panel[\s\S]*?<BranchedMenu\s+items=\{selfTree\}/);
  assert.match(notesPanel, /onRename: \(nextTitle\) => \{[\s\S]{0,300}?onEdit\(note\.id, combineHtml\(nextTitle/);
  // Save / Cancel keep their explicit hooks, so Work saving is the player's.
  assert.match(editorBranch, /"data-course-note-edit-save": true/);
  assert.match(editorBranch, /"data-course-notes-save": true/);
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
