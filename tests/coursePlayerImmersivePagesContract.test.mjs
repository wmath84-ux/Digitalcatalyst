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
//   Footer navigation — hidden on the Note Editor, the Mind Map Editor,
//   the Brain Card / Brain Practice answer page, the Live Experiment
//   Viewer, the Sketch Editor, the Read Library's PDF viewer and the
//   Annotations viewer; back on every library page; the Music Player's
//   footer behaviour untouched. The panels publish their sub-page into
//   coursePanelSession; both footer homes (the parent-rendered Workspace
//   pill and the Split Deck's in-flow dock) apply the one resolver.

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

test("4 — one resolver names every immersive page (and never Music)", () => {
  assert.match(session, /case "notes":\s*\n?\s*return state\.notesEditorOpen;/);
  assert.match(session, /case "mindmap":\s*\n?\s*return state\.mindMapView === "canvas";/);
  assert.match(session, /case "brain":\s*\n?\s*return state\.brainView === "answer";/);
  assert.match(session, /case "experiment":\s*\n?\s*return state\.experimentView === "viewer";/);
  // The Sketch tab IS the editor: no library page, always immersive.
  assert.match(session, /case "sketch":[\s\S]{0,140}?return true;/);
  assert.match(session, /case "read":\s*\n?\s*return state\.readView === "reader";/);
  // Music keeps its footer: it is never a hidden case.
  assert.doesNotMatch(session, /case "music"/);
  // Library defaults: leaving the player resets every sub-page.
  assert.match(session, /notesEditorOpen: false/);
  assert.match(session, /readView: "library"/);
  assert.match(session, /brainView: "home"/);
  assert.match(session, /experimentView: "library"/);
});

test("5 — every immersive page publishes its sub-page", () => {
  // Note Editor (compose / edit / MASTER note reading): the panel's own
  // full-panel takeover signal.
  assert.match(notesPanel, /setNotesEditorOpen\(editorOpen\)/);
  // Read reader (course PDF viewer, annotations viewer, Drive viewer).
  assert.match(readPanel, /setReadSessionView\(activeId \? "reader" : "library"\)/);
  // Brain answer page = an open set on the question deck.
  assert.match(brainPanel, /setBrainSessionView\(activeSet && mode === "question" \? "answer" : "home"\)/);
  // Live Experiment Viewer = the parent-owned open experiment.
  assert.match(playerApp, /setExperimentSessionView\(studyExperiment \? "viewer" : "library"\)/);
  // Mind Map canvas was already published for session restore; it is
  // asserted here so the footer's source can never silently vanish.
  assert.match(read("src/course/MindMapPanel.tsx"), /setMindMapSessionView\(libraryOpen \? "library" : "canvas"\)/);
});

test("6 — both footer homes hide, each in its own way", () => {
  // The parent-rendered Workspace pill unmounts (its keyboard rule's way).
  assert.match(peekDock, /const immersivePage = useFooterHiddenPage\(tab\)/);
  assert.match(peekDock, /if \(keyboardVisible \|\| immersivePage\) return null/);
  // The Split Deck's in-flow dock hides (not unmounts), like its keyboard
  // rule, so the pane's restore survives.
  assert.match(overlay, /const immersivePage = useFooterHiddenPage\(tab\);/);
  assert.match(overlay, /\$\{keyboardVisible \|\| immersivePage \? "hidden" : ""\}/);
  assert.match(overlay, /data-course-dock/);
});
