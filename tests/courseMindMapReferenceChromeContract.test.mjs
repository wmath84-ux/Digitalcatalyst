// tests/courseMindMapReferenceChromeContract.test.mjs
//
// Pins the mind map editor's chrome changes (owner brief):
//
//   1. preview/read mode: a double-tap / double-click NEVER opens editing;
//   2. preview/read mode: nodes cannot be dragged — movement is edit-only;
//   3. zoomed/panned content under the toolbar never shows through it;
//   4. the toolbar sits at the very bottom of the screen;
//   5+6. the toolbar wears the NOTE EDITOR's toolbar design (one floating
//      pill, 36px round buttons) while keeping the mind map's own icons;
//   7. top-left / top-right corner buttons open the side panels;
//   8. a map can be renamed from the side panel (and the name persists
//      through the same onRenameMap the library has always used).
//
// Save / sync / drag-commit behaviour stays pinned by the older suites
// (coursePlayerMindMapContract, courseMindMapCloudSyncRuntime, …).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const panel = read("src/course/MindMapPanel.tsx");
const styles = read("src/index.css");
const noteCss = read("src/course/noteEditor/noteEditor.css");

test("1 — no double-tap/double-click unlock: editing is entered explicitly", () => {
  assert.doesNotMatch(panel, /useDoubleTapToEdit/, "the double-tap-to-edit gesture is gone from the mind map");
  assert.doesNotMatch(panel, /editGesture/);
  // The explicit entries: the Map options panel's Edit button, and Enter/F2
  // on the focused canvas (keyboard intent, not a stray second tap).
  assert.match(panel, /const enterEditMode = useCallback/);
  assert.match(panel, /data-course-mindmap-edit[\s\S]{0,160}?enterEditMode\(\)/);
  assert.match(panel, /!editMode && \(event\.key === "Enter" \|\| event\.key === "F2"\)/);
  // The canvas no longer advertises a double-tap unlock.
  assert.doesNotMatch(panel, /Double tap or press Enter to edit/);
});

test("2 — nodes are draggable only in edit mode", () => {
  // Per-node `draggable: true` would override the canvas-wide gate, so the
  // flag follows the mode: read/preview → locked, edit → hand placement.
  assert.match(panel, /draggable: !readOnlyCanvas/);
  assert.doesNotMatch(panel, /draggable: true,/);
  assert.match(panel, /nodesDraggable=\{!readOnlyCanvas\}/);
  // The drop still commits through the model in edit mode.
  assert.match(panel, /moveNodeSubtree\(current, node\.id, node\.position\.x, node\.position\.y, session\.origin\.x, session\.origin\.y\)/);
  // And a preview tap still cannot select/open a node editor.
  assert.match(panel, /if \(dragMovedRef\.current \|\| readOnlyRef\.current\) return;/);
});

test("3+4 — the toolbar is an opaque pill at the very bottom", () => {
  assert.match(styles, /\[data-course-mindmap-status\] \{[^}]*position: absolute;[^}]*left: 0\.5rem;/);
  assert.match(styles, /\[data-course-mindmap-status\] \{[^}]*bottom: calc\(max\(0\.5rem, env\(safe-area-inset-bottom\)\) \+ var\(--dc-note-footer-inset, 0px\)\);/);
  assert.match(styles, /\[data-course-mindmap-status\] \{[^}]*background: var\(--mm-pill-bg\);/);
  // Solid surfaces in both palettes — never the glass tokens.
  assert.match(styles, /\.course-mindmap-shell \{[^}]*--mm-pill-bg: #0d1424;/);
  assert.match(styles, /\.course-mindmap-shell\[data-mindmap-theme="light"\] \{[^}]*--mm-pill-bg: #ffffff;/);
  const statusBlock = styles.slice(styles.indexOf("[data-course-mindmap-status] {"), styles.indexOf("[data-course-mindmap-status][data-compact"));
  assert.doesNotMatch(statusBlock, /backdrop-filter|chrome-glass/, "nothing translucent about the pill");
  // The measured footer lift is published on the strip itself.
  assert.match(panel, /useCourseFooterInset\(!libraryOpen && !readOnlyCanvas, canvasRef\)/);
  assert.match(panel, /strip\.style\.setProperty\(COURSE_FOOTER_INSET_PROPERTY, `\$\{footerInset\}px`\)/);
});

test("5+6 — note-editor sizes, mind-map icons", () => {
  // Same geometry as the note editor's pill (36px buttons, same padding).
  assert.match(styles, /\[data-course-mindmap-status\] \{[^}]*--mm-tool-size: 36px;/);
  assert.match(styles, /\[data-course-mindmap-status\] \{[^}]*padding: 0\.375rem 0\.5rem;/);
  assert.match(noteCss, /\.dc-note \.dc-note-dock \.bn-ak-button \{[^}]*height: 2\.25rem;/, "the note pill's buttons are the same 36px");
  assert.match(styles, /\.mm-tool \{[^}]*width: var\(--mm-tool-size\);[^}]*border-radius: var\(--mm-tool-radius\);/);
  assert.match(styles, /\.mm-tool > svg \{[^}]*width: 1rem;/);
  // The mind map's own controls and glyphs are all still on the bar.
  for (const hook of [
    "data-course-mindmap-done",
    "data-course-mindmap-save",
    "data-course-mindmap-json-import",
    "data-course-mindmap-maps",
    "data-course-mindmap-auto-arrange",
    "data-course-mindmap-align",
    "data-course-mindmap-look",
    "data-course-mindmap-fit",
    "data-course-mindmap-delete",
  ]) {
    assert.match(panel, new RegExp(hook), hook);
  }
  assert.match(panel, /className="mm-tool mm-tool-violet"[^>]*data-course-mindmap-done/);
  assert.match(panel, /<Sparkles \/>/);
  assert.match(panel, /<Maximize \/>/);
  assert.match(panel, /<Trash2 \/>/);
  // Its menus open upward from the bottom bar now.
  assert.match(panel, /bottom: window\.innerHeight - anchor\.top \+ 8/);
});

test("7 — corner buttons open the left and right side panels", () => {
  assert.match(panel, /data-mindmap-open-left-panel[\s\S]{0,200}?setSidePanel\("left"\)/);
  assert.match(panel, /<PanelLeft size=\{18\}/);
  assert.match(panel, /data-mindmap-open-right-panel[\s\S]{0,200}?setSidePanel\("right"\)/);
  assert.match(panel, /<PanelRight size=\{18\}/);
  assert.match(panel, /data-mindmap-left-panel/);
  assert.match(panel, /absolute inset-y-0 left-0 z-40 flex w-\[280px\]/);
  assert.match(panel, /data-mindmap-right-panel/);
  assert.match(panel, /absolute inset-y-0 right-0 z-40 flex w-\[300px\]/);
  assert.match(panel, /data-mindmap-panel-scrim/);
  // Escape shuts a panel before it leaves the canvas.
  assert.match(panel, /if \(sidePanel\) \{ setSidePanel\(null\); return; \}/);
});

test("8 — rename from the side panel, saved through the library's rename path", () => {
  // Right panel: a rename field for the map on the canvas.
  assert.match(panel, /data-mindmap-right-panel[\s\S]*?data-mindmap-rename-input/);
  assert.match(panel, /data-mindmap-rename-save/);
  assert.match(panel, /onRenameMap\?\.\(activeMapKey, next\)/);
  // Left panel: the same library trees, whose SELF rows rename in place.
  assert.match(panel, /data-mindmap-left-panel[\s\S]*?<BranchedMenu\s+items=\{collectionMode === "master" \? masterTree : selfTree\}|data-mindmap-left-panel[\s\S]*?items=\{selfTree\}/);
  assert.match(panel, /onRename: \(nextTitle\) => onRenameMap\?\.\(entry\.mapKey, nextTitle\)/);
  // The canvas name the panel seeds from is the library's own name source.
  assert.match(panel, /maps\.find\(\(entry\) => entry\.mapKey === activeMapKey\)\?\.title \|\| mind\.title/);
});
