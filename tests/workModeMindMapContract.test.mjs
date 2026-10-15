// tests/workModeMindMapContract.test.mjs
//
// Work Mode's Mind Map Editor is the Course Player's updated mind map
// surface (the same MindMapPanel) with Work's shell rules around it:
//
//   1. preview/read mode never unlocks editing from a double-tap;
//   2. node movement exists only in edit mode;
//   3. the editing toolbar is one opaque pill at the bottom of the screen;
//   4. its sizing/design matches the Note Editor's pill while the mind
//      map's own icons stay;
//   5. top-left / top-right side-panel buttons are the canvas's top chrome;
//   6. a map renames from the side panel through Work's device-only store;
//   7. the Work footer navigation hides while the canvas is open and
//      returns on the map library.
//
// Behaviour is driven for real in workModeMindMapRuntime; the toolbar
// geometry lives in CSS and is pinned here and in
// courseMindMapReferenceChromeContract.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const app = source("src/work/WorkApp.tsx");
const page = source("src/work/pages/WorkPageSurface.tsx");
const surface = source("src/work/pages/WorkMindMapSurface.tsx");
const panel = source("src/course/MindMapPanel.tsx");
const css = source("src/index.css");

test("Work mounts the shared MindMapPanel device-only, with rename and editor signals wired", () => {
  assert.match(surface, /useCourseMindMap\(\{[\s\S]*?storageOnly: true/);
  assert.match(surface, /masterMaps=\{\[\]\}[\s\S]*?storageOnly[\s\S]*?themeOverride=\{theme\}[\s\S]*?onEditorOpenChange=\{onEditorOpenChange\}/);
  assert.match(surface, /onRenameMap=\{maps\.renameMap\}/);
  assert.match(page, /<WorkMindMapSurface theme=\{theme\} orientation=\{orientation\} onEditorOpenChange=\{setMindMapEditorOpen\} \/>/);
  // No Work fork of the canvas, toolbar or node rendering.
  assert.doesNotMatch(page, /ReactFlow|data-course-mindmap-status|data-mind-node/);
  assert.doesNotMatch(surface, /ReactFlow|data-course-mindmap-status/);
});

test("1 — preview never unlocks editing: no double-tap path into edit mode", () => {
  // Edit mode is entered explicitly only: the Map options "Edit map" button
  // or Enter/F2 on the canvas.
  assert.match(panel, /data-course-mindmap-edit[\s\S]{0,160}?enterEditMode\(\)/);
  assert.match(panel, /\(event\.key === "Enter" \|\| event\.key === "F2"\)\) \{\s+event\.preventDefault\(\);\s+enterEditMode\(\);/);
  // Node taps are inert while the canvas is read-only, and React Flow's own
  // double-click zoom (the other accidental unlock) is off.
  assert.match(panel, /const handleOpenEditor = useCallback\(\(id: string\) => \{\s+if \(readOnlyRef\.current\) return;/);
  assert.match(panel, /if \(dragMovedRef\.current \|\| readOnlyRef\.current\) return;/);
  assert.match(panel, /zoomOnDoubleClick=\{false\}/);
  // Opening a map always lands on the preview first.
  assert.match(panel, /const openMap = useCallback\([\s\S]{0,300}?setLibraryOpen\(false\);\s+setEditMode\(false\);/);
});

test("2 — nodes move only in edit mode", () => {
  assert.match(panel, /const readOnlyCanvas = readOnlyMaster \|\| !editMode;/);
  assert.match(panel, /draggable: !readOnlyCanvas/);
  assert.match(panel, /nodesDraggable=\{!readOnlyCanvas\}/);
  assert.match(panel, /data-mindmap-mode=\{readOnlyCanvas \? "read" : "edit"\}/);
});

test("3+4 — the editing toolbar: one opaque pill at the exact bottom, Note-Editor sizing, mind map icons", () => {
  // Mounted only on the canvas in edit mode.
  assert.match(panel, /\{libraryOpen \|\| readOnlyCanvas \? null : \(\s+<div[\s\S]{0,300}?data-course-mindmap-status/);
  const strip = css.slice(css.indexOf("[data-course-mindmap-status] {"), css.indexOf("[data-course-mindmap-status][data-compact"));
  assert.match(strip, /position: absolute;/);
  assert.match(strip, /bottom: calc\(max\(0\.5rem, env\(safe-area-inset-bottom\)\) \+ var\(--dc-note-footer-inset, 0px\)\);/);
  assert.match(strip, /background: var\(--mm-pill-bg\);/, "a solid surface — map content sliding underneath stays hidden");
  assert.doesNotMatch(strip, /backdrop-filter|opacity:\s*0\./, "never glass, never translucent");
  // The Note Editor pill's exact tile geometry.
  assert.match(strip, /--mm-tool-size: 36px;/);
  assert.match(css, /\.mm-tool \{[^}]*width: var\(--mm-tool-size\);[^}]*height: var\(--mm-tool-size\);/);
  // …with the mind map's own glyphs preserved (save state, arrange, fit…).
  assert.match(panel, /data-course-mindmap-save/);
  assert.match(panel, /data-course-mindmap-done/);
  assert.match(panel, /storageOnly\s*\? <HardDrive \/>/);
});

test("5+6 — corner side-panel buttons; rename lives in the right panel", () => {
  assert.match(panel, /data-mindmap-open-left-panel[\s\S]{0,200}?setSidePanel\("left"\)/);
  assert.match(panel, /data-mindmap-open-right-panel[\s\S]{0,200}?setSidePanel\("right"\)/);
  assert.match(panel, /\{!libraryOpen \? \(\s+<div className="flex h-11 shrink-0 items-center justify-between px-2" data-mindmap-editor-chrome>/);
  assert.match(panel, /data-mindmap-rename-input/);
  assert.match(panel, /data-mindmap-rename-save/);
  const rightPanel = panel.slice(panel.indexOf("data-mindmap-right-panel"), panel.indexOf("data-mindmap-right-panel") + 7000);
  assert.match(rightPanel, /onRenameMap\?\.\(activeMapKey, next\)/, "rename saves the open map through the panel's callback");
  // Leaving edit mode flushes the pending save first (rename + edits land
  // in Work's device-only store, never the cloud).
  assert.match(panel, /const handleDone = useCallback\(\(\) => \{[\s\S]{0,200}?onFlush\?\.\(\);/);
});

test("7 — Work footer follows the canvas and restores on the library, without course-session leakage", () => {
  assert.match(panel, /if \(!storageOnly\) setMindMapSessionView\(libraryOpen \? "library" : "canvas"\);/);
  assert.match(panel, /onEditorOpenChange\?\.\(!libraryOpen\);/);
  assert.match(page, /\(page === "mindmap" && mindMapEditorOpen\)/);
  assert.match(page, /onImmersiveChange\?\.\(slotKey, immersive\);/);
  assert.match(app, /\{\(page === "myday" && myDayView === "editor"\) \|\| anyImmersive \? null : \(\s+<WorkFooterNav/);
  assert.doesNotMatch(surface, /coursePanelSession|setMindMapSessionView/);
  assert.doesNotMatch(page, /from "[^"]*coursePanelSession"/);
});
