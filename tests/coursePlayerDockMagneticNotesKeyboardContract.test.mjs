// tests/coursePlayerDockMagneticNotesKeyboardContract.test.mjs
//
// Contract for the Course Player footer + sheet redesign (owner's direction):
//
//   1. SIMPLE HOME-STYLE FOOTER — the course player's footer navigation is
//      the EXACT home page footer navigation (src/components/glass-dock/
//      GlassDock.tsx, the same component src/components/BottomNav.tsx uses):
//      same frosted panel, entrance spring, magnification, tinted plates,
//      tooltips. The old draggable magnetic pill, grab handle, live content
//      swap on slide and landscape split are REMOVED.
//   2. RESUME LAST OPENED MODULE — reopening any purchased course lands the
//      learner back on the exact module they left off in. (The resume guard
//      is covered in coursePlayerUx.test.mjs; this file asserts the helper.)
//   3. RIGHT-SIDE GLASS SHEET — the overlay is the websiteglass Glass Sheet
//      (https://websiteglass.com/docs/components/glass-sheet), right side,
//      opening ONLY in the window between the player header and the footer
//      dock (measured `bounds` inset both the sheet and its scrim), so it
//      never overlaps either.
//   4. SCROLL-RELEASE CLICK LIST — inside the sheet, list tabs render a
//      vertical column of dock-style buttons, scroll-snapped: scroll and
//      lift the finger and the button the finger settled on (closest to the
//      list centre) is clicked.

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
const bottomNav = readSource("src/components/BottomNav.tsx");
const glassSheet = readSource("src/components/ui/glass-sheet.tsx");

// ---------------------------------------------------------------------------
// 1. Simple home-style footer navigation
// ---------------------------------------------------------------------------

test("The course footer IS the home footer component (same GlassDock)", () => {
  // The overlay imports the exact dock the home page renders…
  assert.match(overlay, /import GlassDock, \{ type GlassDockItem \} from "\.\.\/components\/glass-dock\/GlassDock"/);
  // …and mounts it the same way BottomNav does (site footer variant).
  assert.match(overlay, /<GlassDock[\s\S]*?siteFooter[\s\S]*?items=\{dockItems\}[\s\S]*?onSelect=\{\(id\) => props\.onTabChange\(id as DockTab\)\}/);
  assert.match(bottomNav, /<GlassDock\s+siteFooter/);
});

test("The dock tabs keep their data hooks and select through onTabChange", () => {
  assert.match(overlay, /data-course-dock/);
  assert.match(overlay, /"data-course-dock-tab": ""/);
  assert.match(overlay, /"data-tab": key/);
});

test("The old slide/drag machinery is gone (no magnetic pill, no live swap)", () => {
  // Draggable indicator + grab handle
  assert.doesNotMatch(overlay, /data-course-dock-handle/);
  assert.doesNotMatch(overlay, /data-course-dock-indicator/);
  assert.doesNotMatch(overlay, /magneticIndex/);
  assert.doesNotMatch(overlay, /DOCK_MAGNETIC_BAND/);
  // Live content swap while the finger slides across the dock
  assert.doesNotMatch(overlay, /onHandlePointerDown/);
  assert.doesNotMatch(overlay, /onDockPointerDown/);
  // Landscape split mode (60/40 lesson + panel, edge reopen handle)
  assert.doesNotMatch(overlay, /data-course-split-handle/);
  assert.doesNotMatch(overlay, /data-course-dock-spacer/);
  assert.doesNotMatch(coursePlayer, /data-course-dock-spacer/);
  assert.doesNotMatch(coursePlayer, /data-course-mindmap-dock-spacer/);
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
// 3. Right-side glass sheet between header and footer dock
// ---------------------------------------------------------------------------

test("The sheet is the websiteglass Glass Sheet pinned to the right edge", () => {
  assert.match(overlay, /import \{ GlassSheet, GlassSheetContent, type SheetBounds \} from "\.\.\/components\/ui\/glass-sheet"/);
  assert.match(overlay, /<GlassSheetContent[\s\S]*?side="right"/);
  assert.match(glassSheet, /right: "right-0 top-0 h-full w-\[min\(24rem,90vw\)\]"/);
});

test("The sheet is bounded to the window between the header and the dock", () => {
  // The inset is measured from the real layout: the player header's bottom
  // edge (portrait) / right edge (landscape rail) and the dock's top edge.
  assert.match(overlay, /const \[sheetBounds, setSheetBounds\] = useState<SheetBounds \| null>\(null\);/);
  assert.match(overlay, /\[data-course-landscape-header\]" : "\[data-course-header\]"/);
  assert.match(overlay, /bottom: Math\.max\(0, Math\.round\(window\.innerHeight - dockRect\.top\)\)/);
  // …and handed to the sheet + scrim via the `bounds` prop.
  assert.match(overlay, /bounds=\{sheetBounds \?\? undefined\}/);
  // The shared component insets BOTH scrim and panel when bounds is given.
  assert.match(glassSheet, /export interface SheetBounds/);
  assert.match(glassSheet, /style=\{bounds \? boundsInset\(bounds\) : undefined\}/);
});

test("The sheet content swaps per tab without a slide animation", () => {
  assert.match(overlay, /key=\{tab\} className="min-h-0 flex-1 overflow-hidden" data-course-overlay-tab=\{tab\}/);
  // The old tab-content slide-in is gone.
  assert.doesNotMatch(overlay, /animate-course-overlay-in/);
});

// ---------------------------------------------------------------------------
// 4. Scroll-release click list
// ---------------------------------------------------------------------------

test("List rows are dock-style buttons (same 44px tinted plates + magnify)", () => {
  assert.match(overlay, /const ROW_ICON_SIZE = 44;/);
  assert.match(overlay, /const ROW_MAG_SCALE = 1\.55;/);
  assert.match(overlay, /background: spec\.selected \? `\$\{color\}30` : `\$\{color\}18`/);
  assert.match(overlay, /borderRadius: 12/);
  assert.match(overlay, /data-course-sheet-row/);
});

test("Scrolling the list and lifting the finger clicks the settled button", () => {
  // The list is snap-scrollable…
  assert.match(overlay, /snap-y snap-proximity/);
  assert.match(overlay, /snap-center/);
  // …and the browser's own "settle" signal (plus an idle fallback) fires the
  // row closest to the list centre.
  assert.match(overlay, /el\.addEventListener\("scrollend", activate\)/);
  assert.match(overlay, /idleTimerRef\.current = window\.setTimeout\(activate, 140\)/);
  assert.match(overlay, /const dist = Math\.abs\(rect\.top \+ rect\.height \/ 2 - center\);/);
  // A reflow caused by the fired press (expand / sheet close) must not
  // immediately fire a second row.
  assert.match(overlay, /lockedUntilRef\.current = Date\.now\(\) \+ 800;/);
  // A plain tap never triggers the scroll path.
  assert.match(overlay, /if \(!scrolledRef\.current \|\| Date\.now\(\) < lockedUntilRef\.current\) return;/);
});
