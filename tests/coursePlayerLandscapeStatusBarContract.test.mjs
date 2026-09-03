// tests/coursePlayerLandscapeStatusBarContract.test.mjs
//
// Contract for the mobile Course Player status-bar behaviour.
//
// The honest truth (documented in courseStatusBar.ts): the ONLY web API that
// can truly hide the phone's status bar is the Fullscreen API, and Android
// honours it ONLY when the request rides a REAL user gesture. A gesture-less
// request — e.g. right after a physical rotation or from a layout effect —
// is rejected by the browser and the bar stays. That is a browser security
// rule, which is why the old "hide automatically on landscape" behaviour
// never worked on real devices.
//
// So hiding is never automatic: the learner hides/restores the bar with the
// explicit "Hide status bar" rail button (Android only). Whatever the learner
// did, the chrome is restored the moment the player leaves landscape or
// unmounts.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const player = fs.readFileSync("src/CoursePlayerApp.tsx", "utf8");
const playerPanel = fs.readFileSync("src/course/PlayerPanel.tsx", "utf8");
const statusBar = fs.readFileSync("src/utils/courseStatusBar.ts", "utf8");

test("status bar hiding is an explicit Player-tab row because auto-hide cannot be gesture-less", () => {
  // Android-only switch: iOS can never hide the bar and desktop browsers
  // don't need to. The control is the "Hide status bar" Glass Switch row of
  // the footer dock's Player tab — still a real user gesture per flip.
  assert.match(player, /isMobileDevice\(\) && !isIOSDevice\(\)/);
  assert.match(playerPanel, /canFullscreen \? settingsRow\("Hide status bar", courseFullscreen/);
  assert.match(player, /canFullscreen=\{canFullscreen\}/);
  // The switch toggles true fullscreen through the Player tab — one flip to
  // hide, one to restore.
  assert.match(
    player,
    /if \(next\) enterCoursePlayerFullscreen\(\);\s*else exitCoursePlayerFullscreen\(\);/,
  );
});

test("the Player-tab row mirrors the live document fullscreen state", () => {
  // Swipe-down / Escape exits on Android flip the switch back without a tap.
  assert.match(
    player,
    /const \[courseFullscreen, setCourseFullscreen\] = useState<boolean>\(\(\) => isCoursePlayerFullscreen\(\)\)/,
  );
  assert.match(player, /onCourseFullscreenChange\(sync\)/);
  // The settings row mirrors the live state the same way the old button did.
  assert.match(playerPanel, /settingsRow\("Hide status bar", courseFullscreen, \(next\) => onHideStatusBarChange\(next\), "fullscreen"\)/);
  assert.match(player, /courseFullscreen=\{courseFullscreen\}/);
});

test("no gesture-less automatic hide is left (Android rejects it anyway)", () => {
  // The old landscape-entry effect requested fullscreen without a gesture —
  // the browser blocked it, so it was dead weight that pretended to hide.
  assert.doesNotMatch(player, /if \(isLandscape \|\| immersive\) \{\s*enterCourseLandscapeChrome/);
  // No first-touch auto-fullscreen listeners either.
  assert.doesNotMatch(player, /addEventListener\("pointerdown"/);
  assert.doesNotMatch(player, /addEventListener\("touchstart"/);
});

test("the rotate-to-fullscreen tap was removed; the Player-tab switch is the only fullscreen path", () => {
  // The header rotate button, its quarter-turned immersive entry and the
  // whole header itself are gone. The Android "Hide status bar" switch in
  // the Player tab is now the sole fullscreen gesture path.
  assert.doesNotMatch(player, /data-course-rotate-fullscreen/);
  assert.doesNotMatch(player, /setImmersive\(/);
  assert.doesNotMatch(player, /enterCourseLandscapeChrome/);
  assert.doesNotMatch(player, /data-course-landscape-header/);
});

test("the landscape shell reports the live bar state for QA/integration", () => {
  // The attribute mirrors the real fullscreen state instead of claiming a
  // static hide.
  assert.match(player, /"data-course-statusbar-hidden": courseFullscreen \? "true" : "false"/);
});

test("status bar hiding combines fullscreen with a blended theme-color", () => {
  assert.match(statusBar, /requestFullscreen/);
  assert.match(statusBar, /exitFullscreen/);
  assert.match(statusBar, /black-translucent/);
  assert.match(statusBar, /setThemeColor/);
  assert.match(statusBar, /\(pointer: coarse\)/);
  assert.match(statusBar, /navigator\.maxTouchPoints/);
  // navigationUI: "hide" makes Android's fullscreen immersive — the gesture
  // navigation bar goes too.
  assert.match(statusBar, /navigationUI: "hide"/);
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
