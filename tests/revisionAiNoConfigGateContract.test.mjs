// tests/revisionAiNoConfigGateContract.test.mjs
//
// Contract for the user-facing rule:
//
//   "If no AI is configured, the test generation page must give clear
//    instructions to either configure AI or use Bulk Import — never silently
//    fabricate offline questions."
//
// Without this rule learners were picking a chapter and topic, hitting
// Generate, and receiving a 5-10 question set of generic study-skill
// prompts that had nothing to do with the syllabus they had just selected.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const generatePage = fs.readFileSync("src/revision/pages/AiGeneratePage.tsx", "utf8");
const aiConfig = fs.readFileSync("src/revision/engine/aiConfig.ts", "utf8");

test("the generate page imports hasStoredUserAiConfig to distinguish default from explicit choice", () => {
  assert.match(generatePage, /hasStoredUserAiConfig/);
  assert.match(aiConfig, /export function hasStoredUserAiConfig/);
});

test("the page tracks whether the user has not configured any AI", () => {
  assert.match(generatePage, /const aiNotConfigured\s*=\s*!activeConfig/);
});

test("the page distinguishes default-offline from explicit user choice of 'No AI'", () => {
  // The page must require BOTH `userCfg.source === \"offline\"` AND a
  // persisted choice (`hasStoredUserAiConfig`) before honouring the
  // offline fallback. A first-time visitor with no saved settings must
  // never reach the offline engine.
  const userChoseOfflineBlock = generatePage.match(/const userChoseOffline\s*=[\s\S]{0,200}/);
  assert.ok(userChoseOfflineBlock, "userChoseOffline flag is computed");
  assert.match(userChoseOfflineBlock[0], /userCfg\.source === "offline"/);
  assert.match(userChoseOfflineBlock[0], /userHasStoredChoice/);
});

test("a no-AI gate card renders when no AI is configured", () => {
  assert.match(generatePage, /data-rev-no-ai-gate/);
  assert.match(generatePage, /No AI is configured/);
  // The card must offer both required actions.
  assert.match(generatePage, /Configure AI/);
  assert.match(generatePage, /Use Bulk Import/);
  // Both CTAs must route to the right destination.
  assert.match(generatePage, /navigate\("#\/revision\/ai-settings"\)/);
  assert.match(generatePage, /navigate\("#\/revision\/bulk-import"\)/);
});

test("the Generate button is disabled until either AI is configured or the user explicitly chose offline", () => {
  // generateBlockedByNoAi is the gate that disables the primary CTA.
  const gateBlock = generatePage.match(/const generateBlockedByNoAi\s*=\s*[\s\S]{0,200};/);
  assert.ok(gateBlock, "generateBlockedByNoAi is computed");
  assert.match(gateBlock[0], /aiNotConfigured/);
  assert.match(gateBlock[0], /userChoseOffline/);
  // The button must consult the gate.
  assert.match(generatePage, /disabled=\{!canGenerate \|\| generateBlockedByNoAi\}/);
});

test("the runGenerate handler aborts with a clear notice when no AI is configured", () => {
  // Live (run-time) check inside the handler: if the user has not picked
  // "No AI (offline)" explicitly, fall through with a clear notice
  // instead of silently running the offline engine.
  const handlerBlock = generatePage.match(/liveUserChoseOffline[\s\S]{0,800}return;/);
  assert.ok(handlerBlock, "runGenerate gates the offline fallback");
  assert.match(generatePage, /No AI is configured\.[\s\S]*Connect an AI provider/);
  // The reservation is released so a failed gate does not consume the
  // learner's Test Bank slot.
  assert.match(generatePage, /releaseRevisionTestSlot\(uid, reservationId\);[\s\S]{0,200}setNotice\(\s*"No AI is configured/);
});

test("the page no longer calls generateOfflineQuestions on a default (unconfigured) visit", () => {
  // Sanity: the offline generator is still used, but only inside the
  // explicit-offline branch, never as a silent fallback. The branch must
  // be guarded by `if (!liveUserChoseOffline)` returning first.
  const branch = generatePage.match(/if \(!liveUserChoseOffline\)[\s\S]{0,400}generateOfflineQuestions/);
  assert.ok(branch, "offline generator is only reachable when the user explicitly chose offline");
});
