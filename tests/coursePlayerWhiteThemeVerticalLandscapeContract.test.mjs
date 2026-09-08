// tests/coursePlayerWhiteThemeVerticalLandscapeContract.test.mjs
// Regression contract for the requested Course Player follow-up:
//   - Google Forms stay inside the framed player shell (split deck + footer
//     dock — the header is gone entirely, owner's direction)
//   - mobile landscape lists use visible up/down scrolling, not left/right
//   - the theme control is a simple dark ⇄ light toggle (no extra state)

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const coursePlayer = fs.readFileSync("src/CoursePlayerApp.tsx", "utf8");
const playerPanel = fs.readFileSync("src/course/PlayerPanel.tsx", "utf8");
const courseEmbed = fs.readFileSync("src/utils/courseEmbed.ts", "utf8");
const resourceViewer = fs.readFileSync("src/course/ResourceViewer.tsx", "utf8");
const styles = fs.readFileSync("src/index.css", "utf8");

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

test("there is no theme state left in the Course Player at all", () => {
  // The player went dark-only with the app-wide light theme removal: no type,
  // no toggle, no persisted preference.
  assert.ok(!coursePlayer.includes("CoursePlayerTheme"), "no theme type remains");
  assert.ok(!playerPanel.includes("onThemeChange"), "the panel has no theme row");
  assert.ok(!coursePlayer.includes('theme === "light" ? "white"'), "no white step remains in the cycle");
});

test("no light or white theme state remains in the Course Player palette", () => {
  assert.ok(!styles.includes('data-course-theme="white"'), "no white palette block in the stylesheet");
  assert.ok(!styles.includes('data-course-theme="light"'), "no light palette block either");
  assert.ok(!coursePlayer.includes('"dark" | "light" | "white"'), "no three-state theme type");
  assert.ok(styles.includes(".course-player-shell {"), "the dark palette block is still there");
});
