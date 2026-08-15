// utils/featurePricing.js
//
// Plan-aware + cycle-aware subscription feature pricing.
//
// Historically a `subscriptionFeatures/{id}` doc carried a single
// `price` field that applied to every plan and both billing cycles.
// That made it impossible to express the common commercial shape:
//
//   My Day  —  Basic: ₹99/mo   Premium: ₹49/mo   Pro: free
//              (and a discounted yearly rate for each)
//
// This module adds a resolution layer on top of the existing field
// without breaking any document that does not use it. A feature doc
// may now carry an optional `planPricing` map:
//
//   {
//     price: 99,                      // legacy base price (rupees)
//     planPricing: {
//       premium: { monthly: 49, yearly: 490 },
//       pro:     { included: true }
//     }
//   }
//
// Resolution order (first match wins):
//
//   1. plan override marked `included` → free
//   2. plan + cycle override price
//   3. plan-level override price (both cycles)
//   4. feature-level cycle price (`monthlyPrice` / `yearlyPrice`)
//   5. legacy flat `price`
//   6. zero
//
// Everything here is pure (no Firestore / no React) so the Node test
// runner imports it directly, matching the `utils/*.js` convention.
// Money is handled in **paise** everywhere except the raw admin
// inputs, which are rupees.

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Rupees (or a numeric string) → integer paise. Never negative. */
export const toPaise = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
};

/** Already-paise input → clamped integer paise. */
const paiseField = (value) => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
};

export const BILLING_CYCLES = ["monthly", "yearly"];

export const isBillingCycle = (cycle) => BILLING_CYCLES.indexOf(String(cycle)) !== -1;

/**
 * Normalise one plan override entry. Accepts rupee fields
 * (`monthly` / `yearly` / `price`) or explicit paise fields
 * (`monthlyPaise` / `yearlyPaise` / `pricePaise`), plus an
 * `included` flag that makes the feature free on that plan.
 */
export const normalisePlanOverride = (raw) => {
  if (!isObject(raw)) return null;
  const included = raw.included === true;
  const pick = (rupees, paise) => {
    if (paise !== undefined && paise !== null && paise !== "") return paiseField(paise);
    if (rupees !== undefined && rupees !== null && rupees !== "") return toPaise(rupees);
    return null;
  };
  return {
    included,
    monthlyPaise: pick(raw.monthly ?? raw.monthlyPrice, raw.monthlyPaise),
    yearlyPaise: pick(raw.yearly ?? raw.yearlyPrice, raw.yearlyPaise),
    flatPaise: pick(raw.price, raw.pricePaise),
  };
};

/**
 * Normalise the whole `planPricing` map on a feature doc, keyed by
 * plan id. Unusable entries are dropped rather than throwing so one
 * bad admin row can never break the catalog.
 */
export const normalisePlanPricing = (raw) => {
  if (!isObject(raw)) return {};
  const out = {};
  for (const key of Object.keys(raw)) {
    const planId = String(key).trim();
    if (!planId) continue;
    const entry = normalisePlanOverride(raw[key]);
    if (entry) out[planId] = entry;
  }
  return out;
};

/**
 * Resolve what a feature costs for a given plan + billing cycle.
 * Returns `{ pricePaise, included, source }` where `source` names
 * the rule that won — useful for admin previews and for the tests.
 *
 * `feature` is a normalised `SubscriptionFeatureDoc` (paise-based),
 * optionally carrying `planPricing`, `monthlyPricePaise` and
 * `yearlyPricePaise`.
 */
export const resolveFeaturePrice = (feature, planId, cycle) => {
  if (!isObject(feature)) return { pricePaise: 0, included: false, source: "missing" };

  // A globally-included feature is free everywhere.
  if (feature.included === true) return { pricePaise: 0, included: true, source: "feature-included" };

  const normalisedCycle = isBillingCycle(cycle) ? String(cycle) : "monthly";
  const pricing = isObject(feature.planPricing) ? feature.planPricing : {};
  const override = planId ? normalisePlanOverride(pricing[String(planId)]) : null;

  if (override) {
    if (override.included) return { pricePaise: 0, included: true, source: "plan-included" };
    const cycleValue = normalisedCycle === "yearly" ? override.yearlyPaise : override.monthlyPaise;
    if (cycleValue !== null && cycleValue !== undefined) {
      return { pricePaise: cycleValue, included: false, source: `plan-${normalisedCycle}` };
    }
    if (override.flatPaise !== null && override.flatPaise !== undefined) {
      return { pricePaise: override.flatPaise, included: false, source: "plan-flat" };
    }
  }

  // Feature-level cycle pricing (applies to every plan).
  const featureCyclePaise = normalisedCycle === "yearly"
    ? feature.yearlyPricePaise
    : feature.monthlyPricePaise;
  if (featureCyclePaise !== null && featureCyclePaise !== undefined && featureCyclePaise !== "") {
    return { pricePaise: paiseField(featureCyclePaise), included: false, source: `feature-${normalisedCycle}` };
  }

  // Legacy flat price.
  return { pricePaise: paiseField(feature.pricePaise), included: false, source: "feature-flat" };
};

/**
 * Convenience wrapper returning just the paise amount.
 */
export const featurePricePaise = (feature, planId, cycle) =>
  resolveFeaturePrice(feature, planId, cycle).pricePaise;

/**
 * Project a feature list onto a plan + cycle, attaching the resolved
 * price to each record. The subscription page renders straight from
 * this so what the buyer sees always matches what the server charges.
 */
export const resolveFeaturesForPlan = (features, planId, cycle) => {
  if (!Array.isArray(features)) return [];
  return features.map((feature) => {
    const resolved = resolveFeaturePrice(feature, planId, cycle);
    return {
      ...feature,
      resolvedPricePaise: resolved.pricePaise,
      resolvedIncluded: resolved.included,
      resolvedSource: resolved.source,
    };
  });
};

/**
 * Total payable for a set of selected feature ids on a plan + cycle.
 * Included features contribute nothing.
 */
export const sumSelectedFeaturePaise = (features, selectedIds, planId, cycle) => {
  const wanted = new Set((Array.isArray(selectedIds) ? selectedIds : []).map(String));
  let total = 0;
  for (const feature of Array.isArray(features) ? features : []) {
    if (!isObject(feature)) continue;
    if (!wanted.has(String(feature.id))) continue;
    total += resolveFeaturePrice(feature, planId, cycle).pricePaise;
  }
  return total;
};

/**
 * Group resolved features into ascending price tiers so the
 * subscription page can present "what you get at each price point"
 * instead of one flat list. Free/included features form their own
 * leading group.
 */
export const groupFeaturesByPriceTier = (features, planId, cycle) => {
  const resolved = resolveFeaturesForPlan(features, planId, cycle);
  const buckets = new Map();
  for (const feature of resolved) {
    const key = feature.resolvedIncluded ? 0 : feature.resolvedPricePaise;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(feature);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([pricePaise, items]) => ({
      pricePaise,
      free: pricePaise === 0,
      features: items.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name).localeCompare(String(b.name))),
    }));
};

export default resolveFeaturePrice;
