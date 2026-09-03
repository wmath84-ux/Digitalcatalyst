// tests/coursePlayerDownloadRotationChromeContract.test.mjs
//
// Contract for four Course Player behaviours:
//
//   1. Downloads land in the file's EXACT / native format (a Google Doc
//      arrives as .docx, not flattened to PDF) with a correct extension.
//   2. Scrolling inside the rotated ("immersive") mobile view follows the
//      axis the user actually sees, instead of the browser's screen-space
//      guess which made a horizontal swipe scroll the wrong way.
//   3. Desktop/mobile view is a Player-tab preference (the Player tab is
//      the dock's 6th tab that replaced the whole header + ⚙ settings
//      popover): it re-renders embedded documents at phone width.
//   4. The old chrome (header, file bar, complete footer, hide toggles,
//      ⚙ popover) is GONE — there is no header anywhere, and nothing left
//      to hide.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const coursePlayer = readSource("src/CoursePlayerApp.tsx");
const playerPanel = readSource("src/course/PlayerPanel.tsx");
const resourceViewer = readSource("src/course/ResourceViewer.tsx");
const courseEmbed = readSource("src/utils/courseEmbed.ts");
const rotatedScroll = readSource("src/course/useRotatedScroll.ts");
const styles = readSource("src/index.css");

// ---------------------------------------------------------------------------
// 1. Downloads keep the exact format
// ---------------------------------------------------------------------------

test("Google files export to their own native format, not PDF", () => {
  assert.match(courseEmbed, /document\/d\/\$\{google\.id\}\/export\?format=docx/);
  assert.match(courseEmbed, /spreadsheets\/d\/\$\{google\.id\}\/export\?format=xlsx/);
  assert.match(courseEmbed, /presentation\/d\/\$\{google\.id\}\/export\/pptx/);
  // The old behaviour flattened Docs and Slides into PDF.
  assert.doesNotMatch(courseEmbed, /document\/d\/\$\{google\.id\}\/export\?format=pdf/);
  assert.doesNotMatch(courseEmbed, /presentation\/d\/\$\{google\.id\}\/export\/pdf/);
});

test("Every download carries a filename with the matching extension", () => {
  assert.match(courseEmbed, /export const downloadFileName/);
  assert.match(courseEmbed, /export interface CourseDownload/);
  assert.match(courseEmbed, /extension: string;/);
  assert.match(courseEmbed, /fileName: string;/);
  // Extension comes from the URL for direct files.
  assert.match(courseEmbed, /const urlExtension/);
  // …and an existing extension is never duplicated.
  assert.match(courseEmbed, /const baseName = \(name: string\) =>/);
  assert.match(courseEmbed, /replace\(\/\\\.\[a-z0-9\]\{1,8\}\$\/i, ""\)/);
  // The viewer downloads under that exact name.
  assert.match(playerPanel, /downloadableFileName=\{fileActions\.download\.downloadable \? fileActions\.download\.fileName : undefined\}/);
});

// ---------------------------------------------------------------------------
// 2. Rotated-view scrolling
// ---------------------------------------------------------------------------

test("The rotated view drives scrolling itself instead of letting the browser guess", () => {
  assert.match(rotatedScroll, /export function useRotatedScroll/);
  // The visible finger axis wins: up/down changes scrollTop and left/right is
  // reserved for a genuinely horizontal scroller. A horizontal swipe must no
  // longer be required to move a vertical module/notes list.
  assert.match(rotatedScroll, /target\.scrollTop -= dsy/);
  assert.match(rotatedScroll, /target\.scrollLeft -= dsx/);
  assert.match(rotatedScroll, /Math\.abs\(dsy\) >= Math\.abs\(dsx\)/);
  // Only genuinely scrollable ancestors are targeted.
  assert.match(rotatedScroll, /const scrollableAncestor/);
  // A small movement must not steal taps from buttons.
  assert.match(rotatedScroll, /SLOP/);
  // pointermove has to be cancelable to suppress native panning.
  assert.match(rotatedScroll, /"pointermove", onPointerMove, \{ passive: false \}/);
});

test("the rotate-to-fullscreen button and immersive view are removed", () => {
  // The rotation button was removed from the header and its quarter-turned
  // immersive view (plus the enter/exit logic) is gone entirely.
  assert.doesNotMatch(coursePlayer, /data-course-rotate-fullscreen/);
  assert.doesNotMatch(coursePlayer, /setImmersive\(/);
  assert.doesNotMatch(coursePlayer, /enterCourseLandscapeChrome/);
  assert.doesNotMatch(coursePlayer, /RotateCw/);
  assert.doesNotMatch(coursePlayer, /useRotatedScroll\(immersiveRootRef/);
  assert.doesNotMatch(coursePlayer, /data-course-rotated-scroll="active"/);
  assert.doesNotMatch(coursePlayer, /course-rotated-surface/);
});

// ---------------------------------------------------------------------------
// 3. Desktop <-> mobile document view
// ---------------------------------------------------------------------------

test("Desktop/mobile view is one Player-tab preference, gated on the active embed", () => {
  // The row only renders while the ACTIVE file's embed kind is
  // viewport-aware — for YouTube / video / audio viewers it disappears.
  assert.match(playerPanel, /settingsRow\("Desktop view", desktopView, \(next\) => onDesktopViewChange\(next\), "viewport"\)/);
  assert.match(playerPanel, /data-course-setting=\{attr\}/);
  assert.match(coursePlayer, /showViewportToggle = VIEWPORT_AWARE_KINDS\.includes\(selectedEmbedKind\)/);
  assert.match(coursePlayer, /selectedEmbedKind = selectedFile \? getCourseEmbed\(selectedFile\)\.kind : "none"/);
  // The choice flows straight into the viewers; every embed URL is rebuilt
  // with the matching viewport, so a flip re-renders the document.
  assert.match(coursePlayer, /desktopView=\{desktopView\}/);
  assert.match(resourceViewer, /getCourseEmbed\(file, \{ viewport: desktopView \? "desktop" : "mobile"/);
  assert.match(courseEmbed, /options\.viewport === "mobile"/);
  assert.match(courseEmbed, /mobile \? "mobilebasic" : "preview"/);
  // Embedded documents are also marked for the document-mobile switch.
  assert.match(resourceViewer, /const documentKind = VIEWPORT_AWARE_KINDS\.includes\(embed\.kind\);/);
});


test("Mobile view re-renders the embed at phone width", () => {
  assert.match(resourceViewer, /const MOBILE_VIEWPORT_WIDTH = 420/);
  assert.match(resourceViewer, /mobileDocument\?: boolean;/);
  // Narrow the frame so the host serves its mobile layout, then scale it
  // back up to fill the stage.
  assert.match(resourceViewer, /width: `\$\{MOBILE_VIEWPORT_WIDTH\}px`/);
  assert.match(resourceViewer, /transform: `scale\(\$\{mobileScale\}\)`/);
  assert.match(resourceViewer, /transformOrigin: "top left"/);
  // …but only for hosts without a mobile endpoint of their own. Docs /
  // Sheets / Forms load their reflowing mobile page instead, so scaling them
  // again would shrink the very text the switch just made readable.
  assert.match(resourceViewer, /const mobileDocument = documentKind && !desktopView && !hasNativeMobileRendering\(embed\.kind\)/);
  assert.match(resourceViewer, /data-viewport-mode=\{mobileDocument \? "mobile" : "desktop"\}/);
});

// ---------------------------------------------------------------------------
// 4. Two separate chrome toggle buttons
// ---------------------------------------------------------------------------

test("The player chrome hide toggles are gone — there IS no chrome to hide", () => {
  // No course header, no file bar, no footer complete row, no popover: the
  // whole old chrome layer was deleted along with the toggles that hid it.
  assert.doesNotMatch(coursePlayer, /data-course-filebars-toggle|data-course-chrome-toggle/);
  assert.doesNotMatch(coursePlayer, /settingsRow\("File bars"|settingsRow\("Player bars"/);
  assert.doesNotMatch(coursePlayer, /<CompleteBar/);
  // And none of the old hide flags / chrome keys survive anywhere in src.
  for (const rel of [
    "src/CoursePlayerApp.tsx",
    "src/course/PlayerPanel.tsx",
    "src/course/CourseOverlay.tsx",
    "src/course/ResourceViewer.tsx",
  ]) {
    const source = readSource(rel);
    assert.doesNotMatch(source, /fileBarsHidden/, rel);
    assert.doesNotMatch(source, /courseChromeHidden/, rel);
  }
  // The Player panel keeps exactly ONE hide preference: the status bar.
  assert.match(playerPanel, /Hide status bar/);
});

test("Mark-complete and the active file's actions live in the Player tab", () => {
  // The charging button — gesture, reversal, update arrow and double-tap —
  // is the Player panel's progress row now.
  assert.match(playerPanel, /<ChargingCompleteButton/);
  assert.match(coursePlayer, /isDone=\{isDone\}/);
  assert.match(coursePlayer, /onToggleComplete=\{\(\) => void toggleComplete\(\)\}/);
  // So are the active file's download / open-external / media-fullscreen
  // buttons, reported live by the mounted viewer.
  assert.match(playerPanel, /data-course-viewer-kind/);
  assert.match(playerPanel, /data-course-viewer-download/);
  assert.match(playerPanel, /data-course-viewer-external/);
  assert.match(playerPanel, /data-course-viewer-fullscreen/);
  assert.match(resourceViewer, /onFileActions\(file\.id, \{/);
  assert.match(resourceViewer, /onFileActions\(file\.id, null\)/);
  assert.match(coursePlayer, /onFileActions=\{handleFileActions\}/);
  assert.match(coursePlayer, /fileActions=\{fileActions\?\.model \?\? null\}/);
});

