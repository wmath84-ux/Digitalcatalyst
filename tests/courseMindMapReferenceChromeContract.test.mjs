// tests/courseMindMapReferenceChromeContract.test.mjs
//
// Pins the mind map page's chrome after the redesign (owner brief 2026-10-16:
// "use that same complete, exact UI design system in the mind map… it must be
// headless too… the same eye button… centre the toolbar… the same bottom tray
// as the note page's read mode"):
//
//   1. read mode: a double-tap / double-click NEVER opens editing; editing is
//      entered explicitly — from read mode's tray, or Enter/F2 on the canvas;
//   2. read mode: nodes cannot be dragged — movement is edit-only;
//   3. read mode's bottom tray is the note page's read navigation: the side
//      panel button, a New mind map button and an eye/pencil, in one design;
//   4. ONE tap on the canvas hides that tray, and the next tap shows it again;
//   5. the editing toolbar is ONE CENTRED pill (it used to hug the left edge),
//      wearing the note editor's tile design while keeping the mind map's own
//      icons, led by the EYE — the same tile as every other control;
//   6. the ONE side panel is the map library: nearly a page wide with a thin
//      strip still visible, MASTER / SELF top centre, a single New mind map
//      button at the bottom, and rows with NO pencil / trash (rename + delete
//      live behind a long press);
//   7. headless: no header, no corner button that opens a panel, and no second
//      (options) drawer anywhere;
//   8. a map renames from the panel's row popup, saved through the same
//      onRenameMap the library has always used.
//
// Save / sync / drag-commit behaviour stays pinned by the older suites
// (coursePlayerMindMapContract, courseMindMapCloudSyncRuntime, …).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const panel = read("src/course/MindMapPanel.tsx");
const notes = read("src/course/NotesPanel.tsx");
const styles = read("src/index.css");
const noteCss = read("src/course/noteEditor/noteEditor.css");
const libraryCss = read("src/course/mindMapLibrary.css");

test("1 — no double-tap/double-click unlock: editing is entered explicitly", () => {
  assert.doesNotMatch(panel, /useDoubleTapToEdit/, "the double-tap-to-edit gesture is gone from the mind map");
  assert.doesNotMatch(panel, /editGesture/);
  // The explicit entries: read mode's tray pencil, and Enter/F2 on the canvas.
  assert.match(panel, /const enterEditMode = useCallback/);
  assert.match(panel, /data-mindmap-read-edit[\s\S]{0,160}?enterEditMode/);
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

test("3+4 — read mode's tray is the note page's tray, and ONE tap hides it", () => {
  // Mounted only in the read view, and only while it is visible. The EMPTY
  // page wears it too (owner, 2026-10-17): it is the only way into the map
  // library.
  assert.match(panel, /\{!readOnlyCanvas \|\| !readChromeVisible \? null : \(/);
  assert.match(panel, /<nav className="mm-read-tray" aria-label="Mind map navigation" data-mindmap-read-tray>/);
  for (const hook of [
    "data-mindmap-read-library",
    "data-mindmap-read-new",
    "data-mindmap-read-edit",
  ]) {
    assert.match(panel, new RegExp(hook), hook);
  }
  // There is NO home button any more (owner, 2026-10-17): the start screen is
  // gone, and the empty canvas IS the page.
  assert.doesNotMatch(panel, /data-mindmap-read-home/);
  assert.doesNotMatch(panel, /aria-label="Mind map home"/);
  assert.match(panel, /const \[readChromeVisible, setReadChromeVisible\] = useState\(true\)/);
  // ONE tap on the canvas toggles it — and a press that travelled (a pan) never
  // counts as a tap.
  assert.match(panel, /const READ_TAP_SLOP_PX = 10;/);
  assert.match(panel, /onClick=\{\(event\) => \{[\s\S]{0,500}?setReadChromeVisible\(\(visible\) => !visible\)/);
  assert.match(panel, /Math\.hypot\(event\.clientX - start\.x, event\.clientY - start\.y\) > READ_TAP_SLOP_PX/);
  // The tray wears the note page read pill's geometry, in this page's palette.
  assert.match(styles, /\.mm-read-tray \{[\s\S]{0,400}?--mm-tool-size: 36px;/);
  assert.match(styles, /\.mm-read-tray \{[\s\S]{0,500}?bottom: calc\(max\(0\.5rem, env\(safe-area-inset-bottom\)\) \+ var\(--dc-note-footer-inset, 0px\)\);/);
  assert.match(styles, /\.mm-read-tray \{[\s\S]{0,700}?padding: 0\.375rem 0\.5rem;/);
  assert.match(styles, /\.mm-read-tray \{[\s\S]{0,700}?background: var\(--mm-pill-bg\);/);
  assert.match(styles, /\.mm-read-tray \{[\s\S]{0,700}?border-radius: 999px;/);
  assert.match(styles, /\.mm-read-tray-sep \{/);
  // …and the note page's read tray carries a control for every one of them, so
  // the two trays stay one design.
  for (const hook of ["data-note-read-library", "data-note-read-new", "data-note-read-edit"]) {
    assert.match(notes, new RegExp(hook), hook);
  }
  // Neither tray has a home button any more (owner, 2026-10-17).
  assert.doesNotMatch(notes, /data-note-read-home/);
  assert.doesNotMatch(panel, /data-mindmap-read-home/);
  assert.match(notes, /data-note-read-tray/);
});

test("5 — the editing toolbar is CENTRED, note-editor sized, and eye-led", () => {
  // It used to hug the left edge ("thoda sa left side mein hai" — the owner).
  assert.match(styles, /\[data-course-mindmap-status\] \{[\s\S]{0,400}?left: 50%;/);
  assert.match(styles, /\[data-course-mindmap-status\] \{[\s\S]{0,400}?transform: translateX\(-50%\);/);
  assert.match(styles, /\[data-course-mindmap-status\] \{[\s\S]{0,500}?bottom: calc\(max\(0\.5rem, env\(safe-area-inset-bottom\)\) \+ var\(--dc-note-footer-inset, 0px\)\);/);
  // Solid surfaces in both palettes — never the glass tokens.
  const statusBlockForFill = styles.slice(
    styles.indexOf("[data-course-mindmap-status] {"),
    styles.indexOf("[data-course-mindmap-status][data-compact"),
  );
  assert.match(statusBlockForFill, /background: var\(--mm-pill-bg\);/);
  assert.match(styles, /\.course-mindmap-shell \{[^}]*--mm-pill-bg: #0d1424;/);
  assert.match(styles, /\.course-mindmap-shell\[data-mindmap-theme="light"\] \{[^}]*--mm-pill-bg: #ffffff;/);
  const statusBlock = styles.slice(
    styles.indexOf("[data-course-mindmap-status] {"),
    styles.indexOf("[data-course-mindmap-status][data-compact"),
  );
  assert.doesNotMatch(statusBlock, /backdrop-filter|chrome-glass/, "nothing translucent about the pill");
  // Same geometry as the note editor's pill (36px tiles, same padding).
  assert.match(statusBlock, /--mm-tool-size: 36px;/);
  assert.match(statusBlock, /padding: 0\.375rem 0\.5rem;/);
  assert.match(noteCss, /\.dc-note \.dc-note-dock \.bn-ak-button \{[\s\S]{0,200}?width: 2\.5rem;/, "the note pill's buttons are 40px (it scrolls, so it can afford them)");
  assert.match(styles, /\.mm-tool \{[\s\S]{0,200}?width: var\(--mm-tool-size\);/);
  assert.match(styles, /\.mm-tool > svg \{[\s\S]{0,120}?width: 1rem;/);
  // The EYE leads it — one more .mm-tool of the row, in the same design as the
  // note editor's own read control. The violet "Save and read" capsule is gone.
  assert.match(panel, /className="mm-tool"[\s\S]{0,160}?data-mindmap-edit-read/);
  assert.match(panel, /<Eye size=\{16\} aria-hidden="true" \/>/);
  assert.doesNotMatch(panel, /data-course-mindmap-done/);
  // …and the note editor's own read control is the same tile, built from
  // BlockNote's toolbar button so it cannot drift from its neighbours.
  const toolbar = read("src/course/NoteEditorToolbar.tsx");
  assert.match(toolbar, /className="dc-note-read-eye"[\s\S]{0,200}?data-note-edit-read/);
  assert.match(toolbar, /icon=\{<Eye size=\{16\} \/>\}/);
  assert.doesNotMatch(toolbar, /dc-note-dock-read|BookOpen/);
  // The mind map's own controls and glyphs are all still on the bar.
  for (const hook of [
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
  assert.match(panel, /<Sparkles \/>/);
  assert.match(panel, /<Maximize \/>/);
  assert.match(panel, /<Trash2 \/>/);
  // Its menus open upward from the bottom bar.
  assert.match(panel, /bottom: window\.innerHeight - anchor\.top \+ 8/);
  // BOTH bottom bars ride the measured footer lift, published on the shell (the
  // note editor's arrangement) so either bar clears the player's footer.
  // The canvas is always on screen now, so the footer inset always applies.
  assert.match(panel, /useCourseFooterInset\(true, canvasRef\)/);
  assert.match(panel, /shell\.style\.setProperty\(COURSE_FOOTER_INSET_PROPERTY, `\$\{footerInset\}px`\)/);
});

test("6 — the ONE panel is the map library, with the notes library's rows", () => {
  assert.match(panel, /data-course-mindmap-library/);
  assert.match(panel, /data-mindmap-left-panel/);
  // The side panel BECAME the full-page main area (owner, 2026-10-17).
  assert.match(panel, /absolute inset-0 z-40 flex flex-col shadow-2xl/);
  assert.match(panel, /data-mindmap-panel-back[\s\S]{0,600}?onClick=\{closePanel\}/, "the panel carries the one way back");
  assert.match(panel, /masterLabel="Course library"/);
  assert.match(panel, /selfLabel="My library"/);
  assert.match(panel, /expand/);
  assert.match(libraryCss, /\[data-mindmap-left-panel\] \{[\s\S]{0,200}?border-radius: 0;/);
  assert.match(panel, /data-mindmap-panel-scrim/);
  assert.match(panel, /data-mindmap-panel-head/);
  assert.match(panel, /data-mindmap-panel-foot/);
  assert.match(panel, /data-mindmap-panel-new/);
  // ONE button at the bottom — "New mind map" — and nothing "back to library".
  assert.doesNotMatch(panel, /data-mindmap-panel-library/);
  assert.doesNotMatch(panel, /Open full library/);
  // Rows carry no pencil / trash: their actions live behind a long press, in
  // both collections, exactly like the notes library.
  assert.equal(
    (panel.match(/leafActionMenu="long-press"/g) || []).length,
    2,
    "the SELF and MASTER collections are both in the panel, with long-press rows",
  );
  assert.match(libraryCss, /\[data-mindmap-left-panel\] \.mindmap-library-menu \.branched-menu__label[\s\S]{0,200}?text-overflow: ellipsis;/);
  assert.match(panel, /onRename: \(nextTitle\) => onRenameMap\?\.\(entry\.mapKey, nextTitle\)/);
  assert.match(panel, /onDelete: \(\) => requestMapDelete\(entry\.mapKey\)/);
  // Escape shuts the panel before it leaves the canvas.
  assert.match(panel, /if \(panelOpen\) \{ closePanel\(\); return; \}/);
});

test("7 — headless: no header, no corner buttons, no second drawer, notes' home", () => {
  assert.doesNotMatch(panel, /CoursePageHeader|data-course-page-header/);
  assert.doesNotMatch(panel, /data-mindmap-open-left-panel|data-mindmap-open-right-panel|data-mindmap-editor-chrome/);
  assert.doesNotMatch(
    panel,
    /data-mindmap-right-panel|data-mindmap-rename-input|data-mindmap-rename-save|data-mindmap-panel-read|data-mindmap-panel-save|data-mindmap-panel-stats/,
  );
  assert.doesNotMatch(panel, /renameDraft|sidePanel/);
  // There is NO start screen on either page any more (owner, 2026-10-17):
  // the notes page opens on the blank "New note", the mind map page on the
  // empty canvas.
  assert.doesNotMatch(panel, /data-course-mindmap-home/);
  assert.doesNotMatch(panel, /data-mindmap-home-actions/);
  assert.doesNotMatch(panel, /data-mindmap-home-new|data-mindmap-home-mine|data-mindmap-home-course/);
  assert.doesNotMatch(notes, /data-course-notes-home/);
  assert.doesNotMatch(notes, /data-notes-home-actions/);
  // The empty page says what it is, and the library is one tap away.
  assert.match(panel, /data-mindmap-empty-hint/);
  assert.match(panel, /data-mindmap-read-library/);
});

test("8 — rename through the panel's rows, saved through the library's own path", () => {
  // The panel renders the collection the MASTER / SELF control picks, and its
  // SELF rows carry the rename callback the store has always used.
  assert.match(panel, /collectionMode === "master" \? \(/);
  assert.match(panel, /items=\{selfTree\}/);
  assert.match(panel, /items=\{masterTree\}/);
  assert.match(panel, /onRenameMap\?\.\(entry\.mapKey, nextTitle\)/);
  // The canvas name the panel reveals is the library's own name source.
  assert.match(panel, /maps\.find\(\(entry\) => entry\.mapKey === activeMapKey\)\?\.title \|\| mind\.title/);
});
