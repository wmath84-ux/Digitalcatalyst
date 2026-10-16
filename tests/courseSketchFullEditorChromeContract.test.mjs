// tests/courseSketchFullEditorChromeContract.test.mjs
//
// Pins the redesigned Full Sketch (Excalidraw) Editor's chrome (owner brief):
//
//   1. the page is HEADLESS — no header at all, and no pages tray under one;
//   2. every option a header used to hold now lives in the panel body, and the
//      panel's ONE bottom button creates a canvas;
//   3. the panel is opened from the bottom tray's own button (read mode's, the
//      notes page's door) and hides on any outside click;
//   4. the canvas list is the notes library's list: one ellipsised row per
//      canvas, NO row buttons, and the row's long-press menu renames in place
//      and deletes through the confirmation dialog.
//
// The drawing behaviour, the Clean Look sidebar, the save line and the
// Excalidraw wiring stay as they were — pinned by the older sketch suites.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../src/course/SketchPanel.tsx", import.meta.url), "utf8");

test("1 — the page is headless: no header, and no pages tray under one", () => {
  // The old header (and its SketchStatus bar) is gone; the only status UI left
  // is the quiet chip.
  assert.doesNotMatch(panel, /<SketchStatus\b/);
  assert.doesNotMatch(panel, /data-course-sketch-status-bar/);
  assert.match(panel, /<SketchStatusChip/);
  // …and so is the horizontal pages tray that used to sit directly under it.
  assert.doesNotMatch(panel, /SketchPagesTray/);
  assert.doesNotMatch(panel, /data-course-sketch-pages-tray/);
  assert.doesNotMatch(panel, /data-course-sketch-page=\{/);
  // The chip is the page's ONLY top chrome, and it holds no button.
  const chip = panel.slice(panel.indexOf("function SketchStatusChip"), panel.indexOf("export interface SketchPanelProps"));
  assert.doesNotMatch(chip, /<button/);
});

test("2 — the header's options live in the panel body; its one bottom button creates", () => {
  const sidebar = panel.slice(panel.indexOf("const sketchSidebarContent = ("), panel.indexOf("return (", panel.indexOf("const sketchSidebarContent = (")));
  // The canvas list, the mode switch, the library read-out, the colour
  // cluster, the save state and its Retry — all in one place, rendered by the
  // panel AND by the Clean Look's docked sidebar (one implementation).
  assert.match(sidebar, /<SketchCanvasList/);
  assert.match(sidebar, /data-course-sketch-panel-options/);
  assert.match(sidebar, /\{modeToggle\}/);
  assert.match(sidebar, /<SketchLibraryPill/);
  assert.match(sidebar, /<SketchColourCluster/);
  assert.match(sidebar, /<SketchStatusChip/);
  assert.match(sidebar, /data-course-sketch-retry/);
  assert.match(panel, /<Sidebar docked name="course-sketch-clean">\s*\{sketchSidebarContent\}\s*<\/Sidebar>/);
  // The panel's foot holds exactly ONE button: a new canvas.
  const foot = panel.slice(panel.indexOf("data-course-sketch-panel-foot"), panel.indexOf("</aside>"));
  assert.match(foot, /data-course-sketch-panel-new/);
  assert.match(foot, /onClick=\{\(\) => onCreateBoard\?\.\(\)\}/);
  assert.match(foot, /disabled=\{!canCreateBoard\}/);
  assert.match(foot, /New sketch/);
  assert.equal((foot.match(/<button/g) || []).length, 1, "one create button, nothing else");
  // A standalone "New canvas" never comes back to a header that no longer exists.
  assert.doesNotMatch(panel, /data-course-sketch-new-canvas/);
});

test("3 — the panel opens from the bottom tray and hides on outside click", () => {
  // ONE toggle element, used by both trays; nothing else opens the panel.
  assert.match(panel, /const panelButton = \(hook: string\) => \(/);
  assert.match(panel, /data-course-sketch-panel-toggle/);
  assert.match(panel, /aria-expanded=\{sidePanelOpen\}/);
  assert.match(panel, /\{\.\.\.\{ \[hook\]: "" \}\}/);
  assert.match(panel, /data-course-sketch-read-panel/);
  assert.match(panel, /data-course-sketch-edit-panel/);
  assert.doesNotMatch(panel, /data-course-sketch-side-panel-toggle/);
  assert.doesNotMatch(panel, /leading=\{sidePanelToggle\}/);
  // The panel itself: a thin visible strip of page on its right edge.
  assert.match(panel, /const \[sidePanelOpen, setSidePanelOpen\] = useState\(false\);/);
  assert.match(panel, /data-course-sketch-side-panel/);
  assert.match(panel, /w-\[calc\(100%-2\.5rem\)\]/);
  assert.match(panel, /data-course-sketch-panel-scrim/);
  assert.match(panel, /data-course-sketch-panel-head/);
  assert.match(panel, /data-course-sketch-panel-title>Sketch canvases</);
  // Outside click (and Escape) hides it; clicks inside it — or on its own
  // toggle — do not.
  assert.match(panel, /if \(sidePanelRef\.current\?\.contains\(target\)\) return;/);
  assert.match(panel, /closest\?\.\("\[data-course-sketch-panel-toggle\]"\)\) return;/);
  assert.match(panel, /document\.addEventListener\("mousedown", onDocumentClick\);/);
  assert.match(panel, /event\.key === "Escape"\) \{ setSidePanelOpen\(false\); setPendingDeleteKey\(null\); \}/);
  // And choosing a different canvas (or editor) never leaves it hanging open.
  assert.match(panel, /useEffect\(\(\) => \{ setSidePanelOpen\(false\); \}, \[sceneKey, activeBoardKey\]\);/);
});

test("4 — the canvas list is the notes library's list, long-press and all", () => {
  const list = panel.slice(panel.indexOf("function SketchCanvasList"), panel.indexOf("function SketchColourCluster"));
  // BranchedMenu's own long-press rows, full width, one ellipsised line each.
  assert.match(list, /<BranchedMenu/);
  assert.match(list, /leafActionMenu="long-press"/);
  assert.match(list, /fullWidth/);
  assert.match(list, /rowHeight=\{44\}/);
  assert.match(list, /onRename: onRenameBoard \? \(nextLabel: string\) => onRenameBoard\(board\.sketchKey, nextLabel\) : undefined/);
  assert.match(list, /onDelete:\s*canDelete && board\.sketchKey !== SKETCH_DEFAULT_KEY/);
  assert.match(list, /"data-course-sketch-canvas-row": board\.sketchKey/);
  // No row buttons at all: rename and delete are the row's long-press menu.
  assert.doesNotMatch(list, /<button/);
  assert.doesNotMatch(list, /data-course-sketch-delete-active/);
  assert.doesNotMatch(list, /data-course-sketch-board-switch/);
  // The guaranteed first canvas can never be deleted.
  assert.match(list, /SKETCH_DEFAULT_KEY/);
  // Deleting still goes through the two-step confirmation that names it.
  assert.match(panel, /<ConfirmDeleteDialog/);
  assert.match(panel, /open=\{Boolean\(pendingDeleteKey\)\}/);
  assert.match(panel, /if \(onDeleteBoard\) onDeleteBoard\(key\);/);
  assert.match(panel, /onRenameBoard/);
  // Editor wiring unchanged.
  assert.match(panel, /<Excalidraw\s+key=\{sceneKey\}/);
  assert.match(panel, /viewModeEnabled=\{!editing\}/);
  assert.match(panel, /data-course-sketch-mode=\{mode\}/);
  assert.match(panel, /data-course-sketch-colour-cluster/);
  assert.match(panel, /data-course-sketch-edit-colour/);
});
