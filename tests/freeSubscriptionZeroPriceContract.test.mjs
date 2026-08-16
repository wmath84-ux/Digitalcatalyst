// tests/freeSubscriptionZeroPriceContract.test.mjs
//
// Contract for the "price 0 means FREE subscription" rule.
//
// When the admin sets a plan's price to ₹0 (and the buyer selects no paid
// add-ons), the subscription is a free subscription:
//
//   1. The pure engine builds a quote whose payable total is ₹0 and still
//      emits every entitlement line (plan / feature / unlock), so the free
//      activation grants exactly the same access a paid one would.
//   2. Zero-priced features are legitimate free items, not configuration
//      errors — the engine must not refuse them.
//   3. The client CTA stops advertising Razorpay and offers a free
//      activation instead; the sticky bar shows FREE.
//   4. The server free path stays safe: create-order routes a ₹0 quote to
//      the FREE- intent branch, and verify-payment only honours
//      `free: true` when the stored intent itself is a free intent —
//      a client cannot skip Razorpay for a paid order.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSubscriptionLineItems,
  isFeaturePayable,
  validateSubscriptionSelection,
} from "../utils/subscriptions.js";
import { buildQuote } from "../utils/serverQuotes.js";
import { resolveSubscribeCta } from "../utils/subscriptionOwnership.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const freePlan = (overrides = {}) => ({
  id: "free-basic",
  name: "Basic",
  description: "Free plan",
  monthlyPricePaise: 0,
  yearlyPricePaise: 0,
  includedFeatureIds: [],
  includedProductIds: [],
  includedModuleKeys: [],
  allowedCycles: ["monthly", "yearly"],
  active: true,
  minPayablePaise: 0,
  badge: null,
  trialDays: 0,
  autoRenewByDefault: false,
  sortOrder: 0,
  ...overrides,
});

// ---------------------------------------------------------------------------
// 1 + 2. Pure engine: a ₹0 plan quotes to ₹0 and keeps the entitlements
// ---------------------------------------------------------------------------

test("a ₹0 plan produces a ₹0 line but still carries the plan entitlement", () => {
  const items = buildSubscriptionLineItems({
    plan: freePlan(),
    cycle: "monthly",
    selectedFeatureIds: [],
    featureRecords: [],
  });
  const planLine = items.find((item) => item.kind === "subscription");
  assert.ok(planLine, "the plan line must exist even when the plan is free");
  assert.equal(planLine.effectivePrice, 0);
  assert.equal(planLine.entitlementId, "subscription:free-basic");
});

test("zero-priced features are free items, not invalid config", () => {
  assert.equal(isFeaturePayable({ id: "f", name: "F", included: false, pricePaise: 0, active: true }), true);
  const verdict = validateSubscriptionSelection({
    plan: freePlan(),
    cycle: "monthly",
    selectedFeatureIds: ["f"],
    featureRecords: [{ id: "f", name: "Free thing", included: false, pricePaise: 0, active: true, sortOrder: 0 }],
  });
  assert.equal(verdict.ok, true, verdict.reason || "");
});

test("the full server quote for a free plan is cashPayable 0 (the free-order path)", () => {
  const out = buildQuote({
    selection: {
      purchaseKind: "subscription",
      productIds: [],
      moduleIds: [],
      resourceIds: [],
      updateId: null,
      subscriptionPlanId: "free-basic",
      billingCycle: "monthly",
      featureIds: [],
      couponCode: null,
      requestedEduCoins: 0,
      returnRoute: null,
    },
    products: new Map(),
    purchasesByProduct: new Map(),
    uid: "user-free",
    quoteId: "Q-free-sub",
    subscriptionLineItems: buildSubscriptionLineItems({
      plan: freePlan(),
      cycle: "monthly",
      selectedFeatureIds: [],
      featureRecords: [],
    }),
  });
  assert.equal(out.ok, true, out.reason || "");
  assert.equal(out.quote.cashPayable, 0, "a free plan must be payable at ₹0");
  assert.ok(out.quote.verifiedLineItems.length >= 1, "entitlement lines survive the ₹0 total");
});

test("a free plan with a PAID add-on still charges the add-on", () => {
  const out = buildQuote({
    selection: {
      purchaseKind: "subscription",
      productIds: [],
      moduleIds: [],
      resourceIds: [],
      updateId: null,
      subscriptionPlanId: "free-basic",
      billingCycle: "monthly",
      featureIds: ["ai"],
      couponCode: null,
      requestedEduCoins: 0,
      returnRoute: null,
    },
    products: new Map(),
    purchasesByProduct: new Map(),
    uid: "user-free",
    quoteId: "Q-free-plus-paid",
    subscriptionLineItems: buildSubscriptionLineItems({
      plan: freePlan(),
      cycle: "monthly",
      selectedFeatureIds: ["ai"],
      featureRecords: [{ id: "ai", name: "AI", included: false, pricePaise: 49900, active: true, sortOrder: 0 }],
    }),
  });
  assert.equal(out.ok, true, out.reason || "");
  assert.equal(out.quote.cashPayable, 49900, "free plan + paid feature = feature price only");
});

// ---------------------------------------------------------------------------
// 3. Client CTA / display
// ---------------------------------------------------------------------------

test("the CTA switches to free activation when the total is ₹0", () => {
  const cta = resolveSubscribeCta({ state: null, freeSelection: true });
  assert.equal(cta.label, "Activate free subscription");
  assert.equal(cta.disabled, false);
  assert.doesNotMatch(cta.label, /Razorpay/);
});

test("a paid selection keeps the Razorpay CTA", () => {
  const cta = resolveSubscribeCta({ state: null, freeSelection: false });
  assert.equal(cta.label, "Subscribe via Razorpay");
});

test("owned beats free: an already-owned selection never shows the free CTA", () => {
  const cta = resolveSubscribeCta({
    state: { owned: true, blocked: true, renewalEligible: false, code: null, reason: null },
    freeSelection: true,
  });
  assert.equal(cta.owned, true);
  assert.match(cta.label, /Subscribed/);
});

test("the subscribe bar renders FREE for a ₹0 total", () => {
  const bar = read("src/subscription/components/SubscribeBar.tsx");
  assert.match(bar, /const isFreeSelection = totalPaise <= 0/);
  assert.match(bar, /data-subscription-free=/);
  assert.match(bar, /freeSelection: isFreeSelection/);
});

test("the plan overview and order summary show Free instead of ₹0", () => {
  const overview = read("src/subscription/components/PlanOverview.tsx");
  assert.match(overview, /data-subscription-plan-free=/);
  const summary = read("src/subscription/components/PriceSummary.tsx");
  assert.match(summary, /data-subscription-total-free=/);
  assert.match(summary, /basePricePaise <= 0/);
});

test("the subscription page derives isFreeSelection from subtotal + min payable and hides promo inputs", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  assert.match(page, /const isFreeSelection = Math\.max\(subtotalPaise, minPayablePaise\) <= 0/);
  // Stale referral codes must never ride into a ₹0 checkout.
  assert.match(page, /if \(isFreeSelection && appliedReferral\)/);
  assert.match(page, /data-subscription-free-note/);
});

// ---------------------------------------------------------------------------
// 4. Server safety: the free path cannot be spoofed for paid orders
// ---------------------------------------------------------------------------

test("create-order routes a ₹0 quote through the FREE- intent branch", () => {
  const createOrder = read("api/razorpay/create-order.ts");
  assert.match(createOrder, /if \(amountPaise === 0\)/);
  assert.match(createOrder, /FREE-/);
  assert.match(createOrder, /free: true/);
});

test("verify-payment refuses `free: true` for an intent that is not a free intent", () => {
  const verify = read("api/razorpay/verify-payment.ts");
  assert.match(verify, /const intentIsFree = intent\.free === true \|\| Number\(intent\.amountPaise \|\| 0\) === 0/);
  assert.match(verify, /if \(!intentIsFree\)/);
  assert.match(verify, /not a free order/i);
});

test("the free path grants the subscription with source \"free\"", () => {
  const verify = read("api/razorpay/verify-payment.ts");
  assert.match(verify, /grantSubscriptionFromQuote\(\{\s*quote,\s*orderId,\s*paymentId: null,\s*source: "free",\s*\}\)/);
});
