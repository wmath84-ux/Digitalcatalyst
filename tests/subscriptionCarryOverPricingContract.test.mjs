// tests/subscriptionCarryOverPricingContract.test.mjs
//
// Contract tests for the ALREADY-PAID CARRY-OVER rule.
//
// The bug this covers: a member who already paid for a feature / product with
// their active subscription opened the subscription page, picked ANOTHER plan
// (or renewed), and the order summary + server quote added that same item's
// price AGAIN. The rule fixed here is simple and explicit:
//
//   * Anything the active membership already unlocks is ALREADY PAID.
//   * It is carried over to the new plan / renewal at ₹0 — never charged a
//     second time — and stays granted.
//   * Only NEW items are payable, plus the new plan/cycle itself (except the
//     same-plan add-on, where the plan is also already paid).
//
// The pure helper is imported directly; client + server surfaces are asserted
// contract-style (the repo's test convention) so display and charge can never
// drift apart again.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateSubscriptionSelection } from "../utils/subscriptionOwnership.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 3, 1);

const activeRecord = {
  status: "active",
  planId: "premium",
  cycle: "yearly",
  features: ["my-day"],
  includedProductIds: ["course-1"],
  expiresAt: NOW + 200 * DAY,
};

// ---------------------------------------------------------------------------
// Pure engine — carry-over verdict for ANY active-membership selection
// ---------------------------------------------------------------------------

test("a switch to a higher plan carries owned features/products but flags only the new ones", () => {
  const state = evaluateSubscriptionSelection({
    record: activeRecord,
    planId: "pro",
    cycle: "yearly",
    featureIds: ["my-day", "ai-mentor"],
    productIds: ["course-1", "course-2"],
    now: NOW,
  });
  assert.equal(state.active, true);
  assert.equal(state.owned, false, "a different plan is never the owned selection");
  assert.equal(state.addOnPurchase, false);
  assert.equal(state.blocked, false);
  // Already paid items are exposed on the verdict.
  assert.deepEqual(state.ownedFeatureIds, ["my-day"]);
  assert.deepEqual(state.ownedProductIds, ["course-1"]);
  // Only genuinely NEW items are chargeable.
  assert.deepEqual(state.newFeatureIds, ["ai-mentor"]);
  assert.deepEqual(state.newProductIds, ["course-2"]);
});

test("a same-plan renewal inside the window does NOT re-list owned features as new", () => {
  const state = evaluateSubscriptionSelection({
    record: { ...activeRecord, expiresAt: NOW + 3 * DAY },
    planId: "premium",
    cycle: "yearly",
    featureIds: ["my-day"],
    productIds: ["course-1"],
    now: NOW,
  });
  assert.equal(state.renewalEligible, true);
  assert.equal(state.blocked, false);
  assert.deepEqual(state.newFeatureIds, []);
  assert.deepEqual(state.newProductIds, []);
  assert.deepEqual(state.ownedFeatureIds, ["my-day"]);
});

// ---------------------------------------------------------------------------
// Subscription page — summary must never add an already-paid item's price
// ---------------------------------------------------------------------------

test("the page computes membership-owned features/products and excludes them from chargeable totals", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  assert.match(page, /membershipOwnedFeatureIds/);
  assert.match(page, /membershipOwnedProductIds/);
  assert.match(page, /selectedFeatureIds\.filter\(\(id\) => !membershipOwnedFeatureIdSet\.has\(id\)\)/);
  assert.match(page, /selectedCourseIds\.filter\(\(id\) => !membershipOwnedProductIdSet\.has\(id\)\)/);
  // The summary shows a clear "Already purchased" row and the page banner
  // explicitly says nothing is charged again.
  assert.match(page, /data-subscription-carryover-note/);
  assert.match(page, /not charged again/);
  assert.match(page, /alreadyOwnedFeatureTitles/);
  assert.match(page, /alreadyOwnedProductTitles/);
});

test("the price summary renders already-purchased rows at ₹0", () => {
  const summary = read("src/subscription/components/PriceSummary.tsx");
  assert.match(summary, /alreadyOwnedFeatureTitles/);
  assert.match(summary, /alreadyOwnedProductTitles/);
  assert.match(summary, /Already purchased features/);
  assert.match(summary, /Already purchased courses/);
  assert.match(summary, /₹0 — no charge/);
  assert.match(summary, /data-subscription-owned-feature-names/);
});

test("the feature and course pickers treat membership-owned items as purchased", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  assert.match(page, /subscriptionProductOwnedIds/);
  assert.match(page, /purchasedIds=\{subscriptionProductOwnedIds\}/);
});

// ---------------------------------------------------------------------------
// Server quote — carry-over lines stay granted but cost ₹0
// ---------------------------------------------------------------------------

test("the server quote loader marks already-owned items at ₹0 for renewals and plan changes", () => {
  const loader = read("api/_lib/subscriptions.ts");
  assert.match(loader, /hasActiveMembership/);
  assert.match(loader, /ownedFeatureIdSet/);
  assert.match(loader, /ownedProductIdSet/);
  // Carried-over feature / product lines are kept but zeroed + flagged.
  assert.match(loader, /regularPrice: 0, salePrice: null, effectivePrice: 0, alreadyOwned: true/);
  // The add-on path keeps the old rule; every other active membership path
  // (renewal / plan change) maps lines instead of dropping them.
  assert.match(loader, /const pricedLineItems = isAddOnPurchase/);
  assert.match(loader, /: lineItems\.map\(\(item\) => \{/);
});

test("the quote engine keeps subscription already-owned lines visible at ₹0", () => {
  const engine = read("utils/serverQuotes.js");
  assert.match(engine, /alreadyOwned: item\.alreadyOwned === true/);
  assert.match(engine, /if \(isSubscriptionKind\) \{/);
  assert.match(engine, /alreadyOwned: isSubscriptionKind && line\.alreadyOwned === true/);
});

test("the checkout review labels carried-over items as already purchased", () => {
  const review = read("src/components/checkout/CheckoutReviewStep.tsx");
  assert.match(review, /Already purchased — no charge/);
  assert.match(review, /alreadyOwned: Boolean\(pricedLine && pricedLine\.alreadyOwned\)/);
  assert.match(review, /Already purchased/);
});

test("the coupon preflight uses the same carry-over quote as checkout", () => {
  const coupon = read("api/subscription-coupon.ts");
  assert.match(coupon, /loadCurrentSubscription/);
  assert.match(coupon, /existingSubscription: currentSubscription/);
});

// ---------------------------------------------------------------------------
// Grant writer — paid access is never lost on renewal / plan change
// ---------------------------------------------------------------------------

test("renewal and plan-change grants merge previously purchased access", () => {
  const writer = read("api/_lib/subscriptions.ts");
  // mergeSubscriptionAccess is used for add-ons AND now for renewals /
  // plan changes (the writer keeps every already-paid feature/product).
  const occurrences = (writer.match(/const access = mergeSubscriptionAccess\(previousData, args\.plan, args\.selectedFeatureIds\)/g) || []).length;
  assert.ok(occurrences >= 2, `expected merge in add-on + renewal/plan-change paths, got ${occurrences}`);
  assert.match(writer, /features: access\.features/);
  assert.match(writer, /includedProductIds: access\.includedProductIds/);
  assert.match(writer, /subscriptionFeatures: access\.features/);
});
