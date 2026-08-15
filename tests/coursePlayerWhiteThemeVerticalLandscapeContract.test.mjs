// tests/coursePlayerWhiteThemeVerticalLandscapeContract.test.mjs
// Regression contract for the requested Course Player follow-up:
//   - Google Forms stay below the Course Player header and above its footer
//   - mobile landscape lists use visible up/down scrolling, not left/right
//   - the theme control is a simple dark ⇄ light toggle (no extra state)

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const coursePlayer = fs.readFileSync("src/CoursePlayerApp.tsx", "utf8");
const courseEmbed = fs.readFileSync("src/utils/courseEmbed.ts", "utf8");
const resourceViewer = fs.readFileSync("src/course/ResourceViewer.tsx", "utf8");
const rotatedScroll = fs.readFileSync("src/course/useRotatedScroll.ts", "utf8");
const styles = fs.readFileSync("src/index.css", "utf8");

test("Google Form answering and confirmation remain in the framed player", () => {
  assert.match(courseEmbed, /url\.searchParams\.set\("embedded", "true"\)/);
  assert.match(courseEmbed, /\/viewform/);
  assert.match(resourceViewer, /sandbox="allow-scripts allow-forms/);
  assert.doesNotMatch(resourceViewer, /allow-top-navigation/);
  assert.match(coursePlayer, /data-course-header/);
  assert.match(coursePlayer, /data-course-mark-complete-bar/);
});

test("rotated mobile landscape maps a visible vertical swipe to scrollTop", () => {
  assert.match(rotatedScroll, /const wantsY = Math\.abs\(dsy\) >= Math\.abs\(dsx\)/);
  assert.match(rotatedScroll, /if \(axis === "y"\) target\.scrollTop -= dsy/);
  assert.match(rotatedScroll, /if \(axis === "x"\) target\.scrollLeft -= dsx/);
  assert.doesNotMatch(rotatedScroll, /scrollTop \+= dsx/);
});

test("physical mobile landscape explicitly opts scrollable content into vertical panning", () => {
  assert.match(coursePlayer, /data-course-landscape-scroll="vertical"/);
  assert.match(styles, /\[data-course-landscape-scroll="vertical"\][\s\S]*touch-action: pan-y/);
  assert.match(styles, /\[data-course-viewer-iframe\]/);
});

test("theme button simply toggles dark and light with no extra state", () => {
  assert.ok(coursePlayer.includes('type CoursePlayerTheme = "dark" | "light";'), "theme type has only dark + light");
  assert.ok(coursePlayer.includes('const nextTheme: CoursePlayerTheme = theme === "dark" ? "light" : "dark";'), "next theme is a simple flip");
  assert.ok(coursePlayer.includes("data-next-theme={nextTheme}"), "theme toggle exposes the next theme");
  assert.ok(!coursePlayer.includes('theme === "light" ? "white"'), "no white step remains in the cycle");
  // Anyone who previously picked the removed white theme keeps light, and a
  // third tap cycles straight back to the first state (dark ⇄ light ⇄ dark).
  assert.ok(coursePlayer.includes('return stored === "light" || stored === "white" ? "light" : "dark";'), "stored white preference migrates to light");
});

test("no pure-white theme state remains in the Course Player palette", () => {
  assert.ok(!styles.includes('data-course-theme="white"'), "no white palette block in the stylesheet");
  assert.ok(!coursePlayer.includes('"dark" | "light" | "white"'), "no three-state theme type");
  assert.ok(styles.includes('.course-player-shell[data-course-theme="light"]'), "light palette still present");
});
