// tests/workModeSketchContract.test.mjs
//
// Work Mode's Sketch Editor is the Course Player's updated Full Editor
// (the same SketchPanel) with Work's shell rules around it:
//
//   1. the Full Editor's clean header;
//   2. the horizontal sketch tray directly under the header;
//   3. New canvas in the header, behaving like a normal editor's create;
//   4. the header's side-panel button (pages & options);
//   5. the side panel hides on any outside click;
//   6. the Work footer navigation (and Work header) stay hidden on the
//      sketch page, which is an editor from the first frame.
//
// Behaviour is driven for real in workModeSketchRuntime; the panel's own
// chrome contract lives in courseSketchFullEditorChromeContract.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const app = source("src/work/WorkApp.tsx");
const page = source("src/work/pages/WorkPageSurface.tsx");
const surface = source("src/work/pages/WorkSketchSurface.tsx");
const panel = source("src/course/SketchPanel.tsx");
const workSketch = source("src/work/storage/useWorkSketch.ts");
const sketchDb = source("src/work/storage/workSketchDb.ts");

test("Work mounts the shared SketchPanel on its Dexie device store — no Work fork", () => {
  assert.match(surface, /<SketchPanel[\s\S]*?storageOnly\s+libraryDeviceStore=\{workSketchLibraryStore\}/);
  assert.match(surface, /boards=\{sketch\.boards\}[\s\S]*?onSelectBoard=\{sketch\.onSelectBoard\}[\s\S]*?onCreateBoard=\{sketch\.onCreateBoard\}/);
  assert.match(sketchDb, /extends Dexie/);
  assert.doesNotMatch(workSketch, /firebase\/firestore|setDoc\(|getDoc\(|deleteDoc\(/);
  assert.doesNotMatch(page, /Excalidraw|data-course-sketch-status|SketchPagesTray/);
  // The Work surface is the editor from the first frame (no library gate):
  // the sketch slot is always immersive, so Work chrome never flashes.
  assert.match(page, /page === "sketch" \|\|/);
});

test("1+3+4 — headless: the panel button, create and the switches live in the tray and the panel", () => {
  // No header, so nothing "rides in" one: the tray carries the panel toggle
  // (read mode's and the editor's) and the mode switch, and the panel body
  // carries the canvases plus the create button at its foot.
  assert.doesNotMatch(panel, /<SketchStatus\b/);
  assert.match(panel, /data-course-sketch-panel-toggle/);
  assert.match(panel, /data-course-sketch-read-panel/);
  assert.match(panel, /data-course-sketch-edit-panel/);
  assert.match(panel, /aria-expanded=\{sidePanelOpen\}/);
  assert.match(panel, /data-course-sketch-panel-new/);
  assert.match(panel, /onClick=\{\(\) => onCreateBoard\?\.\(\)\}/);
  assert.match(panel, /data-course-sketch-mode=\{mode\}/);
  // The canvases are the panel's own list — never a dropdown in chrome.
  assert.match(panel, /<SketchCanvasList/);
  assert.doesNotMatch(panel, /SketchBoards/);
  assert.doesNotMatch(panel, /data-course-sketch-boards/);
});

test("2 — the tray under the header is gone; the panel's rows are the canvases, and create is guarded", () => {
  // The pages tray that used to sit under the header is gone, and so is the
  // string it was built from.
  assert.doesNotMatch(panel, /SketchPagesTray/);
  assert.doesNotMatch(panel, /data-course-sketch-pages-tray/);
  assert.doesNotMatch(panel, /data-course-sketch-page=\{/);
  // The canvases are the panel's BranchedMenu rows, one per canvas, and the
  // panel's foot is the one create button.
  assert.match(panel, /data-course-sketch-canvas-row/);
  assert.match(panel, /data-course-sketch-board-option/);
  assert.match(panel, /if \(key && key !== activeBoardKey\) onSelectBoard\?\.\(key\);/);
  assert.match(panel, /data-course-sketch-panel-new/);
  assert.match(workSketch, /CREATE_GUARD_MS/);
  assert.match(workSketch, /createSketchScene\(\)/);
});

test("5 — the side panel hides on any outside click (and Escape)", () => {
  assert.match(panel, /data-course-sketch-side-panel/);
  assert.match(panel, /document\.addEventListener\("mousedown", onDocumentClick\);/);
  // Inside clicks (and a click on the tray toggle that opened it) never close
  // it; everything else does.
  assert.match(panel, /if \(sidePanelRef\.current\?\.contains\(target\)\) return;/);
  assert.match(panel, /\?\.closest\?\.\("\[data-course-sketch-panel-toggle\]"\)\) return;\s+setSidePanelOpen\(false\);/);
  assert.match(panel, /event\.key === "Escape"\) \{ setSidePanelOpen\(false\); setPendingDeleteKey\(null\); \}/);
  // A different canvas never inherits an open panel.
  assert.match(panel, /useEffect\(\(\) => \{ setSidePanelOpen\(false\); \}, \[sceneKey, activeBoardKey\]\);/);
});

test("6 — sketch keeps Work's footer (and header) hidden; drawing saves stay on this device", () => {
  assert.match(app, /\{\(page === "myday" && myDayView === "editor"\) \|\| anyImmersive \? null : \(\s+<WorkFooterNav/);
  assert.match(page, /\{showHeader \? \(\s+<header[\s\S]*?data-work-header-area=\{page\}/);
  // The save line's device-only wording is what Work shows (no cloud copy).
  assert.match(panel, /if \(status === "saved"\) return \{ label: "Saved on this device", tone: "ok" \};/);
  assert.match(workSketch, /writeWorkSketchScene/);
  assert.match(workSketch, /SAVE_DEBOUNCE_MS = 500/);
});
