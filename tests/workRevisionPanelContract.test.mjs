// tests/workRevisionPanelContract.test.mjs
//
// Source contract for the Work Revision headless page + test panel.
//
// Owner brief (2026-10, superseding the viewer-only headless rule for
// Revision): the Work Revision page is headless as a page — the outer Work
// header never sits over it — and the deck (FSRS) card viewer and the Brain
// card answer viewer carry a top-left button that opens a simple side
// panel listing every already-created test, so a test can be opened
// directly and tests can be switched mid-study. The Revision page itself
// is NOT squeezed into the panel: it still opens from the library as a
// page; the panel is the extra quick entry, an overlay that never unmounts
// the screen underneath (a half-answered card included).
//
// Runtime behaviour: tests/workRevisionPanelRuntime.test.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const app = read("src/work/WorkRevisionApp.tsx");
const panel = read("src/work/WorkRevisionTestPanel.tsx");
const surface = read("src/work/pages/WorkPageSurface.tsx");
const brainPanel = read("src/course/CourseBrainPanel.tsx");
const css = read("src/work/work-revision.css");

test("the Revision page is headless as a page in Work", () => {
  assert.match(surface, /page === "revision" \|\|/, "the surface treats the Revision page itself as immersive");
  assert.match(surface, /<WorkRevisionApp notes=\{notes\.notes\} onExit=\{onExit\} \/>/, "the surface mounts the app with its way home");
  assert.doesNotMatch(app, /onImmersiveChange|revisionImmersive/, "the app no longer reports viewer boundaries to the shell");
  assert.match(app, /<WorkRevisionTopline onOpenPanel=\{openTestPanel\} title="Revision" subtitle="Private · this device" \/>/, "the headless dashboard carries its own header with the panel button");
});

test("the test panel lists pages and every test, and is a pure overlay", () => {
  assert.match(panel, /data-work-revision-panel=""/, "panel root marker");
  assert.match(panel, /data-work-revision-panel-backdrop=""/, "backdrop closes it");
  assert.match(panel, /data-work-revision-panel-aside=""/, "the drawer itself");
  assert.match(panel, /data-work-revision-panel-close=""/, "an explicit close button");
  assert.match(panel, /data-work-revision-panel-nav="dashboard"/, "Revision home entry");
  assert.match(panel, /data-work-revision-panel-nav="library"/, "Library entry");
  assert.match(panel, /data-work-revision-panel-test=\{row\.id\}/, "one row per test");
  assert.match(panel, /data-work-revision-panel-test-active=\{row\.active \? "true" : undefined\}/, "the current test is marked");
  assert.match(panel, /data-work-revision-panel-exit=""/, "Leave Work — the headless page is never a trap");
  assert.match(panel, /if \(!open\) return null;/, "closed panel renders nothing");
  assert.match(panel, /className="absolute inset-0 z-40"/, "it overlays its own view root, not the whole app");
  assert.match(css, /\.work-revision-panel-aside \{\s*animation: work-revision-panel-in 160ms ease-out;/, "the drawer slides in (and respects reduced motion)");
});

test("panel choices drive the existing views — a test opens straight away", () => {
  assert.match(app, /import WorkRevisionTestPanel from "\.\/WorkRevisionTestPanel";/, "the app renders the panel");
  assert.match(app, /const openTestFromPanel = \(id: string\) => \{\s*const deck = decks\.find\(\(row\) => row\.id === id\);\s*setPanelOpen\(false\);\s*if \(deck\) goToStudyStyle\(deck\);/, "a test tap closes the panel and opens that test's study-style page");
  assert.match(app, /onGoDashboard=\{\(\) => \{ setPanelOpen\(false\); setView\("dashboard"\); \}\}/, "home entry");
  assert.match(app, /onGoLibrary=\{\(\) => \{ setPanelOpen\(false\); setView\("library"\); \}\}/, "library entry");
  assert.match(app, /onExit=\{onExit\}/, "Leave Work is threaded through");
  assert.equal(app.match(/onOpenPanel=\{openTestPanel\}/g).length, 11, "every Revision chrome carries the panel button (dashboard + all toplines + the FSRS viewer)");
  assert.equal(app.match(/\{panelNode\}/g).length, 11, "the panel overlays every Revision view root");
});

test("the top-left panel button is on the deck card viewer and the Brain answer viewer", () => {
  assert.match(app, /function WorkRevisionPanelButton\(\{ onClick \}/, "one shared panel button");
  assert.match(app, /data-work-revision-panel-button=""/, "its marker");
  assert.match(app, /onOpenPanel \? <WorkRevisionPanelButton onClick=\{onOpenPanel\} \/> : null/, "the FSRS card renders it in its header row");
  assert.match(app, /<WorkFlashcardReview[\s\S]*?onOpenPanel=\{openTestPanel\}/, "the app passes it to the FSRS viewer");
  assert.match(app, /headerLeadingAction=\{<WorkRevisionPanelButton onClick=\{openTestPanel\} \/>\}/, "the app passes it into the Brain answer header");
  assert.match(brainPanel, /headerLeadingAction\?: ReactNode;/, "the Course panel exposes the optional host slot");
  const headerAt = brainPanel.indexOf('className="brain-practice-header"');
  const slotAt = brainPanel.indexOf("{headerLeadingAction}", headerAt);
  const backAt = brainPanel.indexOf('data-brain-back=""', headerAt);
  assert.ok(slotAt > headerAt && backAt > slotAt, "the slot renders before the back button — the panel button is the first top-left control");
  assert.match(brainPanel, /headerLeadingAction,\s*\}: CourseBrainPanelProps/, "the slot is destructured with the other optional props");
});

test("existing Revision behaviour is preserved", () => {
  assert.match(app, /data-work-revision-headless=\{brainAnswering \? "true" : undefined\}/, "the Brain answer viewer keeps its headless marker");
  assert.match(app, /\{brainAnswering \? null : \(\s*<WorkRevisionTopline onOpenPanel=\{openTestPanel\}/, "the topline still yields to the answer deck");
  assert.match(app, /data-work-revision-mode="fsrs" data-work-revision-headless="true"/, "the FSRS viewer stays headless");
  assert.match(app, /data-work-revision-viewer-back=""/, "the FSRS viewer's in-card back stays");
  assert.match(app, /onAnsweringChange=\{setBrainAnswering\}/, "answering state still comes from the shared Brain panel");
  assert.match(app, /const goToStudyStyle = \(deck: UnifiedDeck\)/, "the library's study entry path is unchanged");
  assert.match(app, /createWorkRevisionDeck|recordWorkRevisionRating/, "the device-only write paths are unchanged");
});
