import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { getCourseEmbed, getYouTubeWatchUrl } from "../src/utils/courseEmbed.ts";

const coursePlayer = fs.readFileSync("src/CoursePlayerApp.tsx", "utf8");
const playerPanel = fs.readFileSync("src/course/PlayerPanel.tsx", "utf8");
const resourceViewer = fs.readFileSync("src/course/ResourceViewer.tsx", "utf8");
const courseEmbed = fs.readFileSync("src/utils/courseEmbed.ts", "utf8");
const styles = fs.readFileSync("src/index.css", "utf8");

test("The Player tab exposes a persisted light/dark theme toggle", () => {
  // The toggle is the FIRST "Light theme" Glass Switch row of the Player
  // tab's settings section (the old header quick-button is long gone, and
  // the header itself is gone too — owner's direction).
  assert.match(playerPanel, /settingsRow\("Light theme", theme === "light", \(next\) => onThemeChange\(next \? "light" : "dark"\), "theme"\)/);
  assert.match(playerPanel, /data-course-theme=\{theme\}/);
  assert.match(coursePlayer, /onThemeChange=\{\(next\) => setTheme\(next\)\}/);
  assert.match(coursePlayer, /dc\.coursePlayerTheme/);
  assert.match(coursePlayer, /localStorage\.setItem\(courseThemeStorageKey, theme\)/);
});

test("Course Player theme is scoped and supplies both palette variants", () => {
  assert.match(styles, /\.course-player-shell\s*\{/);
  assert.match(styles, /\.course-player-shell\[data-course-theme="light"\]/);
  for (const variable of ["--course-bg", "--course-surface", "--course-panel", "--course-text", "--course-muted", "--course-border"]) {
    assert.match(styles, new RegExp(variable), `missing ${variable}`);
  }
});

test("landscape flips the single split deck into a row — no header rails", () => {
  assert.match(coursePlayer, /const useLandscapeRails = isLandscape;/);
  assert.match(coursePlayer, /orientation=\{useLandscapeRails \? "landscape" : "portrait"\}/);
  assert.match(coursePlayer, /axis=\{useLandscapeRails \? "row" : "column"\}/);
  assert.match(coursePlayer, /useLandscapeRails \? "flex-row" : "flex-col"/);
  // There is no header, portrait or landscape.
  assert.doesNotMatch(coursePlayer, /data-course-landscape-header/);
  assert.doesNotMatch(coursePlayer, /data-course-header\b/);
  assert.doesNotMatch(coursePlayer, /landscapeLayout\(\)/);
  // The quarter-turned immersive ("rotated") view and its exit button were
  // removed along with the header's rotate-to-fullscreen button.
  assert.doesNotMatch(coursePlayer, /data-course-mobile-landscape-header/);
  assert.doesNotMatch(coursePlayer, /data-course-exit-immersive/);
  assert.doesNotMatch(coursePlayer, /setImmersive\(/);
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
