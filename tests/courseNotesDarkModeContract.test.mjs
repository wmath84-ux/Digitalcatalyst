// tests/courseNotesDarkModeContract.test.mjs
//
// Contract for the Note library's theme legibility on the shared listing:
//
//   1. A saved note row never carries a hardcoded white inline background
//      (inline styles would beat the theme and paint white boxes in dark mode).
//   2. Row text and the empty/notice surfaces are theme-token driven, so they
//      stay legible in both the dark default and the light palette.
//   3. Empty, loading and sync-error states come from the shared study-library
//      system, never the old ad-hoc copy.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const notesPanel = fs.readFileSync("src/course/NotesPanel.tsx", "utf8");
const menuCss = fs.readFileSync("src/components/branched-menu/BranchedMenu.css", "utf8");
const statesCss = fs.readFileSync("src/course/study-library-states.css", "utf8");

test("a saved note row has no hardcoded white inline background", () => {
  assert.doesNotMatch(notesPanel, /background:\s*["']?#(?:fff|ffffff)\b/i);
  assert.doesNotMatch(notesPanel, /style=\{\{ background: "#ffffff"/);
});

test("the shared listing paints from theme tokens in both palettes", () => {
  assert.match(menuCss, /var\(--bm-ink\)/);
  assert.match(menuCss, /var\(--bm-muted\)/);
  assert.match(statesCss, /var\(--/);
  assert.doesNotMatch(menuCss, /color:\s*#fff\b/);
});

test("empty, loading and sync-error states use the shared study-library system", () => {
  assert.match(notesPanel, /StudyLibraryEmptyState/);
  assert.match(notesPanel, /StudyLibraryNotice/);
  assert.match(notesPanel, /BranchedMenuSkeleton/);
  assert.match(statesCss, /\.study-library-empty \{/);
  assert.match(statesCss, /\.study-library-notice \{/);
  assert.doesNotMatch(notesPanel, /No notes yet/);
  assert.doesNotMatch(notesPanel, /No notes yet[\s\S]{0,300}?bg-white\/80/);
});
