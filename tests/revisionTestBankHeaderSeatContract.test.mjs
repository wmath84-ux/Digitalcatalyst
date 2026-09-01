// tests/revisionTestBankHeaderSeatContract.test.mjs
//
// Contract for where the Test Bank header sits (Revision → Test Bank, both the
// "Saved Tests" and "Smart Revision" views).
//
// Bug this locks down: the sticky header looked like it had slipped a few px
// down out of its seat — a strip of wallpaper between the website header and
// the Test Bank bar row, and the sticky search row never closing that gap while
// scrolling. The bar itself never moved; its SEAT did. `top: 0` on a sticky box
// is resolved against the CONTENT box of the scroll container, and a sticky box
// can never be shifted above its own containing block, so every padding between
// the top edge of `[data-revision-page-main]` and the header row re-appeared as
// an identical offset: 12 px (tablet landscape), clamp(12–20 px) (desktop
// shell), 16 px from the `.animate-fade-in` wrapper that contains the sticky
// search row (tablet portrait), plus the header row's own `lg:mt-2`.
//
// The fix: on the Test Bank page only, the scroller and the page wrapper carry
// no top padding, so `sticky top-0` means the literal top of the scroll area —
// flush under the main header — and the vertical air lives inside the glass
// bars (`py-3`) instead of above them.
//
// These are pure code-shape / CSS cascade tests — no React, no DOM.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/index.css", "utf8");
const bankPage = fs.readFileSync("src/revision/pages/RevisionBankPage.tsx", "utf8");
const pageShell = fs.readFileSync("src/revision/components/PageShell.tsx", "utf8");

/** Drop CSS comments so prose inside them can't satisfy a check. */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");

/** `selector { body }` pairs, innermost only, with their offset in the file. */
function innermostRules(text) {
  const clean = stripComments(text);
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(clean)) !== null) {
    rules.push({ selector: match[1].trim(), body: match[2], index: match.index });
  }
  return rules;
}

const rules = innermostRules(css);
const cleanCss = stripComments(css);

/**
 * How many at-rule / rule blocks are still open at a given offset. 0 means the
 * declaration sits at the top level of the stylesheet and therefore applies on
 * every band — no media or container query can un-apply it.
 */
function braceDepthAt(text, index) {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") depth -= 1;
  }
  return depth;
}

/** The Test Bank seat rules, keyed by what they clamp to zero. */
const seatRules = rules.filter((rule) => rule.selector.includes("[data-rev-bank-header]"));
const scrollerSeat = seatRules.find((rule) => rule.selector.endsWith("[data-revision-page-main]:has(> [data-rev-bank-header])"));
const wrapperSeat = seatRules.find((rule) => /> \.animate-fade-in$/.test(rule.selector));

test("the Test Bank header is the first child of the page scroller", () => {
  // PageShell puts the page's children straight into `main[data-revision-page-main]`
  // — that scroller is what the sticky rows are measured against.
  assert.match(pageShell, /<main\s+data-revision-page-main/);
  assert.match(pageShell, /className="no-scrollbar min-h-0 w-full min-w-0 flex-1 overflow-y-auto/);

  // The header row is the page's first element, and it owns the seat hook that
  // the CSS clamps to — nothing may be laid out above it inside the scroller.
  const pageOpen = bankPage.indexOf("<PageShell");
  const headerAt = bankPage.indexOf("<div data-rev-bank-header");
  assert.ok(pageOpen > -1 && headerAt > pageOpen, "expected the header row right after <PageShell>");
  assert.ok(headerAt < bankPage.indexOf("<SavedTestsView"), "the header row must precede the page body");
  assert.ok(
    /<PageShell[\s\S]{0,1200}?<div data-rev-bank-header/.test(bankPage),
    "the header row must be the first element the page renders",
  );
  // The hook is shared by markup and stylesheet, spelled identically.
  assert.equal(bankPage.includes("data-rev-bank-header"), true);
  assert.ok(seatRules.length >= 2, "both seat rules must key off [data-rev-bank-header]");
});

test("nothing hangs the header row below the main header", () => {
  const headerLine = bankPage.split("\n").find((line) => line.includes("<div data-rev-bank-header"));
  assert.ok(headerLine, "expected the Test Bank header row");
  // A top margin on the first row is a gap no sticky inset can ever close.
  assert.doesNotMatch(headerLine, /(^|\s)((sm|md|lg|xl):)?mt-/);
  // The air the margin/padding used to add lives inside the bar instead.
  assert.match(headerLine, /\bpy-3\b/);
});

test("the scroller and the page wrapper give the Test Bank no top padding", () => {
  assert.ok(scrollerSeat, "expected a `[data-revision-page-main]:has(> [data-rev-bank-header])` rule");
  assert.ok(wrapperSeat, "expected the same override for the `.animate-fade-in` page wrapper");
  for (const rule of [scrollerSeat, wrapperSeat]) {
    assert.match(
      rule.body,
      /padding-top:\s*0\s*!important/,
      `${rule.selector} must zero the top padding, since a sticky inset is resolved against the content box`,
    );
    // Only the top: the bottom gutter keeps the last card off the edge.
    assert.doesNotMatch(rule.body, /padding:\s/);
    assert.doesNotMatch(rule.body, /padding-(?:bottom|inline|left|right):/);
    assert.equal(braceDepthAt(cleanCss, rule.index), 0, "the seat override must not hide inside a media/container query");
    // It has to beat `!important` band paddings, so it needs the extra
    // `[data-revision-app]` term on the scroller selector.
    assert.match(rule.selector, /^\[data-revision-app\]\s+\[data-revision-page-main\]/);
  }
});

test("the seat override comes after every band padding it beats", () => {
  const padders = rules.filter(
    (rule) =>
      !rule.selector.includes("[data-rev-bank-header]") &&
      /\[data-revision-page-main\](\s*>\s*\.animate-fade-in)?\s*$/.test(rule.selector.replace(/\s+/g, " ").trim()) &&
      /padding/.test(rule.body),
  );
  assert.ok(padders.length >= 2, "expected the desktop-shell / tablet bands to keep padding the scroller for other pages");
  for (const rule of padders) {
    assert.ok(
      rule.index < scrollerSeat.index,
      `the Test Bank override must follow the band rule it overrides:\n${rule.selector}`,
    );
  }
  // And nothing appended later re-pads the Test Bank scroller / wrapper.
  const after = cleanCss.slice(wrapperSeat.index);
  for (const rule of innermostRules(after)) {
    if (!/padding/.test(rule.body)) continue;
    if (rule.selector.includes("[data-rev-bank-header]")) continue;
    // Overlay seats for other Revision pages pad the same scroller hook
    // but explicitly skip Test Bank (or only fire when AppHeader is present).
    if (rule.selector.includes(":not(:has([data-rev-bank-header]))")) continue;
    if (rule.selector.includes("[data-revision-app-header]")) continue;
    assert.doesNotMatch(
      rule.selector,
      /\[data-revision-page-main\](\s*>\s*\.animate-fade-in)?\s*$/,
      `a later rule would undo the seat:\n${rule.selector}`,
    );
  }
});

test("the sticky rows ask for the literal top and carry no band offsets", () => {
  const stickyRows = bankPage.split("\n").filter((line) => line.includes("dc-glass-toolbar sticky"));
  assert.equal(stickyRows.length, 2, "Saved Tests and Smart Revision each own one sticky toolbar");
  for (const line of stickyRows) {
    assert.match(line, /top-0\b/);
    assert.doesNotMatch(line, /top-\[[^\]]+\]/, "a per-band sticky offset pushes the row back down by exactly that amount");
  }
  // No CSS may hand those rows an offset either — the same trap that dropped
  // `[data-revision-app-header]` into the middle of the page (see
  // tests/revisionSubPageHeaderSeatContract.test.mjs).
  for (const rule of rules) {
    if (!/data-rev-bank/.test(rule.selector)) continue;
    const tops = [...rule.body.matchAll(/(?:^|[;{])\s*top\s*:\s*([^;]+)/g)].map((m) => m[1].trim());
    for (const value of tops) {
      assert.match(value, /^(0|0px|auto)$/, `${rule.selector} must not offset the Test Bank header`);
    }
  }
});
