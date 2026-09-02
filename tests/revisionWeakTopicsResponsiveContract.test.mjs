// tests/revisionWeakTopicsResponsiveContract.test.mjs
//
// Contract tests for the Weak Topics page's tablet + desktop layout.
//
// The page was phone-only for a long time: a single 900px-centered column on
// desktop, and at `lg` widths its bare `lg:grid lg:grid-cols-12` container
// auto-placed every section into a 1/12-wide cell (squeezed, overflowing).
//
// The optimized layout re-flows the same sections into two zones:
//   • weak-primary   (7/12 on desktop) — "Recommended for you" (2-up cards)
//                     + "All Weak Topics"
//   • weak-secondary (5/12 on desktop) — "Weakest Subjects",
//                     "Most Missed Topics", "Frequently Skipped"
// On phones the zone wrappers are `display: contents`, so every section keeps
// its original single-column order via explicit `order-*` classes.
// index.css drives the actual grid at each breakpoint, mirroring the
// dashboard/progress treatments: tablet portrait = 2 columns, tablet
// landscape + desktop shell = the 7-5 split.
//
// These tests are pure code-shape — no React, no DOM.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("src/revision/pages/WeakTopicsPage.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8");

test("weak topics container is a phone flex column that becomes a 12-col grid on desktop", () => {
  assert.match(page, /data-rev-layout="weak"/);
  assert.match(
    page,
    /animate-fade-in flex flex-col gap-5 px-4 py-4 pb-8 lg:grid lg:grid-cols-12/,
    "phones keep the single-column rhythm via flex + gap; lg switches to the 12-col grid",
  );
  // No leftover margin-based spacing that `display: contents` would drop.
  assert.doesNotMatch(page, /data-rev-layout="weak"[^>]*space-y-/);
});

test("page is split into the two layout zones the CSS grid targets", () => {
  assert.match(page, /data-rev-col="weak-primary"/);
  assert.match(page, /data-rev-col="weak-secondary"/);
  // Zones are invisible boxes on phones (`display: contents`) so the phone
  // column stays exactly one column, and real flex columns from lg up.
  assert.match(page, /className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-3"/);
  assert.match(page, /className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-3"/);
});

test("phone column order is unchanged via explicit order classes", () => {
  // Original phone order: Recommended → Weakest Subjects → All Weak Topics
  // → Most Missed → Frequently Skipped.
  const orders = [...page.matchAll(/<section className="order-(\d)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(orders, [1, 3, 2, 4, 5]);
});

test("recommended cards go two-up from the desktop threshold (960px)", () => {
  assert.match(page, /grid gap-3 min-\[960px\]:grid-cols-2/);
});

test("desktop split lives in the desktop-shell CSS block with the 7-5 columns", () => {
  const desktopBlock = css.slice(css.indexOf("Revision Studio desktop experience"), css.indexOf("Tablet portrait revision optimization"));
  assert.match(desktopBlock, /\.dc-desktop-shell \[data-rev-layout="weak"\] \{[^}]*grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(desktopBlock, /\.dc-desktop-shell \[data-rev-col="weak-primary"\] \{[^}]*grid-column: span 7/);
  assert.match(desktopBlock, /\.dc-desktop-shell \[data-rev-col="weak-secondary"\] \{[^}]*grid-column: span 5/);
  // No longer squeezed into the generic 900px single-column strip.
  const compactGroup = desktopBlock.slice(desktopBlock.indexOf("Bulk import, ai pages centered compact"));
  assert.doesNotMatch(compactGroup, /\[data-rev-layout="weak"\]/);
});

test("tablet portrait renders the page as two compact columns", () => {
  const portraitBlock = css.slice(css.indexOf("Tablet portrait revision optimization"), css.indexOf("Tablet landscape revision"));
  assert.match(portraitBlock, /\[data-rev-layout="weak"\] \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(portraitBlock, /\[data-rev-layout="weak"\] > \[data-rev-col="weak-primary"\],[^}]*display: flex !important/);
});

test("tablet landscape uses the same 7-5 split as desktop, compacted", () => {
  const landscapeBlock = css.slice(css.indexOf("Tablet landscape revision"), css.indexOf(".dc-desktop-shell {\n    display: flex !important;}") > 0
    ? css.indexOf(".dc-desktop-shell {\n    display: flex !important;}")
    : css.indexOf("Profile Studio: OPTIMIZED desktop/tablet"));
  assert.match(landscapeBlock, /\[data-rev-layout="weak"\] \{[^}]*grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(landscapeBlock, /\[data-rev-layout="weak"\] > \[data-rev-col="weak-primary"\] \{[^}]*grid-column: span 7/);
  assert.match(landscapeBlock, /\[data-rev-layout="weak"\] > \[data-rev-col="weak-secondary"\] \{[^}]*grid-column: span 5/);
});

test("error banner spans the full grid row on desktop", () => {
  assert.match(page, /data-rev-banner/);
  assert.match(page, /order-first flex items-center gap-2 rounded-2xl bg-rose-500\/20[^"]*lg:col-span-12/);
});

test("phone ergonomics are untouched", () => {
  // 42px touch target on Revise Now, 2-col subject tiles, full-width stacks.
  assert.match(page, /min-h-\[42px\]/);
  assert.match(page, /grid grid-cols-2 gap-3/);
  assert.match(page, /Revise Now/);
});
