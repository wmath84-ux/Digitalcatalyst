// src/utils/subscriptionPricing.ts
//
// PURE helpers — no Firestore, no React, no DOM. Used by both the
// admin client, the server API, and the app-side React components
// (subscription page, plan picker, profile widget).
//
// The rule the helpers encode is the user-facing contract:
//   1. When the user is NOT a subscriber, they see the public price
//      for every plan and every cycle — no exceptions.
//   2. When the user IS a subscriber, the admin's override (per plan
//      + per cycle) wins. A `null` override means "use the public
//      price for this cycle on this plan".
//   3. The override only applies to the SUBSCRIBER. A non-subscriber
//      who pokes the API never sees the override. The same rule is
//      enforced server-side in `api/_lib/subscriptionGate.ts`.

export type SubscriberPricingOverride = {
  monthly: number | null;
  yearly: number | null;
  lifetime: number | null;
};

export type Cycle = "monthly" | "yearly" | "lifetime";

export function resolveSubscriberOnlyPrice(
  planId: string,
  cycle: Cycle,
  basePrice: number,
  isSubscriber: boolean,
  subscriberPricing: Record<string, SubscriberPricingOverride | undefined> | null | undefined,
): number {
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
 * Two admin surfaces may carry a subscriber-only price for the same plan:
 * the plan sheet (`plan.subscriberPricingOverride`) and the gate matrix
 * (`settings/subscriptionGate.subscriberPricing[planId]`). Before this helper
 * only the gate value was ever read, so a number typed in the plan sheet did
 * nothing. The plan's own field is the more specific edit, so it wins per
 * cycle and the gate value is the fallback. An empty box means "not set" —
 * never "free" — so it never erases the other surface's number.
 */

export function mergeSubscriberPricing(
  planOverride: Partial<SubscriberPricingOverride> | null | undefined,
  gateOverride: Partial<SubscriberPricingOverride> | null | undefined,
): SubscriberPricingOverride {
  const positive = (value: number | null | undefined): number | null => {
    if (value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  };
  const plan = planOverride && typeof planOverride === "object" ? planOverride : {};
  const gate = gateOverride && typeof gateOverride === "object" ? gateOverride : {};
  return {
    monthly: positive(plan.monthly) ?? positive(gate.monthly) ?? null,
    yearly: positive(plan.yearly) ?? positive(gate.yearly) ?? null,
    lifetime: positive(plan.lifetime) ?? positive(gate.lifetime) ?? null,
  };
}

/**
 * The effective subscriber price for one plan + cycle, resolving BOTH admin
 * surfaces. Non-subscribers always get the public price (rule 1 above).
 */
export function resolveEffectiveSubscriberPrice(
  planId: string,
  cycle: Cycle,
  basePrice: number,
  isSubscriber: boolean,
  planOverride: Partial<SubscriberPricingOverride> | null | undefined,
  gatePricing: Record<string, Partial<SubscriberPricingOverride> | undefined> | null | undefined,
): number {
  const gateForPlan = gatePricing && typeof gatePricing === "object" ? gatePricing[planId] : null;
  const merged = mergeSubscriberPricing(planOverride, gateForPlan);
  return resolveSubscriberOnlyPrice(planId, cycle, basePrice, isSubscriber, { [String(planId)]: merged });
}

export function isPlanVisibleForAudience(
  planId: string,
  isSubscriber: boolean,
  planVisibility: Record<string, { visible?: boolean; visibleToSubscribers?: boolean } | undefined> | null | undefined,
  options?: { ownedPlanId?: string | null } | null,
): boolean {
  const ownedPlanId = options?.ownedPlanId ? String(options.ownedPlanId) : "";
  if (ownedPlanId && String(planId) === ownedPlanId) return true;
  const row = planVisibility?.[planId];
  if (!row) return true;
  if (isSubscriber) return row.visibleToSubscribers !== false;
  return row.visible !== false;
}

export function resolveAiQuestionsPerDay(
  planId: string | null | undefined,
  featureCap: number | null | undefined,
  settings: {
    usageLimits?: { aiQuestionsPerDay?: Record<string, number> };
  } | null | undefined,
): number | null {
  if (planId) {
    const planCap = settings?.usageLimits?.aiQuestionsPerDay?.[planId];
    if (typeof planCap === "number" && planCap > 0) return planCap;
  }
  if (featureCap == null) return null;
  if (Number.isNaN(Number(featureCap))) return null;
  if (Number(featureCap) <= 0) return null;
  return Number(featureCap);
}
