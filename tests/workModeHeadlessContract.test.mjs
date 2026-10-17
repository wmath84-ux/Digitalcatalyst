// tests/workModeHeadlessContract.test.mjs
//
// Work Mode stays a separate design space: it reuses the Course Player's
// updated editor/viewer surfaces and SplitDeck behaviour, but Work pages,
// Work storage and Work shell state are never merged into Course Player.
// Editor/viewer states are headless (no outer Work header), the shared Work
// footer hides while any split slot is immersive, and both return as soon
// as the learner is back on a library/page state.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const app = source("src/work/WorkApp.tsx");
const deck = source("src/work/WorkDeck.tsx");
const page = source("src/work/pages/WorkPageSurface.tsx");
const mindMapSurface = source("src/work/pages/WorkMindMapSurface.tsx");
const revision = source("src/work/WorkRevisionApp.tsx");
const notesPanel = source("src/course/NotesPanel.tsx");
const mindMapPanel = source("src/course/MindMapPanel.tsx");
const brainPanel = source("src/course/CourseBrainPanel.tsx");

test("Work shell aggregates per-slot immersive state and hides only the Work footer", () => {
  assert.match(app, /const \[immersiveSlots, setImmersiveSlots\] = useState<Record<string, boolean>>\(\{\}\);/);
  assert.match(app, /const reportImmersive = useCallback\(\(slotKey: string, immersive: boolean\) => \{/);
  assert.match(app, /const anyImmersive = Object\.values\(immersiveSlots\)\.some\(Boolean\);/);
  assert.match(app, /onImmersiveChange=\{reportImmersive\}/);
  assert.match(app, /data-work-immersive=\{anyImmersive \? "true" : "false"\}/);
  assert.match(app, /\{\(page === "myday" && myDayView === "editor"\) \|\| anyImmersive \? null : \(\s+<WorkFooterNav/);
  // Work chrome state is Work-local: it is never published to Course state.
  assert.doesNotMatch(app, /coursePanelSession|setNotesSessionView|setMindMapSessionView|setBrainSessionView/);
  assert.doesNotMatch(page, /coursePanelSession|setNotesSessionView|setMindMapSessionView|setBrainSessionView/);
});

test("Work page surface drops its outer header for headless states (the Revision page is headless as a page)", () => {
  assert.match(page, /const immersive =\s+page === "sketch" \|\|\s+page === "revision" \|\|\s+\(page === "notes" && notesEditorOpen\) \|\|\s+\(page === "mindmap" && mindMapEditorOpen\);/);
  assert.match(page, /data-work-immersive=\{immersive \? "true" : "false"\}/);
  assert.match(page, /data-work-headless=\{immersive \? "true" : undefined\}/);
  assert.match(page, /\{showHeader \? \(\s+<header[\s\S]*?data-work-header-area=\{page\}/);
  assert.match(page, /const showHeader = !headless && !immersive && page !== "ai";/, "only the AI page drops the header without going immersive (footer stays)");
  // The Work header (Work exit + theme) still exists for library/page states.
  assert.match(page, /data-work-exit=""/);
  assert.match(page, /data-work-theme-toggle=""/);
  // Editor boundaries are reported by the reused surfaces themselves.
  assert.match(page, /onEditorOpenChange=\{setNotesEditorOpen\}/);
  assert.match(page, /<WorkMindMapSurface theme=\{theme\} orientation=\{orientation\} onEditorOpenChange=\{setMindMapEditorOpen\} \/>/);
  assert.match(page, /<WorkRevisionApp notes=\{notes\.notes\} onExit=\{onExit\} \/>/);
  assert.doesNotMatch(page, /handleRevisionImmersiveChange|revisionImmersive/, "the Revision page no longer reports viewer boundaries — it is headless as a page");
  // Split slots report and clear their own state, so an extra/primary pane
  // cannot leave the shared footer hidden after it closes or changes page.
  assert.match(page, /onImmersiveChange\?\.\(slotKey, immersive\);/);
  assert.match(page, /onImmersiveChange\?\.\(slotKey, false\);/);
});

test("reused Course panels expose parent chrome signals without leaking Work into the course session", () => {
  assert.match(notesPanel, /useEffect\(\(\) => \{ onEditorOpenChange\?\.\(editorOpen\); \}\);/);
  assert.match(mindMapSurface, /onEditorOpenChange=\{onEditorOpenChange\}/);
  assert.match(mindMapPanel, /if \(!storageOnly\) setMindMapSessionView\(mapOpen \? "canvas" : "empty"\);/);
  assert.match(mindMapPanel, /onEditorOpenChange\?\.\(true\);/);
  assert.match(brainPanel, /if \(!workMode\) setBrainSessionView\(activeSet && mode === "question" \? "answer" : "home"\);/);
  assert.match(brainPanel, /onAnsweringChange\?\.\(Boolean\(activeSet && mode === "question"\)\);/);
});

test("the Revision page is headless in Work; its viewers keep their internal chrome", () => {
  // The page no longer reports viewer boundaries to the shell: the surface
  // treats the Revision page itself as immersive (see the surface test
  // above), and the app owns only its internal chrome from here.
  assert.doesNotMatch(revision, /onImmersiveChange|revisionImmersive/);
  // Brain answer viewer: the viewer's own practice header is the only
  // chrome; the Work Revision topline returns for library/review/result.
  assert.match(revision, /data-work-revision-headless=\{brainAnswering \? "true" : undefined\}/);
  assert.match(revision, /\{brainAnswering \? null : \(\s+<WorkRevisionTopline/);
  assert.match(revision, /onAnsweringChange=\{setBrainAnswering\}/);
  // FSRS Revision deck viewer: no subheader band, with the way back kept
  // inside the card surface itself.
  assert.match(revision, /data-work-revision-mode="fsrs" data-work-revision-headless="true"/);
  assert.match(revision, /data-work-revision-viewer-back=""/);
  assert.match(revision, /onBack=\{\(\) => setView\("study-style"\)\}/);
});

test("Work keeps the Course Player split and page-opening behaviour without merging pages", () => {
  assert.match(deck, /restRatio=\{100\}/);
  assert.match(deck, /fullRange/);
  assert.match(deck, /railAtEdge=\{false\}/);
  assert.match(deck, /grabInset=\{26\}/);
  assert.match(deck, /onSplitStart=\{showPreviousPage\}/);
  assert.match(deck, /renderExtraPane=\{renderExtraPane\}/);
  assert.match(app, /<WorkDeck page=\{page\} axis=\{orientation\} renderPage=\{renderPage\} \/>/);
  // Work surfaces stay Work-owned: no Course page chrome is imported into
  // the Work page wrapper.
  assert.doesNotMatch(page, /from "\.\.\/\.\.\/course\/CoursePageHeader"/);
});
