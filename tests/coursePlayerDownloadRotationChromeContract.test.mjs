// tests/coursePlayerDownloadRotationChromeContract.test.mjs
//
// Contract for four Course Player behaviours:
//
//   1. Downloads land in the file's EXACT / native format (a Google Doc
//      arrives as .docx, not flattened to PDF) with a correct extension.
//   2. Scrolling inside the rotated ("immersive") mobile view follows the
//      axis the user actually sees, instead of the browser's screen-space
//      guess which made a horizontal swipe scroll the wrong way.
//   3. A desktop/mobile switch beside the theme toggle re-renders embedded
//      documents at phone width so they are readable on a phone.
//   4. Two separate chrome toggle buttons sit in the header (and the
//      landscape rail): one hides the file's own header + mark-complete
//      footer, the other hides the Course Player's own header + dock.
//      Content takes the freed space, and there is always a way back.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const coursePlayer = readSource("src/CoursePlayerApp.tsx");
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
  assert.match(resourceViewer, /download=\{download\.downloadable \? download\.fileName : undefined\}/);
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

test("A desktop/mobile switch sits beside the theme toggle", () => {
  // Both preferences are rows of the one ⚙ Player settings popover now —
  // every former header quick-toggle lives there.
  assert.match(coursePlayer, /settingsRow\("Desktop view", desktopView, \(next\) => setDesktopView\(next\), "viewport"\)/);
  assert.match(coursePlayer, /settingsRow\("Light theme", theme === "light"/);
  // Only meaningful for documents — a video looks the same either way. The
  // list is shared with the viewer so both sides can never drift apart.
  assert.match(coursePlayer, /const showViewportToggle = VIEWPORT_AWARE_KINDS\.includes\(selectedEmbedKind\)/);
  assert.match(courseEmbed, /export const VIEWPORT_AWARE_KINDS: CourseEmbedKind\[\] = \["doc", "sheet", "slides", "form", "drive", "pdf", "embed", "mindmap"\]/);
  // The preference is remembered.
  assert.match(coursePlayer, /dc\.coursePlayerDesktopView/);
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

test("Two separate toggle buttons hide the file bars and the player chrome", () => {
  // One settings row hides the file's own header/footer, the other hides the
  // Course Player's header + dock — each is an independent Glass Switch in
  // the ⚙ popover (rendered in both the portrait header and landscape rail).
  assert.match(coursePlayer, /settingsRow\("File bars", !fileBarsHidden, \(next\) => setFileBarsHidden\(!next\), "file-bars"\)/);
  assert.match(coursePlayer, /settingsRow\("Player bars", !playerChromeHidden, \(next\) => setPlayerChromeHidden\(!next\), "player-chrome"\)/);
  assert.match(coursePlayer, /settingsPopover\("bottom"\)/);
  assert.match(coursePlayer, /settingsPopover\("right"\)/);
});

test("Hiding the file bars removes the download header and the complete footer", () => {
  assert.match(coursePlayer, /chromeHidden=\{fileBarsHidden\}/);
  assert.match(resourceViewer, /\{chromeHidden \? null : \(\s*<ViewerHeader/);
});

test("Hiding the player chrome removes the course header and the dock", () => {
  // Both the portrait header and the landscape rail are gated.
  assert.ok((coursePlayer.match(/\{playerChromeHidden \? null : \(/g) || []).length >= 2, "header not gated in both layouts");
  assert.ok((coursePlayer.match(/\{playerChromeHidden \? null : overlay\}/g) || []).length >= 2, "dock not gated in both layouts");
});

test("The two hides are independent and always reversible", () => {
  // File bars start HIDDEN for mobile users (both portrait and landscape) so
  // the content keeps the full screen; desktop users still see them. Either
  // way the same toggle flips the state, so it stays fully reversible.
  assert.match(coursePlayer, /const \[fileBarsHidden, setFileBarsHidden\] = useState<boolean>\(\(\) => isMobileDevice\(\)\)/);
  assert.match(coursePlayer, /const \[playerChromeHidden, setPlayerChromeHidden\] = useState\(false\)/);
  // A floating pill is the way back once the header itself is gone.
  assert.match(coursePlayer, /data-course-chrome-restore/);
  // Escape restores everything.
  assert.match(coursePlayer, /if \(playerChromeHidden \|\| fileBarsHidden\) \{ setPlayerChromeHidden\(false\); setFileBarsHidden\(false\); \}/);
  // Each preference is a Glass Switch row that reflects its state.
  assert.match(coursePlayer, /data-course-setting=\{attr\}/);
  assert.match(coursePlayer, /GlassSwitch checked=\{checked\} onCheckedChange=\{onChange\}/);
});
