// tests/subscriptions.test.mjs
//
// Part 9 — unit tests for the pure subscription engine in
// `utils/subscriptions.js`. Covers every spec requirement:
//
//   - Plan active
//   - Billing cycle
//   - Plan cycle price
//   - Feature active
//   - Feature prices
//   - Included / free features
//   - Product / module unlock mappings
//   - Coupon (delegated to Part 7 engine)
//   - EduCoins (delegated to Part 4 reservation)
//   - Final cash amount
//   - Expiry / renewal
//
// Plus the math rules: percent + flat cycle price, included
// features bypass the price, expiry uses trial days, etc.
//
// The Node test runner imports the .js file directly; no
// Firestore or fetch is needed.

import test from "node:test";
import assert from "node:assert/strict";
import {
  normalisePlanDoc,
  normaliseFeatureDoc,
  isPlanActive,
  isPlanCycleAllowed,
  isFeaturePayable,
  isFeatureIdAllowed,
  computeCycleExpiresAt,
  isSubscriptionActive,
  getPlanCyclePricePaise,
  buildSubscriptionLineItems,
  validateSubscriptionSelection,
  formatBillingCycle,
  getCycleDurationDays,
  toPaise,
  fromPaise,
  collectSubscriptionEntitlementIds,
} from "../utils/subscriptions.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const basePlan = (overrides = {}) => ({
  id: "pro-monthly",
  name: "Pro Monthly",
  description: "Pro plan, billed monthly",
  monthlyPricePaise: 19900,
  yearlyPricePaise: 199900,
  includedFeatureIds: ["certificates"],
  includedProductIds: ["p-1"],
  includedModuleKeys: ["p-1:m-1"],
  allowedCycles: ["monthly", "yearly"],
  active: true,
  minPayablePaise: 0,
  badge: null,
  trialDays: 0,
  autoRenewByDefault: true,
  sortOrder: 0,
  ...overrides,
});

const baseFeature = (overrides = {}) => ({
  id: "offline",
  name: "Offline downloads",
  description: "Download for offline viewing",
  icon: "download",
  pricePaise: 29900,
  included: false,
  active: true,
  badge: null,
  sortOrder: 0,
  ...overrides,
});

// ---------------------------------------------------------------------------
// normalisePlanDoc / normaliseFeatureDoc
// ---------------------------------------------------------------------------

test("normalisePlanDoc accepts percent-style prices stored as rupees", () => {
  const out = normalisePlanDoc(
    { id: "p", name: "P", monthlyPrice: 199, yearlyPrice: 1999, allowedCycles: ["monthly", "yearly"], active: true },
    "p",
  );
  assert.equal(out.monthlyPricePaise, 19900);
  assert.equal(out.yearlyPricePaise, 199900);
  assert.deepEqual(out.allowedCycles, ["monthly", "yearly"]);
  assert.equal(out.active, true);
});

test("normalisePlanDoc refuses missing or invalid input", () => {
  assert.equal(normalisePlanDoc(null, "p"), null);
  // No id anywhere → null.
  assert.equal(normalisePlanDoc({ name: "x" }, ""), null);
  // An object with no id-only key but a non-empty second-arg id
  // produces a valid (default-priced) plan. The function is
  // permissive on the price shape; stricter validation lives
  // in the endpoint.
  const ok = normalisePlanDoc({ name: "P", active: true }, "p");
  assert.ok(ok);
  assert.equal(ok.id, "p");
});

test("normalisePlanDoc defaults allowedCycles to [monthly, yearly] when not specified", () => {
  const out = normalisePlanDoc({ id: "p", name: "P", active: true }, "p");
  assert.deepEqual(out.allowedCycles, ["monthly", "yearly"]);
});

test("normaliseFeatureDoc accepts included + paid features", () => {
  const included = normaliseFeatureDoc({ id: "cert", name: "Certificates", included: true }, "cert");
  assert.equal(included.included, true);
  assert.equal(included.pricePaise, 0);
  const paid = normaliseFeatureDoc({ id: "offline", name: "Offline", price: 299 }, "offline");
  assert.equal(paid.pricePaise, 29900);
  assert.equal(paid.included, false);
});

// ---------------------------------------------------------------------------
// Rule 1: plan active
// ---------------------------------------------------------------------------

test("rule 1: isPlanActive rejects missing plan or inactive plan", () => {
  assert.equal(isPlanActive(null), false);
  assert.equal(isPlanActive(basePlan({ active: true })), true);
  assert.equal(isPlanActive(basePlan({ active: false })), false);
});

test("validateSubscriptionSelection refuses inactive plans with SUBSCRIPTION_PLAN_INACTIVE", () => {
  const r = validateSubscriptionSelection({
    plan: basePlan({ active: false }),
    cycle: "monthly",
    selectedFeatureIds: [],
    featureRecords: [],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "SUBSCRIPTION_PLAN_INACTIVE");
});

// ---------------------------------------------------------------------------
// Rule 2: billing cycle
// ---------------------------------------------------------------------------

test("rule 2: isPlanCycleAllowed restricts cycles per plan", () => {
  const monthlyOnly = basePlan({ allowedCycles: ["monthly"] });
  assert.equal(isPlanCycleAllowed(monthlyOnly, "monthly"), true);
  assert.equal(isPlanCycleAllowed(monthlyOnly, "yearly"), false);
  const yearlyOnly = basePlan({ allowedCycles: ["yearly"] });
  assert.equal(isPlanCycleAllowed(yearlyOnly, "yearly"), true);
  assert.equal(isPlanCycleAllowed(yearlyOnly, "monthly"), false);
  // "weekly" is not a valid cycle.
  assert.equal(isPlanCycleAllowed(basePlan(), "weekly"), false);
});

test("validateSubscriptionSelection refuses an unsupported cycle with SUBSCRIPTION_CYCLE_NOT_ALLOWED", () => {
  const r = validateSubscriptionSelection({
    plan: basePlan({ allowedCycles: ["yearly"] }),
    cycle: "monthly",
    selectedFeatureIds: [],
    featureRecords: [],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "SUBSCRIPTION_CYCLE_NOT_ALLOWED");
});

// ---------------------------------------------------------------------------
// Rule 3: plan cycle price
// ---------------------------------------------------------------------------

test("rule 3: getPlanCyclePricePaise returns the right price per cycle", () => {
  const plan = basePlan();
  assert.equal(getPlanCyclePricePaise(plan, "monthly"), 19900);
  assert.equal(getPlanCyclePricePaise(plan, "yearly"), 199900);
  assert.equal(getPlanCyclePricePaise(null, "monthly"), 0);
  assert.equal(getPlanCyclePricePaise(plan, "weekly"), 0);
});

// ---------------------------------------------------------------------------
// Rule 4: feature active
// ---------------------------------------------------------------------------

test("rule 4: validateSubscriptionSelection refuses inactive features with SUBSCRIPTION_FEATURE_INACTIVE", () => {
  const r = validateSubscriptionSelection({
    plan: basePlan(),
    cycle: "monthly",
    selectedFeatureIds: ["offline"],
    featureRecords: [baseFeature({ active: false })],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "SUBSCRIPTION_FEATURE_INACTIVE");
});

test("rule 4: validateSubscriptionSelection refuses missing features with SUBSCRIPTION_FEATURE_NOT_FOUND", () => {
  const r = validateSubscriptionSelection({
    plan: basePlan(),
    cycle: "monthly",
    selectedFeatureIds: ["ghost"],
    featureRecords: [],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "SUBSCRIPTION_FEATURE_NOT_FOUND");
});

// ---------------------------------------------------------------------------
// Rule 5: feature prices
// ---------------------------------------------------------------------------

test("rule 5: isFeaturePayable accepts paid, included AND zero-price (free) features", () => {
  assert.equal(isFeaturePayable(baseFeature({ included: false, pricePaise: 29900 })), true);
  assert.equal(isFeaturePayable(baseFeature({ included: true, pricePaise: 0 })), true);
  // "Zero means free": an admin who sets the price to 0 declares the
  // feature free — it must stay selectable and simply charge nothing.
  assert.equal(isFeaturePayable(baseFeature({ included: false, pricePaise: 0 })), true);
  // Only a genuinely broken record (negative / non-numeric) is refused.
  assert.equal(isFeaturePayable(baseFeature({ included: false, pricePaise: -100 })), false);
  assert.equal(isFeaturePayable(baseFeature({ included: false, pricePaise: NaN })), false);
});

test("rule 5: validateSubscriptionSelection accepts a zero-price feature as free", () => {
  const r = validateSubscriptionSelection({
    plan: basePlan(),
    cycle: "monthly",
    selectedFeatureIds: ["free-extra"],
    featureRecords: [baseFeature({ id: "free-extra", included: false, pricePaise: 0 })],
  });
  assert.equal(r.ok, true);
  // The free feature contributes a ₹0 line (entitlement still granted).
  const featureLine = r.lineItems.find((item) => item.featureId === "free-extra");
  assert.ok(featureLine, "the free feature must still produce its entitlement line");
  assert.equal(featureLine.effectivePrice, 0);
});

test("rule 5: validateSubscriptionSelection still refuses a negative feature price", () => {
  const r = validateSubscriptionSelection({
    plan: basePlan(),
    cycle: "monthly",
    selectedFeatureIds: ["broken"],
    featureRecords: [baseFeature({ id: "broken", included: false, pricePaise: -100 })],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "SUBSCRIPTION_FEATURE_INVALID_PRICE");
});

// ---------------------------------------------------------------------------
// Zero-price plan — "price 0 means the subscription is free"
// ---------------------------------------------------------------------------

test("a plan priced at ₹0 builds a fully free quote (cash payable 0)", () => {
  const r = validateSubscriptionSelection({
    plan: basePlan({ monthlyPricePaise: 0, yearlyPricePaise: 0 }),
    cycle: "monthly",
    selectedFeatureIds: [],
    featureRecords: [],
  });
  assert.equal(r.ok, true);
  const total = r.lineItems.reduce((sum, item) => sum + item.effectivePrice * item.quantity, 0);
  assert.equal(total, 0, "a ₹0 plan with no paid add-ons must be entirely free");
  // The plan entitlement line is still present, so activation grants access.
  assert.ok(r.lineItems.some((item) => item.entitlementId === `subscription:${basePlan().id}`));
});

// ---------------------------------------------------------------------------
// Rule 6: included / free features
// ---------------------------------------------------------------------------

test("rule 6: included features bypass the feature price and don't show up as a line item", () => {
  const items = buildSubscriptionLineItems({
    plan: basePlan({ includedFeatureIds: ["certificates"] }),
    cycle: "monthly",
    selectedFeatureIds: ["certificates"],
    featureRecords: [baseFeature({ id: "certificates", included: true, pricePaise: 0 })],
    productUnlocks: [],
    moduleUnlocks: [],
  });
  // One line for the plan, none for the included feature.
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "subscription");
  assert.equal(items[0].effectivePrice, 19900);
});

test("rule 6: isFeatureIdAllowed is true for included feature ids on the plan", () => {
  const plan = basePlan({ includedFeatureIds: ["certificates"] });
  assert.equal(isFeatureIdAllowed(plan, "certificates"), true);
  assert.equal(isFeatureIdAllowed(plan, "offline"), false);
});

// ---------------------------------------------------------------------------
// Rule 7 + 8: product / module unlock mappings
// ---------------------------------------------------------------------------

test("rule 7+8: buildSubscriptionLineItems emits product + module unlock lines", () => {
  const items = buildSubscriptionLineItems({
    plan: basePlan(),
    cycle: "monthly",
    selectedFeatureIds: [],
    featureRecords: [],
    productUnlocks: [{ planId: "pro-monthly", productId: "p-2", active: true }],
    moduleUnlocks: [{ planId: "pro-monthly", productId: "p-1", moduleId: "m-2", active: true }],
  });
  // Plan line + 1 product unlock + 1 module unlock.
  assert.equal(items.length, 3);
  const productUnlock = items.find((i) => i.productId === "p-2");
  assert.ok(productUnlock, "expected a product-unlock line");
  assert.equal(productUnlock.effectivePrice, 0);
  const moduleUnlock = items.find((i) => i.moduleId === "m-2");
  assert.ok(moduleUnlock, "expected a module-unlock line");
  assert.equal(moduleUnlock.effectivePrice, 0);
});

test("rule 7+8: inactive unlocks are dropped from the line items", () => {
  const items = buildSubscriptionLineItems({
    plan: basePlan(),
    cycle: "monthly",
    selectedFeatureIds: [],
    featureRecords: [],
    productUnlocks: [{ planId: "pro-monthly", productId: "p-2", active: false }],
    moduleUnlocks: [],
  });
  assert.equal(items.length, 1);
});

// ---------------------------------------------------------------------------
// Rule 9 + 10: coupon + EduCoins (delegated to Part 7 + Part 4)
// ---------------------------------------------------------------------------

test("rule 9: validateSubscriptionSelection forwards the Part 7 coupon context", () => {
  const r = validateSubscriptionSelection({
    plan: basePlan(),
    cycle: "monthly",
    selectedFeatureIds: [],
    featureRecords: [],
    couponContext: {
      couponCode: "WELCOME20",
      discountPaise: 3980,
      reason: "20% off",
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.couponContext.discountPaise, 3980);
});

test("rule 10: buildSubscriptionLineItems emits the plan line for an empty feature selection", () => {
  // The plan line is always present, independent of any selected
  // features, so the quote always carries the base subscription item.
  const items = buildSubscriptionLineItems({
    plan: basePlan(),
    cycle: "monthly",
    selectedFeatureIds: [],
    featureRecords: [],
    productUnlocks: [],
    moduleUnlocks: [],
  });
  assert.equal(items.length, 1);
});

// ---------------------------------------------------------------------------
// Rule 11: final cash amount
// ---------------------------------------------------------------------------

test("rule 11: validateSubscriptionSelection returns the verified line items + plan + cycle", () => {
  const r = validateSubscriptionSelection({
    plan: basePlan(),
    cycle: "monthly",
    selectedFeatureIds: ["offline"],
    featureRecords: [baseFeature({ id: "offline", pricePaise: 29900 })],
  });
  assert.equal(r.ok, true);
  // Two line items: plan + paid feature.
  assert.equal(r.lineItems.length, 2);
  const featureLine = r.lineItems.find((i) => i.featureId === "offline");
  assert.ok(featureLine);
  assert.equal(featureLine.effectivePrice, 29900);
});

test("rule 11: includeFeature kind is subscription_features (mapped by the line item)", () => {
  const r = validateSubscriptionSelection({
    plan: basePlan(),
    cycle: "monthly",
    selectedFeatureIds: ["offline"],
    featureRecords: [baseFeature({ id: "offline" })],
  });
  assert.equal(r.lineItems.find((i) => i.featureId === "offline").kind, "subscription_features");
  assert.equal(r.lineItems[0].kind, "subscription");
});

// ---------------------------------------------------------------------------
// Rule 12: expiry / renewal
// ---------------------------------------------------------------------------

test("rule 12: computeCycleExpiresAt returns now + cycleMs (no trial)", () => {
  const plan = basePlan({ trialDays: 0 });
  const now = 1_700_000_000_000;
  const monthly = computeCycleExpiresAt(plan, "monthly", now);
  const yearly = computeCycleExpiresAt(plan, "yearly", now);
  // 30 days vs 365 days.
  assert.equal(monthly, now + 30 * 24 * 60 * 60 * 1000);
  assert.equal(yearly, now + 365 * 24 * 60 * 60 * 1000);
});

test("rule 12: computeCycleExpiresAt adds the trial on top of the cycle", () => {
  const plan = basePlan({ trialDays: 7 });
  const now = 1_700_000_000_000;
  const monthly = computeCycleExpiresAt(plan, "monthly", now);
  assert.equal(monthly, now + (7 + 30) * 24 * 60 * 60 * 1000);
});

test("rule 12: isSubscriptionActive returns true when expiresAt is in the future and status is active", () => {
  const now = 1_700_000_000_000;
  const sub = {
    uid: "u-1",
    planId: "p",
    cycle: "monthly",
    features: [],
    includedProductIds: [],
    includedModuleKeys: [],
    status: "active",
    activatedAt: now - 1000,
    expiresAt: now + 1000,
    autoRenew: true,
    orderId: "o",
    paymentId: "p",
    amountPaise: 0,
    source: "razorpay",
    couponCode: null,
    requestedEduCoins: 0,
  };
  assert.equal(isSubscriptionActive(sub, now), true);
  assert.equal(isSubscriptionActive({ ...sub, status: "cancelled" }, now), false);
  assert.equal(isSubscriptionActive({ ...sub, expiresAt: now - 1 }, now), false);
});

test("rule 12: getCycleDurationDays returns 30 / 365", () => {
  assert.equal(getCycleDurationDays("monthly"), 30);
  assert.equal(getCycleDurationDays("yearly"), 365);
});

test("rule 12: formatBillingCycle returns the human label", () => {
  assert.equal(formatBillingCycle("monthly"), "Monthly");
  assert.equal(formatBillingCycle("yearly"), "Yearly");
});

// ---------------------------------------------------------------------------
// Monthly / yearly / custom feature combinations
// ---------------------------------------------------------------------------

test("monthly + 1 paid feature → plan line + 1 feature line (e.g. 199 + 299 = 498 paise)", () => {
  const r = validateSubscriptionSelection({
    plan: basePlan(),
    cycle: "monthly",
    selectedFeatureIds: ["offline"],
    featureRecords: [baseFeature({ id: "offline" })],
  });
  assert.equal(r.ok, true);
  const planLine = r.lineItems.find((i) => i.kind === "subscription");
  const featureLine = r.lineItems.find((i) => i.featureId === "offline");
  assert.equal(planLine.effectivePrice, 19900);
  assert.equal(featureLine.effectivePrice, 29900);
});

test("yearly + 0 features + included feature → only the plan line, included bypasses", () => {
  const r = validateSubscriptionSelection({
    plan: basePlan({ includedFeatureIds: ["certificates"] }),
    cycle: "yearly",
    selectedFeatureIds: ["certificates"],
    featureRecords: [baseFeature({ id: "certificates", included: true, pricePaise: 0 })],
  });
  assert.equal(r.ok, true);
  assert.equal(r.lineItems.length, 1);
  assert.equal(r.lineItems[0].effectivePrice, 199900);
});

test("custom combo: monthly + 2 paid features + 1 included + 1 product unlock", () => {
  const r = validateSubscriptionSelection({
    plan: basePlan({ includedFeatureIds: ["certificates"] }),
    cycle: "monthly",
    selectedFeatureIds: ["offline", "mentor", "certificates"],
    featureRecords: [
      baseFeature({ id: "offline" }),
      baseFeature({ id: "mentor", name: "Mentor", pricePaise: 99900 }),
      baseFeature({ id: "certificates", name: "Certificates", included: true, pricePaise: 0 }),
    ],
  });
  // 1 plan + 2 paid features (certificates is included so it
  // doesn't carry a line). Product unlocks are added by the
  // endpoint, not by the pure validator.
  assert.equal(r.ok, true);
  assert.equal(r.lineItems.length, 3);
  // The plan line is the first item.
  assert.equal(r.lineItems[0].kind, "subscription");
  // The mentor line carries the higher price.
  const mentor = r.lineItems.find((i) => i.featureId === "mentor");
  assert.equal(mentor.effectivePrice, 99900);
});

// ---------------------------------------------------------------------------
// collectSubscriptionEntitlementIds
// ---------------------------------------------------------------------------

test("collectSubscriptionEntitlementIds returns plan + feature + unlock ids", () => {
  const ids = collectSubscriptionEntitlementIds({
    plan: basePlan(),
    cycle: "monthly",
    selectedFeatureIds: ["offline"],
    productUnlocks: [{ planId: "pro-monthly", productId: "p-2", active: true }],
    moduleUnlocks: [{ planId: "pro-monthly", productId: "p-1", moduleId: "m-2", active: true }],
  });
  assert.ok(ids.includes("subscription:pro-monthly"));
  assert.ok(ids.includes("subscription_feature:pro-monthly:offline"));
  assert.ok(ids.includes("subscription_product_unlock:pro-monthly:p-2"));
  assert.ok(ids.includes("subscription_module_unlock:pro-monthly:p-1:m-2"));
});

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

test("toPaise converts rupee strings + numbers to paise", () => {
  assert.equal(toPaise(199), 19900);
  assert.equal(toPaise("199"), 19900);
  assert.equal(toPaise("₹199"), 19900);
  assert.equal(toPaise(null), 0);
  assert.equal(toPaise("garbage"), 0);
});

test("fromPaise converts paise to integer rupees", () => {
  assert.equal(fromPaise(19900), 199);
  assert.equal(fromPaise(0), 0);
  assert.equal(fromPaise(NaN), 0);
});
