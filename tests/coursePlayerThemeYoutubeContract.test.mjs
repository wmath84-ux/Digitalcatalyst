import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { getCourseEmbed, getYouTubeWatchUrl } from "../src/utils/courseEmbed.ts";

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

test("mobile landscape keeps the left header and right navigation rails", () => {
  assert.match(coursePlayer, /const useLandscapeRails = isLandscape \|\| immersive/);
  assert.match(coursePlayer, /orientation=\{useLandscapeRails \? "landscape" : "portrait"\}/);
  assert.match(coursePlayer, /data-course-mobile-landscape="rails"/);
  assert.match(coursePlayer, /\{landscapeLayout\(true\)\}/);
  assert.match(coursePlayer, /data-course-mobile-landscape-header/);
  assert.match(coursePlayer, /data-course-exit-immersive/);
});

test("YouTube stays strictly contained in the mobile landscape viewport", () => {
  assert.match(resourceViewer, /data-course-youtube-stage=\{embed\.kind === "youtube" \? "contained"/);
  assert.match(resourceViewer, /course-youtube-stage relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-black/);
  assert.match(resourceViewer, /kind === "youtube" \? "absolute inset-0 bg-black"/);
  assert.match(styles, /\.course-youtube-stage\s*\{[\s\S]*?contain: size layout paint/);
  assert.doesNotMatch(resourceViewer, /aspect-video max-h-full/);
  assert.match(resourceViewer, /settings \/ quality menus get enough vertical room/);
  assert.match(courseEmbed, /playsinline=1&controls=1&fs=1/);
});

test("YouTube auth fallback opens the original watch page instead of nesting sign-in", () => {
  const file = { id: "yt", name: "Lesson", type: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };
  assert.equal(getYouTubeWatchUrl(file), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.match(resourceViewer, /getYouTubeWatchUrl\(file\)/);
  assert.match(resourceViewer, /target="_blank"/);
  assert.match(resourceViewer, /ERR_BLOCKED_BY_RESPONSE/);
  assert.match(resourceViewer, /readyTimeout/);
  assert.match(resourceViewer, /standardFallbackUrl/);
});
