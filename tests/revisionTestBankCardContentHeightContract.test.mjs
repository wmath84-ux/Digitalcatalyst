// tests/revisionTestBankCardContentHeightContract.test.mjs
//
// Contract for how tall a Test Bank saved-test card is allowed to be.
//
// Bug this locks down: on tablet screen sizes every card in Revision → Test Bank
// looked vertically stretched, with a band of white space in the MIDDLE of the
// card. Two mechanisms produced it, and they compounded:
//
//   1. `aspect-square` on the card. A square is only sane in a single-column
//      layout; as soon as the content column was wide enough for 260–330 px
//      squares (tablet landscape inside the desktop shell, and every desktop
//      window), the content — icon row, chips, one metric block, the actions —
//      was shorter than the box, so the leftover had to go somewhere.
//   2. `min-h-0 flex-1`, a deliberate spacer between the metrics and the
//      attempts/actions footer. Any surplus height was absorbed exactly there,
//      which is why the gap opened in the middle of the card instead of at the
//      end. With the grid's default `align-items: stretch`, one taller card
//      (a completed test shows a 4-up result-metrics row; a "ready to start"
//      one does not) forced its neighbours to stretch too — so the whole row
//      showed the hole, "sabhi cards mein same problem".
//   3. On top of that, four `.rev-card` band rules padded every card by
//      10–20px !important, including these cards, which are `p-0` by design and
//      carry their own inner `p-3.5` — pure extra box around the content.
//
// The fix: no aspect ratio anywhere, no stretch spacer, `items-start` so a card
// is never taller than its own content, and every `.rev-card` padding rule
// excludes `[data-saved-test-card]` (see
// tests/revisionDashboardVerticalScaleContract.test.mjs).
//
// These are pure code-shape / CSS tests — no React, no DOM.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("src/revision/pages/RevisionBankPage.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8");
const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");

const cardRoot = page.split("\n").find((line) => line.includes("data-saved-test-card>"));
const gridRow = page.split("\n").find((line) => line.includes("data-saved-tests-grid>"));

test("the card is sized by its content on every band", () => {
  assert.ok(cardRoot, "expected the SavedTestCard root");
  assert.doesNotMatch(cardRoot, /aspect-/);
  // The clip stays: it is what contains the expanded attempt-history overlay.
  assert.match(cardRoot, /overflow-hidden/);
  assert.match(cardRoot, /className="relative overflow-hidden p-0" data-saved-test-card/);
  // …and no CSS hands a Test Bank card a ratio or a floor again.
  const offenders = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(
    ([, selector, body]) =>
      selector.includes("[data-saved-test-card]") &&
      /(aspect-ratio:\s*[0-9.]+\s*(\/\s*[0-9.]+)?|min-height:\s*[1-9])/.test(body),
  );
  assert.deepEqual(offenders.map((o) => o[1].trim()), [], "a forced ratio/height re-creates the dead band");
});

test("the card body has no stretch spacer left", () => {
  assert.doesNotMatch(page, /<div className="min-h-0 flex-1" \/>/);
  // The attempts line keeps its own rhythm instead of being pushed by a filler.
  assert.match(page, /<div className="mt-2 flex items-center justify-between text-\[10px\] text-white\/55">/);
  // The scrollable list INSIDE the history overlay still keeps its flex chain —
  // that `min-h-0 flex-1` is a different thing and must stay.
  assert.match(page, /className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2\.5"/);
  assert.match(page, /data-saved-test-attempts/);
  assert.match(page, /className="absolute inset-0 z-20/);
});

test("grid rows stop inflating the shorter cards", () => {
  assert.ok(gridRow, "expected the saved-tests grid row");
  assert.match(gridRow, /items-start/);
});

test("the wide-screen band keeps one readable column count for the grid", () => {
  // Regression guard for the container-driven column rule (see
  // tests/revisionTestBankCompactColumnContract.test.mjs): content-driven card
  // heights must not come with a grid that stops filling the width.
  assert.match(clean, /\[data-saved-tests-grid\][\s\S]{0,120}repeat\(auto-fill, minmax\(min\(240px, 100%\), 1fr\)\) !important/);
  assert.match(clean, /\.dc-desktop-shell \[data-saved-tests-grid\] \{\s*grid-template-columns: repeat\(auto-fill, minmax\(260px, 1fr\)\)/);
});
