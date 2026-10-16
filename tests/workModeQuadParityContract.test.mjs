// tests/workModeQuadParityContract.test.mjs
//
// Work mode's half of the owner's 2026-10-16 brief:
//
//   "Work mode mein bhi same split-screen behaviour, same footer-navigation
//    behaviour aur naye notes page, mind map page aur sketch ke design — sab
//    kuchh exactly same chahiye."
//
// The contract is deliberately about REUSE: Work must mount the Course
// Player's own deck, its own placeable navigation and its own Course-view
// page, not a second copy of any of them. Runtime behaviour:
// tests/workModeQuadParityRuntime.test.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const APP = read("src/work/WorkApp.tsx");
const DECK = read("src/work/WorkQuadDeck.tsx");
const HEADER = read("src/work/WorkQuadHeader.tsx");
const SURFACE = read("src/work/pages/WorkPageSurface.tsx");
const QUAD_CSS = read("src/work/work-quad.css");

test("Work mounts the Course Player's own plus deck — never a second one", () => {
  assert.match(DECK, /import QuadDeck from "\.\.\/course\/QuadDeck";/);
  // The four blocks are handed in as ready nodes, exactly like the player does.
  assert.match(DECK, /player=\{block\(primary, "c11"\)\}/);
  assert.match(DECK, /notes=\{renderPage\("notes", "deck:c12:notes"\)\}/);
  assert.match(DECK, /resources=\{block\(secondary, "c21"\)\}/);
  assert.match(DECK, /mindmap=\{renderPage\("mindmap", "deck:c22:mindmap"\)\}/);
  // No second model, no second divider: the deck file never draws a divider,
  // a dot, a swap button or a grid format of its own.
  assert.doesNotMatch(DECK, /data-course-quad-divider|data-course-quad-dot|data-quad-format|data-quad-swap/);
  assert.doesNotMatch(DECK, /quadSetFormat|quadTogglePane|quadSwap\(|QUAD_FORMATS|QUAD_PANE_ORDER/);
});

test("the pages that can borrow a content block exclude the two that own blocks", () => {
  assert.match(
    DECK,
    /export const WORK_CONTENT_PAGES: WorkPageId\[\] = WORK_PAGES\.map\(\(page\) => page\.id\)\.filter\(\s*\(id\) => id !== "notes" && id !== "mindmap",\s*\);/,
  );
  // The empty-block picker only offers content pages.
  assert.match(DECK, /data-work-quad-prompt=\{slot\}/);
  assert.match(DECK, /data-work-quad-prompt-page=\{id\}/);
});

test("tablet/desktop gets the deck, a phone keeps today's Work deck untouched", () => {
  assert.match(APP, /const quadWide = useQuadDeckEnabled\(\);/);
  assert.match(APP, /\{quadWide \? \(/);
  // The phone branch: the same WorkDeck + WorkFooterNav it has always had.
  assert.match(APP, /<WorkDeck page=\{page\} axis=\{orientation\} renderPage=\{renderPage\} \/>/);
  assert.match(APP, /<WorkFooterNav[\s\S]{0,400}position="flow"/);
  // Every page renders headless inside the deck (one shell header, no per-block
  // header) — and only from 768px up.
  assert.match(APP, /headless=\{quadWide\}/);
  assert.match(SURFACE, /const showHeader = !headless && !immersive && page !== "ai";/);
  assert.match(QUAD_CSS, /@media \(max-width: 767px\) \{/);
});

test("the navigation is the shared placeable one, with Work's own six pages", () => {
  assert.match(APP, /import \{ HeaderNavView, type CourseNavItem \} from "\.\.\/course\/CourseHeaderNav";/);
  assert.match(APP, /const navItems: CourseNavItem\[\] = WORK_PAGES\.map\(\(record\) => \(\{/);
  assert.match(APP, /<HeaderNavView[\s\S]{0,260}placement=\{navPlacement\}[\s\S]{0,80}ariaLabel="Work mode pages"/);
  // All four placements are real in Work too, and the deck draws the strip
  // itself in the single-divider shape (the owner's "uske niche footer nav").
  assert.match(APP, /const navInHeader = quadWide && navPlacement === "header" && !quadNavInDeck;/);
  assert.match(APP, /const navRailLeft = quadWide && navPlacement === "left" && !quadNavInDeck;/);
  assert.match(APP, /const navRailRight = quadWide && navPlacement === "right" && !quadNavInDeck;/);
  assert.match(APP, /const navBottom = quadWide && navPlacement === "bottom" && !quadNavInDeck;/);
  assert.match(APP, /const quadNavInDeck = quadWide && quadState\.format === "pair";/);
  assert.match(APP, /nav=\{workNavNode\}/);
  // The same stored choice and the same rule the player uses: the navigation
  // disappears while an editor is open.
  assert.match(APP, /const quadNavVisible = quadWide && !anyImmersive;/);
  assert.match(APP, /import \{ useFooterNavigationPlacement \} from "\.\.\/utils\/footerNavigationPlacement";/);
});

test("the navigation taps follow the player's rule: panes keep their blocks", () => {
  assert.match(APP, /if \(next === "notes"\) \{\s*revealQuadPane\("c12"\);\s*return;\s*\}/);
  assert.match(APP, /if \(next === "mindmap"\) \{\s*revealQuadPane\("c22"\);\s*return;\s*\}/);
  assert.match(APP, /setQuadPrimary\(next\);\s*openPage\(next\);/);
  // A deep link fills the main block too, so the deck and the address bar
  // never disagree.
  assert.match(APP, /if \(WORK_CONTENT_PAGES\.includes\(routePage\)\) setQuadPrimary\(routePage\);/);
});

test("the Course-view page is the player's own component, and the shape is remembered", () => {
  assert.match(APP, /import CourseViewPanel from "\.\.\/course\/CourseViewPanel";/);
  assert.match(APP, /<CourseViewPanel quadWide \/>/);
  assert.match(APP, /data-work-view-settings/);
  assert.match(HEADER, /data-work-view-toggle/);
  assert.match(APP, /const \[quadState, setQuadState\] = useState<QuadLayoutState>\(\(\) => loadQuadLayout\("work"\)\);/);
  assert.match(APP, /saveQuadLayout\("work", next\);/);
  // One store for the zoom and the divider switches in both environments.
  assert.match(APP, /import \{ useCourseViewSettings \} from "\.\.\/course\/courseViewSettings";/);
});

test("the shell header carries what the headless blocks gave up", () => {
  // A real header in the layout's flow (never a floating overlay): exit, the
  // page, the navigation slot, the view settings and the theme.
  assert.match(HEADER, /data-work-quad-header/);
  assert.match(HEADER, /data-work-header-area=\{page\}/);
  assert.match(HEADER, /data-work-exit=""/);
  assert.match(HEADER, /data-work-quad-nav-slot="header"/);
  assert.match(HEADER, /data-work-theme-toggle=""/);
  assert.match(HEADER, /aria-label=\{`Switch to \$\{dark \? "light" : "dark"\} Work theme`\}/);
  // It is not in WorkApp: that file must stay free of a shell-level theme
  // control (tests/workModePhase2Contract.test.mjs).
  assert.doesNotMatch(APP, /data-work-theme-toggle|data-work-shell-controls/);
});
