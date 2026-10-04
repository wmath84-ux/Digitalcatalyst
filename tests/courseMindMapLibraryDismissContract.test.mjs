// Contract for the shared responsive Note / Mind Map study-resource grid.
// Narrow panels become one full-width column without shrinking typography or
// creating horizontal overflow; wider tablet / desktop panes add columns.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const indexCss = fs.readFileSync("src/index.css", "utf8");
const cardCss = fs.readFileSync("src/course/study-resource-card.css", "utf8");
const panel = fs.readFileSync("src/course/MindMapPanel.tsx", "utf8");

test("both library grids tile by available width and never overflow a narrow pane", () => {
  const baseRule = indexCss.match(/\[data-course-notes-grid\],\s*\[data-course-mindmap-map-grid\]\s*\{[^}]*\}/);
  assert.ok(baseRule, "both libraries share one base grid rule");
  assert.match(baseRule[0], /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*260px\),\s*1fr\)\)/);
  assert.match(baseRule[0], /align-items:\s*stretch/);
  assert.doesNotMatch(baseRule[0], /grid-template-columns:\s*repeat\((2|3)/);

  const desktopRule = indexCss.match(/@media \(min-width: 1100px\)\s*\{\s*\[data-course-notes-grid\],\s*\[data-course-mindmap-map-grid\]\s*\{[^}]*\}/);
  assert.ok(desktopRule, "wide desktop cards may use a more generous width");
  assert.match(desktopRule[0], /min\(100%,\s*290px\)/);
});

test("cards keep readable copy and a real study-resource height rather than shrinking to slivers", () => {
  assert.match(panel, /min-h-\[212px\]/);
  assert.match(cardCss, /min-height: 212px/);
  assert.match(cardCss, /font-size: 17px/);
  assert.match(cardCss, /overflow-wrap: anywhere/);
  assert.doesNotMatch(panel, /aspect-square/);
  assert.doesNotMatch(cardCss, /font-size:\s*9px|font-size:\s*10px/);
});

test("the mind-map grid keeps its shared card contract while loading and with data", () => {
  assert.equal((panel.match(/data-course-mindmap-map-grid="true"/g) || []).length, 2);
  assert.match(panel, /StudyResourceCardSkeleton kind="mind-map"/);
  assert.match(panel, /StudyResourceCard/);
  assert.match(panel, /data-course-mindmap-library/);
});
