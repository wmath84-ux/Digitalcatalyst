// tests/mindMapEditorRedesignContract.test.mjs
//
// Acceptance contract for the Course Player Mind Map editor redesign:
//   A. readable in Light by default, text follows the real fill
//   B. small icon header; Boxed / Modern look toggle is an icon with a name
//   C. Modern look is a view only — switching never edits the saved map
//   D. Plus is shown only for a selected / editing node
//   E. colour button for a selection; node box, text and branch colour; reset
//   F. styles go through the one inline renderer; state styles are distinct

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const panel = fs.readFileSync("src/course/MindMapPanel.tsx", "utf8");

test("A. the editor opens in Light by default and keeps the shared theme untouched", () => {
  assert.match(panel, /data-mindmap-theme=\{mindTheme\}/);
  assert.match(panel, /useCourseTheme\("mindMap", uid \?\? null, "light"\)/);
  // The fallback for the mind map feature is Light (playerPreferences default).
  assert.match(fs.readFileSync("src/course/playerPreferences.tsx", "utf8"), /fallback: CoursePlayerTheme = "light"/);
});

test("A. node ink follows the real fill, including custom colours", () => {
  assert.match(panel, /ink: style\?\.text \?\? readableInkOn\(inkBase\)/);
  assert.match(panel, /style=\{\{\s*background: fill,\s*color: ink,/);
});

test("B. header is a small icon; the look toggle is a named icon control", () => {
  assert.match(panel, /aria-pressed=\{look === "modern"\}/);
  assert.match(panel, /aria-label=\{look === "modern" \? "Modern look on[^"]*" : "Modern look par jaayein"\}/);
  assert.match(panel, /title=\{look === "modern" \? "Modern look \(on\) — classic boxes" : "Modern look"\}/);
  assert.match(panel, /data-course-mindmap-look=\{look\}/);
});

test("C. the look is a remembered view; switching never writes the map", () => {
  const lookSetter = panel.match(/const \[look, setLook\][\s\S]*?\n/)?.[0] || "";
  assert.ok(lookSetter.length > 0, "look is local state");
  const toggle = panel.slice(panel.indexOf("data-course-mindmap-look"), panel.indexOf("data-course-mindmap-look") + 900);
  assert.doesNotMatch(toggle, /onMindChange/);
  assert.doesNotMatch(toggle, /setNodeStyle|setNodeTopic|addChildNode|removeNode/);
});

test("D. Plus only renders while a node is selected or being edited", () => {
  assert.match(panel, /const showPlus = \(selected \|\| editing\) && !dragging( && !readOnly)?;/);
  assert.match(panel, /\{showPlus \? \(/);
});

test("E. the colour button exists only for a selection and writes through setNodeStyle", () => {
  assert.match(panel, /setNodeStyle\(current, target, patch\)/);
  assert.match(panel, /if \(selectedId == null\) setStyleMenuOpen\(false\)/);
  assert.match(panel, /data-course-mindmap-style\b/);
  assert.match(panel, /data-course-mindmap-style-reset/);
});

test("E. a reset clears the keys (falls back to default), never a neighbour", () => {
  assert.match(panel, /allowDefault/);
  assert.match(panel, /onPick\(null\)/);
});

test("F. selected, editing and dragging states are distinct", () => {
  assert.match(panel, /data-mind-node-state=\{editing \? "editing" : dragging \? "dragging" : selected \? "selected" : "idle"\}/);
  assert.match(panel, /const ringShadow = editing[\s\S]*?"0 0 0 2px #8b5cf6"/);
  assert.match(panel, /selected\s*\n?\s*\? "0 0 0 2px rgba\(167, 139, 250, 0\.85\)"/);
  assert.match(panel, /dragging \? "opacity-90" : ""/);
});

test("F. no class or CSS rule overrides a node's inline fill or ink", () => {
  const css = fs.readFileSync("src/course/courseTheme.css", "utf8");
  assert.doesNotMatch(css, /\[data-mind-node-body\][^{]*\{[^}]*!important[^}]*background/);
  assert.doesNotMatch(css, /\[data-mind-node-body\][^{]*\{[^}]*!important[^}]*color/);
});
