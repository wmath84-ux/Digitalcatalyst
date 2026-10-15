// tests/courseSketchFullEditorChromeContract.test.mjs
//
// Pins the Full Sketch (Excalidraw) Editor's header cleanup (owner brief):
//
//   1. every sketch page shows in a horizontal tray just under the header;
//   2. the header carries a standalone "+ New canvas" — the same create
//      affordance the Quick Sketch chip has — and it actually creates;
//   3. the Full Editor's side panel hides on any outside click;
//   4. the button that opens that panel lives in the header.
//
// The canvas switcher itself (pages list + delete + create-in-menu), the
// Clean Look sidebar, the save line and all drawing behaviour stay as they
// were — pinned by the older sketch suites.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../src/course/SketchPanel.tsx", import.meta.url), "utf8");
const header = panel.slice(panel.indexOf("<SketchStatus"), panel.indexOf("</SketchStatus>"));

test("1 — all sketch pages in a horizontal tray directly under the header", () => {
  const tray = panel.slice(panel.indexOf("function SketchPagesTray"), panel.indexOf("function SketchColourCluster"));
  assert.match(tray, /data-course-sketch-pages-tray=\{boards\.length\}/);
  assert.match(tray, /role="tablist"[\s\S]{0,60}?aria-label="Sketch pages"/);
  // One chip per page, horizontally scrollable, active page lit.
  assert.match(tray, /overflow-x-auto/);
  assert.match(tray, /data-course-sketch-page=\{board\.sketchKey\}/);
  assert.match(tray, /data-active=\{active \? "true" : "false"\}/);
  assert.match(tray, /if \(!active\) onSelectBoard\?\.\(board\.sketchKey\);/);
  // Rendered in the Full Editor (not Quick Sketch), right after the header.
  assert.match(panel, /\{!quickMode && !cleanLook && scoped && boards\.length > 0 \? \(\s*<SketchPagesTray/);
  const statusAt = panel.indexOf("</SketchStatus>");
  const trayAt = panel.indexOf("<SketchPagesTray");
  const canvasAt = panel.indexOf("data-course-sketch-canvas");
  assert.ok(statusAt !== -1 && trayAt > statusAt && trayAt < canvasAt, "the tray sits between the header and the canvas");
});

test("2 — a standalone New canvas in the Full header, wired to create", () => {
  assert.match(panel, /data-course-sketch-new-canvas/);
  assert.match(panel, /onClick=\{\(\) => onCreateBoard\?\.\(\)\}/);
  assert.match(panel, /disabled=\{!canCreateBoard\}/);
  // It rides in the header's own action row, before the edit/mode toggles.
  assert.ok(header.includes("{newCanvasButton}"), "the header renders the new-canvas button");
  assert.ok(header.indexOf("{newCanvasButton}") < header.indexOf("{editToggle}"));
  assert.match(panel, /<Plus aria-hidden size=\{14\} \/> New canvas/);
});

test("3+4 — the side panel opens from the header and hides on outside click", () => {
  // The button lives at the header's left end.
  assert.match(panel, /data-course-sketch-side-panel-toggle/);
  assert.match(panel, /leading=\{sidePanelToggle\}/);
  assert.match(panel, /aria-expanded=\{sidePanelOpen\}/);
  assert.match(panel, /<PanelLeft aria-hidden size=\{16\} \/>/);
  // The panel itself, over the canvas' left edge.
  assert.match(panel, /\{sidePanelOpen && !quickMode && !cleanLook \? \(/);
  assert.match(panel, /data-course-sketch-side-panel/);
  assert.match(panel, /absolute inset-y-0 left-0 z-40 flex w-\[280px\]/);
  // Outside click (and Escape) hides it; clicks inside it — or on its own
  // toggle — do not.
  assert.match(panel, /if \(sidePanelRef\.current\?\.contains\(target\)\) return;/);
  assert.match(panel, /if \(sideToggleRef\.current\?\.contains\(target\)\) return;/);
  assert.match(panel, /document\.addEventListener\("mousedown", onDocumentClick\);/);
  assert.match(panel, /if \(event\.key === "Escape"\) setSidePanelOpen\(false\);/);
  // And choosing a different page (or board) never leaves it hanging open.
  assert.match(panel, /useEffect\(\(\) => \{ setSidePanelOpen\(false\); \}, \[sceneKey, activeBoardKey\]\);/);
});

test("existing sketch behaviour is preserved", () => {
  // The switcher (pages + delete-active + menu create) lives on, shared by
  // the Clean Look sidebar and the new side panel — one implementation.
  assert.match(panel, /const sketchSidebarContent = \([\s\S]*?<SketchBoards/);
  assert.match(panel, /<Sidebar docked name="course-sketch-clean">\s*\{sketchSidebarContent\}\s*<\/Sidebar>/);
  assert.match(panel, /data-course-sketch-side-panel[\s\S]*?\{sketchSidebarContent\}/);
  assert.match(panel, /data-course-sketch-board-switch/);
  assert.match(panel, /data-course-sketch-delete-active/);
  // Header actions and editor wiring unchanged.
  assert.match(panel, /data-course-sketch-edit-toggle/);
  assert.match(panel, /data-course-sketch-mode=\{mode\}/);
  assert.match(panel, /data-course-sketch-colour-cluster/);
  assert.match(panel, /<Excalidraw\s+key=\{sceneKey\}/);
  assert.match(panel, /viewModeEnabled=\{!editing\}/);
  assert.match(panel, /data-course-sketch-quick-bar/);
});
