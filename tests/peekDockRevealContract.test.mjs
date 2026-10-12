// tests/peekDockRevealContract.test.mjs
//
// THE DESKTOP PEEK DOCK'S ONE REVEAL/HIDE RULE — owner brief 2026-10-02:
//
//   "Line se footer navigation ki taraf pointer le jaate hi footer navigation
//    turant hide ho jata hai, jiski wajah se footer ke kisi button par click
//    nahi ho pata. … Footer navigation tabhi hide ho jab user actual
//    interaction area se bahar chala jaaye."
//
// The rule: the desktop dock's line and the panel it reveals are ONE
// interaction area. A close is only committed when the pointer's last known
// position is really outside the union of those boxes — never because a
// `pointerleave` arrived while crossing the seam.
//
// The Course Player no longer has a reveal dock; its always-visible, in-flow
// study strip has its own layout/accessibility contracts. This file pins the
// geometry and wiring of the desktop shell dock and guards that separation.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { transformSync } from "esbuild";

const area = fs.readFileSync("src/components/glass-dock/peekDockArea.ts", "utf8");
const desktop = fs.readFileSync("src/components/glass-dock/DesktopPeekDock.tsx", "utf8");
const course = fs.readFileSync("src/course/CoursePeekDock.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8");

// The real module, transpiled — the unit tests below exercise the shipped
// predicate, not a copy of it.
const areaModule = await import(
  `data:text/javascript;base64,${Buffer.from(
    transformSync(area, { loader: "ts", format: "esm" }).code,
  ).toString("base64")}`
);
const { isInsidePeekDockArea, PEEK_DOCK_AREA_SLACK } = areaModule;

// ---------------------------------------------------------------------------
// 1. The shared rule: pure geometry, unit-testable without a browser
// ---------------------------------------------------------------------------

test("the dock area is the union of the line and the panel, with a hairline of slack", () => {
  assert.equal(typeof PEEK_DOCK_AREA_SLACK, "number");
  assert.ok(PEEK_DOCK_AREA_SLACK > 0 && PEEK_DOCK_AREA_SLACK <= 16, "a hairline of slack, not a region of the page");
  const line = { left: 674, right: 1026, top: 884, bottom: 892 };
  const panel = { left: 681, right: 1019, top: 808, bottom: 884 };
  // The seam itself (the line's top edge == the panel's bottom edge).
  assert.equal(isInsidePeekDockArea(850, 884, [line, panel]), true);
  // A pointer on the line, on the panel, and on a button — all inside.
  assert.equal(isInsidePeekDockArea(850, 889, [line, panel]), true);
  assert.equal(isInsidePeekDockArea(850, 840, [line, panel]), true);
  // A pointer that really left the dock (the page above it) — outside.
  assert.equal(isInsidePeekDockArea(850, 700, [line, panel]), false);
  assert.equal(isInsidePeekDockArea(400, 840, [line, panel]), false);
  // A null box (an element with no layout) never counts as a hit.
  assert.equal(isInsidePeekDockArea(850, 840, [null, undefined]), false);
});

test("the area rule bridges the seam the old enter/leave hand-off fell through", () => {
  const line = { left: 674, right: 1026, top: 884, bottom: 892 };
  const panel = { left: 681, right: 1019, top: 808, bottom: 884 };
  // A fractional device-pixel ratio can leave a sub-pixel dead band between the
  // two boxes; the panel's own open transition moves it too. Still inside.
  assert.equal(isInsidePeekDockArea(850, 883.4, [line, panel]), true);
  assert.equal(isInsidePeekDockArea(850, 892.9, [line, panel]), true);
  // And the slack is not a back door onto the page: 40px above the panel is out.
  assert.equal(isInsidePeekDockArea(850, 768, [line, panel]), false);
});

// ---------------------------------------------------------------------------
// 2. The desktop dock decides the close by the area, not by the event
// ---------------------------------------------------------------------------

for (const [name, source] of [["desktop", desktop]]) {
  test(`${name} peek dock: a leave schedules a close, the area decides it`, () => {
    assert.match(area, /export function isInsidePeekDockArea/);
    assert.match(source, /import \{ isInsidePeekDockArea, peekDockAreaOf \} from/);
    // The measurable boxes are the line and the panel it reveals.
    assert.match(source, /peekDockAreaOf\(lineRef\.current\)/);
    assert.match(source, /peekDockAreaOf\(panelRef\.current\)/);
    // The close timer asks the area before hiding.
    assert.match(source, /if \(pointerInArea\(\)\) return/);
    // The pointer's last position is tracked while the dock is live — window
    // level, so a captured pointer is still followed.
    assert.match(source, /window\.addEventListener\(["']pointermove["'], onMove, \{ passive: true \}\)/);
    // A mouse leaving the DOCUMENT is out of the area; a touch/pen release is
    // not (its leave fires at the end of every contact).
    assert.match(source, /if \(event\.pointerType !== ["']mouse["']\) return/);
    assert.match(source, /pointerRef\.current = null/);
  });
}

test("desktop peek dock: click, tap and drag all reveal the same dock", () => {
  // The press on the line reveals immediately (hover, click and drag all pass
  // through the same handler).
  assert.match(desktop, /onPointerDown=\{\(event\) => \{/);
  assert.ok(desktop.includes("setOpen(true)"));
  // Touch / pen have no hover: a tap toggles the dock, and the toggle reads the
  // PIN, not `open` — a touch's synthetic enter already opened the dock, and
  // reading `open` would turn the first tap into a close.
  assert.match(desktop, /wasPinnedRef\.current/);
  assert.match(desktop, /if \(wasPinnedRef\.current\) close\(\)/);
  assert.match(desktop, /setPinned\(true\)/);
  // A pinned dock closes on an outside tap — the tap still lands.
  assert.match(desktop, /document\.addEventListener\(["']pointerdown["'], onDown\)/);
  assert.match(desktop, /host\.contains\(event\.target\)/);
  // A finger/pen drag keeps reporting to the line, so the release still lands
  // on the item it travelled to.
  assert.match(desktop, /setPointerCapture\(event\.pointerId\)/);
  // The release is handled on the HOST — the common ancestor every button
  // bubbles through — and ships the button's own click.
  assert.match(desktop, /const id = idAtPoint\(event\.clientX, event\.clientY\)/);
  assert.match(desktop, /if \(id\) navigate\(id\)/);
  assert.match(desktop, /elementsFromPoint/);
  // Any selection — tap, touch or mouse — ends the interaction and re-minimizes
  // the dock: navigate() closes before it changes the hash.
  assert.match(desktop, /const navigate = useCallback\(\(id: string\) => \{[\s\S]*?close\(\)\s*window\.location\.hash = tab\.hash/);
});

test("Course Player study strips are direct in-flow controls, not a hover/pin reveal dock", () => {
  assert.match(course, /data-course-strip-nav/);
  assert.match(course, /aria-label="Course study tools"/);
  assert.match(course, /onClick=\{\(\) => onTabChange\(item\.key\)\}/);
  assert.match(course, /onKeyDown=\{event => moveFocus\(event, index\)\}/);
  assert.doesNotMatch(course, /peekDockAreaOf|const open = hover \|\| pinned|wasPinnedRef/);
  const stripCss = fs.readFileSync("src/course/course-strip-nav.css", "utf8");
  assert.match(stripCss, /\[data-course-strip-nav\][\s\S]*?flex: 0 0 auto/);
  assert.doesNotMatch(stripCss, /position:\s*fixed/);
});

// ---------------------------------------------------------------------------
// 3. The look and the geometry are untouched
// ---------------------------------------------------------------------------

test("the desktop reveal geometry stays intact and the Course Player uses separate strip styling", () => {
  // The desktop line, panel and open state are exactly the rules that shipped.
  assert.match(css, /\[data-desktop-peek-line\] \{/);
  assert.match(css, /\[data-desktop-peek-dock\]\[data-open="true"\] \[data-desktop-peek-panel\]/);
  // Legacy Course Player selectors may remain for compatibility, but the live
  // Course Player component is the separate in-flow strip verified above.
  assert.match(css, /\[data-course-peek-line-hit\] \{/);
  assert.match(course, /data-course-strip-nav/);
  assert.doesNotMatch(course, /data-course-peek-dock|siteFooter/);
  assert.doesNotMatch(desktop, /data-site-footer/);
});
