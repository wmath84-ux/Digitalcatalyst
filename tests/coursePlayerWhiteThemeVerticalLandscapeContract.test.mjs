// tests/coursePlayerWhiteThemeVerticalLandscapeContract.test.mjs
// Regression contract for the requested Course Player follow-up:
//   - Google Forms stay below the Course Player header and above its footer
//   - mobile landscape lists use visible up/down scrolling, not left/right
//   - the theme control has a third, fully white Course Player state

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

test("theme button cycles dark to light to white and back to dark", () => {
  assert.match(coursePlayer, /type CoursePlayerTheme = "dark" \| "light" \| "white"/);
  assert.match(coursePlayer, /theme === "dark" \? "light" : theme === "light" \? "white" : "dark"/);
  assert.match(coursePlayer, /stored === "light" \|\| stored === "white"/);
  assert.match(coursePlayer, /data-next-theme=\{nextTheme\}/);
});

test("third theme state makes the entire Course Player canvas pure white", () => {
  assert.match(styles, /\.course-player-shell\[data-course-theme="white"\]\s*\{/);
  const whiteBlock = styles.match(/\.course-player-shell\[data-course-theme="white"\]\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.match(whiteBlock, /--course-bg:\s*#ffffff/);
  assert.match(whiteBlock, /--course-surface:\s*#ffffff/);
  assert.match(whiteBlock, /--course-panel:\s*#ffffff/);
  assert.match(whiteBlock, /background-color:\s*#ffffff/);
});
