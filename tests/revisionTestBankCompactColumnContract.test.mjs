// tests/revisionTestBankCompactColumnContract.test.mjs
//
// Contract tests for the Test Bank (Revision > Test Bank > Saved Tests)
// column rule on the smallest tablet screens.
//
// Bug being locked down: the saved-test grid chose its column count from the
// VIEWPORT, so every band where the desktop shell's side panel is visible but
// the window is still small — mini tablet in landscape, split-screen tablet,
// small portrait tablet, and the 960-1199 px narrow-desktop band — packed 2-3
// cards side by side. `AppShell` routes those viewports to `DesktopShell` from
// 960 px wide, or from 640 px when a tablet (min screen side >= 600 px) is in
// landscape, and the 200-260 px rail leaves a much narrower content column
// than the viewport suggests. Cards used to be `aspect-square overflow-hidden`,
// so each one shrank with its column and clipped its own action buttons.
//
// The rule is now container-driven: under 900 px of REAL content width the
// grid is exactly one card per row, cards grow with their content, and the
// trailing Generate / Import tile takes the whole row instead of spanning
// into an implicit second column.
//
// These are pure code-shape / CSS cascade tests — no React, no DOM.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("src/revision/pages/RevisionBankPage.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8");

/** The new one-card-per-row block, sliced out of index.css. */
const compactBlock = (() => {
  const start = css.indexOf("@container dc-rev (max-width: 899px)");
  assert.ok(start > -1, "the compact Test Bank container query must exist");
  return css.slice(start, css.indexOf("/* 6. AI generator", start));
})();

test("test bank grid keeps its auto-fill baseline for wide content columns", () => {
  assert.match(page, /data-saved-tests-grid/);
  assert.match(page, /data-saved-test-card/);
  assert.match(css, /\[data-saved-tests-grid\]\s*\{[^}]*repeat\(auto-fill, minmax\(min\(240px, 100%\), 1fr\)\) !important/);
});

test("under 900px of real content width the grid is one card per row", () => {
  assert.match(compactBlock, /grid-template-columns: minmax\(0, 1fr\) !important/);
  // Container-driven, not viewport-driven: the query targets the revision
  // page scroller (`dc-rev`) that the side panel already narrowed.
  assert.match(css, /\[data-revision-page-main\]\s*\{[^}]*container-name: dc-rev/);
  assert.match(compactBlock, /width: min\(100%, 640px\)/);
  assert.match(compactBlock, /margin-inline: auto/);
});

test("the rule also beats the desktop-shell grid rule inside the side panel", () => {
  // `.dc-desktop-shell [data-saved-tests-grid]` (min-width: 960px) has the
  // same !important at a higher specificity, so the compact block has to
  // repeat that selector AND appear later in the file to win the tie.
  assert.match(compactBlock, /\.dc-desktop-shell \[data-saved-tests-grid\]/);
  assert.match(compactBlock, /\.dc-desktop-shell \[data-saved-test-card\]/);

  const desktopRule = css.indexOf("Test Bank grid: 4 cols on desktop");
  const portraitRule = css.indexOf("Tablet portrait revision optimization");
  const landscapeRule = css.indexOf("Tablet landscape revision");
  const compactRule = css.indexOf("@container dc-rev (max-width: 899px)");
  assert.ok(desktopRule > -1 && portraitRule > -1 && landscapeRule > -1);
  assert.ok(
    compactRule > desktopRule && compactRule > portraitRule && compactRule > landscapeRule,
    "the compact one-column block must come after every viewport-based Test Bank grid rule",
  );
  // And nothing later in the file re-targets the grid and undoes it.
  const afterCompact = css.indexOf("@container dc-rev (max-width: 899px)") + compactBlock.length;
  assert.equal(css.indexOf("[data-saved-tests-grid]", afterCompact), -1);
  assert.equal(css.indexOf("[data-saved-test-card]", afterCompact), -1);
});

test("cards stop being squares so every button stays on screen", () => {
  assert.match(compactBlock, /aspect-ratio: auto !important/);
  assert.match(compactBlock, /min-height: 0 !important/);
  // And no band forces a square any more: the card is content-sized everywhere,
  // which is also what stops a stretched grid row from opening a white band in
  // the middle of a shorter card. `overflow-hidden` stays — it is what contains
  // the expanded attempt-history overlay.
  assert.doesNotMatch(page, /className="relative[^"]*aspect-square[^"]*data-saved-test-card/);
  assert.match(page, /className="relative overflow-hidden p-0" data-saved-test-card/);
});

test("the trailing create tile spans the full row in the one-column band", () => {
  assert.match(page, /data-saved-tests-actions/);
  assert.match(page, /grid grid-cols-2 gap-2 pt-1 sm:col-span-2 lg:col-span-3" data-saved-tests-actions/);
  assert.match(compactBlock, /\[data-saved-tests-grid\] > \[data-saved-tests-actions\][\s\S]*grid-column: 1 \/ -1 !important/);
});

test("small-tablet bands that show the side panel fall inside the compact range", () => {
  // Content column = viewport
  //   − rail (`clamp(200px, 22vw, 260px)` on `[data-desktop-rail]`)
  //   − the shell row's `px-6` (48 px)
  //   − the revision scroller's own horizontal padding.
  const rail = (viewport) => Math.min(260, Math.max(200, 0.22 * viewport));
  const column = (viewport, mainPadding) => viewport - rail(viewport) - 48 - 2 * mainPadding;

  assert.ok(column(640, 10) < 900, "mini tablet in landscape (~372 px column)");
  assert.ok(column(960, 15) < 900, "split-screen / narrow tablet (~671 px column)");
  assert.ok(column(1024, 15) < 900, "small laptop window with the rail (~721 px column)");
  assert.ok(column(1133, 17) < 900, "iPad landscape (~802 px column)");
  // A real desktop keeps two or more columns.
  assert.ok(column(1440, 24) >= 900, "1440 px desktop (~1084 px column)");
});
