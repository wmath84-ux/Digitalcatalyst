// tests/featurePricing.test.mjs
//
// Plan-aware + cycle-aware subscription feature pricing.
//
// The commercial requirement: the same feature can cost a different
// amount on each plan, differ between monthly and yearly, and be free
// on a top tier. These tests pin the resolution order and guarantee
// the server charges exactly what the subscription page displayed.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  featurePricePaise,
  groupFeaturesByPriceTier,
  normalisePlanOverride,
  normalisePlanPricing,
  resolveFeaturePrice,
  resolveFeaturesForPlan,
  sumSelectedFeaturePaise,
  toPaise,
} from "../utils/featurePricing.js";
import { buildSubscriptionLineItems, normaliseFeatureDoc } from "../utils/subscriptions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

// A feature priced differently on every plan — the headline scenario.
const myDay = {
  id: "my-day",
  name: "My Day",
  description: "Cloud sync",
  icon: "calendar",
  pricePaise: 9900, // ₹99 base
  included: false,
  active: true,
  sortOrder: 0,
  monthlyPricePaise: null,
  yearlyPricePaise: null,
  planPricing: {
    premium: { monthly: 49, yearly: 490 },
    pro: { included: true },
  },
};

// ---------------------------------------------------------------------------
// toPaise
// ---------------------------------------------------------------------------

test("toPaise converts rupees to integer paise", () => {
  assert.equal(toPaise(99), 9900);
  assert.equal(toPaise("49.50"), 4950);
  assert.equal(toPaise(0), 0);
});

test("toPaise never returns a negative or NaN amount", () => {
  assert.equal(toPaise(-10), 0);
  assert.equal(toPaise("abc"), 0);
  assert.equal(toPaise(null), 0);
  assert.equal(toPaise(undefined), 0);
});

// ---------------------------------------------------------------------------
// Override normalisation
// ---------------------------------------------------------------------------

test("normalisePlanOverride accepts rupee and paise inputs", () => {
  assert.deepEqual(normalisePlanOverride({ monthly: 49, yearly: 490 }), {
    included: false,
    monthlyPaise: 4900,
    yearlyPaise: 49000,
    flatPaise: null,
  });
  assert.deepEqual(normalisePlanOverride({ monthlyPaise: 4900 }), {
    included: false,
    monthlyPaise: 4900,
    yearlyPaise: null,
    flatPaise: null,
  });
});

test("normalisePlanPricing drops unusable entries instead of throwing", () => {
  const out = normalisePlanPricing({ premium: { monthly: 49 }, "": { monthly: 10 }, bad: null });
  assert.ok(out.premium);
  assert.equal(Object.keys(out).length, 1);
});

// ---------------------------------------------------------------------------
// Resolution order
// ---------------------------------------------------------------------------

test("plan override wins for the matching plan and cycle", () => {
  assert.equal(resolveFeaturePrice(myDay, "premium", "monthly").pricePaise, 4900);
  assert.equal(resolveFeaturePrice(myDay, "premium", "yearly").pricePaise, 49000);
});

test("plan marked included resolves to free", () => {
  const resolved = resolveFeaturePrice(myDay, "pro", "monthly");
  assert.equal(resolved.pricePaise, 0);
  assert.equal(resolved.included, true);
  assert.equal(resolved.source, "plan-included");
});

test("a plan with no override falls back to the base price", () => {
  assert.equal(resolveFeaturePrice(myDay, "basic", "monthly").pricePaise, 9900);
  assert.equal(resolveFeaturePrice(myDay, "basic", "yearly").pricePaise, 9900);
});

test("feature-level cycle rates apply when no plan override exists", () => {
  const feature = { ...myDay, planPricing: {}, monthlyPricePaise: 7900, yearlyPricePaise: 79000 };
  assert.equal(resolveFeaturePrice(feature, "basic", "monthly").pricePaise, 7900);
  assert.equal(resolveFeaturePrice(feature, "basic", "yearly").pricePaise, 79000);
});

test("a globally included feature is free on every plan", () => {
  const freeFeature = { ...myDay, included: true };
  for (const planId of ["basic", "premium", "pro"]) {
    assert.equal(resolveFeaturePrice(freeFeature, planId, "monthly").pricePaise, 0);
  }
});

test("an unknown cycle is treated as monthly", () => {
  assert.equal(featurePricePaise(myDay, "premium", "weekly"), 4900);
});

test("resolveFeaturePrice tolerates a missing feature", () => {
  assert.deepEqual(resolveFeaturePrice(null, "basic", "monthly"), {
    pricePaise: 0,
    included: false,
    source: "missing",
  });
});

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

test("resolveFeaturesForPlan attaches the resolved price to each record", () => {
  const [resolved] = resolveFeaturesForPlan([myDay], "premium", "monthly");
  assert.equal(resolved.resolvedPricePaise, 4900);
  assert.equal(resolved.resolvedIncluded, false);
  // The original catalog value is preserved for reference.
  assert.equal(resolved.pricePaise, 9900);
});

test("sumSelectedFeaturePaise totals only the selected features at plan rates", () => {
  const extra = { id: "ai", name: "AI mentor", pricePaise: 19900, included: false, active: true, sortOrder: 1 };
  const features = [myDay, extra];
  assert.equal(sumSelectedFeaturePaise(features, ["my-day", "ai"], "premium", "monthly"), 4900 + 19900);
  // On Pro, My Day is free.
  assert.equal(sumSelectedFeaturePaise(features, ["my-day", "ai"], "pro", "monthly"), 19900);
  assert.equal(sumSelectedFeaturePaise(features, [], "premium", "monthly"), 0);
});

test("groupFeaturesByPriceTier sorts tiers ascending with free first", () => {
  const features = [
    myDay,
    { id: "ai", name: "AI mentor", pricePaise: 19900, included: false, active: true, sortOrder: 1 },
    { id: "certs", name: "Certificates", pricePaise: 0, included: true, active: true, sortOrder: 2 },
  ];
  const tiers = groupFeaturesByPriceTier(features, "premium", "monthly");
  assert.equal(tiers[0].pricePaise, 0);
  assert.equal(tiers[0].free, true);
  assert.deepEqual(tiers.map((t) => t.pricePaise), [0, 4900, 19900]);
});

// ---------------------------------------------------------------------------
// Server parity — the charge must match the display
// ---------------------------------------------------------------------------

test("normaliseFeatureDoc reads planPricing and cycle rates off the Firestore doc", () => {
  const doc = normaliseFeatureDoc(
    { name: "My Day", price: 99, monthlyPrice: 79, yearlyPrice: 790, planPricing: { pro: { included: true } } },
    "my-day",
  );
  assert.equal(doc.pricePaise, 9900);
  assert.equal(doc.monthlyPricePaise, 7900);
  assert.equal(doc.yearlyPricePaise, 79000);
  assert.equal(doc.planPricing.pro.included, true);
});

test("buildSubscriptionLineItems charges the plan-resolved price", () => {
  const plan = { id: "premium", name: "Premium", description: "" };
  const items = buildSubscriptionLineItems({
    plan,
    cycle: "monthly",
    selectedFeatureIds: ["my-day"],
    featureRecords: [myDay],
    productUnlocks: [],
    moduleUnlocks: [],
  });
  const line = items.find((item) => item.featureId === "my-day");
  assert.ok(line, "feature line item should exist");
  // ₹49 on Premium, NOT the ₹99 base price.
  assert.equal(line.effectivePrice, 4900);
  assert.equal(line.regularPrice, 4900);
});

test("buildSubscriptionLineItems omits a feature that is free on the plan", () => {
  const items = buildSubscriptionLineItems({
    plan: { id: "pro", name: "Pro", description: "" },
    cycle: "monthly",
    selectedFeatureIds: ["my-day"],
    featureRecords: [myDay],
    productUnlocks: [],
    moduleUnlocks: [],
  });
  assert.equal(items.filter((item) => item.featureId === "my-day").length, 0);
});

test("buildSubscriptionLineItems honours the yearly override", () => {
  const items = buildSubscriptionLineItems({
    plan: { id: "premium", name: "Premium", description: "" },
    cycle: "yearly",
    selectedFeatureIds: ["my-day"],
    featureRecords: [myDay],
    productUnlocks: [],
    moduleUnlocks: [],
  });
  assert.equal(items.find((item) => item.featureId === "my-day").effectivePrice, 49000);
});

// ---------------------------------------------------------------------------
// UI contract
// ---------------------------------------------------------------------------

test("SubscriptionPage prices features through the shared resolver", () => {
  const source = readSource("src/subscription/components/SubscriptionPage.tsx");
  assert.match(source, /resolveFeaturesForPlan/);
  assert.match(source, /sumSelectedFeaturePaise\(rawFeatures, chargeableFeatureIds, selectedPlanId, cycle\)/);
  assert.match(source, /groupFeaturesByPriceTier/);
});

test("Admin subscriptions page exposes plan-wise and cycle pricing inputs", () => {
  const source = readSource("src/admin/pages/SubscriptionsPage.tsx");
  assert.match(source, /Plan-wise pricing/);
  assert.match(source, /Monthly \/ Yearly pricing/);
  assert.match(source, /planPricing/);
  assert.match(source, /Free on this plan/);
});

test("Admin feature editor previews the buyer-facing price with the shared resolver", () => {
  const source = readSource("src/admin/pages/SubscriptionsPage.tsx");
  assert.match(source, /What buyers will see/);
  assert.match(source, /resolveFeaturePrice\(previewDoc, plan\.id, "monthly"\)/);
  assert.match(source, /resolveFeaturePrice\(previewDoc, plan\.id, "yearly"\)/);
});

test("FeatureSelectModal and trigger price from the plan-resolved rate, not the flat rate", () => {
  const modal = readSource("src/subscription/components/FeatureSelectModal.tsx");
  assert.match(modal, /resolvedPricePaise/);
  assert.match(modal, /featurePrice\(feat\)/);
  // The running total must skip plan-included features.
  assert.match(modal, /!includedSet\.has\(f\.id\)/);
  const trigger = readSource("src/subscription/components/FeatureSelectTrigger.tsx");
  assert.match(trigger, /resolvedPricePaise/);
});

test("legacy feature docs with individualPrice/pricePaise fields still resolve their real price", () => {
  // Older admin builds wrote `individualPrice` (rupees) instead of `price`.
  const legacyRupees = normaliseFeatureDoc({ name: "My Day", individualPrice: 500, active: true }, "my-day");
  assert.equal(legacyRupees.pricePaise, 50000);
  // Even older docs stored paise directly.
  const legacyPaise = normaliseFeatureDoc({ name: "My Day", pricePaise: 50000, active: true }, "my-day");
  assert.equal(legacyPaise.pricePaise, 50000);
  // The current admin field still wins when both are present.
  const both = normaliseFeatureDoc({ name: "My Day", price: 500, individualPrice: 900, active: true }, "my-day");
  assert.equal(both.pricePaise, 50000);
});
