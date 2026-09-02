// tests/subscriptionRepurchaseGuard.test.mjs
//
// Duplicate-purchase rules for subscriptions.
//
// A "subscription type" is the plan AND the billing cycle together, so
// Basic/Premium/Pro × monthly/yearly are six distinct things a user can own.
// Re-selecting the one they already hold must show an unmistakable
// "already active" state instead of the buy flow, and must be impossible to
// pay for again outside the renewal window — on the client AND on the server.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALREADY_ACTIVE_CODE,
  RENEWAL_WINDOW_DAYS,
  buildOwnedPlanSummary,
  daysUntilExpiry,
  evaluateSubscriptionSelection,
  isOwnedSubscriptionActive,
  matchesOwnedSelection,
  normaliseOwnedSubscription,
  renewalOpensAt,
  resolveSubscribeCta,
} from "../utils/subscriptionOwnership.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 1);

const activeRecord = (overrides = {}) => ({
  status: "active",
  planId: "premium",
  cycle: "yearly",
  features: ["my-day", "premium-content"],
  includedProductIds: ["course-1"],
  expiresAt: NOW + 200 * DAY,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

test("a stored subscription record normalises to a predictable shape", () => {
  const owned = normaliseOwnedSubscription(activeRecord());
  assert.equal(owned.planId, "premium");
  assert.equal(owned.cycle, "yearly");
  assert.deepEqual(owned.featureIds, ["my-day", "premium-content"]);
  assert.deepEqual(owned.productIds, ["course-1"]);
  assert.equal(owned.expiresAt, NOW + 200 * DAY);
});

test("an unusable record normalises to null instead of a half-built object", () => {
  assert.equal(normaliseOwnedSubscription(null), null);
  assert.equal(normaliseOwnedSubscription({}), null);
  assert.equal(normaliseOwnedSubscription({ status: "active" }), null);
});

test("an unknown cycle falls back to monthly rather than matching everything", () => {
  assert.equal(normaliseOwnedSubscription(activeRecord({ cycle: "weekly" })).cycle, "monthly");
});

test("Firestore timestamp objects are accepted for expiresAt", () => {
  const record = activeRecord({ expiresAt: { toMillis: () => NOW + 10 * DAY } });
  assert.equal(normaliseOwnedSubscription(record).expiresAt, NOW + 10 * DAY);
  assert.equal(isOwnedSubscriptionActive(record, NOW), true);
});

// ---------------------------------------------------------------------------
// Activity + matching
// ---------------------------------------------------------------------------

test("only an unexpired active record counts as owned", () => {
  assert.equal(isOwnedSubscriptionActive(activeRecord(), NOW), true);
  assert.equal(isOwnedSubscriptionActive(activeRecord({ status: "expired" }), NOW), false);
  assert.equal(isOwnedSubscriptionActive(activeRecord({ status: "cancelled" }), NOW), false);
  assert.equal(isOwnedSubscriptionActive(activeRecord({ expiresAt: NOW - DAY }), NOW), false);
  assert.equal(isOwnedSubscriptionActive(null, NOW), false);
});

test("the plan AND the cycle must both match for a selection to be the owned one", () => {
  const record = activeRecord({ planId: "premium", cycle: "yearly" });
  assert.equal(matchesOwnedSelection(record, { planId: "premium", cycle: "yearly" }), true);
  assert.equal(matchesOwnedSelection(record, { planId: "premium", cycle: "monthly" }), false);
  assert.equal(matchesOwnedSelection(record, { planId: "pro", cycle: "yearly" }), false);
  assert.equal(matchesOwnedSelection(record, { planId: "basic", cycle: "monthly" }), false);
});

// ---------------------------------------------------------------------------
// The core decision
// ---------------------------------------------------------------------------

test("re-selecting the exact plan + cycle already owned is blocked", () => {
  const state = evaluateSubscriptionSelection({
    record: activeRecord(),
    planId: "premium",
    cycle: "yearly",
    now: NOW,
  });
  assert.equal(state.active, true);
  assert.equal(state.owned, true);
  assert.equal(state.renewalEligible, false);
  assert.equal(state.blocked, true);
  assert.equal(state.code, ALREADY_ACTIVE_CODE);
  assert.match(state.reason, /already have an active yearly membership/i);
});

test("every other plan on the same cycle stays purchasable", () => {
  for (const planId of ["basic", "pro"]) {
    const state = evaluateSubscriptionSelection({
      record: activeRecord({ planId: "premium" }),
      planId,
      cycle: "yearly",
      now: NOW,
    });
    assert.equal(state.owned, false, `${planId} must not be treated as owned`);
    assert.equal(state.blocked, false, `${planId} must remain purchasable`);
  }
});

test("the same plan on the other cycle stays purchasable — it is a different type", () => {
  const state = evaluateSubscriptionSelection({
    record: activeRecord({ planId: "premium", cycle: "yearly" }),
    planId: "premium",
    cycle: "monthly",
    now: NOW,
  });
  assert.equal(state.owned, false);
  assert.equal(state.blocked, false);
});

test("a user with no subscription is never blocked", () => {
  const state = evaluateSubscriptionSelection({
    record: null,
    planId: "premium",
    cycle: "yearly",
    now: NOW,
  });
  assert.equal(state.active, false);
  assert.equal(state.owned, false);
  assert.equal(state.blocked, false);
  assert.equal(state.reason, null);
});

test("an expired membership can be repurchased on the same plan + cycle", () => {
  const state = evaluateSubscriptionSelection({
    record: activeRecord({ status: "expired", expiresAt: NOW - 5 * DAY }),
    planId: "premium",
    cycle: "yearly",
    now: NOW,
  });
  assert.equal(state.active, false);
  assert.equal(state.owned, false);
  assert.equal(state.blocked, false);
});

test("renewal unlocks inside the renewal window and stays locked before it", () => {
  const insideWindow = evaluateSubscriptionSelection({
    record: activeRecord({ expiresAt: NOW + 3 * DAY }),
    planId: "premium",
    cycle: "yearly",
    now: NOW,
  });
  assert.equal(insideWindow.owned, true);
  assert.equal(insideWindow.renewalEligible, true);
  assert.equal(insideWindow.blocked, false, "a member must be able to renew before expiry");

  const outsideWindow = evaluateSubscriptionSelection({
    record: activeRecord({ expiresAt: NOW + (RENEWAL_WINDOW_DAYS + 5) * DAY }),
    planId: "premium",
    cycle: "yearly",
    now: NOW,
  });
  assert.equal(outsideWindow.renewalEligible, false);
  assert.equal(outsideWindow.blocked, true);
});

test("the renewal window boundary is inclusive", () => {
  const record = activeRecord({ expiresAt: NOW + RENEWAL_WINDOW_DAYS * DAY });
  assert.equal(renewalOpensAt(record), NOW);
  const state = evaluateSubscriptionSelection({
    record,
    planId: "premium",
    cycle: "yearly",
    now: NOW,
  });
  assert.equal(state.renewalEligible, true);
  assert.equal(state.blocked, false);
});

test("days remaining is reported for the countdown copy", () => {
  assert.equal(daysUntilExpiry(activeRecord({ expiresAt: NOW + 30 * DAY }), NOW), 30);
  assert.equal(daysUntilExpiry(activeRecord({ expiresAt: NOW + 20 * 60 * 60 * 1000 }), NOW), 1);
  assert.equal(daysUntilExpiry(activeRecord({ expiresAt: NOW - 2 * DAY }), NOW), -2);
});

// ---------------------------------------------------------------------------
// Presentation view-model
// ---------------------------------------------------------------------------

test("the owned-plan summary lists exactly the features the member paid for", () => {
  const features = [
    { id: "my-day", name: "My Day", description: "Cloud planner" },
    { id: "premium-content", name: "Premium Content", description: "Courses" },
    { id: "not-owned", name: "Analytics", description: "Not purchased" },
  ];
  const summary = buildOwnedPlanSummary({
    record: activeRecord({ expiresAt: NOW + 45 * DAY }),
    planName: "Premium",
    features,
    productTitles: ["React Masterclass"],
    now: NOW,
  });
  assert.equal(summary.planName, "Premium");
  assert.equal(summary.cycleLabel, "Yearly");
  assert.deepEqual(
    summary.features.map((f) => f.id),
    ["my-day", "premium-content"],
    "features the member does not own must never appear as included",
  );
  assert.equal(summary.featureCount, 2);
  assert.deepEqual(summary.productTitles, ["React Masterclass"]);
  assert.equal(summary.remainingLabel, "45 days left");
  assert.equal(summary.renewalEligible, false);
});

test("the summary is null when there is nothing owned to describe", () => {
  assert.equal(buildOwnedPlanSummary({ record: null, planName: "Premium" }), null);
});

// ---------------------------------------------------------------------------
// The bottom-bar call to action
// ---------------------------------------------------------------------------

test("the CTA says Subscribed and switches colour tone once the plan is owned", () => {
  const owned = evaluateSubscriptionSelection({
    record: activeRecord(),
    planId: "premium",
    cycle: "yearly",
    now: NOW,
  });
  const cta = resolveSubscribeCta({ state: owned });
  assert.equal(cta.owned, true);
  assert.equal(cta.tone, "owned", "the colour must indicate an existing subscription");
  assert.equal(cta.label, "Subscribed");
  assert.equal(cta.disabled, true, "an owned plan outside the renewal window is not clickable");
});

test("an owned plan inside the renewal window offers renewal, still in the owned tone", () => {
  const renewable = evaluateSubscriptionSelection({
    record: activeRecord({ expiresAt: NOW + 2 * DAY }),
    planId: "premium",
    cycle: "yearly",
    now: NOW,
  });
  const cta = resolveSubscribeCta({ state: renewable });
  assert.equal(cta.tone, "owned");
  assert.equal(cta.label, "Subscribed · Renew");
  assert.equal(cta.disabled, false);
});

test("an unowned selection keeps the normal purchase CTA", () => {
  const cta = resolveSubscribeCta({
    state: evaluateSubscriptionSelection({
      record: activeRecord(),
      planId: "pro",
      cycle: "monthly",
      now: NOW,
    }),
  });
  assert.equal(cta.owned, false);
  assert.equal(cta.tone, "default");
  assert.equal(cta.label, "Subscribe via Razorpay");
  assert.equal(cta.disabled, false);
});

test("loading beats every other CTA state", () => {
  const cta = resolveSubscribeCta({ state: null, loading: true });
  assert.equal(cta.disabled, true);
  assert.equal(cta.label, "Processing…");
});

// ---------------------------------------------------------------------------
// Wiring contracts — the rule must actually reach the UI and the server
// ---------------------------------------------------------------------------

test("the subscription page hides the buy flow for an owned selection", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  assert.match(page, /evaluateSubscriptionSelection/);
  assert.match(page, /buildOwnedPlanSummary/);
  assert.match(page, /const isSelectionOwned = ownershipState\.owned/);
  // The owned branch renders the summary card *instead of* the pickers,
  // coupon field and price summary.
  assert.match(page, /isSelectionOwned && ownedPlanSummary \? \(\s*<OwnedPlanCard/);
  // Everything between the ternary test and its `: (` alternative is the
  // owned branch — that is the region the buy-flow widgets must be absent
  // from.
  const branchStart = page.indexOf("isSelectionOwned && ownedPlanSummary");
  const ownedBranch = page.slice(branchStart, page.indexOf("\n        ) : (", branchStart));
  assert.ok(ownedBranch.includes("<OwnedPlanCard"), "the owned branch must render the summary card");
  for (const forbidden of ["<CourseSelectTrigger", "<FeatureSelectTrigger", "<PriceSummary", "<PromoCodeInput", "<FeaturePricingTiers"]) {
    assert.equal(
      ownedBranch.includes(forbidden),
      false,
      `${forbidden} must not render for an already-owned subscription`,
    );
  }
});

test("the page refuses to start checkout for a blocked selection", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  assert.match(page, /if \(ownershipState\.blocked\) \{[\s\S]*?setSubmitError\([\s\S]*?return;/);
});

test("the subscribe bar renders the owned tone from the shared helper", () => {
  const bar = read("src/subscription/components/SubscribeBar.tsx");
  assert.match(bar, /resolveSubscribeCta/);
  assert.match(bar, /data-subscription-owned=/);
  assert.match(bar, /data-subscription-cta-tone=\{cta\.tone\}/);
  assert.match(bar, /\? "bg-emerald-600 text-white/, "owned CTA must use a distinct colour");
});

test("the plan picker marks which plan and cycle are already active", () => {
  const overview = read("src/subscription/components/PlanOverview.tsx");
  assert.match(overview, /ownedPlanId/);
  assert.match(overview, /ownedCycle/);
  assert.match(overview, /data-subscription-plan-owned/);
  assert.match(overview, /data-subscription-cycle-owned/);
});

test("the owned-plan card states the active plan and its features", () => {
  const card = read("src/subscription/components/OwnedPlanCard.tsx");
  assert.match(card, /Already subscribed/);
  assert.match(card, /data-subscription-owned-plan=/);
  assert.match(card, /data-subscription-owned-features/);
  assert.match(card, /What your plan includes/);
});

test("the quote endpoint enforces the same rule server-side", () => {
  const quotes = read("api/_lib/quotes.ts");
  assert.match(quotes, /assertSubscriptionPurchasable/);
  assert.match(quotes, /subscriptionErrorCode: purchasable\.code/);

  const subscriptions = read("api/_lib/subscriptions.ts");
  assert.match(subscriptions, /export const assertSubscriptionPurchasable/);
  assert.match(subscriptions, /evaluateSubscriptionSelection/);
  assert.match(subscriptions, /status: 409/);
});
