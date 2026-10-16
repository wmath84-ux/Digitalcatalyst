// tests/coursePlayerSplitExtraPanesContract.test.mjs
//
// Source-shape contract for the owner's 2026-10-14 brief, kept beside the
// runtime proof in tests/coursePlayerSplitExtraPanesRuntime.test.mjs:
//
//   · the divider's little button now offers MORE than the swap on a big
//     stage: one control splits the LESSON area into another part, the other
//     splits the STUDY area, and every divider carries the switch plus its
//     split-mode control;
//   · the controls are a tablet-sized / desktop affordance only — a phone
//     stage keeps the bare switch;
//   · an added part is never an empty box: it opens on a real study tab, and
//     it keeps a tab of its own;
//   · the added part never mounts a singleton canvas / chat / video, because
//     two of those would fight over one session.
//
// Plus the desktop footer-strip fix from the same brief: the circular plates
// must stay circles on a wide stage.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const MOTION = read("src/course/splitMotion.ts");
const DECK = read("src/course/studyPanels.tsx");
const PLAYER = read("src/CoursePlayerApp.tsx");
const TABS = read("src/course/ExtraPaneTabs.tsx");
const STRIP_CSS = read("src/course/course-strip-nav.css");

/* ── the split controls exist, and only where they belong ────────────────── */

test("the split ceiling and the wide-stage gate live in the motion file", () => {
  assert.match(MOTION, /export const SPLIT_WIDE_MIN_PX = 900;/);
  assert.match(MOTION, /export type SplitRegion = "lesson" \| "study";/);
  assert.match(MOTION, /export const EXTRA_PANE_MIN = 15;/);
  assert.match(MOTION, /export const EXTRA_PANE_MAX = 85;/);
  assert.match(MOTION, /export const EXTRA_PANE_DEFAULT = 50;/);
});

test("the deck measures itself, so a phone stage never offers a third pane", () => {
  assert.match(DECK, /const wide = renderExtraPane \? deckWidth >= SPLIT_WIDE_MIN_PX : false;/);
  // One control per region, and only while that region can still grow.
  assert.match(DECK, /if \(!wide\) return \[\];/);
  assert.match(DECK, /if \(!extras\.lesson\) actions\.push\(splitAction\("lesson"\)\);/);
  assert.match(DECK, /if \(!extras\.study\) actions\.push\(splitAction\("study"\)\);/);
  // The region's own divider offers the way back plus the other side.
  assert.match(DECK, /id: `merge-\$\{region\}`/);
  assert.match(DECK, /if \(wide && !extras\[other\]\) actions\.push\(splitAction\(other\)\);/);
});

test("the divider renders the controls it is handed, next to the switch", () => {
  assert.match(DECK, /export interface SplitDividerAction \{/);
  assert.match(DECK, /actions\?: SplitDividerAction\[\];/);
  assert.match(DECK, /data-course-split-action=\{action\.id\}/);
  assert.match(DECK, /\{actions\.map\(\(action\) => \(/);
  // The switch itself is untouched: still the tap-revealed toolbar button
  // (36px glass pill since the divider-toolbar redesign).
  assert.match(DECK, /data-course-split-swap=""/);
  assert.match(DECK, /<ArrowLeftRight size=\{SWAP_ICON_PX\} \/>/);
});

/* ── an added part is never empty, and keeps its own tab ─────────────────── */

test("an extra part is a real study pane with a tab of its own", () => {
  assert.match(DECK, /renderExtraPane\?: \(region: SplitRegion, tab: string, setTab: \(tab: string\) => void\) => ReactNode;/);
  assert.match(DECK, /extraPaneTab\?: \(used: string\[\]\) => string;/);
  // A brand-new part lands on a tab that is not already on screen.
  assert.match(DECK, /const tab = extraPaneTab\?\.\(usedExtraTabs\(\)\) \?\? "modules";/);
  assert.match(DECK, /const usedExtraTabs = useCallback\(/);
  // …it opens drawn, not collapsed to zero.
  assert.match(DECK, /\[region\]: \{ tab, percent: EXTRA_PANE_ENTRY, swapped: false \}/);
  assert.match(DECK, /renderExtraPane\(region, pane\.tab, \(tab: string\) => patchRegion\(region, \{ tab \}\)\)/);
});

test("the added part has its own divider with the same two gestures", () => {
  assert.match(DECK, /kind="nested"/);
  assert.match(DECK, /data-course-region=\{region\}/);
  assert.match(DECK, /data-region-pane="extra"/);
  // Both dividers share ONE tap-reveal implementation.
  assert.match(DECK, /function useDividerReveal\(/);
  assert.match(DECK, /const \{ swapVisible, revealSwap, handlePointerDown, handlePointerUp, handlePointerCancel \} =\s*\n\s*useDividerReveal\(axis, \{ onPointerDown, onPointerUp, onPointerCancel \}\);/);
});

test("an extra part never mounts a singleton canvas, chat or video", () => {
  for (const prop of ["mindMapPanel", "sketchPanel", "playerPanel", "experimentPanel", "aiPanel"]) {
    assert.match(
      PLAYER,
      new RegExp(`^\\s+${prop}=\\{opts\\.extra \\? undefined :`, "m"),
      `${prop} is withheld from an extra part`,
    );
  }
  // …and the tab list it can choose from says the same thing.
  assert.match(PLAYER, /\(\["modules", "notes", "read", "paid"\] as DockTab\[\]\)/);
});

/* ── the wiring between the player and the deck ──────────────────────────── */

test("the player hands the deck the pane renderer and the free-tab rule", () => {
  assert.match(PLAYER, /const renderExtraPane = \(region: SplitRegion, tab: string, setTab: \(tab: string\) => void\) => \{/);
  assert.match(PLAYER, /const extraPaneTab = \(used: string\[\]\) => \{/);
  assert.match(PLAYER, /const taken = new Set<string>\(\[dockTab, \.\.\.used\]\);/);
  assert.match(PLAYER, /renderExtraPane=\{renderExtraPane\}/);
  assert.match(PLAYER, /extraPaneTab=\{extraPaneTab\}/);
  // The main pane is built by the SAME builder, so both share one tab language.
  assert.match(PLAYER, /const studyOverlay = \(\n[\s\S]{0,600}?buildStudyPane\(dockTab, handleDockTabChange\)/);
  assert.match(PLAYER, /const buildStudyPane = \(/);
});

test("the extra part's own tab chooser is a real control", () => {
  assert.match(TABS, /role="tablist"/);
  assert.match(TABS, /role="tab"/);
  assert.match(TABS, /data-extra-pane-tab=\{key\}/);
  assert.match(TABS, /aria-selected=\{tab === key\}/);
  assert.match(TABS, /className="extra-pane-tab-plate"/);
});

/* ── the footer: the Workspace pill, in the strip's unchanged area ─────── */

test("the footer is the Workspace pill at the strip's exact height, swipeable", () => {
  // The pill takes the Workspace design's markup hooks…
  const strip = read("src/course/CoursePeekDock.tsx");
  assert.match(strip, /data-work-footer-nav=""/);
  assert.match(strip, /data-site-footer=""/);
  assert.match(strip, /data-work-nav-cell=\{item\.key\}/);
  // …at exactly the height the old strip buttons occupied (area unchanged)…
  assert.match(STRIP_CSS, /--work-nav-h: 44px;/);
  // …and extra tools are reached by swiping inside the pill, never by
  // shrinking a cell.
  assert.match(STRIP_CSS, /overflow-x: auto/);
  assert.match(STRIP_CSS, /--work-nav-cell: 46px/);
  // The old letter plates are gone.
  assert.doesNotMatch(STRIP_CSS, /course-strip-plate|inset: 6px 0/);
});
