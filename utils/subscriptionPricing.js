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
