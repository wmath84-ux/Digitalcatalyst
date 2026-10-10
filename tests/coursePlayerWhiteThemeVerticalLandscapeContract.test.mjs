// tests/coursePlayerWhiteThemeVerticalLandscapeContract.test.mjs
// Regression contract for the requested Course Player follow-up:
//   - Google Forms stay inside the framed player shell (split deck + footer
//     dock — the header is gone entirely, owner's direction)
//   - mobile landscape lists use visible up/down scrolling, not left/right
//   - the independently persisted theme control is a simple dark ⇄ light toggle

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const coursePlayer = fs.readFileSync("src/CoursePlayerApp.tsx", "utf8");
const playerPanel = fs.readFileSync("src/course/PlayerPanel.tsx", "utf8");
const readPanel = fs.readFileSync("src/course/ReadLibraryPanel.tsx", "utf8");
const notesPanel = fs.readFileSync("src/course/NotesPanel.tsx", "utf8");
const sketchPanel = fs.readFileSync("src/course/SketchPanel.tsx", "utf8");
const confirmDialog = fs.readFileSync("src/course/ConfirmDeleteDialog.tsx", "utf8");
const courseEmbed = fs.readFileSync("src/utils/courseEmbed.ts", "utf8");
const resourceViewer = fs.readFileSync("src/course/ResourceViewer.tsx", "utf8");
const styles = fs.readFileSync("src/index.css", "utf8");
const preferences = fs.readFileSync("src/course/playerPreferences.tsx", "utf8");
const themeStyles = fs.readFileSync("src/course/courseTheme.css", "utf8");
const main = fs.readFileSync("src/main.tsx", "utf8");

test("Google Form answering and confirmation remain in the framed player", () => {
  assert.match(courseEmbed, /url\.searchParams\.set\("embedded", "true"\)/);
  assert.match(courseEmbed, /\/viewform/);
  // Previews stay sandboxed; only the trusted Google full editor (edit
  // mode) runs unsandboxed because Google's /edit page needs sign-in
  // cookies + popups a sandbox list silently breaks.
  assert.match(resourceViewer, /sandbox=\{editMode \? undefined : "allow-scripts allow-forms/);
  assert.doesNotMatch(resourceViewer, /allow-top-navigation/);
  // The player's new shell (split deck + footer dock, no header) stays
  // mounted while the form answers inside the lesson pane, and the Player
  // tab keeps mark-complete one tap away at all times.
  assert.match(coursePlayer, /data-course-split="on"/);
  assert.match(coursePlayer, /<SplitDeck/);
  assert.match(coursePlayer, /<PlayerPanel/);
});

test("physical mobile landscape explicitly opts scrollable content into vertical panning", () => {
  assert.match(coursePlayer, /"data-course-landscape-scroll": "vertical"/);
  assert.match(styles, /\[data-course-landscape-scroll="vertical"\][\s\S]*touch-action: pan-y/);
  assert.match(styles, /\[data-course-viewer-iframe\]/);
});

test("Light is the fallback while feature- and UID-scoped saved themes remain authoritative", () => {
  assert.match(coursePlayer, /useCourseTheme\("player", user\?\.id \?\? null\)/);
  assert.match(playerPanel, /Light appearance/);
  assert.match(playerPanel, /playerTheme = "light"/);
  assert.match(preferences, /fallback: CoursePlayerTheme = "light"/);
  assert.match(preferences, /stored === "light" \|\| stored === "dark" \? stored : fallback/);
  assert.match(preferences, /prefKey\("courseTheme", feature, uid\)/);
  assert.match(preferences, /uid \? `dc\.\$\{kind\}\.\$\{feature\}\.\$\{uid\}`/);
  assert.match(coursePlayer, /style=\{\{ colorScheme: playerThemeCtl\.theme \}\}/);
  assert.doesNotMatch(coursePlayer, /const browserColorScheme = "dark" as const/);
});

test("portaled confirmation dialogs carry their owning feature's persisted theme", () => {
  assert.match(confirmDialog, /data-course-confirm-theme=\{theme\}/);
  assert.match(readPanel, /theme=\{readThemeCtl\.theme\}/);
  assert.match(notesPanel, /theme=\{noteThemeCtl\.theme\}/);
  assert.match(sketchPanel, /theme=\{playerTheme\}/);
  assert.match(coursePlayer, /playerTheme=\{playerThemeCtl\.theme\}/);
});

test("the Course Player light palette is comprehensive, feature-scoped, and imported after its chrome", () => {
  assert.ok(styles.includes('.course-player-shell[data-course-theme="light"]'), "the light palette is scoped to the shell");
  assert.ok(!styles.includes('data-course-theme="white"'), "no white palette block in the stylesheet");
  assert.ok(!themeStyles.includes("filter: invert"), "the light theme is a real palette swap, never an inversion");
  assert.ok(main.indexOf('./course/flatPlayerChrome.css') < main.indexOf('./course/courseTheme.css'), "theme overrides follow flat player chrome");
  for (const boundary of [
    "data-course-read-panel", "data-course-notes-panel", "data-mindmap-theme",
    "data-course-ai-theme", "data-course-brain-panel", "data-course-experiment-panel",
    'data-course-theme-surface="dark"', "data-course-dock", "data-course-viewer",
    "data-course-sketch-panel", "data-course-accent-action",
  ]) {
    assert.ok(themeStyles.includes(boundary), `missing light-theme boundary ${boundary}`);
  }
  assert.match(themeStyles, /data-course-sheet-row\] \.truncate\.text-xs/);
  assert.match(themeStyles, /data-row-subtitle/);
  assert.match(themeStyles, /data-course-panel-section-label/);
  assert.match(themeStyles, /data-course-top-progress/);
  assert.match(coursePlayer, /data-course-player-loading/);
  assert.match(themeStyles, /data-course-player-loading.*data-course-theme="light"/);
  assert.match(themeStyles, /data-course-settings-trigger/);
  assert.match(themeStyles, /data-course-notes-panel.*data-notes-theme/);
  assert.match(themeStyles, /data-course-theme-portal.*data-menu-theme.*mm-menu/);
  assert.match(themeStyles, /data-mind-node-root="true"/);
  assert.ok(themeStyles.includes('.course-mindmap-shell[data-mindmap-theme="light"] [data-course-mindmap-library]'), "Mind Map's library overlay follows its own light theme");
  assert.ok(themeStyles.includes('.course-player-shell[data-course-theme="light"] .course-mindmap-shell[data-mindmap-theme="dark"]'), "a Dark map keeps its own dark canvas in a Light Player");
  assert.ok(themeStyles.includes('.course-player-shell [data-course-notes-panel][data-notes-theme="light"] .course-rich-surface'), "the legacy Notes editor overrides dark Player chrome");
  assert.ok(themeStyles.includes("--course-text: #0f172a;"), "Notes Light owns its text token even inside a Dark Player");
  assert.match(themeStyles, /\[data-course-ai-panel\]\[data-course-ai-theme="dark"\][\s\S]*background: #0b0b16;/);
  assert.match(notesPanel, /data-course-notes-editor-loading data-notes-theme=\{noteThemeCtl\.theme\}/);
});
