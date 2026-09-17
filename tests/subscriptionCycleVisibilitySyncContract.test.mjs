// Subscription page: the Monthly ↔ Yearly toggle must change the table/list,
// and the server must accept exactly what the page offered.
//
// Owner report: "monthly and yearly ka toggle hai ... switch karne par jo table
// hai use page par vah update nahi hoti uske list accordingly". Root cause: the
// catalog normaliser dropped the admin's per-cycle fields before the page ever
// saw them, and nothing on the server read them either — so a feature the
// admin hid for a cycle was both invisible AND still purchasable.
//
// This test drives the real pure helpers (not a mock) and pins the wiring on
// both sides of the wire.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  featuresForPlanCycle,
  isFeatureHiddenForAudience,
  isFeatureHiddenForPlan,
  isFeatureVisibleForCycle,
  normaliseVisibleCycles,
  planVisibleCycles,
} from "../utils/subscriptionVisibility.js";
import {
  mergeSubscriberPricing,
  resolveEffectiveSubscriberPrice,
} from "../utils/subscriptionPricing.js";
import { normaliseFeatureDoc, normalisePlanDoc } from "../utils/subscriptions.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const FEATURES = [
  { id: "my-day", name: "My Day", active: true, sortOrder: 0 },
  { id: "revision", name: "Roman AI Pro", active: true, sortOrder: 1, visibleCycles: ["monthly"] },
  { id: "pro-only", name: "Pro extra", active: true, sortOrder: 2, hiddenPlanIds: ["basic"] },
];

test("a feature the admin limited to monthly disappears from the yearly list", () => {
  const monthly = featuresForPlanCycle(FEATURES, "basic", "monthly").map((f) => f.id);
  const yearly = featuresForPlanCycle(FEATURES, "basic", "yearly").map((f) => f.id);
  assert.deepEqual(monthly, ["my-day", "revision"]);
  assert.deepEqual(yearly, ["my-day"], "the yearly row list is genuinely different");
  assert.equal(isFeatureVisibleForCycle(FEATURES[1], "basic", "monthly"), true);
  assert.equal(isFeatureVisibleForCycle(FEATURES[1], "basic", "yearly"), false);
});

test("hiddenPlanIds removes a feature from that plan in every cycle", () => {
  assert.equal(isFeatureHiddenForPlan(FEATURES[2], "basic"), true);
  assert.equal(isFeatureHiddenForPlan(FEATURES[2], "pro"), false);
  assert.deepEqual(featuresForPlanCycle(FEATURES, "basic", "monthly").map((f) => f.id), ["my-day", "revision"]);
  assert.ok(featuresForPlanCycle(FEATURES, "pro", "monthly").some((f) => f.id === "pro-only"));
});

test("a subscriber keeps every cycle; only a non-subscriber sees the restriction", () => {
  const yearlyForGuest = featuresForPlanCycle(FEATURES, "basic", "yearly", { isSubscriber: false }).map((f) => f.id);
  const yearlyForMember = featuresForPlanCycle(FEATURES, "basic", "yearly", { isSubscriber: true }).map((f) => f.id);
  assert.deepEqual(yearlyForGuest, ["my-day"]);
  assert.deepEqual(yearlyForMember, ["my-day", "revision"], "a paid member is never retro-locked out");
});

test("the gate matrix and the doc field are the same rule", () => {
  // `settings/subscriptionGate.features[id].durations` wins when it speaks.
  const gateRows = { revision: { durations: { monthly: true, yearly: false } } };
  assert.deepEqual(
    featuresForPlanCycle(FEATURES, "basic", "yearly", { gateRows }).map((f) => f.id),
    ["my-day"],
  );
  const bothOpen = { revision: { durations: { monthly: true, yearly: true } } };
  assert.ok(
    featuresForPlanCycle(FEATURES, "basic", "yearly", { gateRows: bothOpen }).some((f) => f.id === "revision"),
    "an explicit yes in the gate re-opens the yearly cycle",
  );
  // Garbage never hides a feature.
  assert.deepEqual(normaliseVisibleCycles([]), ["monthly", "yearly"]);
  assert.deepEqual(normaliseVisibleCycles(["weekly"]), ["monthly", "yearly"]);
  assert.deepEqual(normaliseVisibleCycles(["monthly"]), ["monthly"]);
});

test("a plan's cycles follow the admin's visibility for non-subscribers", () => {
  const plan = { id: "basic", allowedCycles: ["monthly", "yearly"], visibleCycles: ["yearly"] };
  assert.deepEqual(planVisibleCycles(plan, { isSubscriber: false }), ["yearly"]);
  assert.deepEqual(planVisibleCycles(plan, { isSubscriber: true }), ["monthly", "yearly"]);
  assert.deepEqual(
    planVisibleCycles(plan, { isSubscriber: false, gateRows: { basic: { durations: { monthly: true, yearly: true } } } }),
    ["monthly", "yearly"],
  );
  // A plan that never configured the field stays fully available.
  assert.deepEqual(planVisibleCycles({ id: "pro", allowedCycles: ["monthly", "yearly"] }, {}), ["monthly", "yearly"]);
});

test("the catalog carries the admin fields instead of dropping them", () => {
  const feature = normaliseFeatureDoc({ id: "revision", name: "Roman AI Pro", visibleCycles: ["yearly"], hiddenPlanIds: ["pro"], visibilityMode: "hide", userLimit: { aiQuestionsPerDay: 7 }, subscriberPricingOverride: { monthly: 49 } }, "revision");
  assert.deepEqual(feature.visibleCycles, ["yearly"]);
  assert.deepEqual(feature.hiddenPlanIds, ["pro"]);
  assert.equal(feature.visibilityMode, "hide");
  assert.deepEqual(feature.userLimit, { aiQuestionsPerDay: 7 });
  assert.deepEqual(feature.subscriberPricingOverride, { monthly: 49, yearly: null, lifetime: null });
  // Unset means "both cycles", never "none".
  assert.deepEqual(normaliseFeatureDoc({ id: "my-day" }, "my-day").visibleCycles, ["monthly", "yearly"]);

  const plan = normalisePlanDoc({ id: "basic", visibleCycles: ["monthly"], subscriberPricingOverride: { yearly: 999 }, featured: true, cta: "Go" }, "basic");
  assert.deepEqual(plan.visibleCycles, ["monthly"]);
  assert.deepEqual(plan.subscriberPricingOverride, { monthly: null, yearly: 999, lifetime: null });
  assert.equal(plan.featured, true);
  assert.equal(plan.cta, "Go");
  assert.deepEqual(normalisePlanDoc({ id: "pro" }, "pro").visibleCycles, ["monthly", "yearly"]);
});

test("the page lists, prices and totals only what the cycle offers", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  assert.match(page, /featuresForPlanCycle\(rawFeatures, selectedPlanId, cycle, cycleVisibilityOptions\)/);
  assert.match(page, /planVisibleCycles\(plan, \{\s*\n\s*isSubscriber: isActiveMember,\s*\n\s*gateRows: gateSettings\.planVisibility,\s*\n\s*\}\)/);
  // Table rows, tiers, picker and the total all move together.
  assert.match(page, /<PlanComparisonTable\s*\n\s*plans=\{pickerPlans\}\s*\n\s*features=\{offeredFeatures\}/);
  assert.match(page, /groupFeaturesByPriceTier\(offeredFeatures, selectedPlanId, cycle\)/);
  assert.match(page, /sumSelectedFeaturePaise\(offeredFeatures, chargeableFeatureIds, selectedPlanId, cycle\)/);
  // A selection can never keep an item the new cycle does not offer.
  assert.match(page, /const next = current\.filter\(\(id\) => offeredFeatureIdSet\.has\(id\)\);/);

  const overview = read("src/subscription/components/PlanOverview.tsx");
  assert.match(overview, /planVisibleCycles\(activePlan, \{ isSubscriber, gateRows: gatePlanRows \}\)/);
  assert.match(overview, /gatePlanRows\?: Record<string, VisibilityGateRow> \| null;/);
});

test("the server refuses a hidden feature or cycle instead of trusting the page", () => {
  const server = read("api/_lib/subscriptions.ts");
  assert.match(server, /import \{ isFeatureHiddenForPlan, isFeatureVisibleForCycle, isPlanVisibleForCycle \} from "\.\.\/\.\.\/utils\/subscriptionVisibility\.js";/);
  assert.match(server, /if \(!isPlanVisibleForCycle\(plan as never, cycle, \{/);
  assert.match(server, /if \(!isFeatureVisibleForCycle\(feature as never, planId, cycle, \{/);
  assert.match(server, /code: "SUBSCRIPTION_CYCLE_NOT_OFFERED"/);
  assert.match(server, /code: "SUBSCRIPTION_FEATURE_NOT_OFFERED"/);
  // Checked before the line items are priced, i.e. before anything is charged.
  assert.ok(
    server.indexOf("SUBSCRIPTION_FEATURE_NOT_OFFERED") < server.indexOf("const lineItems = buildSubscriptionLineItems({"),
    "visibility is enforced before pricing",
  );
});

test("the subscriber-only price the page shows is the price the server charges", () => {
  const server = read("api/_lib/subscriptions.ts");
  // One resolver, reading BOTH admin surfaces, shared with the page.
  assert.match(server, /import \{ resolveEffectiveSubscriberPrice \} from "\.\.\/\.\.\/utils\/subscriptionPricing\.js";/);
  const block = server.slice(server.indexOf("if (buyerIsSubscriber) {"), server.indexOf("// Buyer-selected bonus products"));
  assert.match(block, /const resolvedRupees = resolveEffectiveSubscriberPrice\(\s*\n\s*planId,\s*\n\s*cycle,\s*\n\s*baseRupees,\s*\n\s*true,\s*\n\s*plan\.subscriberPricingOverride \?\? null,\s*\n\s*subscriberPricing as never,/,
    "the same helper the page uses");
  assert.match(block, /const resolvedPaise = Math\.max\(0, Math\.round\(Number\(resolvedRupees\) \* 100\)\);/,
    "rupees → paise, once, on the authoritative side");
  assert.match(block, /planLine\.regularPrice = resolvedPaise;/);
  assert.match(block, /planLine\.effectivePrice = resolvedPaise;/);
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  assert.match(page, /resolveEffectiveSubscriberPrice\(\s*\n\s*activePlan\.id,\s*\n\s*cycle,\s*\n\s*baseRupees,\s*\n\s*true,\s*\n\s*activePlan\.subscriberPricingOverride \?\? null,\s*\n\s*gateSettings\.subscriberPricing,/);
  // The wrapper the server keeps in its gate module is only an adapter now.
  const gate = read("api/_lib/subscriptionGate.ts");
  assert.match(gate, /sharedResolveSubscriberOnlyPrice\(\s*\n\s*planId,\s*\n\s*cycle,\s*\n\s*basePrice,\s*\n\s*isSubscriber,\s*\n\s*settings\?\.subscriberPricing \|\| null,/);
});

test("the two subscriber-price surfaces merge with one precedence", () => {
  assert.deepEqual(
    mergeSubscriberPricing({ monthly: 399 }, { monthly: 499, yearly: 4990 }),
    { monthly: 399, yearly: 4990, lifetime: null },
  );
  assert.deepEqual(
    mergeSubscriberPricing({ monthly: null, yearly: 0 }, { monthly: 499, yearly: 4990 }),
    { monthly: 499, yearly: 4990, lifetime: null },
    "an empty box never erases the other surface's number",
  );
  assert.equal(resolveEffectiveSubscriberPrice("pro", "monthly", 999, true, { monthly: 399 }, { pro: { monthly: 499 } }), 399);
  assert.equal(resolveEffectiveSubscriberPrice("pro", "monthly", 999, true, null, { pro: { monthly: 499 } }), 499);
  assert.equal(resolveEffectiveSubscriberPrice("pro", "monthly", 999, false, { monthly: 399 }, { pro: { monthly: 499 } }), 999,
    "a non-subscriber always gets the public price");
});

test("the hide-until-purchased model hides entry points for non-subscribers only", () => {
  const revision = { id: "revision", visibilityMode: "gate" };
  assert.equal(isFeatureHiddenForAudience(revision, {}), false);
  assert.equal(isFeatureHiddenForAudience({ id: "revision", visibilityMode: "hide" }, {}), true);
  assert.equal(
    isFeatureHiddenForAudience(revision, { gateSettings: { hideUntilPurchasedEnabled: true } }),
    true,
    "the global kill switch reaches the rail",
  );
  assert.equal(isFeatureHiddenForAudience(revision, { gateSettings: { features: { revision: { gated: true } } } }), true);
  assert.equal(
    isFeatureHiddenForAudience(revision, { gateSettings: { features: { revision: { tiers: { free: true } } } }, currentPlanId: "free" }),
    true,
    "the per-plan tier toggle hides on that plan",
  );
  assert.equal(
    isFeatureHiddenForAudience(revision, { gateSettings: { features: { revision: { tiers: { free: false } } }, hideUntilPurchasedEnabled: true }, currentPlanId: "free" }),
    false,
    "an explicit per-plan 'keep visible' wins",
  );
  assert.equal(
    isFeatureHiddenForAudience({ id: "revision", visibilityMode: "hide" }, { isSubscriber: true }),
    false,
    "a paid member keeps what they pay for",
  );
});
