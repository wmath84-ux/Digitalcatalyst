import test from "node:test";
import assert from "node:assert/strict";
import { isPlanVisibleForAudience } from "../utils/subscriptionPricing.js";

test("missing planVisibility rows stay visible to everyone", () => {
  assert.equal(isPlanVisibleForAudience("basic", false, null), true);
  assert.equal(isPlanVisibleForAudience("basic", true, {}), true);
});

test("visible=false hides the plan from non-subscribers only", () => {
  const map = { basic: { visible: false, visibleToSubscribers: true } };
  assert.equal(isPlanVisibleForAudience("basic", false, map), false);
  assert.equal(isPlanVisibleForAudience("basic", true, map), true);
});

test("visibleToSubscribers=false hides the plan from existing members", () => {
  const map = { pro: { visible: true, visibleToSubscribers: false } };
  assert.equal(isPlanVisibleForAudience("pro", false, map), true);
  assert.equal(isPlanVisibleForAudience("pro", true, map), false);
});

test("owned plan stays visible to the subscriber even when hidden", () => {
  const map = { pro: { visible: true, visibleToSubscribers: false } };
  assert.equal(isPlanVisibleForAudience("pro", true, map, { ownedPlanId: "pro" }), true);
});
