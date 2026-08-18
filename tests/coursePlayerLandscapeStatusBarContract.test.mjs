// tests/coursePlayerLandscapeStatusBarContract.test.mjs
//
// Contract for the mobile Course Player status-bar behaviour: in landscape
// (physical or quarter-turned immersive) mode the phone's status bar is
// hidden BY DEFAULT with no user-facing toggle, and restored the moment the
// player leaves landscape or unmounts.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const player = fs.readFileSync("src/CoursePlayerApp.tsx", "utf8");
const statusBar = fs.readFileSync("src/utils/courseStatusBar.ts", "utf8");

test("mobile landscape hides the status bar automatically, with no user toggle", () => {
  assert.match(player, /enterCourseLandscapeChrome/);
  assert.match(player, /restoreStatusBarFromCoursePlayer/);
  assert.match(player, /if \(isLandscape \|\| immersive\)/);
  // The hide is default behaviour, not an opt-in: there is no toggle,
  // switch or label anywhere that lets the learner keep the bar.
  assert.doesNotMatch(player, /hide status bar/i);
  assert.doesNotMatch(player, /data-course-toggle-status/);
});

test("the hide rides the rotate tap so true fullscreen is gesture-granted", () => {
  // The "Rotate to fullscreen" button calls the hide synchronously inside
  // the click handler, then flips immersive state.
  assert.match(player, /onClick=\{\(\) => \{[\s\S]*?enterCourseLandscapeChrome\(courseBackgroundForStatusBar\);[\s\S]*?setImmersive\(true\);[\s\S]*?\}\}/);
});

test("both landscape shells declare the bar as hidden for QA/integration", () => {
  assert.match(player, /data-course-statusbar-hidden="true"/);
  assert.match(player, /data-course-mobile-landscape-viewport data-course-statusbar-hidden="true"/);
});

test("status bar hiding combines fullscreen with a blended theme-color", () => {
  assert.match(statusBar, /requestFullscreen/);
  assert.match(statusBar, /exitFullscreen/);
  assert.match(statusBar, /black-translucent/);
  assert.match(statusBar, /setThemeColor/);
  assert.match(statusBar, /\(pointer: coarse\)/);
  assert.match(statusBar, /navigator\.maxTouchPoints/);
});

test("the bar is restored when leaving landscape or unmounting the player", () => {
  assert.match(player, /return \(\) => restoreStatusBarFromCoursePlayer\(\)/);
  assert.match(player, /useEffect\(\(\) => \(\) => restoreStatusBarFromCoursePlayer\(\), \[\]\)/);
  // Only exits fullscreen that the player itself entered.
  assert.match(statusBar, /fullscreenEnteredByPlayer && document\.fullscreenElement/);
});

test("theme flips while in landscape only re-blend the bar colour", () => {
  assert.match(player, /syncCourseLandscapeChromeColor/);
  assert.match(statusBar, /landscapeChromeActive/);
});
