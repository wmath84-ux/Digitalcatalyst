// tests/coursePlayerSplitLandscapeGuardContract.test.mjs
//
// REGRESSION GUARD for the landscape player, written while the Split Deck went
// in. The owner confirmed the landscape rail layout, the rotation unlock and
// the status-bar colour sync all worked before this redesign — so they are not
// a redesign target, they are a fence. Every assertion here is a piece of the
// landscape contract that must survive ANY future player work, plus the three
// places where the Split Deck is allowed to touch it:
//
//   · the left header rail stays on the left, and the split region is
//     everything right of it;
//   · the divider turns VERTICAL in landscape (lesson left, study right);
//   · the footer dock lives in the study pane instead of the section bottom.

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
// 2. The left header rail — geometry, safe areas and content
// ---------------------------------------------------------------------------

test("The landscape header rail keeps its safe-area width calc", () => {
  assert.match(coursePlayer, /width: "calc\(3\.5rem \+ env\(safe-area-inset-left, 0px\)\)"/);
  assert.match(coursePlayer, /paddingLeft: "env\(safe-area-inset-left, 0px\)"/);
  assert.match(coursePlayer, /paddingTop: "calc\(0\.5rem \+ env\(safe-area-inset-top, 0px\)\)"/);
  assert.match(coursePlayer, /paddingBottom: "calc\(0\.5rem \+ env\(safe-area-inset-bottom, 0px\)\)"/);
  assert.match(coursePlayer, /data-course-landscape-header/);
});

test("The rail still carries the title, the progress rail and the badges", () => {
  assert.match(coursePlayer, /\[writing-mode:vertical-rl\] rotate-180" data-course-product-title/);
  assert.match(coursePlayer, /const progressRail = \(/);
  assert.match(coursePlayer, /orientation="vertical"/);
  assert.match(coursePlayer, /data-course-subscription-badge="active" className="shrink-0 rounded-full bg-violet-500\/20 px-1\.5 py-2/);
  assert.match(coursePlayer, /data-course-preview-badge className="shrink-0 rounded-full bg-sky-500\/15 px-1\.5 py-2/);
  // Mark complete + ⚙ settings live in the rail, popover opening to the right.
  assert.match(coursePlayer, /\{markCompleteButton\(true\)\}/);
  assert.match(coursePlayer, /\{settingsPopover\("right"\)\}/);
});

test("The landscape content section keeps its hook and the vertical scroll rule", () => {
  assert.match(coursePlayer, /data-course-landscape-content/);
  assert.match(coursePlayer, /data-course-landscape-scroll="vertical"/);
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

test("Fullscreen entry/exit stays behind the settings row and the shell hook", () => {
  assert.match(coursePlayer, /if \(next\) enterCoursePlayerFullscreen\(\);\s*\n\s*else exitCoursePlayerFullscreen\(\);/);
  assert.match(coursePlayer, /data-course-statusbar-hidden=\{courseFullscreen \? "true" : "false"\}/);
  assert.match(statusBar, /export const enterCoursePlayerFullscreen = \(\): void =>/);
  assert.match(statusBar, /export const exitCoursePlayerFullscreen = \(\): void =>/);
});

test("Hiding the player chrome still leaves a way back", () => {
  assert.match(coursePlayer, /data-course-chrome-restore/);
  assert.match(coursePlayer, /Show bars/);
  assert.match(coursePlayer, /const chromeRestoreButton = playerChromeHidden \? \(/);
});

// ---------------------------------------------------------------------------
// 4. Where the Split Deck is allowed to change landscape
// ---------------------------------------------------------------------------

test("In landscape split the rail stays left and the divider goes vertical", () => {
  // The deck is rendered INSIDE the landscape content section, right of the
  // rail — the rail itself is untouched by the split.
  assert.match(coursePlayer, /data-course-landscape-content[\s\S]*?splitDeck\("row", "landscape"\)/);
  // axis "row" = lesson left / study right, and the separator advertises a
  // vertical orientation to assistive tech.
  assert.match(studyPanels, /aria-orientation=\{row \? "vertical" : "horizontal"\}/);
  assert.match(studyPanels, /const row = axis === "row";/);
  // The study pane is measured from the RIGHT edge in landscape.
  assert.match(studyPanels, /\(\(rect\.right - clientX\) \/ Math\.max\(1, rect\.width\)\) \* 100/);
});

test("In landscape split the dock moves into the study pane", () => {
  assert.match(overlay, /data-in-split=\{pane \? "true" : "false"\}/);
  // The sheet's bounds are only measured while the sheet variant is up, so the
  // landscape rail's right edge is still the sheet's left bound when split is
  // OFF.
  assert.match(overlay, /left: landscape \? Math\.round\(headerRect \? headerRect\.right : 0\) : 0/);
  assert.match(overlay, /if \(pane\) return undefined;/);
  // The deck's pane is a plain in-flow flex child of the split region.
  assert.match(studyPanels, /data-course-study-pane=""/);
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
