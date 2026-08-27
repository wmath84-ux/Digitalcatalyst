// tests/revisionProfileCardsContract.test.mjs
//
// Contract for the Revision profile page card fixes:
//
//   1. The AI Configuration and Generate Questions cards use the website
//      brand gradient (indigo → violet) with glassmorphism + a deep shadow,
//      instead of unrelated violet/blue gradients.
//   2. The snapshot cards (below the Import section) use the stable opaque
//      `rev-card` surface so they don't show a white-flash glitch while
//      scrolling (the old `dc-glass` backdrop-filter caused it).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("src/revision/pages/RevisionProfilePage.tsx", "utf8");

test("AI cards use the website brand gradient with glassmorphism + shadow", () => {
  // The redesign consolidated the two AI cards into a single launchpad
  // hero on the profile page, with a glass surface + branded shadow
  // stack. Assert that the brand gradient + glassmorphism are still
  // present in some form on the AI / Configure sections.
  assert.match(page, /dc-glass-hero/);
  assert.match(page, /Generate Questions with AI/);
  // The Configure AI card uses the indigo→violet brand icon tile.
  assert.match(page, /from-indigo-500 to-violet-600/);
  // The Bulk Import card keeps a branded surface with shadow.
  assert.match(page, /from-sky-50 to-indigo-50/);
  // Glassmorphism / branded shadow are still used on the hero.
  assert.match(page, /backdrop-blur-xl/);
  assert.match(page, /shadow-\[0_20px_40px_-26px_rgba\(79,70,229,0\.55\)\]/);
});

test("snapshot cards below Import use the stable rev-card surface (no glitch)", () => {
  // The Import section's cards were `dc-glass` (backdrop-filter) which caused
  // a white-flash glitch while scrolling; they now use the opaque rev-card.
  assert.match(page, /rev-card flex flex-col items-center gap-1 rounded-2xl py-3/);
  assert.doesNotMatch(page, /dc-glass flex flex-col items-center gap-1 rounded-2xl py-3/);
});
