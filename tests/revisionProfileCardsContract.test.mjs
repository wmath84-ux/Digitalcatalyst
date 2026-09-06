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

test("AI cards are the pack's glass surfaces (Phase A4)", () => {
  // The launchpad hero is a GlassSurface at pack defaults; the Configure AI and
  // Bulk Import cards are GlassCards; the brand tile is solid indigo (no
  // gradient anywhere) and nothing hand-rolls a backdrop-blur any more.
  assert.match(page, /dc-glass-hero/);
  assert.match(page, /<GlassSurface className="dc-glass-hero/);
  assert.match(page, /Generate Questions with AI/);
  assert.match(page, /<GlassCard/);
  assert.match(page, /bg-indigo-600 text-white/);
  assert.doesNotMatch(page, /from-indigo-500 to-violet-600|from-sky-50 to-indigo-50/);
  assert.doesNotMatch(page, /backdrop-blur-xl/);
});

test("snapshot cards below Import use the stable rev-card surface (no glitch)", () => {
  // The Import section's cards were `dc-glass` (backdrop-filter) which caused
  // a white-flash glitch while scrolling; they now use the opaque rev-card.
  assert.match(page, /className="rev-card dc-scene-plate text-white" contentClassName="flex flex-col items-center gap-1 rounded-2xl py-3/);
  assert.doesNotMatch(page, /dc-glass flex flex-col items-center gap-1 rounded-2xl py-3/);
});
