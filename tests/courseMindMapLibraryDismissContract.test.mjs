// Contract for the Mind Map library's shared, responsive listing. Both the
// SELF and MASTER collections render the one `BranchedMenu` (the same listing
// the Modules and Notes libraries use), so the tablet/narrow-pane behaviour is
// the menu's own: rows wrap long titles, never overflow, and never shrink type.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const panel = fs.readFileSync("src/course/MindMapPanel.tsx", "utf8");
const menuCss = fs.readFileSync("src/components/branched-menu/BranchedMenu.css", "utf8");
const statesCss = fs.readFileSync("src/course/study-library-states.css", "utf8");

test("both mind-map collections render through the shared branched menu", () => {
  assert.equal((panel.match(/<BranchedMenu\b/g) || []).length, 2, "SELF and MASTER each render one menu");
  assert.match(panel, /data-course-mindmap-map-grid": "true"|data-course-mindmap-map-grid="true"/);
  assert.match(panel, /data-course-mindmap-master-grid/);
});

test("rows wrap long titles and keep readable type on narrow and tablet panes", () => {
  assert.match(menuCss, /overflow-wrap: anywhere/);
  assert.doesNotMatch(menuCss, /text-overflow: ellipsis/);
  assert.doesNotMatch(menuCss, /font-size:\s*(0|[1-9])px/);
  assert.doesNotMatch(panel, /aspect-square/);
  assert.doesNotMatch(panel, /grid-cols-2|sm:grid-cols-3/);
});

test("the mind-map library shows the shared loading, empty and error states", () => {
  assert.match(panel, /BranchedMenuSkeleton rows=\{4\}/);
  assert.match(panel, /StudyLibraryEmptyState/);
  assert.match(panel, /StudyLibraryNotice/);
  assert.match(statesCss, /\.study-library-empty \{/);
  assert.match(statesCss, /\.study-library-notice \{/);
  assert.match(panel, /data-course-mindmap-library/);
});
