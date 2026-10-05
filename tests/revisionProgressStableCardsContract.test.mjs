// tests/revisionProgressStableCardsContract.test.mjs
//
// The active Progress page is built from Recall's scoped surface primitives.
// Chart bars update with a width transition when the learner changes range.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const progressPage = fs.readFileSync("src/revision/pages/ProgressPage.tsx", "utf8");
const recallUi = fs.readFileSync("src/revision/components/recall-ui.tsx", "utf8");

test("Progress uses Recall cards instead of the retired glass-card recipe", () => {
  assert.match(progressPage, /<RecallPage/);
  assert.match(progressPage, /<RecallCard className="space-y-3">/);
  assert.match(progressPage, /<RecallStat label="Overall accuracy"/);
  assert.match(progressPage, /<RecallStat label="Tests completed"/);
  assert.match(recallUi, /export function RecallCard/);
  assert.doesNotMatch(progressPage, /<GlassSurface|<GlassCard|dc-glass|rev-card/);
});

test("daily, weekly and monthly chart bars transition their token-backed widths", () => {
  assert.match(progressPage, /type Range = "daily" \| "weekly" \| "monthly"/);
  assert.match(progressPage, /\["daily", "weekly", "monthly"\] as Range\[\]/);
  assert.match(progressPage, /range === candidate/);
  assert.match(progressPage, /bg-primary transition-\[width\] duration-300/);
  assert.match(progressPage, /bg-tertiary transition-\[width\] duration-300/);
  assert.match(progressPage, /data\.accuracyTrend\.map/);
});
