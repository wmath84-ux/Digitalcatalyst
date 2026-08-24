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

test("AI cards match the website brand gradient with glassmorphism + shadow", () => {
  // AI Configuration
  assert.match(page, /from-indigo-600 via-violet-600 to-fuchsia-600/);
  // Generate Questions
  assert.match(page, /from-indigo-500 via-violet-500 to-purple-600/);
  // Glassmorphism + deep branded shadow + glass ring on both cards.
  assert.match(page, /shadow-\[0_24px_50px_-20px_rgba\(79,70,229,0\.65\)\] ring-1 ring-white\/30 backdrop-blur/);
  assert.match(page, /shadow-\[0_24px_50px_-20px_rgba\(124,58,237,0\.6\)\] ring-1 ring-white\/30 backdrop-blur/);
});

test("snapshot cards below Import use the stable rev-card surface (no glitch)", () => {
  // The Import section's cards were `dc-glass` (backdrop-filter) which caused
  // a white-flash glitch while scrolling; they now use the opaque rev-card.
  assert.match(page, /rev-card flex flex-col items-center gap-1 rounded-2xl py-3/);
  assert.doesNotMatch(page, /dc-glass flex flex-col items-center gap-1 rounded-2xl py-3/);
});
