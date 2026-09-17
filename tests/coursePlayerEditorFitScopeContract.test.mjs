// tests/coursePlayerEditorFitScopeContract.test.mjs
//
// Contract for the responsive Google editor frame. The editor is an
// authenticated/shared Google page inside the player; no learner Drive copy
// or Drive OAuth is part of this layout behavior.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const resourceViewer = read("src/course/ResourceViewer.tsx");

// ---------------------------------------------------------------------------
// The full editor is fitted to the stage
// ---------------------------------------------------------------------------

test("every Google editor family has its own layout width", () => {
  assert.match(resourceViewer, /const EDITOR_VIEWPORT_WIDTHS: Record<string, number>/);
  for (const kind of ["doc", "sheet", "slides"]) {
    assert.match(resourceViewer, new RegExp(`\\n\\s*${kind}: \\d{3},`), `no editor width for ${kind}`);
  }
});

test("the editor is laid out wide and scaled down to fit the stage", () => {
  assert.match(resourceViewer, /const editorFrameWidth = scalesEditor \? editorViewportWidth \/ editorZoom : 0/);
  assert.match(resourceViewer, /Math\.min\(stageWidth \/ editorFrameWidth, 1\)/);
  assert.match(resourceViewer, /width: `\$\{editorFrameWidth\}px`/);
  assert.match(resourceViewer, /transform: `scale\(\$\{editorScale\}\)`/);
});

test("a stage at least as wide as the editor is left completely unscaled", () => {
  assert.match(resourceViewer, /const scalingEditor = scalesEditor && stageWidth > 0 && editorScale < 1/);
  assert.match(resourceViewer, /mobileDocument \|\| scalingEditor \? "absolute left-0 top-0 bg-white" : "h-full max-h-full min-h-0 w-full max-w-full min-w-0"/);
});

test("only real editors are scaled — previews and Drive binaries are not", () => {
  assert.match(resourceViewer, /const scalesEditor = editMode && !mobileDocument && kind in EDITOR_VIEWPORT_WIDTHS/);
});

test("the mobile-preview path remains separate from the editor fit", () => {
  assert.match(resourceViewer, /const MOBILE_VIEWPORT_WIDTH = 420/);
  assert.match(resourceViewer, /width: `\$\{MOBILE_VIEWPORT_WIDTH\}px`/);
  assert.match(resourceViewer, /transform: `scale\(\$\{mobileScale\}\)`/);
  assert.match(resourceViewer, /const mobileDocument = documentKind && !desktopView && !hasNativeMobileRendering\(embed\.kind\) && !isEditingInline/);
});

test("the stage never becomes an outer scroll container", () => {
  assert.match(resourceViewer, /className="relative h-full min-h-0 w-full min-w-0 overflow-hidden"/);
  assert.doesNotMatch(resourceViewer, /editorOverflows/);
});

test("the learner can magnify the fitted editor", () => {
  assert.match(resourceViewer, /data-course-editor-zoom/);
  assert.match(resourceViewer, /data-course-editor-zoom-in/);
  assert.match(resourceViewer, /data-course-editor-zoom-out/);
  assert.match(resourceViewer, /setEditorZoom\(1\)/);
});
