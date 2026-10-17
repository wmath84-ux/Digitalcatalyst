// tests/noteEditorToolbarSpacingContract.test.mjs
//
// The owner's toolbar brief (2026-10-17), pinned:
//
//   1. The NOTES page's bottom toolbar (the edit-mode pill) is BLACK.
//   2. The tools are NOT squeezed: the bold button, the checklist and the
//      block/page switcher kept their full size, with REAL spacing between
//      them — the old 2px gap made them look shrunken into one another.
//
// The same spacing rules apply to the mind map's own bottom bars and to the
// My Day editor's pill, so one bar design rules the whole app.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const noteCss = read("src/course/noteEditor/noteEditor.css");
const notesPanel = read("src/course/NotesPanel.tsx");
const styles = read("src/index.css");
const mydayCss = read("src/work/myday/work-myday.css");

test("1 — the Course Player's notes page wears a BLACK bottom toolbar", () => {
  // The pill itself: a dark surface, a light hairline, a deep shadow.
  assert.match(
    noteCss,
    /\[data-course-notes-panel\] \.dc-note \.dc-note-dock \.dc-note-dock-bar \{[^}]*background: #0b1020;/,
    "the editing pill is black",
  );
  assert.match(
    noteCss,
    /\[data-course-notes-panel\] \.dc-note \.dc-note-dock \.dc-note-dock-bar \{[^}]*border-color: rgb\(255 255 255 \/ 0\.16\);/,
  );
  // Every glyph on it is light, and the hover / selected states are light too.
  assert.match(noteCss, /\[data-course-notes-panel\] \.dc-note \.dc-note-dock \.bn-ak-button \{[^}]*color: rgb\(226 232 240\);/);
  assert.match(noteCss, /\[data-course-notes-panel\] \.dc-note \.dc-note-dock \.bn-ak-button:hover \{[^}]*background: rgb\(255 255 255 \/ 0\.12\);/);
  assert.match(noteCss, /\[data-course-notes-panel\] \.dc-note \.dc-note-dock-sep \{[^}]*background: rgb\(255 255 255 \/ 0\.22\);/);
  // The block-type ("page") switcher is part of the bar, so it is black too.
  assert.match(noteCss, /\[data-course-notes-panel\] \.dc-note \.dc-note-dock \[role="combobox"\] \{[^}]*background: rgb\(255 255 255 \/ 0\.08\);/);
});

test("1b — the notes page's READ tray is the same black bar", () => {
  // The library / prev / next / new / edit tray: a black pill, 40px tiles.
  assert.match(notesPanel, /data-note-read-nav/);
  assert.match(notesPanel, /bg-slate-950\/95 text-slate-200/);
  assert.match(notesPanel, /grid h-10 w-10 shrink-0 place-items-center rounded-full/);
  // The floating Read capsule (edit mode, caret away) wears it as well.
  assert.match(notesPanel, /data-note-edit-read-float/);
  assert.match(notesPanel, /grid h-10 w-10 place-items-center rounded-full border border-white\/15 bg-slate-950\/95/);
});

test("2 — the tools keep their full size and get REAL spacing", () => {
  // 40px round tiles, an 18px glyph, and never a squeeze.
  assert.match(noteCss, /\.dc-note \.dc-note-dock \.bn-ak-button \{[^}]*flex: 0 0 auto;[^}]*min-width: 2\.5rem;[^}]*width: 2\.5rem;[^}]*height: 2\.5rem;/);
  assert.match(noteCss, /\.dc-note \.dc-note-dock \.bn-ak-button svg \{[^}]*width: 1\.125rem;/);
  // The air between the tiles: 4px (was 2px — the squeezed look).
  const tray = noteCss.slice(noteCss.indexOf(".dc-note .dc-note-dock-tools {"), noteCss.indexOf(".dc-note .dc-note-dock-tools > *"));
  assert.match(tray, /gap: 0\.25rem;/);
  assert.doesNotMatch(tray, /gap: 0\.125rem;/, "the 2px gap is gone");
  // The pill itself keeps room between the pinned eye and the tray.
  assert.match(noteCss, /\.dc-note \.dc-note-dock \.dc-note-dock-bar \{[^}]*gap: 0\.375rem;/);
  // The separators have room to breathe.
  assert.match(noteCss, /\.dc-note \.dc-note-dock-sep \{[^}]*height: 1\.4rem;[^}]*margin: 0 0\.3rem;/);
  // The row still scrolls instead of squeezing (nothing is ever shrunk).
  assert.match(tray, /overflow-x: auto;/);
  assert.match(noteCss, /\.dc-note \.dc-note-dock-tools > \* \{\s*flex: 0 0 auto;/);
});

test("2b — the block-type / page switcher has room of its own", () => {
  assert.match(noteCss, /\.dc-note \.dc-note-dock \[role="combobox"\] \{[^}]*flex: 0 0 auto;[^}]*min-width: 2\.5rem;[^}]*max-width: 10rem;[^}]*height: 2\.5rem;/);
  assert.match(noteCss, /\.dc-note \.dc-note-dock \[role="combobox"\] \{[^}]*text-overflow: ellipsis;/);
  assert.match(noteCss, /\.dc-note \.dc-note-dock \[role="combobox"\] svg \{[^}]*flex: 0 0 auto;/);
});

test("3 — the pill is centred, not jammed against the edge", () => {
  assert.match(noteCss, /\.dc-note \.dc-note-dock \{[^}]*left: 50%;[^}]*transform: translateX\(-50%\);/);
  assert.match(noteCss, /\.dc-note \.dc-note-dock \{[^}]*width: max-content;[^}]*max-width: calc\(100% - 1rem\);/);
});

test("4 — the mind map's own bottom bars breathe too", () => {
  const strip = styles.slice(styles.indexOf("[data-course-mindmap-status] {"), styles.indexOf("[data-course-mindmap-status][data-compact"));
  assert.match(strip, /--mm-tool-gap: 4px;/, "the strip's tiles have 4px of air");
  assert.doesNotMatch(strip, /--mm-tool-gap: 2px;/);
  const tray = styles.slice(styles.indexOf(".mm-read-tray {"), styles.indexOf(".mm-read-tray-sep"));
  assert.match(tray, /--mm-tool-gap: 4px;/);
  assert.match(styles, /\.mm-read-tray-sep \{[^}]*height: 1\.4rem;[^}]*margin: 0 0\.3rem;/);
});

test("5 — the My Day editor's pill follows the same spacing", () => {
  assert.match(mydayCss, /\.work-myday-note-surface \.dc-note \.dc-note-dock \.bn-ak-button \{[^}]*width: 2\.5rem;[^}]*height: 2\.5rem;[^}]*min-width: 2\.5rem;/);
  assert.match(mydayCss, /\.work-myday-note-surface \.dc-note \.dc-note-dock \.dc-note-dock-tools \{[^}]*gap: 0\.25rem;/);
});
