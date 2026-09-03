// tests/coursePlayerDockMagneticNotesKeyboardContract.test.mjs
//
// Contract for the Course Player footer + the SPLIT DECK (owner's direction:
// "the old split function was GOOD — keep the function, make it ekadam crazy,
// top-level, interactive"):
//
//   1. SIMPLE HOME-STYLE FOOTER — the course player's footer navigation is
//      the EXACT home page footer navigation (src/components/glass-dock/
//      GlassDock.tsx, the same component src/components/BottomNav.tsx uses):
//      same frosted panel, entrance spring, magnification, tinted plates,
//      tooltips. The old draggable magnetic pill, grab handle, live content
//      swap on slide and the per-tab landscape split are REMOVED.
//   2. RESUME LAST OPENED MODULE — reopening any purchased course lands the
//      learner back on the exact module they left off in. (The resume guard
//      is covered in coursePlayerUx.test.mjs; this file asserts the helper.)
//   3. RIGHT-SIDE GLASS SHEET — with Split mode OFF the overlay is the
//      websiteglass Glass Sheet, right side, opening ONLY in the window
//      between the player header and the footer dock (measured `bounds` inset
//      both the sheet and its scrim), so it never overlaps either.
//   4. SCROLL-RELEASE CLICK LIST — inside the sheet, list tabs render a
//      vertical column of dock-style buttons, scroll-snapped: scroll and
//      lift the finger and the button the finger settled on (closest to the
//      list centre) is clicked.
//   5. SPLIT DECK — one "Split mode" row in ⚙ Player settings turns the whole
//      player into two glass panes with a draggable glass divider between
//      them: the lesson pane (the lossless viewer stack) and the study pane
//      (the same five tabs WITH the footer dock inside it). The divider is
//      magnetic, keyboard-driven, reports a live % bubble, and dragging it to
//      an edge fills one side to 100% while the other becomes a peek rail.

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
const studyPanels = readSource("src/course/studyPanels.tsx");
const splitMotion = readSource("src/course/splitMotion.ts");
const styles = readSource("src/index.css");

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
  // The OLD per-tab landscape split (60/40 lesson + panel, edge reopen handle)
  assert.doesNotMatch(overlay, /data-course-split-handle/);
  assert.doesNotMatch(overlay, /data-course-dock-spacer/);
  assert.doesNotMatch(coursePlayer, /data-course-dock-spacer/);
  assert.doesNotMatch(coursePlayer, /data-course-mindmap-dock-spacer/);
  assert.doesNotMatch(coursePlayer, /notesSplitMode/);
  assert.doesNotMatch(coursePlayer, /mindMapSplitMode/);
  assert.doesNotMatch(coursePlayer, /splitPanelPercent/);
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
// 3. Right-side glass sheet between header and footer dock (Split mode OFF)
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

test("Split mode ON never renders the sheet — the study pane replaces it", () => {
  // One component, two homes: the pane variant returns in-flow content and
  // skips the sheet entirely (no portal, no scrim, no bounds measurement).
  assert.match(overlay, /export type OverlayVariant = "sheet" \| "pane";/);
  assert.match(overlay, /const pane = props\.variant === "pane";/);
  assert.match(overlay, /if \(pane\) \{[\s\S]*?\{studyBody\}[\s\S]*?\}/);
  // The bounds measurement is skipped while the pane is up.
  assert.match(overlay, /if \(pane\) return undefined;/);
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

// ---------------------------------------------------------------------------
// 5. Split Deck — the settings toggle
// ---------------------------------------------------------------------------

test("Split mode is one row in ⚙ Player settings, in both popover variants", () => {
  // The row sits right after Snowfall and uses the same GlassPrefToggle helper
  // as every other preference, so it also fires the settings toast.
  assert.match(coursePlayer, /settingsRow\("Snowfall", snowMode, \(next\) => setSnowMode\(next\), "snow"\)\}\s*\n\s*\{settingsRow\("Split mode", splitMode, \(next\) => requestSplitMode\(next\), "split"\)/);
  assert.match(coursePlayer, /split: \{ color: "#22D3EE", delay: 0\.15, divider: true \}/);
  assert.match(coursePlayer, /data-course-setting=\{attr\}/);
  // ONE popover builder serves both the portrait ("bottom") and the landscape
  // ("right") trigger, so the row exists in both.
  assert.match(coursePlayer, /settingsPopover\("bottom"\)/);
  assert.match(coursePlayer, /settingsPopover\("right"\)/);
});

test("The Split Deck preference persists across reloads", () => {
  assert.match(coursePlayer, /const \[splitMode, setSplitMode\] = useState<boolean>\(loadSplitEnabled\);/);
  assert.match(coursePlayer, /useEffect\(\(\) => \{ saveSplitEnabled\(splitMode\); \}, \[splitMode\]\);/);
  assert.match(splitMotion, /SPLIT_ENABLED_KEY = "dc\.splitDeck\.enabled"/);
  assert.match(splitMotion, /localStorage\.getItem\(SPLIT_ENABLED_KEY\) === "1"/);
});

// ---------------------------------------------------------------------------
// 5b. Split Deck — the two panes and the dock INSIDE the study pane
// ---------------------------------------------------------------------------

test("The deck lays out a lesson pane, a divider and a study pane", () => {
  assert.match(studyPanels, /data-course-split-deck=""/);
  assert.match(studyPanels, /data-course-lesson-pane=""/);
  assert.match(studyPanels, /data-course-study-pane=""/);
  assert.match(studyPanels, /data-course-lesson-content=""/);
  // The axis follows the player's orientation: portrait = lesson on top,
  // landscape = lesson on the left.
  assert.match(studyPanels, /axis === "row" \? "flex-row" : "flex-col"/);
  assert.match(coursePlayer, /splitDeck\("row", "landscape"\)/);
  assert.match(coursePlayer, /splitDeck\("column", "portrait"\)/);
  // The player marks the split region on the section that owns it.
  assert.match(coursePlayer, /data-course-split=\{splitRendered \? "on" : "off"\}/);
});

test("The footer dock lives INSIDE the study pane in split mode", () => {
  // The pane is the deck's `[data-course-study-pane]` element and its content
  // is `<CourseOverlay variant="pane" />` — whose LAST child is the very same
  // home-footer dock (`[data-course-dock]`), i.e. the DOM is
  // `[data-course-study-pane] [data-course-dock]`.
  assert.match(studyPanels, /data-course-study-pane=""[\s\S]*?\{study\}/);
  assert.match(coursePlayer, /const renderStudyOverlay = \(variant: OverlayVariant\) => \(/);
  assert.match(coursePlayer, /study=\{studyPane\}/);
  assert.match(coursePlayer, /const studyPane = renderStudyOverlay\("pane"\);/);
  // The overlay's pane branch ends with the dock (module panel, footer
  // navigation and content all live in the split).
  assert.match(overlay, /if \(pane\) \{[\s\S]*?\{studyBody\}[\s\S]*?dock[\s\S]*?\}/);
  assert.match(overlay, /data-in-split=\{pane \? "true" : "false"\}/);
  // And the sheet's own bounds still measure from that same dock element.
  assert.match(overlay, /<div ref=\{dockShellRef\} className="mx-auto w-max max-w-full">/);
});

test("Tapping the active dock tab peek-collapses the study pane", () => {
  assert.match(coursePlayer, /const handleSplitDockTabChange = \(next: DockTab\) => \{/);
  assert.match(coursePlayer, /splitDeckRef\.current\?\.toggleStudy\(\);/);
  assert.match(studyPanels, /toggleStudy: \(\) => \(collapsedRef\.current === "study" \? restore\(\) : collapseTo\("study"\)\)/);
  // A different tab swaps the pane's content in place — the pane never closes.
  assert.match(coursePlayer, /onTabChange=\{variant === "pane" \? handleSplitDockTabChange : handleDockTabChange\}/);
});

test("The lesson pane is the lossless viewer stack, only ever resized", () => {
  // The stack itself is untouched: every opened file stays mounted and the
  // inactive ones stay hidden-but-alive.
  assert.match(coursePlayer, /data-course-viewer-stack/);
  assert.match(coursePlayer, /data-course-viewer-slot/);
  assert.match(coursePlayer, /pointer-events-none invisible opacity-0/);
  assert.match(coursePlayer, /lesson=\{viewerStack\}/);
  // The deck only wraps it — the pane is a resizing box around the stack.
  assert.match(studyPanels, /data-course-lesson-content=""[\s\S]*?\{lesson\}/);
});

// ---------------------------------------------------------------------------
// 5c. Split Deck — the draggable, magnetic divider
// ---------------------------------------------------------------------------

test("The divider is an accessible separator with a 44px glass grabber", () => {
  assert.match(studyPanels, /role="separator"/);
  assert.match(studyPanels, /data-course-split-divider=""/);
  assert.match(studyPanels, /data-course-split-grabber=""/);
  assert.match(studyPanels, /data-course-split-ratio-bubble=""/);
  assert.match(studyPanels, /aria-orientation=\{row \? "vertical" : "horizontal"\}/);
  assert.match(studyPanels, /aria-valuemin=\{SPLIT_MIN\}/);
  assert.match(studyPanels, /aria-valuemax=\{SPLIT_MAX\}/);
  assert.match(studyPanels, /aria-valuenow=\{ariaNow\}/);
  assert.match(studyPanels, /tabIndex=\{0\}/);
  // A real touch target and no browser gesture stealing the drag.
  assert.match(studyPanels, /flex: `0 0 \$\{DIVIDER_HIT\}px`/);
  assert.match(splitMotion, /export const DIVIDER_HIT = 44;/);
  assert.match(studyPanels, /touchAction: "none"/);
});

test("The divider drags with pointer capture and reports the live ratio", () => {
  assert.match(studyPanels, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  assert.match(studyPanels, /event\.currentTarget\.releasePointerCapture\?\.\(event\.pointerId\)/);
  assert.match(studyPanels, /const applySplitPercent = useCallback\(/);
  assert.match(studyPanels, /const ratioFromPointer = useCallback\(/);
  // The study pane is measured from the far edge: right in landscape, bottom
  // in portrait.
  assert.match(studyPanels, /\(\(rect\.right - clientX\) \/ Math\.max\(1, rect\.width\)\) \* 100/);
  assert.match(studyPanels, /\(\(rect\.bottom - clientY\) \/ Math\.max\(1, rect\.height\)\) \* 100/);
  // The % bubble reads "lesson% · study%" and is written without a re-render.
  assert.match(studyPanels, /bubbleTextRef\.current\.textContent = `\$\{lesson\}% · \$\{study\}%`/);
  assert.match(studyPanels, /useMotionValueEvent\(ratio, "change"/);
  // Only flex-grow is written per frame — never a React render.
  assert.match(studyPanels, /lessonRef\.current\.style\.flexGrow = String\(Math\.max\(0\.0001, 100 - value\)\)/);
  assert.match(studyPanels, /studyRef\.current\.style\.flexGrow = String\(Math\.max\(0\.0001, value\)\)/);
});

test("The divider snaps magnetically and settles on a spring", () => {
  assert.match(splitMotion, /export const SPLIT_SNAP_POINTS = \[20, 35, 50, 65, 80\] as const;/);
  assert.match(splitMotion, /export const SNAP_TOLERANCE = 3;/);
  assert.match(splitMotion, /export const SPLIT_MIN = 15;/);
  assert.match(splitMotion, /export const SPLIT_MAX = 85;/);
  assert.match(studyPanels, /SPLIT_SNAP_POINTS\.find\(\(point\) => Math\.abs\(point - raw\) <= SNAP_TOLERANCE\)/);
  assert.match(studyPanels, /clampSplitRatio\(snap \?\? raw, floor\)/);
  assert.match(studyPanels, /animateRatio\(target, SPRING_SETTLE\)/);
  // One soft pulse ring per snap point crossed mid-drag — the magnetic click.
  assert.match(splitMotion, /export const PULSE_TOLERANCE = 2;/);
  assert.match(studyPanels, /data-course-split-pulse=""/);
  assert.match(studyPanels, /Math\.abs\(point - value\) <= PULSE_TOLERANCE/);
  // Double-click = 50/50.
  assert.match(studyPanels, /onDoubleClick=\{fiftyFifty\}/);
  assert.match(studyPanels, /animateRatio\(50, SPRING_SETTLE\)/);
});

test("Dragging to an edge fills one side and leaves a glowing peek rail", () => {
  assert.match(splitMotion, /export const FILL_THRESHOLD = 8;/);
  assert.match(splitMotion, /export const PEEK_RAIL_PX = 28;/);
  assert.match(studyPanels, /if \(raw <= FILL_THRESHOLD\) \{ collapseTo\("study"\); return; \}/);
  assert.match(studyPanels, /if \(raw >= 100 - FILL_THRESHOLD\) \{ collapseTo\("lesson"\); return; \}/);
  assert.match(studyPanels, /data-course-peek-rail=""/);
  assert.match(studyPanels, /data-peek-side=\{side\}/);
  assert.match(studyPanels, /animateRatio\(side === "study" \? 0 : 100, SPRING_SETTLE\)/);
  // The collapsed pane keeps its 28px strip as a minimum, so the spring lands
  // exactly on the rail instead of on zero.
  assert.match(studyPanels, /\{ \[paneSizeProp\]: PEEK_RAIL_PX \}/);
  // Tapping the rail brings the last ratio back with the entry spring.
  assert.match(studyPanels, /onRestore=\{restore\}/);
  assert.match(studyPanels, /animateRatio\(target, SPRING_ENTRY\)/);
  // The rail shows the lesson's play glyph or the ACTIVE TAB's own icon.
  assert.match(studyPanels, /icon=\{PlayCircle\}/);
  assert.match(studyPanels, /icon=\{studyIcon\}/);
  assert.match(coursePlayer, /studyIcon=\{activeStudyTab\.icon\}/);
});

test("The divider is fully keyboard driven", () => {
  assert.match(splitMotion, /export const KEY_STEP = 5;/);
  assert.match(splitMotion, /export const KEY_STEP_FINE = 1;/);
  assert.match(studyPanels, /const step = event\.shiftKey \? KEY_STEP_FINE : KEY_STEP;/);
  assert.match(studyPanels, /case "ArrowUp":/);
  assert.match(studyPanels, /case "ArrowLeft":/);
  assert.match(studyPanels, /case "ArrowDown":/);
  assert.match(studyPanels, /case "ArrowRight":/);
  // Home = lesson full, End = study full, Enter/Space = 50/50.
  assert.match(studyPanels, /case "Home":[\s\S]*?collapseTo\("study"\)/);
  assert.match(studyPanels, /case "End":[\s\S]*?collapseTo\("lesson"\)/);
  assert.match(studyPanels, /case "Enter":[\s\S]*?fiftyFifty\(\)/);
  // The focus ring is the active tab's colour.
  assert.match(studyPanels, /\["--split-accent" as string\]: accent/);
  assert.match(styles, /\[data-course-split-divider\]:focus-visible \{\s*outline: 2px solid var\(--split-accent/);
});

test("⌘/Ctrl+1…5 walks the study tabs while the deck is up", () => {
  assert.match(coursePlayer, /if \(!\(event\.metaKey \|\| event\.ctrlKey\) \|\| event\.altKey\) return;/);
  assert.match(coursePlayer, /index > STUDY_TAB_ORDER\.length\) return;/);
  // Never hijack a browser shortcut aimed at a text field…
  assert.match(coursePlayer, /target\.isContentEditable \|\| \/\^\(input\|textarea\|select\)\$\/i\.test\(target\.tagName\)/);
  // …or at anything outside the player.
  assert.match(coursePlayer, /if \(shell && target && target !== document\.body && !shell\.contains\(target\)\) return;/);
  assert.match(coursePlayer, /const next = STUDY_TAB_ORDER\[index - 1\];/);
  assert.match(overlay, /export const STUDY_TAB_ORDER: DockTab\[\] = TABS\.map\(\(\{ key \}\) => key\);/);
});

// ---------------------------------------------------------------------------
// 5d. Split Deck — persistence, rotation and the soft keyboard
// ---------------------------------------------------------------------------

test("The ratio is remembered per course and per axis", () => {
  assert.match(splitMotion, /`dc\.splitDeck\.ratio\.v1:\$\{courseId\}:\$\{axis\}`/);
  assert.match(splitMotion, /`dc\.splitDeck\.collapsed\.v1:\$\{courseId\}:\$\{axis\}`/);
  assert.match(splitMotion, /export const DEFAULT_SPLIT_RATIO: Record<SplitAxis, number> = \{ column: 40, row: 45 \};/);
  // A bad stored value falls back to the axis default instead of collapsing.
  assert.match(splitMotion, /if \(!Number\.isFinite\(raw\)\) return fallback;/);
  assert.match(studyPanels, /loadSplitRatio\(courseId, axis, floor\)/);
  assert.match(studyPanels, /saveSplitRatio\(courseId, axis, percent\)/);
  // Rotating re-reads the OTHER axis's own ratio + collapse.
  assert.match(studyPanels, /\}, \[axis, courseId, floor\]\);/);
  assert.match(studyPanels, /loadSplitCollapsed\(courseId, axis\)/);
  // Phone portrait keeps a 30% floor so notes stay writable.
  assert.match(splitMotion, /export const SPLIT_SMALL_SCREEN_MIN = 30;/);
  assert.match(splitMotion, /axis === "column" && smallScreen \? SPLIT_SMALL_SCREEN_MIN : SPLIT_MIN/);
});

test("The soft keyboard lifts the study pane's content box only", () => {
  assert.match(studyPanels, /const useKeyboardInset = \(scopeRef: RefObject<HTMLElement \| null>\): number =>/);
  assert.match(studyPanels, /window\.innerHeight - \(viewport\.height \+ viewport\.offsetTop\)/);
  // Only while an editable field inside the deck actually has focus.
  assert.match(studyPanels, /target\.isContentEditable \|\| \/\^\(textarea\|input\)\$\/i\.test\(target\.tagName\)/);
  assert.match(studyPanels, /scopeRef\.current\?\.contains\(target\)/);
  assert.match(studyPanels, /paddingBottom: keyboardInset \? keyboardInset : undefined/);
});

// ---------------------------------------------------------------------------
// 5e. Split Deck — entry / exit, the dock FLIP and the divider's tab colour
// ---------------------------------------------------------------------------

test("Enabling grows the study pane open and FLIPs the dock into it", () => {
  assert.match(splitMotion, /export const ENTRY_START = 5;/);
  assert.match(studyPanels, /ratio\.set\(ENTRY_START\);/);
  assert.match(studyPanels, /animateRatio\(stored, SPRING_ENTRY\)/);
  // The divider's core line draws itself along its own axis (240ms).
  assert.match(studyPanels, /initial=\{row \? \{ scaleY: 0, scaleX: 1 \} : \{ scaleX: 0, scaleY: 1 \}\}/);
  assert.match(studyPanels, /transition=\{\{ duration: 0\.24, ease: EASE_OUT_MOTION \}\}/);
  // The study content fades in and rises 8px behind it (150ms, 60ms delay).
  assert.match(studyPanels, /initial=\{\{ opacity: 0, y: 8 \}\}/);
  assert.match(studyPanels, /transition=\{\{ duration: 0\.15, delay: 0\.06, ease: EASE_OUT_MOTION \}\}/);
  // The dock FLIPs: measured before the reflow, played back to zero after it.
  assert.match(studyPanels, /export const captureDockRect = \(\): DOMRect \| null =>/);
  assert.match(studyPanels, /export const flipDockFrom = \(from: DOMRect \| null\): void =>/);
  assert.match(studyPanels, /\{ transform: \[`translate3d\(\$\{dx\}px, \$\{dy\}px, 0\)`, "translate3d\(0px, 0px, 0\)"\] \}/);
  assert.match(studyPanels, /\{ duration: 0\.38, ease: EASE_OUT_MOTION \}/);
  assert.match(coursePlayer, /dockFlipFromRef\.current = captureDockRect\(\);/);
  assert.match(coursePlayer, /flipDockFrom\(dockFlipFromRef\.current\);/);
});

test("Disabling plays the exact reverse before the sheet takes over", () => {
  assert.match(coursePlayer, /const \[splitRendered, setSplitRendered\] = useState<boolean>\(splitMode\);/);
  assert.match(coursePlayer, /onExited=\{\(\) => setSplitRendered\(false\)\}/);
  assert.match(studyPanels, /animateRatio\(0, SPRING_ENTRY\);/);
  assert.match(studyPanels, /onExitedRef\.current\?\.\(\), 280/);
  // Re-enabling mid-exit grows back instead of unmounting the lesson.
  assert.match(studyPanels, /if \(!exitedRef\.current\) return undefined;/);
});

test("The divider, its glow and the peek rail all wear the active tab colour", () => {
  // The five tab colours, straight from the dock's own list.
  assert.match(overlay, /\{ key: "modules"[\s\S]*?color: "#FFBE0B"/);
  assert.match(overlay, /\{ key: "resources"[\s\S]*?color: "#06D6A0"/);
  assert.match(overlay, /\{ key: "notes"[\s\S]*?color: "#3A86FF"/);
  assert.match(overlay, /\{ key: "mindmap"[\s\S]*?color: "#B388FF"/);
  assert.match(overlay, /\{ key: "paid"[\s\S]*?color: "#C9A96E"/);
  // The player hands the ACTIVE tab's colour to the deck…
  assert.match(coursePlayer, /const activeStudyTab = dockTabRecord\(dockTab\);/);
  assert.match(coursePlayer, /accent=\{activeStudyTab\.color\}/);
  // …and the deck paints the line + glow + rail from it.
  assert.match(studyPanels, /boxShadow: `0 0 14px \$\{accent\}66`/);
  assert.match(studyPanels, /boxShadow: `0 0 14px \$\{accent\}88`/);
  // A tab switch glides the colour over 300ms.
  assert.match(studyPanels, /background-color 300ms \$\{EASE_OUT\}/);
});

test("Every split spring comes from the one motion file", () => {
  assert.match(splitMotion, /export const SPRING_SETTLE = \{ stiffness: 300, damping: 30 \} as const;/);
  assert.match(splitMotion, /export const SPRING_ENTRY = \{ stiffness: 260, damping: 26, mass: 0\.9 \} as const;/);
  assert.match(splitMotion, /export const SPRING_MAG = \{ stiffness: 300, damping: 22, mass: 0\.5 \} as const;/);
  assert.match(splitMotion, /export const EASE_OUT = "cubic-bezier\(0\.22,1,0\.36,1\)";/);
  assert.match(studyPanels, /from "\.\/splitMotion"/);
  assert.match(studyPanels, /SPRING_MAG,\s*\n\s*SPRING_SETTLE,/);
  // No ad-hoc spring numbers anywhere in the deck.
  assert.doesNotMatch(studyPanels, /stiffness: \d/);
  assert.doesNotMatch(studyPanels, /damping: \d/);
});

// ---------------------------------------------------------------------------
// 5f. Split Deck — glass discipline (Phase 2)
// ---------------------------------------------------------------------------

test("The split surfaces are built from the player's own glass tokens", () => {
  assert.match(studyPanels, /background: "var\(--dc-chrome-glass\)"/);
  assert.match(studyPanels, /backdropFilter: "var\(--dc-chrome-glass-blur\)"/);
  assert.match(studyPanels, /boxShadow: "var\(--dc-chrome-glass-rim\)"/);
  // The study pane keeps its tint at ≤ 0.35 so text stays readable…
  assert.match(studyPanels, /tint=\{0\.3\}/);
  // …while the non-split sheet keeps its 0.5.
  assert.match(overlay, /tint=\{0\.5\}/);
  // Blur is static per theme and cheaper on touch — never animated.
  assert.match(styles, /\.course-player-shell \{\s*--dc-chrome-glass-blur: blur\(18px\) saturate\(1\.4\);/);
  assert.match(styles, /\.course-player-shell\[data-course-theme="light"\] \{\s*--dc-chrome-glass-blur: blur\(14px\) saturate\(1\.2\);/);
  assert.match(styles, /@media \(pointer: coarse\) \{[\s\S]*?--dc-chrome-glass-blur: blur\(12px\) saturate\(1\.2\);/);
  assert.doesNotMatch(studyPanels, /transition[^;]*backdrop-filter/);
});

test("Notes and mind map keep their container-width tiling inside the pane", () => {
  assert.match(styles, /\[data-course-overlay\] \[data-course-notes-grid\],\s*\n\[data-course-study-pane\] \[data-course-notes-grid\] \{/);
  assert.match(studyPanels, /data-solid-panel=\{solid \? "true" : "false"\}/);
  assert.match(coursePlayer, /solid=\{dockTab === "notes" \|\| dockTab === "mindmap"\}/);
});

test("Coarse pointers and reduced motion get the cheap deck", () => {
  assert.match(studyPanels, /const useCoarsePointer = \(\): boolean =>/);
  assert.match(studyPanels, /const reduceMotion = useReducedMotion\(\) === true;/);
  assert.match(studyPanels, /const cheap = coarse \|\| reduceMotion;/);
  assert.match(studyPanels, /if \(cheap\) return;/);
  assert.match(studyPanels, /breathe=\{!cheap\}/);
  assert.match(styles, /@media \(pointer: coarse\) \{\s*\[data-course-split-pulse\] \{\s*display: none;/);
  // Only transform / opacity / box-shadow / flex-grow are ever animated.
  assert.doesNotMatch(studyPanels, /animate\(\{[^}]*blur/);
});

// ---------------------------------------------------------------------------
// 8. Pane tab-switch crossfade + the phone-landscape dock floor
// ---------------------------------------------------------------------------

test("Switching tabs inside the pane crossfades the content — and only there", () => {
  // The pane body is keyed by tab and fades in over 150ms with a 6px rise.
  assert.match(
    overlay,
    /<motion\.div\s+key=\{props\.tab\}\s+initial=\{\{ opacity: paneCrossfade \? 0 : 1, y: paneCrossfade \? 6 : 0 \}\}\s+animate=\{\{ opacity: 1, y: 0 \}\}\s+transition=\{\{ duration: 0\.15, ease: EASE_OUT_MOTION \}\}/,
  );
  // One shared easing curve, and reduced motion turns the fade into a swap.
  assert.match(overlay, /import \{ EASE_OUT_MOTION \} from "\.\/splitMotion";/);
  assert.match(overlay, /const paneCrossfade = useReducedMotion\(\) !== true;/);
  assert.match(splitMotion, /export const EASE_OUT_MOTION = \[0\.22, 1, 0\.36, 1\]/);
  // Phase 0's sheet keeps its animation-free in-place swap: the file holds two
  // `{studyBody}` mounts — the pane's, wrapped in the crossfade above, and the
  // sheet's, a direct child of the sheet content with no motion in between.
  assert.equal(overlay.match(/\{studyBody\}/g)?.length, 2);
  assert.match(overlay, /<GlassSheetContent(?:(?!motion\.div)[\s\S])*?\{studyBody\}/);
});

test("A phone in landscape never settles the pane narrower than the dock inside it", () => {
  // The five-icon glass dock's natural width is the floor's reason to exist.
  assert.match(splitMotion, /export const SPLIT_DOCK_MIN_PX = 288;/);
  assert.match(splitMotion, /export const SPLIT_SHORT_VIEWPORT_PX = 500;/);
  // "Phone" = a narrow viewport OR a short one (turned sideways).
  assert.match(
    studyPanels,
    /window\.matchMedia\(\s*`\(max-width: \$\{SPLIT_SMALL_SCREEN_PX\}px\), \(max-height: \$\{SPLIT_SHORT_VIEWPORT_PX\}px\)`,\s*\)/,
  );
  // The floor is measured from the deck's real width, not guessed.
  assert.match(studyPanels, /const observer = new ResizeObserver\(\(entries\) => \{/);
  assert.match(studyPanels, /observer\.observe\(node\);/);
  assert.match(
    studyPanels,
    /const dockFloor =\s+phone && axis === "row" && deckWidth > 0 \? clampSplitRatio\(\(SPLIT_DOCK_MIN_PX \/ deckWidth\) \* 100\) : 0;/,
  );
  assert.match(studyPanels, /const floor = Math\.max\(specFloor, dockFloor\);/);
  // The spec's percentage floor still governs everywhere else…
  assert.match(studyPanels, /const specFloor = splitFloorFor\(axis, phone\);/);
  assert.match(splitMotion, /export const splitFloorFor = \(axis: SplitAxis, smallScreen: boolean\): number =>/);
  // …and the clamp still caps it, so collapse-to-rail stays reachable.
  assert.match(splitMotion, /export const clampSplitRatio = \(value: number, floor: number = SPLIT_MIN\): number =>/);
  assert.match(studyPanels, /data-course-peek-rail/);
});
