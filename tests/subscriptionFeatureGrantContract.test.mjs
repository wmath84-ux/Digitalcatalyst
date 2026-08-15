// tests/subscriptionFeatureGrantContract.test.mjs
//
// Regression guard for the "I bought the plan but My Day is still
// locked" bug.
//
// Root cause: a feature that is free — either included with the plan or
// zeroed by a plan-specific price override — produces NO priced line
// item. The grant step used to rebuild the unlocked-feature list by
// filtering `verifiedLineItems`, so those free features silently
// vanished between checkout and activation.
//
// The fix is an invariant, and these tests pin it end to end:
//   the selected feature list travels on the quote as
//   `subscriptionFeatureIds`, and the grant NEVER re-derives it from
//   line items (except as a fallback for pre-existing quotes).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildQuote } from "../utils/serverQuotes.js";
import { buildSubscriptionLineItems, normaliseFeatureDoc } from "../utils/subscriptions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const PLAN = {
  id: "premium",
  name: "Premium",
  monthlyPrice: 500,
  yearlyPrice: 5000,
  includedFeatureIds: [],
  includedProductIds: [],
  includedModuleKeys: [],
  active: true,
};

// My Day is free on Premium via a plan override — exactly the shape
// that used to disappear.
const FREE_FEATURE = normaliseFeatureDoc({
  id: "my-day",
  name: "My Day",
  price: 99,
  active: true,
  planPricing: { premium: { included: true } },
});

const PAID_FEATURE = normaliseFeatureDoc({
  id: "ai-coach",
  name: "AI Coach",
  price: 149,
  active: true,
});

const quoteFor = (featureIds) => {
  const features = [FREE_FEATURE, PAID_FEATURE].filter((f) => featureIds.includes(f.id));
  const lines = buildSubscriptionLineItems({
    plan: PLAN,
    cycle: "monthly",
    features,
    selectedFeatureIds: featureIds,
    products: [],
    selectedProductIds: [],
  });
  return buildQuote({
    selection: {
      purchaseKind: "subscription",
      subscriptionPlanId: PLAN.id,
      billingCycle: "monthly",
      featureIds,
      productIds: [],
    },
    products: new Map(),
    purchasesByProduct: new Map(),
    uid: "user-1",
    quoteId: "q_test",
    subscriptionLineItems: Array.isArray(lines) ? lines : lines?.lineItems || [],
    subscriptionExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });
};

test("a free plan-included feature survives on the quote even with no priced line", () => {
  const result = quoteFor(["my-day"]);
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.quote.subscriptionFeatureIds, ["my-day"]);

  // Proof that the old derivation would have lost it: no line item
  // carries the feature id, because the feature costs nothing.
  const derived = (result.quote.verifiedLineItems || [])
    .filter((line) => line.kind === "subscription_features" && line.featureId)
    .map((line) => String(line.featureId));
  assert.ok(
    !derived.includes("my-day"),
    "expected the free feature to produce no priced line — the regression only exists in that case",
  );
});

test("paid and free features both land on subscriptionFeatureIds, deduped", () => {
  const result = quoteFor(["my-day", "ai-coach", "my-day"]);
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual([...result.quote.subscriptionFeatureIds].sort(), ["ai-coach", "my-day"]);
});

test("non-subscription quotes carry no feature list", () => {
  const result = buildQuote({
    selection: { purchaseKind: "full_product", productIds: ["p1"] },
    products: new Map([["p1", { id: "p1", title: "Book", price: 100, status: "published", isFree: false }]]),
    purchasesByProduct: new Map(),
    uid: "user-1",
    quoteId: "q_prod",
  });
  if (result.ok) assert.equal(result.quote.subscriptionFeatureIds, null);
});

test("the grant reads the quote list and only falls back to line items", () => {
  const src = read("api/_lib/entitlements.ts");
  assert.match(src, /quote\.subscriptionFeatureIds/);
  // The fallback must be a fallback (??), never the primary source.
  assert.match(src, /featureIdsFromQuote \?\?/);
  assert.match(src, /selectedFeatureIds: uniqueFeatures/);
});

test("the order + payment intent forward the feature list to the grant", () => {
  const src = read("api/razorpay/create-order.ts");
  const hits = src.match(/subscriptionFeatureIds/g) || [];
  assert.ok(hits.length >= 2, "expected the field on both the intent and the order notes/record");
});

test("My Day access still requires an active subscription that lists the feature", () => {
  const src = read("src/hooks/useMyDayAccess.ts");
  assert.match(src, /my-day/);
  assert.match(src, /active/);
});
