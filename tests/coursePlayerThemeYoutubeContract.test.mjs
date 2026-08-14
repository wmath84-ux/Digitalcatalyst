import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const coursePlayer = fs.readFileSync("src/CoursePlayerApp.tsx", "utf8");
const resourceViewer = fs.readFileSync("src/course/ResourceViewer.tsx", "utf8");
const courseEmbed = fs.readFileSync("src/utils/courseEmbed.ts", "utf8");
const styles = fs.readFileSync("src/index.css", "utf8");

test("Course Player header exposes a persisted light/dark theme toggle", () => {
  assert.match(coursePlayer, /data-course-theme-toggle/);
  assert.match(coursePlayer, /data-course-theme=\{theme\}/);
  assert.match(coursePlayer, /dc\.coursePlayerTheme/);
  assert.match(coursePlayer, /localStorage\.setItem\(courseThemeStorageKey, theme\)/);
  assert.match(coursePlayer, /theme === "dark" \? <Sun/);
  assert.match(coursePlayer, /<Moon/);
});

test("Course Player theme is scoped and supplies both palette variants", () => {
  assert.match(styles, /\.course-player-shell\s*\{/);
  assert.match(styles, /\.course-player-shell\[data-course-theme="light"\]/);
  for (const variable of ["--course-bg", "--course-surface", "--course-panel", "--course-text", "--course-muted", "--course-border"]) {
    assert.match(styles, new RegExp(variable), `missing ${variable}`);
  }
});

test("YouTube gets the full viewer height so its settings menu is visible and dismissible", () => {
  assert.match(resourceViewer, /data-course-youtube-stage=\{embed\.kind === "youtube" \? "expanded"/);
  assert.match(resourceViewer, /className="h-full min-h-0 w-full bg-black"/);
  assert.doesNotMatch(resourceViewer, /aspect-video max-h-full/);
  assert.match(resourceViewer, /settings \/ quality menus get enough vertical room/);
  assert.match(courseEmbed, /playsinline=1&controls=1&fs=1/);
});
