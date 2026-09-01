// tests/revisionSubPageHeaderSeatContract.test.mjs
//
// Contract for where the Revision feature header sits on the sub-pages that
// render it — AI Configuration (`#/revision/ai-settings`,
// `#/revision/customize/ai-config`), the AI generator, Bulk Import
// (`#/revision/bulk-import`), the test player / result / review and a Smart
// Revision session. All of them are reached from the revision profile page and
// all of them render `PageShell` → `AppHeader`.
//
// The bug this locks down: `src/index.css` carried per-band sticky offsets for
// `[data-revision-app-header]` (68 px phone / 80 px tablet portrait / 64 px
// desktop) copied from `.dc-page-tabs`. Those offsets were written for a layout
// where the header scrolled with the page body and had to clear the site
// header. In the current structure the header is a flex sibling ABOVE the page
// scroller, inside `[data-revision-content]` — and that container is
// `overflow: hidden`, so IT is the sticky scrollport. A sticky inset also
// pushes a box DOWN when its static position is above the inset, so the header
// dropped out of its seat by exactly those amounts on every form factor and
// floated over the page content ("the header slid into the middle of the
// page").
//
// Adding Tailwind's `top-0` to the element could not fix it either: Tailwind
// v4 utilities live in `@layer utilities`, and unlayered rules always win the
// cascade against layered ones, so the plain `[data-revision-app-header]`
// selector outranked the class no matter what it said.
//
// These are pure code-shape / CSS contract tests — no React, no DOM.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const css = read("src/index.css");
const appHeader = read("src/revision/components/AppHeader.tsx");
const pageShell = read("src/revision/components/PageShell.tsx");
const revisionApp = read("src/revision/RevisionApp.tsx");
const bankPage = read("src/revision/pages/RevisionBankPage.tsx");
const aiSettings = read("src/revision/pages/AiSettingsPage.tsx");
const bulkImport = read("src/revision/pages/BulkImportPage.tsx");

/** Drop CSS comments so band-offset prose inside them can't satisfy a check. */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Innermost `selector { body }` pairs. Good enough for these flat rules, and
 * it deliberately ignores at-rule preludes (they come back as selector-only
 * matches with an empty body).
 */
function innermostRules(text) {
  const clean = stripComments(text);
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(clean)) !== null) {
    rules.push({ selector: match[1].trim(), body: match[2] });
  }
  return rules;
}

const headerRules = innermostRules(css).filter((rule) =>
  rule.selector.includes("data-revision-app-header"),
);

const topValues = (body) =>
  [...body.matchAll(/(?:^|[{;])\s*top\s*:\s*([^;]+)/g)].map((m) => m[1].trim());

test("the feature header keeps its seat: no sticky offset can push it down", () => {
  // The rule must exist (it is the unlayered counterpart of `top-0`), and it
  // must say 0.
  assert.ok(headerRules.length > 0, "expected a [data-revision-app-header] rule in index.css");
  const allTops = headerRules.flatMap((rule) => topValues(rule.body));
  assert.ok(allTops.length > 0, "expected the header rule to set `top`");
  for (const value of allTops) {
    assert.match(
      value,
      /^(0|0px|auto)$/,
      `[data-revision-app-header] must not carry a sticky offset, found top: ${value}`,
    );
  }
  // The band offsets that caused the drop are gone from the whole file, not
  // just from the base rule.
  for (const rule of headerRules) {
    assert.doesNotMatch(rule.body, /top:\s*(68|80|64)px/, rule.selector);
  }
});

test("the header is rendered above the page scroller, not inside it", () => {
  // PageShell renders `<AppHeader> + <main data-revision-page-main>` — the
  // header is a sibling of the scroller, which is what makes `top: 0` the only
  // correct inset.
  const headerAt = pageShell.indexOf("<AppHeader");
  const mainAt = pageShell.indexOf("data-revision-page-main");
  assert.ok(headerAt >= 0, "PageShell must render AppHeader");
  assert.ok(mainAt > headerAt, "AppHeader must render before the scrolling main");
  // …and the wrapper both live in is the sticky scrollport: it clips, so the
  // header is measured against THAT box, not against the viewport.
  assert.match(revisionApp, /data-revision-content className="flex min-h-0 flex-1 flex-col overflow-hidden"/);
  const contentRules = innermostRules(css).filter(
    (rule) => rule.selector.trim() === "[data-revision-content]",
  );
  assert.ok(contentRules.length > 0, "expected a bare [data-revision-content] rule in index.css");
  assert.ok(
    contentRules.some((rule) => /min-height:\s*0/.test(rule.body)),
    "the revision content column must stay a bounded flex child (min-height: 0)",
  );

  // The two sub-pages this report is about reach that header through PageShell
  // with a back button and WITHOUT merging into the shared website header.
  for (const page of [aiSettings, bulkImport]) {
    assert.match(page, /<PageShell[\s\S]*?backHref="#\/revision\/profile"/);
    assert.doesNotMatch(page, /mergeIntoMainHeader/);
  }
});

test("AppHeader itself asks for top-0 and no hard-coded band offset", () => {
  assert.match(appHeader, /data-revision-app-header/);
  assert.match(appHeader, /sticky top-0/);
  assert.doesNotMatch(appHeader, /top-\[\d+px\]/);
  assert.doesNotMatch(appHeader, /top:\s*\d+px/);
});

test("the tablet tab row keeps its offsets — it sits under the site header", () => {
  // `.dc-page-tabs` is a sibling of `[data-revision-content]` inside the frame
  // scrollport, directly below the site header, so its static position already
  // equals these insets and they never move it. Guarding this keeps the
  // "header must be 0" rule above from being "fixed" by copying the row.
  const tabRules = innermostRules(css).filter((rule) => rule.selector.includes(".dc-page-tabs"));
  assert.ok(tabRules.length > 0, "expected .dc-page-tabs rules in index.css");
  const tabTops = tabRules.flatMap((rule) => topValues(rule.body));
  assert.ok(tabTops.includes("68px"), "phone band offset missing");
  assert.ok(tabTops.includes("80px"), "tablet portrait band offset missing");
  assert.match(css, /\.dc-page-tabs\s*\{\s*position: sticky;/);
});

test("the desktop shell body seats the revision frame under the overlay top bar", () => {
  // On desktop / tablet landscape the website header is hidden and the shell's
  // top bar overlays the scroller. Its body wrapper (`px-6 py-6`, or a clamped
  // `!important` padding in the tablet-landscape band) would otherwise hide
  // the first content. Seat the frame by the bar height and keep the bottom
  // flush so the pinned revision column does not overflow.
  const rule = innermostRules(css).find(
    (candidate) =>
      candidate.selector.includes("[data-desktop-content]") &&
      candidate.selector.includes("data-revision-app") &&
      !candidate.selector.includes("data-topbar-tabs"),
  );
  assert.ok(rule, "expected a [data-desktop-content]:has(… [data-revision-app]) rule");
  assert.match(rule.body, /padding-top:\s*var\(--desktop-topbar-height\)\s*!important/);
  assert.match(rule.body, /padding-bottom:\s*0\s*!important/);
  assert.doesNotMatch(rule.body, /padding-block:\s*0/);
  // It must outrank the tablet-landscape `padding: clamp(…)!important`, so it
  // cannot sit behind a >=960px gate.
  const marker = "padding-top: var(--desktop-topbar-height) !important";
  const gated = /@media[^{]*min-width:\s*960px[^{]*\{[^}]*$/.test(
    css.slice(0, css.indexOf(marker)),
  );
  assert.equal(gated, false, "the padding override must not be gated to >=960px only");
});

test("the Test Bank search header stays pinned to the top of the page body", () => {
  // Test Bank merges its title into the website header, so its own "header" is
  // the sticky search toolbar inside the page scroller. It is the reference for
  // "flush under the main header" and must keep `top-0`.
  assert.match(bankPage, /mergeIntoMainHeader/);
  assert.match(bankPage, /dc-glass-toolbar sticky top-0 z-10/);
  // The route stays a top-level tab page, so the feature header is not
  // rendered on top of it.
  assert.match(revisionApp, /if \(path\.startsWith\("#\/revision\/bank"\)\) return false;/);
});
