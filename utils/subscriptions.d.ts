// Type declarations for `utils/subscriptions.js`. The runtime
// lives in the sibling `.js` file so the Node test runner can
// import it without a TS toolchain. The server endpoint
// (`api/_lib/subscriptions.ts`) and the entitlement writer
// (`api/_lib/entitlements.ts`) import the runtime from this
// file.

import type { CheckoutLineItem } from "../src/types/commerce";

export type BillingCycle = "monthly" | "yearly";

/** Canonical subscription plan shape (post-normalisation). */
export interface SubscriptionPlanDoc {
  id: string;
  name: string;
  description: string;
  /** Paise. */
  monthlyPricePaise: number;
  /** Paise. */
  yearlyPricePaise: number;
  includedFeatureIds: string[];
  includedProductIds: string[];
  includedModuleKeys: string[];
  allowedCycles: BillingCycle[];
  active: boolean;
  /** Paise. */
  minPayablePaise: number;
  badge: string | null;
  trialDays: number;
  autoRenewByDefault: boolean;
  sortOrder: number;
}

/** Canonical subscription feature shape. */
export interface SubscriptionFeatureDoc {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Paise. Legacy flat price applied when no override matches. */
  pricePaise: number;
  /** Paise. Cycle-specific base rate; null falls back to `pricePaise`. */
  monthlyPricePaise?: number | null;
  /** Paise. Cycle-specific base rate; null falls back to `pricePaise`. */
  yearlyPricePaise?: number | null;
  /** Per-plan price overrides keyed by plan id. */
  planPricing?: Record<string, { included: boolean; monthlyPaise: number | null; yearlyPaise: number | null; flatPaise: number | null }>;
  included: boolean;
  active: boolean;
  badge: string | null;
  sortOrder: number;
}

/** Plan-to-product unlock (Firestore `subscriptionPlanProductUnlocks`). */
export interface SubscriptionPlanProductUnlock {
  planId: string;
  productId: string;
  active: boolean;
}

/** Plan-to-module unlock (Firestore `subscriptionPlanModuleUnlocks`). */
export interface SubscriptionPlanModuleUnlock {
  planId: string;
  productId: string;
  moduleId: string;
  active: boolean;
}

/** Optional coupon context forwarded by the Part 7 engine. */
export interface SubscriptionCouponContext {
  couponCode: string;
  discountPaise: number;
  reason: string | null;
}

export interface ValidateSubscriptionInput {
  plan: SubscriptionPlanDoc | null;
  cycle: BillingCycle;
  selectedFeatureIds: string[];
  featureRecords: SubscriptionFeatureDoc[];
  couponContext?: SubscriptionCouponContext | null;
}

export type ValidateSubscriptionResult =
  | {
      ok: true;
      plan: SubscriptionPlanDoc;
      cycle: BillingCycle;
      features: SubscriptionFeatureDoc[];
      lineItems: CheckoutLineItem[];
      expiresAt: number;
      couponContext: SubscriptionCouponContext | null;
    }
  | { ok: false; code: string; reason: string };

/**
 * The subscription record written to `subscriptions/{uid}/current`
 * and mirrored on `users/{uid}.subscriptionPlanId` etc. The
 * post-payment writer stamps this after a successful Razorpay
 * capture.
 */
export interface SubscriptionRecord {
  uid: string;
  planId: string;
  cycle: BillingCycle;
  features: string[];
  includedProductIds: string[];
  includedModuleKeys: string[];
  status: "active" | "cancelled" | "expired" | "paused";
  activatedAt: number;
  expiresAt: number;
  autoRenew: boolean;
  orderId: string | null;
  paymentId: string | null;
  amountPaise: number;
  source: "razorpay" | "free" | "admin";
  /** Coupon applied to the original payment. */
  couponCode: string | null;
  /** EduCoin reservation the original payment requested. */
  requestedEduCoins: number;
}

export const normalisePlanDoc: (raw: unknown, id?: string) => SubscriptionPlanDoc | null;
export const normaliseFeatureDoc: (raw: unknown, id?: string) => SubscriptionFeatureDoc | null;

export const isPlanActive: (plan: SubscriptionPlanDoc | null | undefined) => boolean;
export const isPlanCycleAllowed: (
  plan: SubscriptionPlanDoc | null | undefined,
  cycle: BillingCycle,
) => boolean;
export const isFeatureSelectable: (
  plan: SubscriptionPlanDoc | null | undefined,
  feature: SubscriptionFeatureDoc | null | undefined,
  selectedFeatureIds: ReadonlyArray<string> | string[],
) => boolean;
export const isFeaturePayable: (feature: SubscriptionFeatureDoc | null | undefined) => boolean;
export const isFeatureIdAllowed: (plan: SubscriptionPlanDoc | null | undefined, featureId: string) => boolean;

export const computeCycleExpiresAt: (plan: SubscriptionPlanDoc, cycle: BillingCycle, now?: number) => number;
export const isSubscriptionActive: (subscription: SubscriptionRecord | null | undefined, now?: number) => boolean;

export const getPlanCyclePricePaise: (plan: SubscriptionPlanDoc, cycle: BillingCycle) => number;
export const formatBillingCycle: (cycle: BillingCycle) => string;
export const getCycleDurationDays: (cycle: BillingCycle) => number;

export interface BuildSubscriptionLineItemsInput {
  plan: SubscriptionPlanDoc;
  cycle: BillingCycle;
  selectedFeatureIds: string[];
  featureRecords: SubscriptionFeatureDoc[];
  productUnlocks: SubscriptionPlanProductUnlock[];
  moduleUnlocks: SubscriptionPlanModuleUnlock[];
}

export const buildSubscriptionLineItems: (input: BuildSubscriptionLineItemsInput) => CheckoutLineItem[];

export const validateSubscriptionSelection: (
  input: ValidateSubscriptionInput,
  now?: number,
) => ValidateSubscriptionResult;

export interface CollectSubscriptionEntitlementIdsInput {
  plan: SubscriptionPlanDoc;
  cycle: BillingCycle;
  selectedFeatureIds: string[];
  productUnlocks: SubscriptionPlanProductUnlock[];
  moduleUnlocks: SubscriptionPlanModuleUnlock[];
}

export const collectSubscriptionEntitlementIds: (
  input: CollectSubscriptionEntitlementIdsInput,
) => string[];

export const toPaise: (value: unknown) => number;
export const fromPaise: (paise: number) => number;
