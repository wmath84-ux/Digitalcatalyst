// src/subscription/utils/subscriptionCatalog.ts
//
// Part 9 — types + helpers for the server-driven subscription
// flow. The catalog (plans + features + product/module unlock
// mappings) is loaded from Firestore via `/api/subscription-catalog`
// and consumed by the SubscriptionPage.
//
// The `startCheckout` helper routes the subscription through the
// Part 5 `CheckoutContext` so the same quote → Razorpay →
// entitlement pipeline handles subscriptions.

import type { CheckoutSelection } from "../../types/commerce";

/** Billing cycle supported by a plan. */
export type BillingCycle = "monthly" | "yearly";

/**
 * Server-normalised subscription plan. Loaded from the
 * `subscriptionPlans` Firestore collection.
 */
export interface SubscriptionPlanDoc {
  id: string;
  name: string;
  description: string;
  /** Cents in paise. */
  monthlyPricePaise: number;
  /** Cents in paise. */
  yearlyPricePaise: number;
  /** Free features bundled into the plan (by feature id). */
  includedFeatureIds: string[];
  /** Products the plan unlocks as a base entitlement (by product id). */
  includedProductIds: string[];
  /** Modules the plan unlocks as a base entitlement (by productId + moduleId). */
  includedModuleKeys: string[];
  /** Allowed cycles. */
  allowedCycles: BillingCycle[];
  /** True when the plan is currently sellable. */
  active: boolean;
  /** Optional admin-set minimum payable floor in paise. */
  minPayablePaise: number;
  /** Display-only metadata. */
  badge?: string | null;
  /** Free trial days (0 = no trial). */
  trialDays: number;
  /** Auto-renew by default. */
  autoRenewByDefault: boolean;
  /** Sort order for the picker. */
  sortOrder: number;
}

/** Server-normalised subscription feature. */
export interface SubscriptionFeatureDoc {
  id: string;
  name: string;
  description: string;
  /** Icon name (matches a Lucide icon). */
  icon: string;
  /** Feature price in paise (legacy flat rate; used when no override matches). */
  pricePaise: number;
  /** Cycle-specific base rate in paise. Null falls back to `pricePaise`. */
  monthlyPricePaise?: number | null;
  /** Cycle-specific base rate in paise. Null falls back to `pricePaise`. */
  yearlyPricePaise?: number | null;
  /**
   * Per-plan price overrides keyed by plan id, e.g.
   * `{ premium: { monthly: 49, yearly: 490 }, pro: { included: true } }`.
   * Resolved by `utils/featurePricing.js` on both client and server.
   */
  planPricing?: Record<string, unknown>;
  /** True when the feature is included for free with the plan. */
  included: boolean;
  /** Active flag (admin can disable a feature without removing it). */
  active: boolean;
  /** Optional badge text. */
  badge?: string | null;
  /** Sort order for the picker. */
  sortOrder: number;
}

/** Server-normalised plan-to-product unlock (Firestore
 *  `subscriptionPlanProductUnlocks` collection). */
export interface SubscriptionPlanProductUnlock {
  planId: string;
  productId: string;
  active: boolean;
}

/** Server-normalised plan-to-module unlock. */
export interface SubscriptionPlanModuleUnlock {
  planId: string;
  productId: string;
  moduleId: string;
  active: boolean;
}

/** The full normalised catalog the page renders. */
export interface SubscriptionCatalog {
  plans: SubscriptionPlanDoc[];
  features: SubscriptionFeatureDoc[];
  /** New: subscription-priced add-on products (courses etc) */
  subscriptionProducts?: Array<{
    id: string;
    productId: string;
    name: string;
    pricePaise: number;
    monthlyPricePaise?: number | null;
    yearlyPricePaise?: number | null;
    planPricing?: Record<string, any>;
    included?: boolean;
    active: boolean;
    sortOrder: number;
  }>;
  productUnlocks: SubscriptionPlanProductUnlock[];
  moduleUnlocks: SubscriptionPlanModuleUnlock[];
  loadedAt: number;
}

/**
 * Build a canonical subscription `CheckoutSelection` from the
 * plan / cycle / features / products / modules the buyer picked.
 * The selection is then handed to the Part 5 `CheckoutContext` so
 * the same Razorpay / coupon / EduCoin plumbing handles
 * subscriptions. The Part 4 engine recognises `purchaseKind:
 * "subscription"` and emits the correct line items.
 */
export const buildSubscriptionSelection = (input: {
  plan: SubscriptionPlanDoc;
  cycle: BillingCycle;
  selectedFeatureIds: string[];
  selectedProductIds: string[];
  selectedModuleIds: string[];
  couponCode: string | null;
  requestedEduCoins: number;
  returnRoute?: string;
}): CheckoutSelection => ({
  purchaseKind: "subscription",
  productIds: input.selectedProductIds.slice(),
  moduleIds: input.selectedModuleIds.slice(),
  resourceIds: [],
  updateId: null,
  subscriptionPlanId: input.plan.id,
  billingCycle: input.cycle,
  featureIds: input.selectedFeatureIds.slice(),
  couponCode: input.couponCode,
  requestedEduCoins: Math.max(0, Math.floor(Number(input.requestedEduCoins || 0))),
  returnRoute: input.returnRoute || null,
});

/**
 * Route the subscription through the Part 5 `CheckoutContext`. The
 * context builds a validated session record, writes it, and
 * navigates to `#/checkout`. The same `CheckoutApp` then renders
 * the review / payment / success steps for the subscription.
 */
export const startCheckout = async (input: {
  selection: CheckoutSelection;
  buyer: {
    uid: string;
    name: string;
    email: string;
  };
  returnRoute: { hash: string; label?: string };
  idempotencyKey?: string;
}): Promise<void> => {
  // Lazy import so the subscription module doesn't depend on
  // the auth context at module-eval time.
  const mod = await import("../../../utils/checkoutSession");
  const session = mod.buildCheckoutSessionRecord({
    selection: input.selection,
    quote: null,
    buyer: {
      uid: input.buyer.uid,
      name: input.buyer.name,
      email: input.buyer.email,
      mobile: null,
      emailVerified: false,
      tokenVerified: true,
      coins: 0,
    },
    returnRoute: input.returnRoute,
    idempotencyKey: input.idempotencyKey || null,
  });
  mod.writeToSessionStorage(session);
  if (typeof window !== "undefined") {
    window.location.hash = "#/checkout";
  }
};
