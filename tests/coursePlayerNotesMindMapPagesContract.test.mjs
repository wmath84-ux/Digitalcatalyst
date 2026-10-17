// tests/coursePlayerNotesMindMapPagesContract.test.mjs
//
// The owner's Notes + Mind Map page redesign (2026-10-17), pinned:
//
//   1. NO start screen on either page — the "New note / New mind map /
//      My Library / Course Library" button page is GONE.
//   2. Both pages open on a VIEWER page: the notes page on the blank
//      "New note" (the heading "New note" and the hint
//      "Start writing from here…"), the mind map page on the empty canvas.
//   3. Both pages wear a BOTTOM toolbar, and the library is opened by a
//      DIRECT button on that toolbar — never by a page of its own.
//   4. The "home" button is GONE from the Mind Map toolbar and from the
//      Note read-mode bottom toolbar.
//   5. The side panel BECAME the full-page main area, and MASTER / SELF are
//      renamed "Course library" / "My library" in both panels, with the top
//      control EXPANDED.
//   6. Nothing is created on the way in: an untouched empty state shows the
//      SAME state again on the next visit, and a NEW session after real
//      changes starts a NEW (blank) state.
//   7. The Mind Map's page-switching button FRAMES (fit-zooms) the map it
//      opens — it does not only switch.
//   8. A Course-Library note opens in the NOTES area (never in the lesson
//      pane) and without the opening lag.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const notesPanel = read("src/course/NotesPanel.tsx");
const mindMapPanel = read("src/course/MindMapPanel.tsx");
const notesCss = read("src/course/notesLibrary.css");
const mindMapCss = read("src/course/mindMapLibrary.css");
const control = read("src/course/MasterSelfControl.tsx");
const session = read("src/course/coursePanelSession.ts");
const player = read("src/CoursePlayerApp.tsx");
const library = read("src/course/CourseResourceLibrary.tsx");
const overlay = read("src/course/CourseOverlay.tsx");

test("1 — neither page has a start screen any more", () => {
  for (const [name, source] of [["notes", notesPanel], ["mind map", mindMapPanel]]) {
    assert.doesNotMatch(source, /data-course-notes-home|data-notes-home-actions/, `${name}: no notes start screen`);
    assert.doesNotMatch(source, /data-course-mindmap-home|data-mindmap-home-actions/, `${name}: no mind map start screen`);
  }
  assert.doesNotMatch(notesPanel, /data-notes-home-new|data-notes-home-library|data-notes-home-course/);
  assert.doesNotMatch(mindMapPanel, /data-mindmap-home-new|data-mindmap-home-mine|data-mindmap-home-course/);
  // …and no CSS still dresses a page that no longer exists.
  assert.doesNotMatch(notesCss, /data-course-notes-home/);
  assert.doesNotMatch(mindMapCss, /data-course-mindmap-home/);
});

test("2 — the notes page opens on the blank 'New note'", () => {
  assert.match(notesPanel, /export const BLANK_NOTE_TITLE = "New note";/);
  assert.match(notesPanel, /export const BLANK_NOTE_BODY = "Start writing from here…";/);
  // The page OPENS on it (a session that was left on a real note restores
  // that note instead).
  assert.match(notesPanel, /const \[composing, setComposing\] = useState\(!restoreEdit\);/);
  // The heading and the hint are REAL TEXT on the viewer page…
  assert.match(notesPanel, /data-note-blank-title/);
  assert.match(notesPanel, /data-note-blank-body/);
  assert.match(notesPanel, /const blankPage = readView && !editing;/);
  // …and the very same two words are the editor's placeholders in edit mode.
  assert.match(notesPanel, /titlePlaceholder=\{editing \? undefined : BLANK_NOTE_TITLE\}/);
  assert.match(notesPanel, /bodyPlaceholder=\{editing \? undefined : BLANK_NOTE_BODY\}/);
  // The placeholder is per editor instance.
  const factory = read("src/course/noteEditor/editorFactory.ts");
  assert.match(factory, /bodyPlaceholder\?: string;/);
  assert.match(factory, /placeholders: \{ \.\.\.noteDictionary\.placeholders, default: bodyPlaceholder \}/);
  // The blank page's own styles live with the panel (not in the lazy chunk).
  assert.match(notesCss, /\.dc-note-blank-title/);
  assert.match(notesCss, /\.dc-note-blank-body/);
});

test("2b — the mind map page opens on the EMPTY canvas", () => {
  // The page IS the canvas: `mapOpen` says whether a map is ON it.
  assert.match(mindMapPanel, /const \[mapOpen, setMapOpen\] = useState\(/);
  assert.match(mindMapPanel, /: \(mapOpen \? selfMind : emptyMind\);/, "no map open → the empty map is drawn");
  assert.match(mindMapPanel, /data-mindmap-empty-hint/, "the empty page says what it is");
  // The canvas is never replaced by a page of buttons.
  assert.doesNotMatch(mindMapPanel, /\{libraryOpen \? \(/);
});

test("3 — both pages wear a bottom toolbar, and the library is one direct tap away", () => {
  // The notes read tray.
  assert.match(notesPanel, /data-note-read-tray/);
  assert.match(notesPanel, /data-note-read-library/);
  assert.match(notesPanel, /data-note-read-library[\s\S]{0,200}?openLibrary\("self"\)/);
  // The mind map read tray.
  assert.match(mindMapPanel, /data-mindmap-read-tray/);
  assert.match(mindMapPanel, /data-mindmap-read-library/);
  assert.match(mindMapPanel, /data-mindmap-read-library[\s\S]{0,200}?openPanel\("self"\)/);
  // The map switcher (the edit toolbar's map pill) opens the SAME panel.
  const switcherAt = mindMapPanel.indexOf("data-course-mindmap-maps");
  assert.ok(switcherAt > 0, "the map switcher keeps its hook");
  assert.match(
    mindMapPanel.slice(Math.max(0, switcherAt - 600), switcherAt),
    /setPanelOpen\(\(open\) => !open\);/,
    "…and it opens the ONE panel",
  );
  // The empty page wears the tray too — it is the only way into the library.
  assert.match(mindMapPanel, /\{!readOnlyCanvas \|\| !readChromeVisible \? null : \(/);
});

test("4 — the home button is gone from both bottom toolbars", () => {
  assert.doesNotMatch(notesPanel, /data-note-read-home/);
  assert.doesNotMatch(notesPanel, /aria-label="Notes home"/);
  assert.doesNotMatch(mindMapPanel, /data-mindmap-read-home/);
  assert.doesNotMatch(mindMapPanel, /aria-label="Mind map home"/);
  assert.doesNotMatch(mindMapPanel, /data-mindmap-home-actions/);
});

test("5 — the side panel is the FULL-PAGE main area, with the expanded, renamed filter", () => {
  // Notes.
  assert.match(notesPanel, /absolute inset-0 z-40 flex flex-col shadow-2xl/);
  assert.match(notesPanel, /data-note-library-back[\s\S]{0,600}?onClick=\{closeLibrary\}/);
  assert.match(notesPanel, /masterLabel="Course library"/);
  assert.match(notesPanel, /selfLabel="My library"/);
  assert.match(notesPanel, /expand/);
  // Mind map.
  assert.match(mindMapPanel, /absolute inset-0 z-40 flex flex-col shadow-2xl/);
  assert.match(mindMapPanel, /data-mindmap-panel-back[\s\S]{0,600}?onClick=\{closePanel\}/);
  assert.match(mindMapPanel, /masterLabel="Course library"/);
  assert.match(mindMapPanel, /selfLabel="My library"/);
  assert.match(mindMapPanel, /expand/);
  // The shared control takes the labels and the expanded shape.
  assert.match(control, /masterLabel\?: string;/);
  assert.match(control, /selfLabel\?: string;/);
  assert.match(control, /expand\?: boolean;/);
  assert.match(control, /data-master-self-expanded/);
  // …and the plain MASTER / SELF words stay the default for the other pages.
  assert.match(control, /masterLabel = "MASTER"/);
  assert.match(control, /selfLabel = "SELF"/);
});

test("6 — nothing is created on the way in, and a new session starts a NEW state", () => {
  // The notes page: the blank page is not a record. A note is created only
  // when the draft has words in it.
  assert.match(notesPanel, /if \(isEmptyRichText\(html\)\) return false;/);
  assert.match(notesPanel, /const saved = onAdd\(html\);/);
  // The session's default is the blank page, and leaving the player resets it
  // — so the next entry is a NEW blank page.
  assert.match(session, /notes: \{ view: "list" \}/);
  assert.match(session, /mindMapView: "empty"/);
  assert.match(player, /resetCoursePanelSession\(\);/);
  // The mind map: the empty page creates nothing (the default draft is only
  // written when the learner edits it).
  assert.match(mindMapPanel, /const \[mapOpen, setMapOpen\] = useState\(\s*\(\) => !storageOnly && getCoursePanelSession\(\)\.mindMapView === "canvas",\s*\);/);
  // An untouched empty state is the SAME state on the next visit: nothing
  // stores a "visited" flag, and the map is never created on mount.
  assert.doesNotMatch(mindMapPanel, /useEffect\(\(\) => \{[^}]*createNewMap\(\)/);
});

test("7 — the mind map's page switching FRAMES the map it opens", () => {
  // The switcher (prev / next / the library row) opens the map AND fits it.
  assert.match(mindMapPanel, /const openMap = useCallback\([\s\S]{0,900}?setMapOpen\(true\);/);
  assert.match(mindMapPanel, /const openMap = useCallback\([\s\S]{0,1200}?fitView\(\{ duration: 320, padding: 0\.2 \}\), 60\);/);
  // …and the read tray's prev / next go through the same door.
  assert.match(mindMapPanel, /data-mindmap-read-prev[\s\S]{0,200}?openMap\(prevMap\.mapKey\)/);
  assert.match(mindMapPanel, /data-mindmap-read-next[\s\S]{0,200}?openMap\(nextMap\.mapKey\)/);
});

test("8 — a Course-Library note opens in the NOTES area, without the opening lag", () => {
  // The wrong-area fix: a note never falls through to the lesson pane.
  assert.match(library, /if \(resource\.masterNote\) onOpenMasterNote\(resource\.masterNote\);/);
  assert.match(library, /if \(onOpenCourseNote\) onOpenCourseNote\(resource\.file, resource\.modulePath\);/);
  assert.doesNotMatch(library, /else if \(resource\.file\) onSelectFile\(resource\.file\);/);
  // The player turns a course note FILE into a note the notes page can open.
  assert.match(player, /const handleOpenCourseNoteFromLibrary = useCallback\(/);
  assert.match(player, /handleOpenMasterNoteFromLibrary\(note\);/);
  // The lag fix: the note travels WITH the signal (no lookup, no waiting for
  // the master list) and the editor chunk is warm before the note is tapped.
  assert.match(player, /setOpenMasterNoteSignal\(\{ id: note\.id, count: Date\.now\(\), note \}\);/);
  assert.match(overlay, /openMasterNoteSignal\?: \{ id: string; count: number; note\?: MasterCourseNote \} \| null;/);
  assert.match(notesPanel, /const note = openMasterNoteSignal\.note/);
  assert.match(library, /void import\("\.\/NoteEditor"\)\.catch\(\(\) => undefined\);/);
});
