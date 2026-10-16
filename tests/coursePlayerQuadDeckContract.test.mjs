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
const NAV = read("src/course/CourseHeaderNav.tsx");
const NAV_CSS = read("src/course/course-header-nav.css");
const PLACEMENT = read("src/utils/footerNavigationPlacement.ts");
const VIEW = read("src/course/courseViewSettings.ts");
const PLAYER = read("src/CoursePlayerApp.tsx");
const OVERLAY = read("src/course/CourseOverlay.tsx");
const PANEL = read("src/course/PlayerPanel.tsx");
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

test("the deck draws exactly two dividers, never four", () => {
  // ONE vertical divider (its two half segments) and ONE horizontal one.
  assert.equal((DECK.match(/<QuadDivider/g) || []).length, 2);
  assert.match(DECK, /\{hasVertical \? \(/);
  assert.match(DECK, /\{hasHorizontal \? \(/);
  assert.match(DECK, /data-course-quad-divider=\{axis\}/);
  assert.doesNotMatch(DECK, /DIVIDERS|fourDividers|dividers\.map/);
  // The two axes are the only ones the deck knows.
  assert.match(DECK, /axis: "v" \| "h";/);
});

/* ── 2 · every divider always drags ─────────────────────────────────────── */

test("both dividers are always draggable — no mode, no gate, no unlock", () => {
  assert.match(DECK, /const handlePointerDown = \(axis: "v" \| "h"\) => \(event: ReactPointerEvent<HTMLDivElement>\) => \{/);
  assert.match(DECK, /dragRef\.current = \{ axis, start: axis === "v" \? event\.clientX : event\.clientY, base, live: base \};/);
  assert.match(DECK, /event\.currentTarget\.setPointerCapture\?\.\(event\.pointerId\);/);
  // The live drag writes the CSS variables straight to the DOM (no React
  // re-render per frame) and commits on release.
  assert.match(DECK, /deck\.style\.setProperty\(axis === "v" \? "--quad-col" : "--quad-row", `\$\{value\}%`\);/);
  assert.match(DECK, /if \(drag\.axis === "v"\) commit\(\{ \.\.\.state, col: clampQuadCol\(drag\.live\) \}\);/);
  // Keyboard parity, and no gate on the drag path at all.
  assert.match(DECK, /const QUAD_KEY_STEP = 2;/);
  assert.match(DECK, /if \(event\.key === "s" \|\| event\.key === "S"\) \{/);
  assert.doesNotMatch(DECK, /wide|isTablet|SPLIT_WIDE_MIN_PX/);
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
  assert.match(DECK, /onPress=\{\(\) => \{\n\s+commit\(quadSwap\(state, "cols"\)\);\n\s+setMenu\(null\);/);
  assert.match(DECK, /commit\(quadTogglePane\(state, button\.pane\)\);\n\s+setMenu\(null\);/);
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
  assert.match(DECK, /disabled=\{button\.lastOne\}/);
  assert.match(MODEL, /lastOne: visible && open\.length === 1,/);
});

/* ── 6 · every grid shape the owner named ───────────────────────────────── */

test("the model carries every grid shape the brief asks for", () => {
  assert.match(MODEL, /export type QuadFormat = "quad" \| "top1" \| "bottom1" \| "top2" \| "bottom2" \| "pair";/);
  assert.match(MODEL, /label: "1 upar · 3 niche"/);
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
  assert.match(PLAYER, /const headerNavInRail = quadWide && navPlacement === "header" && !quadNavInDeck;/);
  assert.match(PLAYER, /data-course-nav-slot/);
  assert.match(PLAYER, /\{courseNavNode\}\n\s+<\/div>/);
  // The progress bar takes the free space and Settings keeps its own width.
  assert.match(PLAYER, /headerNavInRail \? "min-w-0 flex-1" : "w-1\/2"/);
  assert.match(PLAYER, /headerNavInRail \? "shrink-0" : "w-1\/2"/);
  // Left, right and bottom have their own homes — one navigation, four places.
  assert.match(PLAYER, /const quadRailLeft = quadWide && navPlacement === "left" && !quadNavInDeck;/);
  assert.match(PLAYER, /const quadRailRight = quadWide && navPlacement === "right" && !quadNavInDeck;/);
  assert.match(PLAYER, /const quadNavBottom = quadWide && navPlacement === "bottom" && !quadNavInDeck;/);
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
  assert.match(NAV, /onClick=\{\(\) => onTabChange\(item\.key\)\}/);
  // The same visibility rule as the footer: keyboard up or an immersive page.
  assert.match(NAV, /const pageRuleHidesFooter = useFooterHiddenPage\(tab\);/);
  assert.match(NAV, /const immersivePage = pageRuleHidesFooter && !useFooterNavigationAlways\(\);/);
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
  assert.match(PANEL, /data-course-view-page/);
  assert.match(PANEL, /data-course-view-zoom-out/);
  assert.match(PANEL, /data-course-view-zoom-in/);
  assert.match(PANEL, /data-course-view-zoom-value/);
  assert.match(PANEL, /COURSE_DIVIDER_SEGMENTS\.map\(\(segment\) => \(/);
  // …on the app's own switch, never a native checkbox.
  assert.match(PANEL, /"data-course-view-divider": segment/);
  assert.match(PANEL, /data-course-view-divider-row=\{segment\}/);
  assert.match(PANEL, /on=\{courseView\.dividers\[segment\]\}/);
  assert.match(PANEL, /onChange=\{\(next\) => setCourseDividerVisible\(segment, next\)\}/);
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

test("the player brings a closed block back when its navigation button is pressed", () => {
  assert.match(PLAYER, /const handleNavTabChange = \(next: DockTab\) => \{/);
  assert.match(PLAYER, /next === "notes" \? "c12" : next === "mindmap" \? "c22" : next === "modules" \? "c21" : null;/);
  assert.match(PLAYER, /setQuadReveal\(\(prev\) => \(\{ pane, count: \(prev\?\.count \?\? 0\) \+ 1 \}\)\);/);
  assert.match(DECK, /if \(!quadPaneVisible\(current, pane\)\) onState\(quadTogglePane\(current, pane\)\);/);
  // The mind map's block is on screen for the whole visit on a big stage, and
  // its panel still goes through the open transition that restores the last
  // view from the panel session.
  assert.match(PLAYER, /open=\{quadWide \? quadPaneLive : dockTab === "mindmap"\}/);
});

test("the deck's state is persisted per course, so the player never opens fresh", () => {
  assert.match(PLAYER, /const \[quadState, setQuadState\] = useState<QuadLayoutState>\(\(\) => loadQuadLayout\(storageProductId\)\);/);
  assert.match(PLAYER, /saveQuadLayout\(storageProductId, next\);/);
  assert.match(MODEL, /const storageKey = \(courseId: string\) => `dc\.course\.quadLayout\.v1\.\$\{courseId \|\| "course"\}`;/);
  assert.match(MODEL, /export function loadQuadLayout\(courseId: string\): QuadLayoutState \{/);
  assert.match(MODEL, /export function saveQuadLayout\(courseId: string, state: QuadLayoutState\): void \{/);
});

/* ── the nav-space rule ─────────────────────────────────────────────────── */

test("panel chrome steps out of the navigation's way", () => {
  assert.match(DECK, /data-quad-nav-side=\{navSide\}/);
  assert.match(DECK_CSS, /\[data-course-quad-deck\]\[data-quad-nav-side="right"\] \[data-course-notes-add\]/);
  assert.match(DECK_CSS, /\[data-course-quad-deck\]\[data-quad-nav-side="left"\] \[data-course-notes-add\]/);
  assert.match(DECK_CSS, /\/\* A phone never mounts the deck, so the rules above cannot reach it\. \*\//);
});
