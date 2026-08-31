// tests/subscriptionFeatureEntitlementContract.test.mjs
//
// Contract for the single-source subscription-feature entitlement rule
// (`subscriptionUnlocksFeature` in utils/subscriptions.js):
//
//   · an active, unexpired membership unlocks the two core subscription
//     features ("my-day", "revision") — these are what every plan sells;
//     the admin tunes their per-plan PRICE, not their availability;
//   · custom features still require their id on the stored `features`
//     list (or a free plan override supplied by the caller);
//   · expired / cancelled / missing records never unlock anything;
//   · Firestore Timestamps ({seconds,nanoseconds}) and admin SDK
//     Timestamps (toMillis()) and plain epoch-millis numbers all work,
//     because the web client and the serverless functions share the same
//     helper and must never disagree (the "Profile says 1 free use on a
//     Basic subscription" sync bug this pins).

import test from "node:test";
import assert from "node:assert/strict";
import {
  CORE_SUBSCRIPTION_FEATURES,
  isActiveSubscriptionRecord,
  subscriptionUnlocksFeature,
} from "../utils/subscriptions.js";

const DAY = 24 * 60 * 60 * 1000;
const FUTURE = Date.now() + 30 * DAY;
const PAST = Date.now() - DAY;

const firestoreTimestamp = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 });
const adminTimestamp = (ms) => ({ toMillis: () => ms });

test("active membership unlocks the core features even with an empty stored list", () => {
  const record = { status: "active", expiresAt: FUTURE, features: [], planId: "basic" };
  for (const featureId of CORE_SUBSCRIPTION_FEATURES) {
    assert.equal(subscriptionUnlocksFeature(record, featureId), true, featureId);
  }
});

test("explicit stored feature ids always win for custom features", () => {
  const record = { status: "active", expiresAt: FUTURE, features: ["custom-ai"] };
  assert.equal(subscriptionUnlocksFeature(record, "custom-ai"), true);
  assert.equal(subscriptionUnlocksFeature(record, "custom-other"), false);
});

test("free plan-override features unlock via the supplied list", () => {
  const record = { status: "active", expiresAt: FUTURE, features: [] };
  assert.equal(
    subscriptionUnlocksFeature(record, "free-on-basic", { freeFeatureIds: ["free-on-basic"] }),
    true,
  );
});

test("expired or inactive memberships unlock nothing", () => {
  for (const record of [
    { status: "active", expiresAt: PAST, features: ["my-day", "revision"] },
    { status: "cancelled", expiresAt: FUTURE, features: ["my-day"] },
    { status: "expired", expiresAt: FUTURE },
    null,
    {},
  ]) {
    assert.equal(isActiveSubscriptionRecord(record), false);
    assert.equal(subscriptionUnlocksFeature(record, "my-day"), false);
    assert.equal(subscriptionUnlocksFeature(record, "revision"), false);
  }
});

test("timestamp shapes from the web client and server are both accepted", () => {
  assert.equal(
    subscriptionUnlocksFeature({ status: "active", expiresAt: firestoreTimestamp(FUTURE) }, "my-day"),
    true,
  );
  assert.equal(
    subscriptionUnlocksFeature({ status: "active", expiresAt: adminTimestamp(FUTURE) }, "revision"),
    true,
  );
  assert.equal(
    subscriptionUnlocksFeature({ status: "active", expiresAt: firestoreTimestamp(PAST) }, "my-day"),
    false,
  );
  // missing status defaults to "active" but still requires a live expiry
  assert.equal(
    isActiveSubscriptionRecord({ expiresAt: adminTimestamp(FUTURE) }),
    true,
  );
});

test("core feature list is exactly my-day + revision", () => {
  assert.deepEqual([...CORE_SUBSCRIPTION_FEATURES].sort(), ["my-day", "revision"]);
});
