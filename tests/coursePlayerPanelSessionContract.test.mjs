// tests/coursePlayerPanelSessionContract.test.mjs
//
// Contract for the Course Player's panel-session behaviour.
//
//   While the learner stays INSIDE the course player, the Notes and Mind Map
//   panels keep their place across every switch (the learner's own words):
//     • notes editor open → switch to Module / Mind map → back to Notes ⇒
//       the SAME editor is still open (compose or edit, with the draft);
//     • mind map library open → switch away → back ⇒ library; canvas open ⇒
//       canvas — "vahi state rahe".
//   Leaving the player (unmount) RESETS everything so the next entry starts
//   from the default library state:
//     • notes → list, mind map → library, mind map theme → follows the
//       player again (the map's own sun/moon button is a per-visit choice).
//   One safety net remains: an open notes draft is preserved as a saved note
//   on exit, so a learner's work is never thrown away.
//
//   The state lives in src/course/coursePanelSession.ts (module scope, so it
//   survives panel unmounts on tab switches) and CoursePlayerApp resets it in
//   its unmount cleanup.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const session = fs.readFileSync("src/course/coursePanelSession.ts", "utf8");
const notesPanel = fs.readFileSync("src/course/NotesPanel.tsx", "utf8");
const mindMapPanel = fs.readFileSync("src/course/MindMapPanel.tsx", "utf8");
const coursePlayer = fs.readFileSync("src/CoursePlayerApp.tsx", "utf8");
const overlay = fs.readFileSync("src/course/CourseOverlay.tsx", "utf8");

test("the panel session stores notes view, mind map view and the map theme pick", () => {
  assert.match(session, /notes: NotesPanelSessionView/);
  assert.match(session, /mindMapView: MindMapPanelSessionView/);
  assert.match(session, /mindMapThemeOverride: MindMapThemeChoice/);
  // Defaults = the entry state: notes list, map library, no theme override.
  assert.match(session, /notes: \{ view: "list" \}/);
  assert.match(session, /mindMapView: "library"/);
  assert.match(session, /mindMapThemeOverride: null/);
  // A single reset function hands every field back to those defaults.
  assert.match(session, /export const resetCoursePanelSession/);
  assert.match(session, /session = defaultState\(\);/);
});

test("NotesPanel restores its editor from the session and syncs it on every render", () => {
  // The mount state comes from the session (view + draft survive tab switches).
  assert.match(notesPanel, /const sessionNotes = getCoursePanelSession\(\)\.notes/);
  assert.match(notesPanel, /useState\(sessionNotes\.view === "compose"\)/);
  assert.match(notesPanel, /sessionNotes\.view === "compose" \? sessionNotes\.draft : ""/);
  assert.match(notesPanel, /restoreEdit/);
  assert.match(notesPanel, /sessionNotes\.noteId/);
  // Every render re-syncs the live view/draft into the session.
  assert.match(notesPanel, /setNotesSessionView\(\{ view: "compose", draft, title: draftTitle \}\)/);
  assert.match(notesPanel, /setNotesSessionView\(\{ view: "edit", noteId: editingId, draft: editDraft, title: editTitle \}\)/);
  assert.match(notesPanel, /setNotesSessionView\(\{ view: "list" \}\)/);
  // An edit view whose note was deleted must degrade to the list.
  assert.match(notesPanel, /notes\.some\(\(note\) => note\.id === sessionNotes\.noteId\)/);
});

test("tab switches never flush a notes draft — the editor keeps its place", () => {
  // The old auto-save-on-unmount / save-signal flush is gone: switching tabs
  // must NOT convert the draft into a saved note, otherwise coming back would
  // land on the list instead of the open editor.
  assert.doesNotMatch(notesPanel, /flushDraft/);
  assert.doesNotMatch(notesPanel, /saveSignal/);
  assert.doesNotMatch(overlay, /notesSaveSignal/);
  assert.doesNotMatch(coursePlayer, /fireSaveSignal/);
  // Nothing may save on NotesPanel unmount anymore.
  assert.doesNotMatch(notesPanel, /return \(\) => \{\s*flushDraft/);
});

test("the mind map restores library vs canvas from the session", () => {
  // Mount state comes from the session; the live view is written back.
  assert.match(mindMapPanel, /getCoursePanelSession\(\)\.mindMapView !== "canvas"/);
  assert.match(mindMapPanel, /setMindMapSessionView\(libraryOpen \? "library" : "canvas"\)/);
  // Reopening the sheet (same-tab toggle) restores the learner's last view
  // instead of force-resetting to the library.
  assert.match(mindMapPanel, /const resumeCanvas = getCoursePanelSession\(\)\.mindMapView === "canvas";/);
  assert.match(mindMapPanel, /setLibraryOpen\(!resumeCanvas\);/);
});

test("the mind map theme pick is per-visit: follows the player, no device-wide override", () => {
  // The override initialises from the session and is written back to it.
  assert.match(mindMapPanel, /getCoursePanelSession\(\)\.mindMapThemeOverride/);
  assert.match(mindMapPanel, /setMindMapSessionTheme\(themeOverride\)/);
  // null override → the map renders in the player's live theme.
  assert.match(mindMapPanel, /themeOverride \?\? \(playerTheme === "light" \? "light" : "dark"\)/);
  // The old forever-persisted per-device override must be gone: every fresh
  // player entry follows the player's theme again.
  assert.doesNotMatch(mindMapPanel, /dc\.mindMapThemeOverride/);
});

test("leaving the player resets the session and preserves an open notes draft", () => {
  // The unmount cleanup saves any open draft as a note first…
  assert.match(coursePlayer, /const sessionNotes = getCoursePanelSession\(\)\.notes/);
  assert.match(coursePlayer, /combineHtml\(sessionNotes\.title, sessionNotes\.draft\)/);
  assert.match(coursePlayer, /loadLocalNotes\(user\.id, product\.id\)/);
  // …then resets the whole panel session for the next entry.
  assert.match(coursePlayer, /resetCoursePanelSession\(\);/);
});
