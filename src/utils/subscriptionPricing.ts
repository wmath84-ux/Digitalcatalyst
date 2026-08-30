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
