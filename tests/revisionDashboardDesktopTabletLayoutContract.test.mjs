// tests/revisionDashboardDesktopTabletLayoutContract.test.mjs
//
// The Revision DASHBOARD on desktop and tablet — "page shrink ho gaya".
//
// Owner report (2026-10-04): the dashboard was shrunken on desktop and tablet.
// Measured on the real page (Playwright, the real bundle), the numbers were not
// opinion, they were broken layout:
//
//     • 1440 × 900 desktop shell — the deck panel was 77 px wide, the stat grid
//       48 px and the follow-up panel 72 px; the deck's own card (208 × 240)
//       overflowed its stage by 65 px on BOTH sides.
//     • 1194 × 834 tablet landscape — the follow-up panel was 59 px wide with
//       1621 px of text per word.
//     • 1024 × 768 — the follow-up panel was 49 px wide.
//
// One dead selector pair caused all of it. The dashboard's panels used to be
// `<div data-rev-panel="primary" class="… lg:col-span-7">` /
// `<div data-rev-panel="secondary" class="… lg:col-span-5">`, and the band CSS
// split the 12-column grid through those classes:
//
//     .dc-desktop-shell [data-rev-layout="dashboard"] > .lg\:col-span-7 { grid-column: span 7 }
//     .dc-desktop-shell [data-rev-layout="dashboard"] > .lg\:col-span-5 { grid-column: span 5 }
//     [data-rev-layout="dashboard"] > .lg\:col-span-7, … > .lg\:col-span-5 { … }   (landscape)
//
// The Slide Deck pass (2026-10-04) replaced that markup with
// `[data-rev-panel="primary"]` and a follow-up wrapper that carries no
// `lg:col-span-*` class at all — so NO child matched those rules, the grid
// auto-placed both panels into a single 1/12 column, and every card was sized
// from that sliver. The phone was the only band that survived, because it
// never had a column split to lose.
//
// The fix this file locks:
//
//   1. the deck panel and the follow-up wrapper have their OWN hooks
//      (`[data-rev-panel="primary"]` / `[data-rev-followups]`) and every band
//      targets those hooks, never a class the component no longer renders;
//   2. the deck panel spans the full canvas on desktop, tablet landscape and
//      tablet portrait (it solves its own height from the scroller — see
//      `revisionDashboardVerticalScaleContract.test.mjs`);
//   3. the follow-ups under it keep the 5 / 7 split where the shell has room;
//   4. the narrow-container fallback (content < 860 px, i.e. the 960–1240 px
//      windows with the side rail) really wins the cascade against the width
//      bands — its selector is as specific as the band rules and it is last in
//      the file;
//   5. tablet portrait is ONE column: the old 2-up split squeezed the deck into
//      381 px of an 834 px tablet and clipped its card by ~23 px a side.
//
// Pure code-shape / cascade tests — no React, no DOM.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/index.css", "utf8");
const dashboard = fs.readFileSync("src/revision/pages/DashboardPage.tsx", "utf8");

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
const clean = stripComments(css);

/** Innermost `selector { body }` pairs, whitespace-normalised. */
function innermostRules(text) {
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    rules.push({ selector: match[1].trim().replace(/\s+/g, " "), body: match[2] });
  }
  return rules;
}

const rules = innermostRules(clean);

/** Every rule that targets the dashboard's own panels. */
const dashboardPanelRules = rules.filter((rule) =>
  /\[data-rev-panel="(primary|secondary)"\]|\[data-rev-followups\]/.test(rule.selector),
);

/** One band, located by its comment markers in the raw file, then de-commented. */
function band(startMarker, endMarker) {
  const from = css.indexOf(startMarker);
  assert.ok(from > -1, `missing band marker: ${startMarker}`);
  const to = endMarker ? css.indexOf(endMarker, from) : css.length;
  assert.ok(to > from, `missing band end marker: ${endMarker}`);
  return stripComments(css.slice(from, to));
}

/** The band CSS only — the blocks a fix must reach. */
const desktopShellBlock = band("@media (min-width: 960px)", "/* Tablet portrait revision optimization");
const tabletPortraitBlock = band(
  "/* Tablet portrait revision optimization",
  "/* Tablet landscape revision - 12-col like desktop but compact */",
);
const tabletLandscapeBlock = band(
  "/* Tablet landscape revision - 12-col like desktop but compact */",
  "/* ── Profile Studio: fully responsive layout",
);
const narrowContainerBlock = band("@container dc-rev (max-width: 859px)", "/* 4. Stats and metric chips");

test("the dashboard's follow-up row owns a hook instead of a dead `lg:col-span-*`", () => {
  // The wrapper that holds the quick stats and the Weak Topics / Revision Bank
  // cards. The band CSS keys off `data-rev-followups`; the generic `lg:*`
  // utilities stay on it only so both breakpoints read the same in the source.
  assert.match(
    dashboard,
    /data-rev-followups\s*\n\s*className="space-y-4 lg:grid lg:grid-cols-12 lg:gap-3 lg:items-start lg:space-y-0"/,
  );
  // The deck panel keeps its hook too (it is the dashboard's first surface).
  assert.match(dashboard, /data-rev-panel="primary" className="flex flex-col gap-4 lg:gap-3"/);
  // …and both are targeted by that hook in the bands, not by position.
  assert.match(clean, /\[data-rev-layout="dashboard"\] > \[data-rev-panel="primary"\]/);
  assert.match(clean, /\[data-rev-layout="dashboard"\] > \[data-rev-followups\]/);
  assert.doesNotMatch(
    clean,
    /\[data-rev-layout="dashboard"\] > (?:div)?:nth-child/,
    "the follow-up wrapper must be hooked by name, never picked by position",
  );
});

test("the deck panel spans the canvas in every band that has a grid", () => {
  const spansFull = (block) =>
    new RegExp(
      '\\[data-rev-layout="dashboard"\\] > \\[data-rev-panel="primary"\\][\\s\\S]{0,400}?grid-column: 1 / -1',
    ).test(block);
  assert.ok(spansFull(desktopShellBlock), "desktop shell: the deck panel must take the full 12 columns");
  assert.ok(spansFull(tabletLandscapeBlock), "tablet landscape: the deck panel must take the full 12 columns");
  assert.ok(spansFull(tabletPortraitBlock), "tablet portrait: the deck panel must take the whole column");
  // A panel is never left on `auto` while its parent is a grid: that is the
  // exact auto-placement that produced a 1/12-wide dashboard. (Only the rules
  // that lay a panel OUT are inspected — the narrow-container fallback sets
  // panels back to plain blocks on purpose, with `grid-column: auto`.)
  for (const rule of dashboardPanelRules) {
    if (/display:\s*(grid|flex)\s*!important/.test(rule.body) || /display:\s*(grid|flex);/.test(rule.body)) {
      assert.match(
        rule.body,
        /grid-column: 1 \/ -1|grid-column: span [57]|grid-column: auto/,
        `${rule.selector} must place its panel, not let the grid auto-place it`,
      );
    }
  }
});

test("the follow-ups keep the quick stats / cards 5-7 split where there is room", () => {
  const split = (block) => {
    const statRule = block.match(
      /\[data-rev-followups\] > \[data-rev-stat-grid\] \{([^}]*)\}/,
    );
    const panelRule = block.match(
      /\[data-rev-followups\] > \[data-rev-panel="secondary"\] \{([^}]*)\}/,
    );
    return { statRule: statRule?.[1] ?? "", panelRule: panelRule?.[1] ?? "" };
  };
  for (const [name, block] of [
    ["desktop shell", desktopShellBlock],
    ["tablet landscape", tabletLandscapeBlock],
  ]) {
    const { statRule, panelRule } = split(block);
    assert.match(statRule, /grid-column: span 5/, `${name}: the quick stats take 5 columns`);
    assert.match(panelRule, /grid-column: span 7/, `${name}: Weak Topics + Revision Bank take 7 columns`);
  }
  // `align-items: stretch` on the follow-up grid would be fine, but `start` on
  // the WRAPPER shortens the columns next to each other (the "shrunk" look the
  // vertical-scale contract already forbids) — the panels opt out individually.
  assert.doesNotMatch(
    clean,
    /\[data-rev-layout="dashboard"\] > \[data-rev-followups\] \{[^}]*align-items: start/,
  );
  for (const rule of dashboardPanelRules) {
    if (/\[data-rev-followups\] > \[data-rev-/.test(rule.selector)) {
      assert.match(rule.body, /align-self: start/, `${rule.selector} keeps its own height`);
    }
  }
});

test("the narrow-container fallback out-ranks the width bands", () => {
  // 960–1240 px windows (desktop shell + a 220–260 px rail) leave the page
  // under 860 px of content. The fallback must beat the `>= 960px` band, which
  // it can only do with a selector of at least the same specificity AND a
  // position later in the file — the earlier plain `[data-rev-followups]`
  // spelling silently lost the cascade and left the crushed layout in place.
  assert.match(
    narrowContainerBlock,
    /\.dc-desktop-shell \[data-revision-page-main\] > \[data-rev-layout="dashboard"\] > \[data-rev-followups\]/,
  );
  assert.match(
    narrowContainerBlock,
    /\.dc-desktop-shell \[data-rev-layout="dashboard"\] > \[data-rev-followups\]/,
  );
  // It collapses to one column…
  assert.match(narrowContainerBlock, /display: block !important/);
  // …and restores the vertical rhythm the panel grid zeroes out.
  assert.match(
    narrowContainerBlock,
    /\[data-rev-followups\] > \* \+ \*,[\s\S]{0,400}?margin-top: 16px !important/,
  );
  // Source order: the zero-margin band rule comes first, the fallback's
  // restore last, so the narrow layout really re-spaces its cards.
  const zeroAt = clean.indexOf(".dc-desktop-shell [data-rev-followups] > * + * {");
  const containerAt = clean.indexOf("@container dc-rev (max-width: 859px)");
  assert.ok(zeroAt > -1, "the desktop band zeroes the space-y margins inside the grid");
  assert.ok(containerAt > -1, "the narrow-container fallback exists");
  assert.ok(
    containerAt > zeroAt,
    "the restore must come after the zero, or the narrow layout keeps stacked gaps",
  );
  assert.ok(
    containerAt > clean.indexOf("@media (min-width: 960px)"),
    "the container query must stay after the desktop band it overrides",
  );
});

test("tablet portrait is one full-width column, not a 2-up split", () => {
  // 640–959 px portrait: the deck solves its height from this scroller, so it
  // must never be squeezed sideways. The old `repeat(2, …)` split left the deck
  // 381 px wide of an 834 px tablet and clipped its card.
  const dashboardGrid = tabletPortraitBlock.match(/\[data-rev-layout="dashboard"\] \{([^}]*)\}/);
  assert.ok(dashboardGrid, "expected the portrait dashboard grid rule");
  assert.match(dashboardGrid[1], /grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(
    tabletPortraitBlock,
    /\[data-rev-layout="dashboard"\] \{[^}]*repeat\(2,/,
    "no 2-up dashboard split on portrait tablets",
  );
  assert.match(
    tabletPortraitBlock,
    /\[data-rev-layout="dashboard"\] > \[data-rev-panel="primary"\][\s\S]{0,300}?grid-column: 1 \/ -1/,
  );
});

test("no dashboard band still splits the grid through the removed classes alone", () => {
  // The dead-rule trap: a selector that only exists if the component still
  // renders `lg:col-span-*`. Every band rule that mentions those classes must
  // ALSO carry a data hook, so the panels can never fall out of the split
  // again when the markup changes.
  const deadRules = rules.filter(
    (rule) =>
      /\[data-rev-layout="dashboard"\]/.test(rule.selector) &&
      /\.lg\\:col-span-[57]/.test(rule.selector) &&
      !/\[data-rev-panel="primary"\]/.test(rule.selector) &&
      !/\[data-rev-followups\]/.test(rule.selector),
  );
  assert.deepEqual(
    deadRules.map((rule) => rule.selector),
    [],
    "band rules must key off the data hooks, not the old `lg:col-span-*` classes",
  );
  // The stacked follow-up cards lose their `space-y` margins inside the panel
  // grid (the gap owns the rhythm) — paired in the source in one place.
  assert.match(clean, /\[data-rev-followups\] > \* \+ \* \{\s*margin-top: 0 !important/);
});
