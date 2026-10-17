// tests/workModeMindMapContract.test.mjs
//
// Work Mode's Mind Map Editor is the Course Player's redesigned mind map
// surface (the same MindMapPanel) with Work's shell rules around it:
//
//   1. preview/read mode never unlocks editing from a double-tap — editing is
//      entered from read mode's tray and left with the toolbar's EYE;
//   2. node movement exists only in edit mode;
//   3. the editing toolbar is one CENTRED opaque pill at the bottom of the
//      screen, and read mode's tray is the note page's read navigation;
//   4. its sizing/design matches the Note Editor's pill while the mind
//      map's own icons stay;
//   5. the map library is the ONE side panel — no header button opens it, and
//      there is no second (options) drawer;
//   6. a map renames from the panel's row popup through Work's device-only
//      store;
//   7. the Work footer navigation hides while the canvas is open and
//      returns on the map home.
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
  // Edit mode is entered explicitly only: read mode's tray pencil, or Enter/F2
  // on the canvas.
  assert.match(panel, /data-mindmap-read-edit[\s\S]{0,160}?enterEditMode/);
  assert.match(panel, /\(event\.key === "Enter" \|\| event\.key === "F2"\)\) \{\s+event\.preventDefault\(\);\s+enterEditMode\(\);/);
  // Node taps are inert while the canvas is read-only, and React Flow's own
  // double-click zoom (the other accidental unlock) is off.
  assert.match(panel, /const handleOpenEditor = useCallback\(\(id: string\) => \{\s+if \(readOnlyRef\.current\) return;/);
  assert.match(panel, /if \(dragMovedRef\.current \|\| readOnlyRef\.current\) return;/);
  assert.match(panel, /zoomOnDoubleClick=\{false\}/);
  // Opening a map always lands on the preview first.
  assert.match(panel, /const openMap = useCallback\([\s\S]{0,300}?setMapOpen\(true\);\s+setEditMode\(false\);/);
  // …and the map it opens is FRAMED (fit-zoomed) into the screen.
  assert.match(panel, /fitView\(\{ duration: 320, padding: 0\.2 \}\), 60\);/);
});

test("2 — nodes move only in edit mode", () => {
  assert.match(panel, /const readOnlyCanvas = readOnlyMaster \|\| !editMode;/);
  assert.match(panel, /draggable: !readOnlyCanvas/);
  assert.match(panel, /nodesDraggable=\{!readOnlyCanvas\}/);
  assert.match(panel, /data-mindmap-mode=\{readOnlyCanvas \? "read" : "edit"\}/);
});

test("3+4 — the editing toolbar: one opaque pill at the exact bottom, Note-Editor sizing, mind map icons", () => {
  // Mounted only on the canvas in edit mode.
  assert.match(panel, /\{readOnlyCanvas \? null : \(\s+<div[\s\S]{0,300}?data-course-mindmap-status/);
  const strip = css.slice(css.indexOf("[data-course-mindmap-status] {"), css.indexOf("[data-course-mindmap-status][data-compact"));
  assert.match(strip, /position: absolute;/);
  assert.match(strip, /bottom: calc\(max\(0\.5rem, env\(safe-area-inset-bottom\)\) \+ var\(--dc-note-footer-inset, 0px\)\);/);
  assert.match(strip, /background: var\(--mm-pill-bg\);/, "a solid surface — map content sliding underneath stays hidden");
  assert.doesNotMatch(strip, /backdrop-filter|opacity:\s*0\./, "never glass, never translucent");
  // The Note Editor pill's exact tile geometry.
  assert.match(strip, /--mm-tool-size: 36px;/);
  assert.match(css, /\.mm-tool \{[^}]*width: var\(--mm-tool-size\);[^}]*height: var\(--mm-tool-size\);/);
  // …with the save state surviving as an invisible live region only — the
  // visible syncing/synced button is gone (owner, 2026-10-16+), the save
  // itself keeps running in the background.
  assert.match(panel, /className="sr-only" role="status" aria-live="polite" data-course-mindmap-save/);
  // The eye leads that bar, in the same tile design as every other control.
  assert.match(panel, /className="mm-tool"[\s\S]{0,160}?data-mindmap-edit-read/);
  assert.match(panel, /<Eye size=\{16\} aria-hidden="true" \/>/);
  // …and read mode's tray is the note page's read navigation: the side-panel
  // button, New mind map and the pencil (NO home button any more — owner,
  // 2026-10-17).
  assert.match(panel, /data-mindmap-read-tray/);
  assert.match(panel, /data-mindmap-read-library/);
  assert.match(panel, /data-mindmap-read-new/);
  assert.doesNotMatch(panel, /data-mindmap-read-home/);
  assert.match(panel, /const READ_TAP_SLOP_PX = 10;/, "ONE tap on the canvas hides the tray");
  assert.match(css, /\.mm-read-tray \{[\s\S]{0,500}?bottom: calc\(max\(0\.5rem, env\(safe-area-inset-bottom\)\) \+ var\(--dc-note-footer-inset, 0px\)\);/);
});

test("5+6 — no corner buttons; the ONE panel is the library, and rename lives in its rows", () => {
  assert.doesNotMatch(panel, /data-mindmap-open-left-panel|data-mindmap-open-right-panel|data-mindmap-editor-chrome/);
  assert.doesNotMatch(panel, /CoursePageHeader/, "the mind map is headless like the notes page");
  assert.match(panel, /data-mindmap-left-panel/);
  // The side panel BECAME the full-page main area (owner, 2026-10-17).
  assert.match(panel, /absolute inset-0 z-40 flex flex-col shadow-2xl/);
  assert.match(panel, /data-mindmap-panel-back[\s\S]{0,600}?onClick=\{closePanel\}/);
  const headAt = panel.indexOf("data-mindmap-panel-head");
  const libraryHead = panel.slice(panel.lastIndexOf("<div", headAt), panel.indexOf("data-course-mindmap-map-list"));
  assert.doesNotMatch(libraryHead, /justify-center/, "the filter is expanded, not a tiny centred pill");
  assert.match(libraryHead, /storageOnly \? \([\s\S]{0,200}?My mind maps/);
  assert.match(libraryHead, /data-course-mindmap-collections/);
  assert.match(panel, /leafActionMenu="long-press"/, "a row's actions open on a long press");
  assert.match(panel, /onRename: \(nextTitle\) => onRenameMap\?\.\(entry\.mapKey, nextTitle\)/, "rename saves through the library's own callback");
  assert.match(panel, /data-mindmap-panel-new/, "and the panel's ONE bottom button creates a map");
  assert.doesNotMatch(panel, /data-mindmap-panel-library/);
  // Leaving edit mode flushes the pending save first (rename + edits land
  // in Work's device-only store, never the cloud).
  assert.match(panel, /const handleDone = useCallback\(\(\) => \{[\s\S]{0,200}?onFlush\?\.\(\);/);
});

test("7 — Work footer follows the canvas and restores on the library, without course-session leakage", () => {
  assert.match(panel, /if \(!storageOnly\) setMindMapSessionView\(mapOpen \? "canvas" : "empty"\);/);
  // The canvas is always the page, so the editor area is always open.
  assert.match(panel, /onEditorOpenChange\?\.\(true\);/);
  assert.match(page, /\(page === "mindmap" && mindMapEditorOpen\)/);
  assert.match(page, /onImmersiveChange\?\.\(slotKey, immersive\);/);
  assert.match(app, /\{\(page === "myday" && myDayView === "editor"\) \|\| anyImmersive \? null : \(\s+<WorkFooterNav/);
  assert.doesNotMatch(surface, /coursePanelSession|setMindMapSessionView/);
  assert.doesNotMatch(page, /from "[^"]*coursePanelSession"/);
});
