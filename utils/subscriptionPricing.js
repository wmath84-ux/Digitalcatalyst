// utils/subscriptionPricing.js
//
// Runtime version of the shared subscription pricing helpers. Mirrors
// `src/utils/subscriptionPricing.ts`. Pure JS so it runs in the Vercel
// Node runtime as well as in browser bundles.

/**
 * @typedef {"monthly" | "yearly" | "lifetime"} Cycle
 * @typedef {{ monthly: number | null, yearly: number | null, lifetime: number | null }} SubscriberPricingOverride
 */

/**
 * @param {string} planId
 * @param {Cycle} cycle
 * @param {number} basePrice
 * @param {boolean} isSubscriber
 * @param {Record<string, SubscriberPricingOverride | undefined> | null | undefined} subscriberPricing
 * @returns {number}
 */
export function resolveSubscriberOnlyPrice(planId, cycle, basePrice, isSubscriber, subscriberPricing) {
  if (!isSubscriber) return basePrice;
  if (!subscriberPricing) return basePrice;
  const override = subscriberPricing[planId];
  if (!override) return basePrice;
  const candidate = override[cycle];
  if (candidate == null) return basePrice;
  if (Number.isNaN(Number(candidate))) return basePrice;
  if (Number(candidate) <= 0) return basePrice;
  return Number(candidate);
}

/**
 * @param {string | null | undefined} planId
 * @param {number | null | undefined} featureCap
 * @param {{ usageLimits?: { aiQuestionsPerDay?: Record<string, number> } } | null | undefined} settings
 * @returns {number | null}
 */
/**
 * Whether a plan card should appear on the public subscription page for
 * this audience. Missing rows default to visible for everyone so a fresh
 * database behaves like the legacy catalog.
 *
 * Existing subscribers keep seeing the plan they already own even when
 * the admin hides it from the subscriber picker — otherwise they could
 * not renew.
 *
 * @param {string} planId
 * @param {boolean} isSubscriber
 * @param {Record<string, { visible?: boolean, visibleToSubscribers?: boolean } | undefined> | null | undefined} planVisibility
 * @param {{ ownedPlanId?: string | null } | null | undefined} [options]
 * @returns {boolean}
 */
/**
 * Two admin surfaces may carry a subscriber-only price for the same plan:
 * the plan sheet (`plan.subscriberPricingOverride`) and the gate matrix
 * (`settings/subscriptionGate.subscriberPricing[planId]`). Before this helper
 * only the gate value was ever read, so a number typed in the plan sheet did
 * nothing. The plan's own field is the more specific edit, so it wins per
 * cycle and the gate value is the fallback. An empty box means "not set" —
 * never "free" — so it never erases the other surface's number.
 */

export function mergeSubscriberPricing(planOverride, gateOverride) {
  const positive = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  };
  const plan = planOverride && typeof planOverride === "object" ? planOverride : {};
  const gate = gateOverride && typeof gateOverride === "object" ? gateOverride : {};
  return {
    monthly: positive(plan.monthly) ?? positive(gate.monthly),
    yearly: positive(plan.yearly) ?? positive(gate.yearly),
    lifetime: positive(plan.lifetime) ?? positive(gate.lifetime),
  };
}

/**
 * The effective subscriber price for one plan + cycle, resolving BOTH admin
 * surfaces. Non-subscribers always get the public price (rule 1 above).
 */
export function resolveEffectiveSubscriberPrice(
  planId,
  cycle,
  basePrice,
  isSubscriber,
  planOverride,
  gatePricing,
) {
  const gateForPlan = gatePricing && typeof gatePricing === "object" ? gatePricing[planId] : null;
  const merged = mergeSubscriberPricing(planOverride, gateForPlan);
  return resolveSubscriberOnlyPrice(planId, cycle, basePrice, isSubscriber, { [String(planId)]: merged });
}

export function isPlanVisibleForAudience(planId, isSubscriber, planVisibility, options) {
  const ownedPlanId = options && options.ownedPlanId ? String(options.ownedPlanId) : "";
  if (ownedPlanId && String(planId) === ownedPlanId) return true;
  const row = planVisibility && planVisibility[planId];
  if (!row) return true;
  if (isSubscriber) return row.visibleToSubscribers !== false;
  return row.visible !== false;
}

export function resolveAiQuestionsPerDay(planId, featureCap, settings) {
  if (planId) {
    const planCap = settings?.usageLimits?.aiQuestionsPerDay?.[planId];
    if (typeof planCap === "number" && planCap > 0) return planCap;
  }
  if (featureCap == null) return null;
  if (Number.isNaN(Number(featureCap))) return null;
  if (Number(featureCap) <= 0) return null;
  return Number(featureCap);
}
