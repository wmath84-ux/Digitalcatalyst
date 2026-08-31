// tests/courseMindMapLibraryDismissContract.test.mjs
//
// Contract for the Mind Map Library dismissal parity fix:
//
//   When the sheet is dragged shut (landscape split drag), the library grid
//   must behave EXACTLY like the Note Library grid: cards keep a fixed
//   160 px floor and clip at the sheet edge — they must never shrink to a
//   sliver with the container. The old `minmax(min(160px, 100%), 1fr)`
//   guard let the cards shrink all the way to zero during the drag, which
//   is the "boxes shrink as the screen space reduces" report.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const indexCss = fs.readFileSync("src/index.css", "utf8");

test("the mind map library grid keeps the same 160px floor as the notes grid", () => {
  const notesRule = indexCss.match(/\[data-course-notes-grid\][^{]*\{[^}]*\}/);
  const libraryRule = indexCss.match(/^\[data-course-mindmap-map-grid\] \{[^}]*\}/m);
  assert.ok(notesRule && libraryRule, "both grids need a tiling rule in the stylesheet");

  // Identical tiling philosophy: count the space the grid actually got.
  for (const rule of [notesRule[0], libraryRule[0]]) {
    assert.match(rule, /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(160px,\s*1fr\)/);
  }
  // The map library rule must NOT contain the old shrink-to-container guard:
  // `min(160px, 100%)` let cards contract below 160px (down to nothing) as
  // the sheet was dragged closed.
  assert.doesNotMatch(libraryRule[0], /minmax\(min\(160px/);
  assert.doesNotMatch(libraryRule[0], /100%\)/);
});

test("the library cards themselves are width-independent boxes", () => {
  // The card is a square with a min-height floor and a 160px+ grid column,
  // so a narrower sheet clips the grid instead of squashing the cards.
  const panel = fs.readFileSync("src/course/MindMapPanel.tsx", "utf8");
  assert.match(panel, /aspect-square min-h-\[104px\]/);
  // The grid itself is the auto-fill 160px floor rule (never a fixed
  // viewport column count that would let cards track the sheet width).
  assert.match(indexCss, /\[data-course-mindmap-map-grid\]\s*\{[\s\S]*?\}/);
});

test("the sheet still closes with the direct invisible hide", () => {
  // The overlay's transition list stays transform+opacity only — the closed
  // sheet gains `invisible` immediately, matching the Note Library's direct
  // hide (no width animation that would make content shrink on the way out).
  const overlay = fs.readFileSync("src/course/CourseOverlay.tsx", "utf8");
  assert.match(overlay, /transition-\[transform,opacity\]/);
  assert.match(overlay, /invisible opacity-0/);
});
