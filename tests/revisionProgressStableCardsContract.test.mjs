// tests/revisionProgressStableCardsContract.test.mjs
//
// Contract for the Revision Progress page card-rendering fixes:
//
//   1. Revision `Card`s use a stable opaque surface (`.rev-card`) instead of
//      the heavy `backdrop-filter` glass (`.dc-glass`). Re-compositing a
//      blurred backdrop over changing content caused a white-flash glitch on
//      a card and a flicker when the Progress page switched its
//      daily / weekly / monthly chart.
//   2. The Progress page animates in once with the standard `animate-fade-in`
//      and its chart bars transition smoothly on tab switch.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync("src/revision/components/ui.tsx", "utf8");
const progressPage = fs.readFileSync("src/revision/pages/ProgressPage.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8");

test("revision Card is the pack GlassSurface; .rev-card is a sizing hook that paints nothing", () => {
  const cardFn = ui.slice(ui.indexOf("export function Card"), ui.indexOf("export function PrimaryButton"));
  assert.match(cardFn, /<GlassSurface tint=\{0\.4\} radius=\{20\} className=\{`rev-card p-4 text-white/);
  assert.doesNotMatch(cardFn, /dc-glass/);
  // The hook exists in CSS, is transparent and carries no backdrop-filter of its own.
  assert.match(css, /\.rev-card\s*\{/);
  assert.match(css, /\.rev-card\s*\{[^}]*background:\s*transparent/);
  assert.doesNotMatch(css, /\.rev-card\s*\{[^}]*backdrop-filter/);
});

test("Progress page animates once with the standard class and smooths chart swaps", () => {
  // Consistent with the other revision pages (animates once on mount, not on
  // every tab switch) instead of the old inline fade that confused the layout.
  assert.match(progressPage, /animate-fade-in space-y-4 px-4 py-4 pb-8/);
  assert.doesNotMatch(progressPage, /style=\{\{ animation: "fade-in/);
  // Bars transition height smoothly so daily/weekly/monthly feels fluid.
  assert.match(progressPage, /transition-\[height\] duration-300/);
});
