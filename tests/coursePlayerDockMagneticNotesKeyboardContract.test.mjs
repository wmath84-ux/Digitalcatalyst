// tests/coursePlayerDockMagneticNotesKeyboardContract.test.mjs
//
// Contract for four Course Player improvements:
//
//   1. DRAGGABLE, MAGNETIC DOCK INDICATOR — the sliding accent pill on the
//      bottom footer can be grabbed and dragged between the four tabs
//      (Module / Resource / Note / Paid). It follows the finger with a
//      magnetic lock near each tab centre, the overlay content swaps LIVE as
//      the pill crosses each tab, and on release it snaps to the nearest tab.
//      Tab buttons stay fully clickable; a tap on the indicator still toggles.
//   2. RESUME LAST OPENED MODULE — reopening any purchased course lands the
//      learner back on the exact module they left off in. (The resume guard
//      is covered in coursePlayerUx.test.mjs; this file asserts the helper.)
//   3. DOCK FLUID + GLOW — the footer gets the same breathing "magic" glow as
//      the home-page footer plus a slow liquid sheen that drifts inside the
//      capsule.
//   4. LANDSCAPE NOTES SPLIT IS KEYBOARD-AWARE — in landscape the lesson and
//      the notes editor stay side by side (60/40); when the soft keyboard
//      rises the editor shrinks to sit above it instead of being hidden.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const overlay = readSource("src/course/CourseOverlay.tsx");
const coursePlayer = readSource("src/CoursePlayerApp.tsx");
const styles = readSource("src/index.css");

// ---------------------------------------------------------------------------
// 1. Draggable, magnetic dock indicator
// ---------------------------------------------------------------------------

test("The dock exposes a dedicated grab handle over the active slot", () => {
  assert.match(overlay, /data-course-dock-handle/);
  // The handle is the grab affordance and disables browser panning while
  // dragging so the indicator is the only thing that moves.
  assert.match(overlay, /touch-none cursor-grab active:cursor-grabbing/);
});

test("Dragging uses pointer capture so the finger can wander off the pill", () => {
  assert.match(overlay, /onHandlePointerDown = \(event: ReactPointerEvent<HTMLSpanElement>\)/);
  assert.match(overlay, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  assert.match(overlay, /releasePointerCapture\?\.\(event\.pointerId\)/);
});

test("The indicator follows the finger through a magnetic easing curve", () => {
  // Near a tab centre (within the band) it locks; outside it follows ~1:1.
  assert.match(overlay, /const DOCK_MAGNETIC_BAND = 0\.18/);
  assert.match(overlay, /if \(adist <= DOCK_MAGNETIC_BAND\) return nearest;/);
  // The displayed position is the magnetic curve while dragging, the active
  // index at rest.
  assert.match(overlay, /const displayedIndex = dragging \? magneticIndex\(dragIndex as number\) : activeIndex;/);
  // Both the visual indicator and the handle ride on displayedIndex.
  assert.match(overlay, /translateX\(\$\{displayedIndex \* 100\}%\)/);
  assert.match(overlay, /data-display-index=\{displayedIndex\.toFixed\(3\)\}/);
});

test("The overlay content swaps LIVE as the pill is dragged across tabs", () => {
  // In the move handler, the moment the rounded position changes the tab is
  // switched immediately — no waiting for release.
  assert.match(overlay, /const nearest = Math\.round\(raw\);/);
  assert.match(overlay, /if \(key && nearest !== activeIndex\) props\.onTabChange\(key\);/);
});

test("On release the pill magnetically snaps to the nearest tab", () => {
  // The release handler rounds the live fractional position to the nearest
  // tab and commits it.
  assert.match(overlay, /const snapped = current == null \? activeIndex : Math\.round\(current\);/);
  assert.match(overlay, /if \(key && snapped !== activeIndex\) props\.onTabChange\(key\);/);
});

test("A pure tap on the indicator still behaves like tapping the active tab", () => {
  // The handle covers the active slot, so a tap (no movement) must forward to
  // the active-tab toggle instead of stealing the original button behaviour.
  assert.match(overlay, /if \(!st\.moved\) \{/);
  assert.match(overlay, /const key = TABS\[activeIndex\]\?\.key;/);
});

test("The other three tab buttons stay fully clickable", () => {
  // The grab handle overlays ONLY the active quarter, so the remaining tabs'
  // onClick keeps firing. The buttons keep their data hook + click wiring.
  assert.match(overlay, /data-course-dock-tab/);
  assert.match(overlay, /onClick=\{\(\) => props\.onTabChange\(key\)\}/);
});

// ---------------------------------------------------------------------------
// 2. Resume last opened module — the owning-module helper
// ---------------------------------------------------------------------------

test("Resume finds the module that directly owns a file and re-checks access", () => {
  // Files never carried a parentModuleId, so the helper walks the tree itself.
  assert.match(coursePlayer, /const owningModuleForFile = \(modules: CourseModule\[\], fileId: string\)/);
  assert.match(coursePlayer, /filesInModule\(module\)\.some\(\(file\) => file\.id === fileId\)/);
  // The resume path re-validates the owning module's accessibility and the
  // file's paid-update ownership before reopening it.
  assert.match(coursePlayer, /const moduleAccessible = owner \? resolution\.accessibleModuleIds\.has\(String\(owner\.id\)\) : true;/);
  assert.match(coursePlayer, /const filePaidLocked = match\.accessLevel === "paidUpdate"/);
});

test("A manual navigation flags the selection so resume never clobbers it", () => {
  assert.match(coursePlayer, /const userSelectedRef = useRef\(false\);/);
  assert.match(coursePlayer, /userSelectedRef\.current = true;/);
  assert.match(coursePlayer, /userSelectedRef\.current\) return;/);
});

// ---------------------------------------------------------------------------
// 3. Dock fluid sheen + breathing glow
// ---------------------------------------------------------------------------

test("The dock pill has a slow drifting fluid sheen inside the capsule", () => {
  assert.match(styles, /\.dc-dock-fluid\s*\{/);
  assert.match(styles, /@keyframes dc-dock-fluid \{/);
  // The sheen is painted behind the indicator + buttons (z-index 0) so it
  // never washes out an icon.
  assert.match(styles, /\.dc-dock-fluid \{[\s\S]*?z-index: 0;/);
  // Rendered as the first child of the dock pill.
  assert.match(overlay, /<span className="dc-dock-fluid" aria-hidden="true" \/>/);
});

test("The dock's resting glow is tuned brighter so the breathe reads on the dark stage", () => {
  assert.match(styles, /\[data-course-dock\] \.dc-footer-glow \{/);
  assert.match(styles, /opacity: calc\(0\.55 \+ var\(--dc-footer-glow, 0\) \* 0\.45\)/);
  // The dock still reuses the shared footer glow + pill classes.
  assert.match(overlay, /data-course-dock[\s\S]*?dc-footer-glow/);
  assert.match(overlay, /dc-footer-pill/);
});

test("The active pill glows harder while it is being dragged", () => {
  assert.match(styles, /\[data-course-dock-indicator\]\[data-dragging="true"\] > span \{/);
  assert.match(overlay, /data-dragging=\{dragging \? "true" : "false"\}/);
});

// ---------------------------------------------------------------------------
// 4. Landscape notes split is keyboard-aware
// ---------------------------------------------------------------------------

test("The overlay measures the soft-keyboard height from the visual viewport", () => {
  assert.match(overlay, /const \[keyboardInset, setKeyboardInset\] = useState\(0\);/);
  assert.match(overlay, /window\.visualViewport/);
  assert.match(overlay, /setKeyboardInset\(Math\.max\(0, Math\.round\(\(window\.innerHeight \?\? 0\) - vv\.height - vv\.offsetTop\)\)\)/);
});

test("While the keyboard is up over the notes editor the sheet lifts above it", () => {
  assert.match(overlay, /const keyboardActive = tab === "notes" && notesEditorOpen && keyboardInset > 0;/);
  // The sheet reserves the keyboard height at its bottom edge (landscape uses
  // the raw inset; portrait keeps at least the 4rem dock clearance).
  assert.match(overlay, /bottom: landscape \? `\$\{keyboardInset\}px` : `\$\{Math\.max\(64, keyboardInset\)\}px`/);
});

test("The landscape split keeps lesson + notes side by side (60/40)", () => {
  assert.match(coursePlayer, /basis-\[calc\(60%-4rem\)\]/);
  assert.match(overlay, /const splitEditorWidth = "min\(40%, 520px\)"/);
  assert.match(overlay, /onSplitModeChange/);
});
