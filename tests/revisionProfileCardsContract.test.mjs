// tests/revisionProfileCardsContract.test.mjs
//
// The active Revision profile hub is ported to Recall's theme-backed cards.
// Keep the contract on its current content and actions rather than the retired
// glass recipe; Recall owns the surface color in both light and dark themes.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("src/revision/pages/RevisionProfilePage.tsx", "utf8");

test("the Revision profile hub uses Recall cards for its plan and AI sections", () => {
  assert.match(page, /<RecallPage/);
  assert.match(page, /<RecallStat label="Accuracy"/);
  assert.match(page, /<RecallStat label="Tests done"/);
  assert.match(page, /<RecallCard className="space-y-4">/);
  assert.match(page, /<SectionTitle>AI<\/SectionTitle>/);
  assert.match(page, /<RecallCard className="space-y-3">/);
  assert.doesNotMatch(page, /<GlassSurface|<GlassCard|dc-glass|rev-card/);
});

test("profile actions preserve AI configuration, generation and import destinations", () => {
  assert.match(page, /navigate\(REVISION_DEEP_LINKS\.aiSettings\)/);
  assert.match(page, /navigate\(REVISION_DEEP_LINKS\.aiGenerate\)/);
  assert.match(page, /navigate\(REVISION_DEEP_LINKS\.bulkImport\)/);
  assert.match(page, /title="Usage limits"/);
  assert.match(page, /onClick=\{\(\) => navigate\("#\/usage-limits"\)\}/);
});

test("profile snapshot cards use token-backed surfaces and remain responsive", () => {
  assert.match(page, /grid grid-cols-3 gap-2/);
  assert.match(page, /<RecallStat label="Streak"/);
  assert.match(page, /<RecallRow/);
  assert.doesNotMatch(page, /backdrop-blur|bg-sky-50|from-indigo-500 to-violet-600/);
});
