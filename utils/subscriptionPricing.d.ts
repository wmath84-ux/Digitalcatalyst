// utils/subscriptionPricing.d.ts
//
// Type declarations for the shared subscription pricing helpers. The
// implementation lives in `utils/subscriptionPricing.js` (the runtime
// module) and `src/utils/subscriptionPricing.ts` (the Vite-compiled
// source) — both share the same contract.

export type Cycle = "monthly" | "yearly" | "lifetime";

export type SubscriberPricingOverride = {
  monthly: number | null;
  yearly: number | null;
  lifetime: number | null;
};

export function resolveSubscriberOnlyPrice(
  planId: string,
  cycle: Cycle,
  basePrice: number,
  isSubscriber: boolean,
  subscriberPricing: Record<string, SubscriberPricingOverride | undefined> | null | undefined,
): number;

export function resolveAiQuestionsPerDay(
  planId: string | null | undefined,
  featureCap: number | null | undefined,
  settings: {
    usageLimits?: { aiQuestionsPerDay?: Record<string, number> };
  } | null | undefined,
): number | null;
