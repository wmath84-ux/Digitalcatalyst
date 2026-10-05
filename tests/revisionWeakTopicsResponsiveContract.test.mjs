// tests/revisionWeakTopicsResponsiveContract.test.mjs
//
// The old Weak Topics desktop grid selectors belonged to the retired glass
// layout. The active page uses the Recall page/card system and responsive
// Tailwind grids; keep the contract on its live layout and actions.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("src/revision/pages/WeakTopicsPage.tsx", "utf8");
const recallUi = fs.readFileSync("src/revision/components/recall-ui.tsx", "utf8");

test("Weak Topics uses Recall's readable page and card surfaces", () => {
  assert.match(page, /<RecallPage/);
  assert.match(page, /<RecallCard/);
  assert.match(page, /<RecallStat label="Tracked topics"/);
  assert.match(page, /<SectionTitle hint="lowest accuracy first">Weakest topics/);
  assert.match(recallUi, /export function RecallPage/);
  assert.match(recallUi, /export function RecallCard/);
  assert.doesNotMatch(page, /dc-scene-plate|dc-glass|rev-card|data-rev-col=/);
});

test("topic summaries and recommendations reflow at small-screen breakpoints", () => {
  assert.match(page, /grid grid-cols-2 gap-2 sm:grid-cols-4/);
  assert.match(page, /mt-6 grid gap-4 sm:grid-cols-2/);
  assert.match(page, /space-y-2/);
  assert.doesNotMatch(page, /fixed h-\[|overflow-hidden h-screen|min-h-dvh/);
});

test("learners can start an all-topic or topic-specific revision session", () => {
  assert.match(page, /Revise the weakest/);
  assert.match(page, /Revise this topic/);
  assert.match(page, /startRevisionSession\(uid, topicId \?/);
  assert.match(page, /disabled=\{!data\?\.hasData\}/);
});

test("empty and error states remain visible in the page flow", () => {
  assert.match(page, /<RecallEmpty/);
  assert.match(page, /No answers to analyse yet/);
  assert.match(page, /Could not compute your weak topics/);
  assert.match(page, /role="alert"/);
});
