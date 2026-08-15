// tests/verifyPaymentReplayRepairContract.test.mjs
//
// The "I paid and the feature is still locked" failure mode.
//
// grantEntitlementsFromQuote flips the payment intent to "verified"
// inside its own transaction. grantSubscriptionFromQuote then runs in
// a SEPARATE transaction. Anything that kills the function in between
// — a cold-start timeout, Firestore contention, a transient plan read
// — leaves an intent marked verified with no subscription written.
//
// The old handler returned early on `intent.status === "verified"`,
// so every retry (page refresh, webhook redelivery) short-circuited
// and the membership could never activate. The grants are idempotent,
// so the fix is to re-run them on the replay path and let them
// self-heal.
//
// That only holds if the subscription write is genuinely idempotent —
// re-running it must NOT treat the existing record as a renewal and
// hand out another full cycle of free access. Both halves are pinned
// here.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const verifyPayment = read("api/razorpay/verify-payment.ts");
const subscriptions = read("api/_lib/subscriptions.ts");

/** The body of the `if (intent.status === "verified")` block. */
const replayBlock = (() => {
  const start = verifyPayment.indexOf('if (intent.status === "verified")');
  assert.notEqual(start, -1, "the replay branch must still exist");
  return verifyPayment.slice(start, verifyPayment.indexOf("// 4. Free path", start));
})();

test("a replay re-runs both grants instead of returning empty-handed", () => {
  assert.match(replayBlock, /grantEntitlementsFromQuote/, "product entitlements must be repaired on replay");
  assert.match(replayBlock, /grantSubscriptionFromQuote/, "the subscription must be repaired on replay");
});

test("the replay marks itself as a replay so nothing is double-announced", () => {
  assert.match(replayBlock, /isReplay: true/);
  // The bell entry / push is still gated on a first-time grant.
  assert.match(verifyPayment, /if \(!grant\.replayed\)/);
});

test("a failed repair never turns a verified payment into an error", () => {
  assert.match(replayBlock, /try \{/);
  assert.match(replayBlock, /catch/);
  assert.match(replayBlock, /ok: true/);
  assert.match(replayBlock, /verified: true/);
});

test("the replay response reports what it actually repaired", () => {
  // Previously hard-coded to []. It must now carry the real ids so the
  // success page can render the unlock it just recovered.
  assert.match(replayBlock, /grantedEntitlementIds: repairedEntitlementIds/);
  assert.doesNotMatch(replayBlock, /grantedEntitlementIds: \[\]/);
});

test("re-granting the same order does not extend the subscription", () => {
  // Without this guard the replay repair would be worse than the bug:
  // every refresh would read the existing record as a renewal and add
  // another cycle.
  assert.match(subscriptions, /previousData\.orderId \|\| ""\) === args\.orderId/);
  const guardStart = subscriptions.indexOf('String(previousData.orderId || "") === args.orderId');
  const guardBlock = subscriptions.slice(guardStart, guardStart + 1800);
  assert.match(guardBlock, /return \{/, "the guard must return the stored record");
  // The renewal math must live after the guard, never before it.
  assert.ok(
    guardStart < subscriptions.indexOf("const renewalBase = getRenewalBaseTime"),
    "the replay guard must short-circuit before the renewal calculation",
  );
});

test("the replay guard preserves the stored expiry rather than recomputing it", () => {
  const guardStart = subscriptions.indexOf('String(previousData.orderId || "") === args.orderId');
  const guardBlock = subscriptions.slice(guardStart, guardStart + 1800);
  assert.match(guardBlock, /toMillis/, "Firestore timestamps must be read back as millis");
  assert.match(guardBlock, /expiresAt: expiresAtMs/);
  assert.match(guardBlock, /status: "active"/);
});

test("the free path also grants the subscription", () => {
  const freeStart = verifyPayment.indexOf("if (isFree) {");
  const freeBlock = verifyPayment.slice(freeStart, freeStart + 2000);
  assert.match(freeBlock, /grantEntitlementsFromQuote/);
  assert.match(freeBlock, /grantSubscriptionFromQuote/);
});
