// tests/coursePlayerSplitLandscapeGuardContract.test.mjs
//
// REGRESSION GUARD for the landscape player, updated 2026-09-03 for the
// headerless, always-split player. The owner confirmed the rotation unlock
// and the status-bar colour sync all worked before this redesign — so those
// are not a redesign target, they are a fence. Every assertion here is a
// piece of the landscape contract that must survive ANY future player work,
// plus the places where the ONE split layout is allowed to look different:
//
//   · there is NO header anywhere anymore — no portrait sticky header and no
//     landscape left rail (owner's direction); the split deck fills the
//     whole shell in both orientations;
//   · the divider turns VERTICAL in landscape (lesson left, study right);
//   · the footer dock lives in the study pane in both orientations.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const coursePlayer = readSource("src/CoursePlayerApp.tsx");
const studyPanels = readSource("src/course/studyPanels.tsx");
const overlay = readSource("src/course/CourseOverlay.tsx");
const styles = readSource("src/index.css");
const statusBar = readSource("src/utils/courseStatusBar.ts");
const appOrientation = readSource("src/utils/appOrientation.ts");

// ---------------------------------------------------------------------------
// 1. Orientation detection + the app-wide rotation unlock
// ---------------------------------------------------------------------------

test("Landscape is detected from the live viewport, not only the media query", () => {
  assert.match(coursePlayer, /const media = window\.matchMedia\("\(orientation: landscape\)"\);/);
  assert.match(coursePlayer, /setIsLandscape\(media\.matches \|\| window\.innerWidth > window\.innerHeight\)/);
  assert.match(coursePlayer, /window\.screen\.orientation\?\.addEventListener\?\.\("change", update\)/);
  assert.match(coursePlayer, /window\.visualViewport\?\.addEventListener\?\.\("resize", update\)/);
  assert.match(coursePlayer, /window\.addEventListener\("orientationchange", update\)/);
  assert.match(coursePlayer, /const useLandscapeRails = isLandscape;/);
});

test("The Course Player is still the only screen that may rotate", () => {
  assert.match(coursePlayer, /enterCoursePlayerRotation\(\);\s*\n\s*return \(\) => exitCoursePlayerRotation\(\);/);
  assert.match(appOrientation, /export const enterCoursePlayerRotation = \(\): void =>/);
  assert.match(appOrientation, /export const exitCoursePlayerRotation = \(\): void =>/);
});

// ---------------------------------------------------------------------------
// 2. No header rail — the split region is the whole player
// ---------------------------------------------------------------------------

test("There is no landscape header rail anymore — the deck fills the shell", () => {
  // Portrait and landscape both render exactly ONE section around the Split
  // Deck; the rail's hooks are gone from the player entirely.
  assert.doesNotMatch(coursePlayer, /data-course-landscape-header/);
  assert.doesNotMatch(coursePlayer, /data-course-header\b/);
  assert.doesNotMatch(coursePlayer, /progressRail/);
  assert.match(coursePlayer, /useLandscapeRails \? "flex-row" : "flex-col"/);
});

test("The landscape content section keeps its hook and the vertical scroll rule", () => {
  assert.match(coursePlayer, /"data-course-landscape-content": ""/);
  assert.match(coursePlayer, /"data-course-landscape-scroll": "vertical"/);
  assert.match(styles, /\[data-course-landscape-scroll="vertical"\][\s\S]*?touch-action: pan-y/);
});

// ---------------------------------------------------------------------------
// 3. Status bar / fullscreen chrome
// ---------------------------------------------------------------------------

test("The landscape chrome colour sync and its restore are untouched", () => {
  assert.match(coursePlayer, /if \(isLandscape\) syncCourseLandscapeChromeColor\(courseBackgroundForStatusBar\);/);
  assert.match(coursePlayer, /return \(\) => restoreStatusBarFromCoursePlayer\(\)/);
  assert.match(coursePlayer, /useEffect\(\(\) => \(\) => restoreStatusBarFromCoursePlayer\(\), \[\]\)/);
  assert.match(statusBar, /export const syncCourseLandscapeChromeColor = \(playerBackground: string\): void =>/);
  assert.match(statusBar, /export const restoreStatusBarFromCoursePlayer = \(\): void =>/);
});

test("Fullscreen entry/exit stays behind the Player-tab row and the shell hook", () => {
  assert.match(coursePlayer, /if \(next\) enterCoursePlayerFullscreen\(\);\s*\n\s*else exitCoursePlayerFullscreen\(\);/);
  assert.match(coursePlayer, /"data-course-statusbar-hidden": courseFullscreen \? "true" : "false"/);
  assert.match(statusBar, /export const enterCoursePlayerFullscreen = \(\): void =>/);
  assert.match(statusBar, /export const exitCoursePlayerFullscreen = \(\): void =>/);
});

test("There is no chrome to hide, so nothing needs a restore button", () => {
  // The "Player bars" / "File bars" hide toggles and the floating restore
  // button went away together with the header and the file bar.
  assert.doesNotMatch(coursePlayer, /data-course-chrome-restore/);
  assert.doesNotMatch(coursePlayer, /playerChromeHidden/);
  assert.doesNotMatch(coursePlayer, /fileBarsHidden/);
  assert.doesNotMatch(coursePlayer, /chromeRestoreButton/);
});

// ---------------------------------------------------------------------------
// 4. Where the Split Deck is allowed to change landscape
// ---------------------------------------------------------------------------

test("In landscape the divider goes vertical (lesson left, study right)", () => {
  // The deck is rendered as the ONLY child of the landscape content section —
  // there is no rail beside it anymore.
  assert.match(coursePlayer, /"data-course-landscape-content": ""[\s\S]*?<SplitDeck/);
  assert.match(coursePlayer, /axis=\{useLandscapeRails \? "row" : "column"\}/);
  // axis "row" = lesson left / study right, and the separator advertises a
  // vertical orientation to assistive tech.
  assert.match(studyPanels, /aria-orientation=\{row \? "vertical" : "horizontal"\}/);
  assert.match(studyPanels, /const row = axis === "row";/);
  // The study pane is measured from the RIGHT edge in landscape.
  assert.match(studyPanels, /\(\(rect\.right - clientX\) \/ Math\.max\(1, rect\.width\)\) \* 100/);
});

test("The dock lives inside the study pane in both orientations", () => {
  assert.match(overlay, /data-in-split="true"/);
  // The deck's pane is a plain in-flow flex child of the split region.
  assert.match(studyPanels, /data-course-study-pane=""/);
  assert.match(studyPanels, /data-course-study-pane=""[\s\S]*?\{study\}/);
});

test("Rotation mid-session keeps the deck's identity and its stored layout", () => {
  // The lesson pane is the same viewer stack before and after a rotation — the
  // deck only re-reads the other axis's stored ratio.
  assert.match(studyPanels, /\}, \[axis, courseId, floor\]\);/);
  assert.match(studyPanels, /loadSplitRatio\(courseId, axis, floor\)/);
  assert.match(studyPanels, /loadSplitCollapsed\(courseId, axis\)/);
  // The divider's line redraws along the new axis instead of stretching.
  assert.match(studyPanels, /key=\{axis\}/);
  assert.match(studyPanels, /initial=\{row \? \{ scaleY: 0, scaleX: 1 \} : \{ scaleX: 0, scaleY: 1 \}\}/);
});
