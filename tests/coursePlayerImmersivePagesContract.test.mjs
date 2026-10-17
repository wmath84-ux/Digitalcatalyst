// tests/coursePlayerImmersivePagesContract.test.mjs
//
// Pins the Course Player brief: light-mode PDF viewers + a footer
// navigation that stays out of the immersive pages.
//
//   PDF viewers —
//     1. the pdf.js viewer (Read Library PDFs AND the annotations viewer:
//        the same PdfJsGenericViewer) opens in LIGHT mode;
//     2. the Read Library's Google Drive PDF viewer opens in LIGHT mode;
//     3. the pdf.js side panel hides on an outside click.
//
//   Footer navigation — the owner's rule of 2026-10-16 ("yah tab nahin dikhega
//   jab editor mode on hoga, bas; baaki hamesha dikhe"): the three EDITOR
//   tabs hide it only while they are in EDIT mode (the notes READ view, the
//   mind-map READ canvas and the sketch READ mode keep it). The pages the
//   owner named himself hide it outright — the Brain Card / Brain Practice
//   answer page, the Live Experiment Viewer, the Read Library's PDF and
//   annotations viewers, an OPEN PLAYER on the Music tab and the two SEARCH
//   pages (the Resource Library's and the Music library's). A search RESULTS
//   page shows the footer and only scrolls it away (see
//   tests/footerNavigationVisibilityContract.test.mjs for the whole rule).
//   The panels publish their page into coursePanelSession; both footer homes
//   (the parent-rendered Workspace pill and the Split Deck's in-flow dock)
//   apply the one resolver, and Settings can overrule it with "Visible footer
//   navigation always".

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const session = read("src/course/coursePanelSession.ts");
const pdfViewer = read("src/course/PdfJsGenericViewer.tsx");
const readPanel = read("src/course/ReadLibraryPanel.tsx");
const brainPanel = read("src/course/CourseBrainPanel.tsx");
const notesPanel = read("src/course/NotesPanel.tsx");
const playerApp = read("src/CoursePlayerApp.tsx");
const peekDock = read("src/course/CoursePeekDock.tsx");
const overlay = read("src/course/CourseOverlay.tsx");

test("1 — the pdf.js viewer opens in LIGHT mode", () => {
  assert.match(pdfViewer, /setAttribute\("viewer-css-theme", "LIGHT"\)/);
  assert.doesNotMatch(pdfViewer, /setAttribute\("viewer-css-theme", "DARK"\)/);
  // The element and its stage paint the light backdrop while it boots.
  assert.match(pdfViewer, /background:#f8fafc/);
  assert.match(pdfViewer, /data-read-pdfjs-viewer/);
  assert.match(pdfViewer, /overflow-hidden bg-\[#f8fafc\]" data-read-pdfjs-viewer/);
});

test("2 — the Read Library's Google Drive viewer opens in LIGHT mode", () => {
  const drive = readPanel.slice(readPanel.indexOf("data-course-read-drive") - 1600, readPanel.indexOf("data-course-read-drive"));
  assert.match(drive, /style=\{\{ colorScheme: "light" \}\}/);
  assert.match(drive, /className="h-full w-full border-0 bg-white"/);
  // The Drive sandbox/allow contract is untouched.
  assert.match(drive, /sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-same-origin allow-presentation"/);
  assert.match(drive, /allow="fullscreen; clipboard-write"/);
});

test("3 — the pdf.js side panel hides on an outside click", () => {
  assert.match(pdfViewer, /viewsManager\?: \{ isOpen: boolean; close: \(\) => void \}/);
  assert.match(pdfViewer, /doc\.addEventListener\("pointerdown", dismissViewsHandler, true\)/);
  // Presses inside the panel, or on its own toggle, are not outside clicks.
  assert.match(pdfViewer, /doc\.getElementById\("viewsManager"\)\?\.contains\(target\)/);
  assert.match(pdfViewer, /closest\?\.\("#viewsManagerButton"\)/);
  assert.match(pdfViewer, /manager\.close\(\)/);
  // The listener leaves with the viewer.
  assert.match(pdfViewer, /frameDocument\.removeEventListener\("pointerdown", dismissViewsHandler, true\)/);
});

test("4 — one resolver names every page the footer stays away from", () => {
  // The owner's rule: the EDITOR tabs hide the footer on EDIT mode only.
  assert.match(session, /case "notes":[\s\S]{0,160}?return state\.notesEditMode;/);
  assert.match(session, /case "mindmap":[\s\S]{0,200}?return state\.mindMapEditMode;/);
  // The Sketch tab has no library page, so its READ mode is where the footer
  // lives — only its edit mode hides it.
  assert.match(session, /case "sketch":[\s\S]{0,200}?return state\.sketchEditMode;/);
  assert.match(session, /case "brain":\s*\n?\s*return state\.brainView === "answer";/);
  assert.match(session, /case "experiment":\s*\n?\s*return state\.experimentView === "viewer";/);
  assert.match(session, /case "read":\s*\n?\s*return state\.readView === "reader";/);
  // Music: the LIBRARY page keeps the footer, an OPEN PLAYER (the full-area
  // audio player / the YouTube player with its divider) hides it, and so does
  // the search page — a results page only while it is scrolled away.
  assert.match(session, /case "music":[\s\S]{0,400}?state\.musicView === "player"/);
  assert.match(session, /case "modules":[\s\S]{0,400}?state\.librarySearch === "page"/);
  // Library defaults: leaving the player resets every sub-page.
  assert.match(session, /notesEditMode: false/);
  assert.match(session, /mindMapEditMode: false/);
  assert.match(session, /sketchEditMode: false/);
  assert.match(session, /readView: "library"/);
  assert.match(session, /brainView: "home"/);
  assert.match(session, /experimentView: "library"/);
  assert.match(session, /musicView: "library"/);
  assert.match(session, /librarySearch: "closed"/);
  assert.match(session, /musicSearch: "closed"/);
});

test("5 — every page publishes the fact the rule reads", () => {
  // Note Editor: WRITE mode only (a MASTER note being READ keeps the footer).
  assert.match(notesPanel, /const notesEditMode = editorOpen && !viewingMasterNote && !readView;/);
  assert.match(notesPanel, /setNotesEditMode\(notesEditMode\);/);
  // Mind map: the canvas AND edit mode (a read-only MASTER map is never edit).
  assert.match(read("src/course/MindMapPanel.tsx"), /setMindMapEditMode\(mapOpen && !readOnlyCanvas\);/);
  // Sketch: the panel's one edit flag, the Quick Sketch chip included.
  assert.match(read("src/course/SketchPanel.tsx"), /setSketchEditMode\(editing\);/);
  // Read reader (course PDF viewer, annotations viewer, Drive viewer).
  assert.match(readPanel, /setReadSessionView\(activeId \? "reader" : "library"\)/);
  // Brain answer page = an open set on the question deck.
  assert.match(brainPanel, /setBrainSessionView\(activeSet && mode === "question" \? "answer" : "home"\)/);
  // Live Experiment Viewer = the parent-owned open experiment.
  assert.match(playerApp, /setExperimentSessionView\(studyExperiment \? "viewer" : "library"\)/);
  // Mind Map canvas was already published for session restore; it is
  // asserted here so the footer's source can never silently vanish.
  assert.match(read("src/course/MindMapPanel.tsx"), /setMindMapSessionView\(mapOpen \? "canvas" : "empty"\)/);
  // Both search surfaces publish their page, and their scroll rule publishes
  // the "stepped away" half into the same session.
  const library = read("src/course/CourseResourceLibrary.tsx");
  const music = read("src/course/MusicPanel.tsx");
  assert.match(library, /setSearchSurface\("library", searchSurfaceView\);/);
  assert.match(library, /setSearchScrolledAway\("library", searchScrolledAway\);/);
  assert.match(music, /setSearchSurface\("music", musicSearchView\);/);
  assert.match(music, /setSearchScrolledAway\("music", resultsScrolledAway\);/);
});

test("6 — both footer homes hide, and Settings can overrule them", () => {
  // The parent-rendered Workspace pill unmounts (its keyboard rule's way).
  assert.match(peekDock, /const pageRuleHidesFooter = useFooterHiddenPage\(tab\)/);
  // The Settings hook is called UNCONDITIONALLY (its own statement) — a hook
  // inside the `&&` shifts every later hook's slot when the rule flips and
  // crashes React ("Cannot read properties of undefined (reading 'length')").
  assert.match(peekDock, /const footerNavigationAlways = useFooterNavigationAlways\(\)/);
  assert.match(peekDock, /const immersivePage = pageRuleHidesFooter && !footerNavigationAlways/);
  assert.match(peekDock, /if \(keyboardVisible \|\| immersivePage\) return null/);
  // The Split Deck's in-flow dock hides (not unmounts), like its keyboard
  // rule, so the pane's restore survives.
  assert.match(overlay, /const pageRuleHidesFooter = useFooterHiddenPage\(tab\);/);
  assert.match(overlay, /const footerNavigationAlways = useFooterNavigationAlways\(\);/);
  assert.match(overlay, /const immersivePage = pageRuleHidesFooter && !footerNavigationAlways;/);
  assert.match(overlay, /\$\{keyboardVisible \|\| immersivePage \? "hidden" : ""\}/);
  assert.match(overlay, /data-course-dock/);
  // "Visible footer navigation always" (Settings → Footer navigation) is the
  // one thing that overrules every page above.
  assert.match(read("src/utils/footerNavigationVisibility.ts"), /export function useFooterNavigationAlways\(\): boolean \{/);
});
