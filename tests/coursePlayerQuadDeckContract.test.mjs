// tests/coursePlayerQuadDeckContract.test.mjs
//
// SOURCE-SHAPE contract for the owner's 2026-10-16 desktop/tablet brief, kept
// beside the runtime proof in tests/coursePlayerQuadDeckRuntime.test.mjs.
//
// The brief, clause by clause, and where each clause is pinned:
//
//   1 · one horizontal + one vertical divider → four blocks   → QuadDeck + quadLayout
//   2 · every divider always drags                            → QuadDeck (no gate in the drag path)
//   3 · player / resource library / notes / mind map mapping  → QuadDeck (QUAD_PANE_SLOT)
//   4 · a dot at every segment centre opens ONE cluster;
//       outside click and any press close it                  → QuadDeck
//   5 · c11 · c12 · c21 · c22 close/reopen, a closed block
//       reads "c22+"                                          → quadLayout.quadPaneButtons
//   6 · the extra grid shapes (1 upar/3 niche and its reverse,
//       2 upar/1 niche and its reverse, the single-divider one
//       with the navigation under the Resource Library)        → quadLayout.QUAD_FORMATS
//   7 · header: progress bar + Settings + navigation in ONE line → CoursePlayerApp
//   8 · the navigation is 6px smaller                         → footerNavigationPlacement + CSS
//   9 · the placement button (tablet/desktop only) with a
//       dropdown that opens toward the free space             → CourseHeaderNav
//  10 · ≥768px only; mobile keeps today's player              → quadLayout gate + the guards
//
// Plus the Course view page behind the gear (zoom + the four divider switches)
// and the things that must NOT regress: the split deck is still there for
// phones, and the divider stays resizable on every shape.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const MODEL = read("src/course/quadLayout.ts");
const DECK = read("src/course/QuadDeck.tsx");
const DECK_CSS = read("src/course/course-quad-deck.css");
const FLEX = read("src/course/quadFlex.ts");
const PICKER = read("src/course/BlockPicker.tsx");
const BACK = read("src/course/PageBackButton.tsx");
const PAGES = read("src/course/blockPages.ts");
const HISTORY = read("src/course/pageHistory.ts");
const NAV = read("src/course/CourseHeaderNav.tsx");
const NAV_CSS = read("src/course/course-header-nav.css");
const PLACEMENT = read("src/utils/footerNavigationPlacement.ts");
const VIEW = read("src/course/courseViewSettings.ts");
const MOTION = read("src/course/splitMotion.ts");
const PLAYER = read("src/CoursePlayerApp.tsx");
const OVERLAY = read("src/course/CourseOverlay.tsx");
const PANEL = read("src/course/PlayerPanel.tsx");
// The Course view page itself — lifted out of PlayerPanel so Work mode renders
// the very same page (one design, one store).
const VIEW_PANEL = read("src/course/CourseViewPanel.tsx");
const SPLIT = read("src/course/studyPanels.tsx");

/* ── 1 + 3 · four blocks in a +, in the owner's own mapping ─────────────── */

test("the model defines the four blocks and the owner's mapping", () => {
  assert.match(MODEL, /export type QuadPaneId = "c11" \| "c12" \| "c21" \| "c22";/);
  assert.match(MODEL, /export const QUAD_PANE_SLOT: Record<QuadPaneId, QuadSlot> = \{\n  c11: "player",/);
  assert.match(MODEL, /c12: "notes",/);
  assert.match(MODEL, /c21: "resources",/);
  assert.match(MODEL, /c22: "mindmap",/);
  // The four blocks, top-left first — the owner's reading order.
  assert.match(MODEL, /export const QUAD_PANE_ORDER: QuadPaneId\[\] = \["c11", "c12", "c21", "c22"\];/);
});

test("the deck draws exactly the dividers a shape needs, never four", () => {
  // ONE vertical divider (its two half segments), the SECOND vertical divider
  // the three-column shape needs, and ONE horizontal one — never one per block.
  assert.equal((DECK.match(/<QuadDivider/g) || []).length, 3);
  assert.match(DECK, /\{hasVertical \? \(/);
  assert.match(DECK, /\{secondVertical \? \(/);
  assert.match(DECK, /\{hasHorizontal \? \(/);
  assert.match(DECK, /data-course-quad-divider=\{axis\}/);
  assert.doesNotMatch(DECK, /DIVIDERS|fourDividers|dividers\.map/);
  // The three lines the deck knows: the vertical, its SECOND vertical (the row
  // of three blocks) and the horizontal.
  assert.match(DECK, /type QuadAxisKey = "v" \| "v2" \| "h";/);
  // The second divider only exists while a row really holds three blocks.
  assert.match(DECK, /const secondVertical = rows\.some\(\(row\) => row\.length >= 3\);/);
  assert.match(DECK, /const secondSpan = secondVertical/);
  // The owner's shape: three equal columns, the row of three blocks.
  assert.match(MODEL, /triple: \{\n\s+rows: \[\["c11", "c12", "c22"\]\],/);
  assert.match(MODEL, /label: "3 · side by side"/);
});

/* ── 2 · every divider always drags ─────────────────────────────────────── */

test("every divider is always draggable — no mode, no gate, no unlock", () => {
  assert.match(DECK, /const handlePointerDown = \(axis: QuadAxisKey\) => \(event: ReactPointerEvent<HTMLDivElement>\) => \{/);
  assert.match(DECK, /dragRef\.current = \{ axis, start: axis === "h" \? event\.clientY : event\.clientX, base, live: base \};/);
  assert.match(DECK, /event\.currentTarget\.setPointerCapture\?\.\(event\.pointerId\);/);
  // The live drag writes the CSS variables straight to the DOM (no React
  // re-render per frame) and commits on release.
  assert.match(DECK, /deck\.style\.setProperty\(axis === "v" \? "--quad-col" : axis === "v2" \? "--quad-col2" : "--quad-row", `\$\{value\}%`\);/);
  assert.match(DECK, /if \(drag\.axis === "v"\) commit\(\{ \.\.\.state, col: clampAxis\("v", drag\.live\) \}\);/);
  assert.match(DECK, /else if \(drag\.axis === "v2"\) commit\(\{ \.\.\.state, col2: clampAxis\("v2", drag\.live\) \}\);/);
  // The two vertical dividers can never cross: a gap always stays between them.
  assert.match(MODEL, /export const QUAD_TRIPLE_GAP = 8;/);
  assert.match(DECK, /return Math\.min\(next, second - QUAD_TRIPLE_GAP\);/);
  assert.match(DECK, /return Math\.max\(clampQuadCol2\(value\), first \+ QUAD_TRIPLE_GAP\);/);
  // Keyboard parity, and no gate on the drag path at all.
  assert.match(DECK, /const QUAD_KEY_STEP = 2;/);
  assert.match(DECK, /if \(event\.key === "s" \|\| event\.key === "S"\) \{/);
  // No width GATE on the drag path. (Word-bounded: the prose word "wider" in a
  // comment is not a flag — the pin is about a `wide` variable/condition.)
  assert.doesNotMatch(DECK, /\bwide\b|isTablet|SPLIT_WIDE_MIN_PX/);
});

/* ── 4 · the dots, the ONE cluster, and how it closes ───────────────────── */

test("every segment carries its own guide dot, and a dot opens ONE cluster", () => {
  assert.match(DECK, /data-course-quad-dot/);
  assert.match(DECK, /data-quad-dot-segment=\{segment\}/);
  assert.match(DECK, /className="dc-quad-dot__pip"/);
  // One cluster element for the whole deck, anchored on the pressed segment.
  assert.equal((DECK.match(/^\s+data-course-quad-menu$/gm) || []).length, 1);
  assert.match(DECK, /const menuAnchor = \(\): CSSProperties => \{/);
  assert.match(DECK, /role="dialog"[\s\S]{0,120}aria-label="Divider controls"/);
});

test("outside click closes the cluster, and so does every press", () => {
  // The outside-click rule lives on the document, capture phase.
  assert.match(DECK, /document\.addEventListener\("pointerdown", onPointerDown, true\);/);
  assert.match(DECK, /if \(target\?\.closest\?\.\("\[data-course-quad-menu\]"\) \|\| target\?\.closest\?\.\("\[data-course-quad-dot\]"\)\) return;/);
  assert.match(DECK, /setMenu\(null\);[\s\S]{0,200}document\.addEventListener\("keydown", onKeyDown\);/);
  // A swap, a block and a shape all put it away after the press.
  const presses = DECK.match(/setMenu\(null\);/g) || [];
  assert.ok(presses.length >= 5, "the cluster is dismissed by its own buttons too");
  // On the dynamic cross a swap mirrors the four arms AND trades the blocks'
  // pages; on the grid shapes it keeps the old mirror. Either way the
  // cluster closes after the press.
  assert.match(DECK, /onPress=\{\(\) => \{\n\s+commit\(dynamicCross \? quadSwapFlex\(state, "cols"\) : quadSwap\(state, "cols"\)\);\n\s+setMenu\(null\);/);
  assert.match(DECK, /commit\(dynamicCross \? quadSwapFlex\(state, "rows"\) : quadSwap\(state, "rows"\)\);\n\s+setMenu\(null\);/);
  assert.match(DECK, /if \(dynamicCross\) \{[\s\S]{0,420}} else \{\n\s+commit\(quadTogglePane\(state, button\.pane\)\);\n\s+}\n\s+setMenu\(null\);/);
  assert.match(DECK, /commit\(quadSetFormat\(state, format\)\);\n\s+setMenu\(null\);/);
  // A drag hides it as well — the learner is resizing, not choosing.
  assert.match(DECK, /\/\/ A drag on the line puts the cluster away — the learner is resizing\.\n\s+setMenu\(null\);/);
  // Caps: about six rows visible, the rest scrolls inside the popup.
  assert.match(DECK_CSS, /\.dc-quad-menu__scroll \{/);
  assert.match(DECK_CSS, /max-height: min\(52vh, 300px\);/);
  assert.match(DECK_CSS, /overflow-y: auto;/);
  assert.match(DECK, /Press a button and this closes\. Scroll here for the rest\./);
  // With no cross on screen (a single row, a single column, one block left) the
  // same cluster keeps a door of its own — the way back is never lost.
  assert.match(DECK, /\{!cross \? \(\n\s+<button\n[\s\S]{0,400}data-course-quad-menu-button/);
  assert.match(DECK, /if \(!cross\) return \{ left: "50%", top: "50%" \};/);
});

/* ── 5 · the four block buttons and their "+" reading ───────────────────── */

test("the four block buttons carry c11…c22 and read cXX+ while closed", () => {
  assert.match(MODEL, /text: visible \? pane : `\$\{pane\}\+`,/);
  assert.match(DECK, /"data-quad-pane-button": button\.pane,/);
  assert.match(DECK, /"data-quad-pane-open": button\.visible \? "true" : "false"/);
  // The last block on screen cannot be closed — the deck never empties.
  assert.match(MODEL, /if \(open\.length <= 1\) return state;/);
  assert.match(DECK, /disabled=\{dynamicCross \? false : button\.lastOne\}/);
  assert.match(MODEL, /lastOne: visible && open\.length === 1,/);
  // On the dynamic cross (free blocks) the four buttons never close a block:
  // they put it back on its blank picker page ("block Keval aur Keval ek
  // blank page se start hoga"). Closing/reopening stays for the grid shapes.
  assert.match(DECK, /Put block \$\{button\.pane\} back on its blank page/);
  assert.match(DECK, /openBlockPage\(button\.pane, null\);/);
  assert.match(MODEL, /export const quadClearBlockPage/);
});

/* ── 6 · every grid shape the owner named ───────────────────────────────── */

test("the model carries every grid shape the brief asks for", () => {
  assert.match(MODEL, /export type QuadFormat = "quad" \| "top1" \| "bottom1" \| "triple" \| "top2" \| "bottom2" \| "pair";/);
  assert.match(MODEL, /label: "1 upar · 3 niche"/);
  assert.match(MODEL, /hint: "Three blocks side by side, full height — player, notes, mind map"/);
  // The owner's own reading of the new shape: three equal columns on arrival.
  assert.match(MODEL, /const seeded = format === "triple" && state\.format !== "triple"/);
  assert.match(MODEL, /\{ \.\.\.state, col: 33, col2: 67 \}/);
  assert.match(MODEL, /label: "3 upar · 1 niche"/);
  assert.match(MODEL, /label: "2 upar · 1 niche"/);
  assert.match(MODEL, /label: "1 upar · 2 niche"/);
  assert.match(MODEL, /label: "2 · single divider"/);
  // The single-divider shape: the player, and the Resource Library — which
  // takes the navigation under it (see the deck's `resourcesFooter`).
  assert.match(MODEL, /pair: \{\n\s+rows: \[\["c11", "c21"\]\],/);
  assert.match(DECK, /const navUnderLibrary = state\.format === "pair" && Boolean\(resourcesFooter\);/);
  assert.match(DECK, /data-quad-pane-nav/);
  // Every shape is offered by the cluster, in order, with a thin-bar glyph.
  assert.match(DECK, /QUAD_FORMAT_ORDER\.map\(\(format\) => \(/);
  assert.match(DECK, /glyph=\{<QuadGlyph rows=\{formatRows\(format\)\} accent="c11" \/>\}/);
  assert.match(DECK, /function QuadGlyph\(\{ rows, accent \}: \{ rows: QuadPaneId\[\]\[\]; accent\?: QuadPaneId \}\)/);
});

/* ── 7 · the header line ────────────────────────────────────────────────── */

test("the header carries the progress bar, Settings and the navigation in ONE line", () => {
  assert.match(PLAYER, /const headerNavInRail = quadWide && navPlacement === "header" && !quadNavInDeck && !quadFooterOff;/);
  assert.match(PLAYER, /data-course-nav-slot/);
  assert.match(PLAYER, /\{courseNavNode\}\n\s+<\/div>/);
  // The progress bar takes the free space and Settings keeps its own width.
  assert.match(PLAYER, /headerNavInRail \? "min-w-0 flex-1" : "w-1\/2"/);
  assert.match(PLAYER, /headerNavInRail \? "shrink-0" : "w-1\/2"/);
  // Left, right and bottom have their own homes — one navigation, four places.
  assert.match(PLAYER, /const quadRailLeft = quadWide && navPlacement === "left" && !quadNavInDeck && !quadFooterOff;/);
  assert.match(PLAYER, /const quadRailRight = quadWide && navPlacement === "right" && !quadNavInDeck && !quadFooterOff;/);
  assert.match(PLAYER, /const quadNavBottom = quadWide && navPlacement === "bottom" && !quadNavInDeck && !quadFooterOff;/);
  // The owner's footer rule (2026-10-16+): "footer navigations Keval tabhi
  // dikhe jo bhi user single split mode mein ho, means Keval do block".
  assert.match(PLAYER, /const footerNavigationAlways = useFooterNavigationAlways\(\);/);
  assert.match(PLAYER, /const quadFooterOff = quadWide && !quadSingleSplit\(quadState\) && !footerNavigationAlways;/);
  assert.match(MODEL, /export function quadSingleSplit\(state: QuadLayoutState\): boolean \{\n\s+return quadOpenBlockCount\(state\) === 2;/);
  assert.match(PLAYER, /data-quad-nav-rail="left"/);
  assert.match(PLAYER, /data-quad-nav-rail="right"/);
  assert.match(PLAYER, /data-quad-nav-bottom/);
});

/* ── 8 · the owner's "-6px" ─────────────────────────────────────────────── */

test("the navigation's box comes down by six pixels — and only from 768px up", () => {
  assert.match(PLACEMENT, /export const FOOTER_NAVIGATION_SIZE_STEP_PX = 6;/);
  assert.match(PLACEMENT, /export const FOOTER_NAVIGATION_BASE_HEIGHT_PX = 44;/);
  assert.match(PLACEMENT, /export const FOOTER_NAVIGATION_HEIGHT_PX = FOOTER_NAVIGATION_BASE_HEIGHT_PX - FOOTER_NAVIGATION_SIZE_STEP_PX;/);
  assert.match(PLACEMENT, /"--work-nav-h": `\$\{FOOTER_NAVIGATION_HEIGHT_PX\}px`,/);
  // 44 → 38 with the padding following (9 → 6), so the icons stay legible.
  assert.match(DECK_CSS, /\[data-quad-nav-shrunk\] \[data-work-footer-nav\] \[data-site-footer\]\[data-nav-count\] \{\n  --work-nav-h: 38px;\n  --work-nav-cell: 40px;\n\}/);
  assert.match(DECK_CSS, /\[data-quad-nav-shrunk\] \[data-work-footer-nav\] \[data-work-nav-cell\] \{\n  height: 38px;\n  padding: 6px 11px;\n\}/);
  assert.match(PLAYER, /\{\.\.\.\(quadWide \? \{ "data-quad-nav-shrunk": "" \} : \{\}\)\}/);
});

/* ── 9 · the placement button and its dropdown direction ────────────────── */

test("the placement button is tablet/desktop only and always opens into free space", () => {
  assert.match(NAV, /if \(!enabled\) return null;/);
  assert.match(NAV, /const enabled = useFooterNavigationPlacementEnabled\(\);/);
  assert.match(PLACEMENT, /export const FOOTER_NAVIGATION_PLACEMENT_MEDIA_QUERY = "\(min-width: 768px\)";/);
  assert.match(PLACEMENT, /if \(placement === "header"\) return "down";/);
  assert.match(PLACEMENT, /if \(placement === "bottom"\) return "up";/);
  assert.match(PLACEMENT, /if \(placement === "left"\) return "right";/);
  assert.match(PLACEMENT, /return "left";/);
  // The four options, with the current one marked, and a click outside closing it.
  assert.match(NAV, /FOOTER_NAVIGATION_PLACEMENTS\.map\(\(option\) => \{/);
  assert.match(NAV, /data-dc-header-nav-option=\{option\}/);
  assert.match(NAV, /setFooterNavigationPlacement\(option\);/);
  assert.match(NAV, /document\.addEventListener\("pointerdown", onPointerDown, true\);/);
  // Every side has its own rule in the sheet — never off-screen.
  for (const side of ["down", "up", "right", "left"]) {
    assert.match(NAV_CSS, new RegExp(`\\.dc-header-nav__menu\\[data-side="${side}"\\] \\{`));
  }
});

test("the navigation is the same component everywhere: icons + labels, every tab working", () => {
  assert.match(NAV, /import \{ TABS, type DockTab \} from "\.\/CourseOverlay";/);
  assert.match(NAV, /const items = TABS\.filter\(\(item\) => !hiddenTabs\.includes\(item\.key\)\);/);
  assert.match(NAV, /data-dc-header-nav-tab=\{item\.key\}/);
  assert.match(NAV, /data-dc-header-nav-label/);
  // ONE drawing (HeaderNavView), reused by Work mode with its own page list,
  // and one thin course wrapper that owns the course's own rules.
  assert.match(NAV, /export function HeaderNavView\(\{/);
  assert.match(NAV, /onClick=\{\(\) => onSelect\(item\.key\)\}/);
  assert.match(NAV, /onSelect=\{\(key\) => onTabChange\(key as DockTab\)\}/);
  assert.match(NAV, /items=\{items\}/);
  // The same visibility rule as the footer: keyboard up or an immersive page.
  assert.match(NAV, /const pageRuleHidesFooter = useFooterHiddenPage\(tab\);/);
  assert.match(NAV, /const footerNavigationAlways = useFooterNavigationAlways\(\);/);
  assert.match(NAV, /const immersivePage = pageRuleHidesFooter && !footerNavigationAlways;/);
  assert.match(NAV, /if \(keyboardVisible \|\| immersivePage\) return null;/);
  // Its own row, sized by the shrunken rhythm.
  assert.match(NAV, /style=\{footerNavigationSizeVars\(\) as CSSProperties\}/);
});

/* ── 10 · the scope: 768px and up, mobile untouched ─────────────────────── */

test("the whole system starts at 768px and the phone keeps today's player", () => {
  assert.match(MODEL, /export const QUAD_MIN_SCREEN_PX = 768;/);
  assert.match(MODEL, /export const QUAD_MEDIA_QUERY = `\(min-width: \$\{QUAD_MIN_SCREEN_PX\}px\)`;/);
  assert.match(MODEL, /export function useQuadDeckEnabled\(\): boolean \{/);
  // The player swaps layouts on that one boolean, and nothing else changes.
  assert.match(PLAYER, /const quadWide = useQuadDeckEnabled\(\);/);
  assert.match(PLAYER, /\{quadOverlay \? quadOverlay : \(/);
  assert.match(PLAYER, /\{quadWide \? null : <CoursePeekDock tab=\{dockTab\} onTabChange=\{handleDockTabChange\} hiddenTabs=\{hiddenTabs\} \/>\}/);
  // The split deck is still the phone's layout — untouched.
  assert.match(SPLIT, /export function SplitDeck\(/);
  assert.match(PLAYER, /import \{ SplitDeck, type SplitDeckHandle \} from "\.\/course\/studyPanels";/);
  // The plus deck never exports the split divider, and studyPanels keeps it private.
  assert.doesNotMatch(DECK, /SplitDivider/);
  assert.match(SPLIT, /^function SplitDivider\(\{/m);
  assert.doesNotMatch(SPLIT, /export function SplitDivider|export \{ SplitDivider/);
});

/* ── the Course view page behind the gear ───────────────────────────────── */

test("the gear's Course view page carries the zoom and the four divider switches", () => {
  assert.match(VIEW, /export const COURSE_VIEW_ZOOM_MIN = 80;/);
  assert.match(VIEW, /export const COURSE_VIEW_ZOOM_MAX = 140;/);
  assert.match(VIEW, /export const COURSE_VIEW_ZOOM_STEP = 10;/);
  assert.match(VIEW, /export const COURSE_DIVIDER_SEGMENTS: CourseDividerSegment\[\] = \["vTop", "vBottom", "hLeft", "hRight"\];/);
  assert.match(VIEW, /export function setCourseViewZoom\(zoom: number\): void \{/);
  assert.match(VIEW, /export function setCourseDividerVisible\(segment: CourseDividerSegment, visible: boolean\): void \{/);
  assert.match(VIEW_PANEL, /data-course-view-page/);
  // The player still OWNS the page — it just renders the shared component now.
  assert.match(PANEL, /<CourseViewPanel quadWide=\{quadWide\} \/>/);
  assert.match(VIEW_PANEL, /data-course-view-zoom-out/);
  assert.match(VIEW_PANEL, /data-course-view-zoom-in/);
  assert.match(VIEW_PANEL, /data-course-view-zoom-value/);
  assert.match(VIEW_PANEL, /COURSE_DIVIDER_SEGMENTS\.map\(\(segment\) => \(/);
  // …on the app's own switch, never a native checkbox.
  assert.match(VIEW_PANEL, /"data-course-view-divider": segment/);
  assert.match(VIEW_PANEL, /data-course-view-divider-row=\{segment\}/);
  assert.match(VIEW_PANEL, /on=\{courseView\.dividers\[segment\]\}/);
  assert.match(VIEW_PANEL, /onChange=\{\(next\) => setCourseDividerVisible\(segment, next\)\}/);
  assert.doesNotMatch(VIEW_PANEL, /<input/);
  assert.doesNotMatch(PANEL, /<input/);
  // The Course view page replaces the old split-view note (the owner renamed it).
  assert.doesNotMatch(PANEL, /Split view/);
  // And the deck applies both: zoom on its own layer, the switches on the lines.
  assert.match(DECK, /transform: zoom === 1 \? undefined : `scale\(\$\{zoom\}\)`,/);
  assert.match(DECK, /visible=\{\{ vTop: view\.dividers\.vTop, vBottom: view\.dividers\.vBottom \}\}/);
  assert.match(DECK, /visible=\{\{ vTop: view\.dividers\.hLeft, vBottom: view\.dividers\.hRight \}\}/);
  assert.match(DECK_CSS, /\.dc-quad-segment\[data-visible="false"\] \.dc-quad-segment__line \{\n  opacity: 0;\n\}/);
  // Reduced motion: the zoom jumps instead of easing.
  assert.match(DECK, /transition: reducedMotion \? "none" : "transform 220ms cubic-bezier\(0\.22, 1, 0\.36, 1\)",/);
  assert.match(DECK_CSS, /@media \(prefers-reduced-motion: reduce\) \{\n  \.dc-quad-zoom \{\n    transition: none !important;\n  \}\n\}/);
});

/* ── the overlay's wiring ───────────────────────────────────────────────── */

test("the overlay hands the deck its four blocks, the state and the navigation", () => {
  assert.match(OVERLAY, /quad\?: CourseOverlayQuadConfig;/);
  assert.match(OVERLAY, /export interface CourseOverlayQuadConfig \{/);
  assert.match(OVERLAY, /import QuadDeck from "\.\/QuadDeck";/);
  assert.match(OVERLAY, /if \(props\.quad\) \{/);
  assert.match(OVERLAY, /player=\{props\.quad\.playerPane\}/);
  assert.match(OVERLAY, /notes=\{notesPanelNode\}/);
  assert.match(OVERLAY, /resources=\{props\.resourceLibraryPanel \?\? RESOURCES_FALLBACK\}/);
  assert.match(OVERLAY, /mindmap=\{props\.mindMapPanel \?\? MINDMAP_FALLBACK\}/);
  assert.match(OVERLAY, /resourcesFooter=\{props\.quad\.nav\}/);
  assert.match(OVERLAY, /reveal=\{props\.quad\.reveal\}/);
  // The footer strip is NOT drawn inside the plus deck: the navigation is
  // placed by the player instead (and under the Resource Library in the
  // single-divider shape).
  assert.match(OVERLAY, /const dock = props\.peekDock \|\| props\.quad \? null : \(/);
  // The borrowed block: the tab's own body plus the surfaces that must never
  // restart (a song, a chat, a PDF).
  assert.match(OVERLAY, /const borrowed = \(/);
  assert.match(OVERLAY, /data-course-quad-borrowed/);
  assert.match(OVERLAY, /study=\{borrowed\}/);
  assert.match(OVERLAY, /studyVisible=\{!tabHasOwnBlock\}/);
  assert.match(OVERLAY, /const persistentSurfaces = \(/);
  assert.equal((OVERLAY.match(/const persistentSurfaces = \(/g) || []).length, 1, "defined once, used twice");
  assert.equal((OVERLAY.match(/\{persistentSurfaces\}/g) || []).length, 2);
  // The three tabs that own a block are the only ones that do not borrow.
  assert.match(OVERLAY, /const paneOwnedTabs: DockTab\[\] = \["notes", "mindmap", "modules"\];/);
});

test("a navigation tap opens that page in a block — the free-blocks route", () => {
  assert.match(PLAYER, /const handleNavTabChange = \(next: DockTab\) => \{/);
  // One effect routes EVERY tab change (nav taps, shortcuts, deep links) into
  // a block; the mount tab never routes, so a course opens on blank pages.
  assert.match(PLAYER, /const routedDockTabRef = useRef<string \| null>\(null\);/);
  assert.match(PLAYER, /if \(routedDockTabRef\.current === dockTab\) return;/);
  assert.match(PLAYER, /if \(first \|\| !quadWide\) return;/);
  assert.match(PLAYER, /openQuadPage\(page\);/);
  // A page already on screen glows in its block; otherwise a blank block
  // first, else the block the learner touched last.
  assert.match(PLAYER, /const openQuadPage = useCallback\(/);
  assert.match(PLAYER, /const existing = quadFindPageBlock\(current, page\);/);
  assert.match(PLAYER, /setQuadReveal\(\(prev\) => \(\{ pane: existing, count: \(prev\?\.count \?\? 0\) \+ 1 \}\)\);/);
  assert.match(PLAYER, /pushPageHistory\(`block:\$\{target\}`, page\);/);
  assert.match(PLAYER, /commitQuadState\(quadSetBlockPage\(current, target, page\)\);/);
  // The reveal glow still brings a hidden block back on the grid shapes.
  assert.match(DECK, /if \(!quadPaneVisible\(current, pane\)\) onState\(quadTogglePane\(current, pane\)\);/);
  // The mind map's panel still goes through the open transition that restores
  // the last view from the panel session.
  assert.match(PLAYER, /open=\{quadWide \? quadPaneLive : dockTab === "mindmap"\}/);
});

test("the deck's state is persisted per course, so the player never opens fresh", () => {
  assert.match(PLAYER, /const \[quadState, setQuadState\] = useState<QuadLayoutState>\(\(\) => loadQuadLayout\(storageProductId\)\);/);
  assert.match(PLAYER, /saveQuadLayout\(storageProductId, next\);/);
  assert.match(MODEL, /const storageKey = \(courseId: string\) => `dc\.course\.quadLayout\.v1\.\$\{courseId \|\| "course"\}`;/);
  assert.match(MODEL, /export function loadQuadLayout\(courseId: string\): QuadLayoutState \{/);
  assert.match(MODEL, /export function saveQuadLayout\(courseId: string, state: QuadLayoutState\): void \{/);
});

/* ── the squeeze: two blocks pressed together ───────────────────────────── */

test("a divider pressed onto its clamp keeps a gap and offers ONE small way back", () => {
  // The squeeze line and the wider gap.
  assert.match(DECK, /const QUAD_SQUEEZE_EPS = 0\.6;/);
  assert.match(DECK, /const QUAD_SQUEEZE_GAP = 18;/);
  assert.match(DECK, /const squeezedCol = state\.col <= QUAD_COL_MIN \+ QUAD_SQUEEZE_EPS \|\| state\.col >= QUAD_COL_MAX - QUAD_SQUEEZE_EPS;/);
  assert.match(DECK, /const squeezedRow = state\.row <= QUAD_ROW_MIN \+ QUAD_SQUEEZE_EPS \|\| state\.row >= QUAD_ROW_MAX - QUAD_SQUEEZE_EPS;/);
  assert.match(DECK, /data-quad-squeezed=/);
  // The way back is the PREVIOUS size of that axis, remembered while it was
  // still roomy — never a default.
  assert.match(DECK, /const lastColRef = useRef\(state\.col\);/);
  assert.match(DECK, /const lastRowRef = useRef\(state\.row\);/);
  assert.match(DECK, /if \(!squeezedCol\) lastColRef\.current = state\.col;/);
  assert.match(DECK, /if \(!squeezedRow\) lastRowRef\.current = state\.row;/);
  assert.match(DECK, /const restoreCol = \(\) => commit\(\{ \.\.\.state, col: clampQuadCol\(lastColRef\.current\) \}\);/);
  assert.match(DECK, /const restoreRow = \(\) => commit\(\{ \.\.\.state, row: clampQuadRow\(lastRowRef\.current\) \}\);/);
  assert.match(DECK, /squeezed=\{squeezedCol\}/);
  assert.match(DECK, /onRestore=\{restoreCol\}/);
  assert.match(DECK, /squeezed=\{squeezedRow\}/);
  assert.match(DECK, /onRestore=\{restoreRow\}/);
  // ONE small icon at the divider's centre, and the wider gap behind it.
  assert.match(DECK, /data-course-quad-restore=\{axis\}/);
  assert.match(DECK, /`\$\{squeezed \? QUAD_SQUEEZE_GAP : DIVIDER_HIT\}px`/);
  assert.match(DECK, /Expand the squeezed blocks back to their previous width/);
  assert.match(DECK, /Expand the squeezed blocks back to their previous height/);
  assert.match(DECK, /data-squeezed=\{squeezed \? "true" : "false"\}/);
  // The divider ELEMENT still paints nothing (a plate across the whole gap is
  // what the owner rejected) — the chrome is its own thin child: the white
  // strip he asked back (2026-10-16), 6px, running the gap's whole length with
  // the small icon centred on top of it.
  const dividerRule = DECK_CSS.slice(DECK_CSS.indexOf(".dc-quad-divider {"), DECK_CSS.indexOf(".dc-quad-divider--v"));
  assert.doesNotMatch(dividerRule, /background/, "the divider element itself stays transparent");
  assert.match(DECK, /<span aria-hidden data-course-quad-strip="" className="dc-quad-strip" \/>/);
  assert.match(DECK, /"--quad-strip": `\$\{PEEK_STRIP_PX\}px`/);
  assert.match(DECK, /import \{ DIVIDER_HIT, DIVIDER_LINE, EASE_OUT_MOTION, PEEK_STRIP_PX \} from "\.\/splitMotion";/);
  assert.match(MOTION, /export const PEEK_STRIP_PX = 6;/);
  assert.match(DECK_CSS, /\.dc-quad-strip \{/);
  assert.match(DECK_CSS, /width: var\(--quad-strip, 6px\);/);
  assert.match(DECK_CSS, /height: var\(--quad-strip, 6px\);/);
  // Between the two blocks, and BEHIND the icon (which sits at z-index 3).
  assert.match(DECK_CSS, /\.dc-quad-strip \{[\s\S]{0,420}?z-index: 1;/);
  assert.match(DECK_CSS, /\.dc-quad-restore \{[\s\S]{0,220}?z-index: 3;/);
  assert.match(DECK_CSS, /\.dc-quad-divider--h \.dc-quad-strip \{/);
  assert.match(DECK_CSS, /\.dc-quad-divider\[data-squeezed="true"\] \{/);
  assert.match(DECK_CSS, /\.dc-quad-restore \{/);
  assert.match(DECK_CSS, /\.dc-quad-restore:hover \{/);
  assert.match(DECK_CSS, /@media \(prefers-reduced-motion: reduce\) \{\n  \.dc-quad-restore \{/);
});

/* ── the nav-space rule ─────────────────────────────────────────────────── */

test("panel chrome steps out of the navigation's way", () => {
  assert.match(DECK, /data-quad-nav-side=\{navSide\}/);
  assert.match(DECK_CSS, /\[data-course-quad-deck\]\[data-quad-nav-side="right"\] \[data-course-notes-add\]/);
  assert.match(DECK_CSS, /\[data-course-quad-deck\]\[data-quad-nav-side="left"\] \[data-course-notes-add\]/);
  assert.match(DECK_CSS, /\/\* A phone never mounts the deck, so the rules above cannot reach it\. \*\//);
});

/* ═══════════════════════════════════════════════════════════════════════
 * The 2026-10-16+ upgrade: the DYNAMIC CROSS, the free blocks' blank
 * starter page and the step-back button.
 * ═══════════════════════════════════════════════════════════════════════ */

test("the dynamic cross: four half-dividers with their OWN drag, meeting at the centre joint", () => {
  // Four arm positions — the owner's "charon ka apna alag drag position hoga".
  assert.match(FLEX, /export interface QuadFlexState \{/);
  assert.match(FLEX, /xTop: number;/);
  assert.match(FLEX, /xBottom: number;/);
  assert.match(FLEX, /yLeft: number;/);
  assert.match(FLEX, /yRight: number;/);
  // Each arm runs from its outer edge in to the joint.
  assert.match(FLEX, /export const quadFlexArms = \(flex: QuadFlexState\): Record<QuadArmKey, QuadFlexArm> => \{/);
  assert.match(FLEX, /top: \{ value: f\.xTop, from: 0, to: joint\.top \},/);
  assert.match(FLEX, /left: \{ value: f\.yLeft, from: 0, to: joint\.left \},/);
  // One arm's drag moves ONE value; the joint's drag moves all four
  // ("center se directly ham drag karenge to charon ek saath resize honge").
  assert.match(FLEX, /export const moveQuadFlexArm = \(flex: QuadFlexState, arm: QuadArmKey, delta: number\): QuadFlexState => \{/);
  assert.match(FLEX, /export const moveQuadFlexJoint = \(flex: QuadFlexState, dx: number, dy: number\): QuadFlexState => \{/);
  // The deck draws the four arms and the joint; the cross drops the old
  // grid dividers entirely.
  assert.match(DECK, /data-course-quad-flex-arm=\{arm\}/);
  assert.match(DECK, /data-course-quad-flex-joint/);
  assert.match(DECK, /handleFlexPointerDown = \(kind: QuadArmKey \| "joint"\)/);
  assert.match(DECK, /const dynamicCross = Boolean\(blocks\) && state\.format === "quad";/);
  // Live drags write the four CSS variables — no re-render per frame.
  assert.match(DECK, /deck\.style\.setProperty\("--flex-xt"/);
  assert.match(DECK_CSS, /\.dc-quad-flex__block--c11 \{[\s\S]{0,160}?width: var\(--flex-xt\);\n  height: var\(--flex-yl\);/);
  assert.match(DECK_CSS, /\.dc-quad-flex__joint-handle \{/);
});

test("every block starts on a WHITE blank picker — solid blue/white rectangular buttons only", () => {
  // The owner's starter page: "block Keval aur Keval ek blank page se start
  // hoga … white background, button s blue white, rectangular … sabkuchh
  // solid color, glass type nahin".
  assert.match(PICKER, /className="dc-block-picker"/);
  assert.match(PICKER, /data-course-block-picker-page=\{record\.key\}/);
  const pickerRule = DECK_CSS.slice(DECK_CSS.indexOf(".dc-block-picker {"), DECK_CSS.indexOf(".dc-block-picker__head"));
  assert.match(pickerRule, /background: #ffffff;/);
  assert.doesNotMatch(pickerRule, /gradient|backdrop-filter/, "solid colours only — no glass");
  const buttonRule = DECK_CSS.slice(DECK_CSS.indexOf(".dc-block-picker__button {"), DECK_CSS.indexOf(".dc-block-picker__button:hover"));
  assert.match(buttonRule, /background: #2563eb;/);
  assert.match(buttonRule, /border: 2px solid #2563eb;/);
  assert.match(buttonRule, /border-radius: 6px;/, "rectangular buttons");
  assert.match(buttonRule, /color: #ffffff;/);
  // The catalog lists every course player page — the lesson, the learner's
  // own tree and the player settings included.
  assert.match(PAGES, /"lesson"/);
  assert.match(PAGES, /"personal"/);
  assert.match(PAGES, /"player"/);
  // A page already open elsewhere MOVES on pick (one page, one block).
  assert.match(MODEL, /pages\[other\] === page/);
  assert.match(PAGES, /export function findBlockOwningPage/);
});

test("the top-left Back button steps through previous pages — never a jump home", () => {
  // The owner's rule: "yah button directly home page per redirect na karen …
  // step bye step previous pages per click karne per back kare. Course player
  // ke sabhi pages per top left mein yah button hoga."
  assert.match(BACK, /className="dc-page-back"/);
  assert.match(BACK, /onBack/);
  assert.doesNotMatch(BACK, /location|hash|href|window\./, "it never navigates on its own");
  const backRule = DECK_CSS.slice(DECK_CSS.indexOf(".dc-page-back {"), DECK_CSS.indexOf(".dc-page-back:hover"));
  assert.match(backRule, /background: #ffffff;/);
  assert.match(backRule, /border: 2px solid #2563eb;/);
  // Top-left of the surface it sits on.
  assert.match(backRule, /top: 6px;/);
  assert.match(backRule, /left: 6px;/);
  // The walk: one page per click, and quiet at its end.
  assert.match(HISTORY, /export function backPageHistory\(scope: string\): string \| null \{/);
  assert.match(HISTORY, /if \(stack\.length <= 1\) return null;/);
  assert.match(DECK, /<PageBackButton\n\s+surface=\{pane\}\n\s+enabled=\{canBack\}\n\s+onBack=\{\(\) => onBack\(pane\)\}/);
  // The phone's study pane and the lesson pane carry it too — every page.
  assert.match(PLAYER, /<PageBackButton surface="lesson" enabled=\{lessonCanBack\} onBack=\{backLessonPage\} \/>/);
  assert.match(PLAYER, /<PageBackButton surface="study" enabled=\{studyCanBack\} onBack=\{backStudyPage\} \/>/);
});

test("the footer navigation shows only in single split mode — Keval do block", () => {
  assert.match(MODEL, /"footer navigations Keval tabhi/);
  assert.match(MODEL, /dikhe jo bhi user single split mode mein ho, means Keval do block"/);
  assert.match(MODEL, /return quadOpenBlockCount\(state\) === 2;/);
  // …and the deck's placement flags all step behind it (with the "always"
  // setting as the one override).
  assert.match(PLAYER, /const footerNavigationAlways = useFooterNavigationAlways\(\);/);
  assert.match(PLAYER, /const quadFooterOff = quadWide && !quadSingleSplit\(quadState\) && !footerNavigationAlways;/);
});
