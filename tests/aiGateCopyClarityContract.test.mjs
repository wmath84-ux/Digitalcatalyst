// The AI paywall copy contract.
//
// The owner reported the exact confusion this test locks down: a learner with
// **no subscription at all** was shown "AI access limit reached" plus "Your
// plan's AI allowance isn't active. Renew or upgrade to use the AI study engine
// on your modules." — which reads as "you used up your quota", so the learner
// could not tell what had actually happened.
//
// Three rules are enforced here:
//   1. a plan problem and a used-up allowance never share one heading;
//   2. the server names the real state (no plan / cancelled / ended on <date> /
//      not included in <plan>) instead of "allowance isn't active";
//   3. the error card offers the one action that fixes a plan problem.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const personalAi = read("api/_lib/personalAi.ts");
const client = read("utils/personalAi.js");
const messageList = read("src/lumen/components/MessageList.tsx");
const lumenApp = read("src/lumen/App.tsx");
const coursePlayer = read("src/CoursePlayerApp.tsx");

test("the server explains the real subscription state, not an 'allowance'", () => {
  assert.match(personalAi, /export async function describeAiSubscriptionBlock\(/);
  const helper = personalAi.slice(
    personalAi.indexOf("export async function describeAiSubscriptionBlock("),
    // The definition, not the call site (`assertAiMentorEntitlement(adminDb(), uid)`).
    personalAi.indexOf("async function assertAiMentorEntitlement(db: Db, uid: string): Promise<void> {"),
  );
  // Each blocked state gets its own sentence.
  assert.match(helper, /has no active plan yet/, "no membership at all");
  assert.match(helper, /Reactivate a plan/, "cancelled / paused membership");
  assert.match(helper, /Your subscription ended on \$\{readableDate\(expiresAt\)\}/, "expired, with the date");
  assert.match(helper, /isn't included in \$\{plan\}/, "the plan simply does not carry AI");

  // The rejected sentence must be gone from the shipped copy. (The comments
  // above describe the old wording on purpose, so match the string literal.)
  assert.doesNotMatch(personalAi, /"Your plan's AI allowance isn't active/);
  assert.doesNotMatch(personalAi, /"Renew or upgrade to use the AI study engine/);
});

test("every blocked school-AI call on both chat surfaces goes through the resolver", () => {
  const grounded = personalAi.slice(personalAi.indexOf("async function groundedCompletion("));
  assert.match(
    grounded.slice(0, grounded.indexOf("await assertAiMentorEntitlement")),
    /fail\(403, "REVISION_SUBSCRIPTION_REQUIRED", await describeAiSubscriptionBlock\(adminDb\(\), uid, policy\.planName\)\)/,
    "the ask/generate choke point names the state",
  );
  // `personalAi.context` is what the module-AI paywall renders before asking.
  assert.match(personalAi, /const accessBlockedReason = planAllowsAi \? "" : await describeAiSubscriptionBlock\(/);
  assert.match(personalAi, /blockedReason: !planAllowsAi\s*\n\s*\? accessBlockedReason/);
  // The error codes are the client contract — they must not be renamed.
  assert.match(personalAi, /"REVISION_SUBSCRIPTION_REQUIRED"/);
  assert.match(personalAi, /"AI_MENTOR_PLAN_REQUIRED"/);
});

test("the client mapper keeps entitlement vs limit apart and never says 'limit' for a plan problem", () => {
  const map = client.slice(client.indexOf('case "REVISION_SUBSCRIPTION_REQUIRED":'));
  const row = map.slice(0, map.indexOf('case "AI_NOT_CONFIGURED":'));
  assert.match(row, /kind: "entitlement"/);
  assert.match(row, /upgrade: true/);
  assert.match(row, /retryable: false/);
  assert.match(row, /AI needs an active subscription/);
  assert.doesNotMatch(row, /limit/i, "a missing plan is never worded as a limit");
  assert.match(client, /case "AI_MENTOR_PLAN_REQUIRED":/);
});

test("the chat card splits the headings and offers the subscription page", () => {
  assert.match(messageList, /message\.errorKind === "entitlement"\s*\n\s*\? "AI needs an active subscription"/);
  assert.match(messageList, /message\.errorKind === "limit"\s*\n\s*\? "AI limit reached for now"/);
  assert.doesNotMatch(messageList, /errorKind === "entitlement" \|\| message\.errorKind === "limit"\s*\n\s*\? "AI access limit reached"/);
  assert.match(messageList, /data-lumen-open-plans=""/);
  assert.match(messageList, /View subscription plans/);
  // The button is offered for exactly the two actionable kinds.
  assert.match(messageList, /\(message\.errorKind === "entitlement" \|\| message\.errorKind === "limit"\) && onOpenPlans/);
});

test("the course player wires the plan CTA to the subscription page", () => {
  assert.match(lumenApp, /onOpenSubscription\?: \(\) => void;/);
  assert.match(lumenApp, /onOpenPlans=\{onOpenSubscription\}/);
  assert.match(coursePlayer, /onOpenSubscription=\{\(\) => \{ window\.location\.hash = "#\/subscription"; \}\}/);
});
