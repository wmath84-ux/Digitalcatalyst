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
