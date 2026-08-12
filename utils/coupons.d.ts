// Type declarations for `utils/coupons.js`. The runtime lives in
// the sibling `.js` file so the Node test runner can import it
// without a TS toolchain. The server endpoint
// (`api/_lib/coupons.ts`) and the entitlement writer
// (`api/_lib/entitlements.ts`) import the runtime from this file.

import type { ServerPriceQuoteRecord } from "./serverQuotes";

/** Canonical coupon shape after normalising a Firestore doc. */
export interface CouponDoc {
  code: string;
  type: "percent" | "flat";
  value: number;
  status: string;
  startsAt: number | null;
  expiresAt: number | null;
  globalLimit: number | null;
  usedCount: number;
  perUserLimit: number | null;
  productIds: string[];
  moduleIds: string[];
  resourceIds: string[];
  categories: string[];
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  firstPurchaseOnly: boolean;
  allowedPurchaseKinds: string[];
  description: string | null;
}

/** Context the validator needs to decide eligibility + discount. */
export interface CouponOrderContext {
  subtotalPaise: number;
  productIds: string[];
  moduleIds: string[];
  resourceIds: string[];
  categories: string[];
  purchaseKind: string | null;
  userHasPriorPurchases: boolean;
  userUsageCount: number;
}

/** Result of `validateCoupon`. */
export type CouponValidationResult =
  | { ok: true; discountPaise: number; reason: null }
  | { ok: false; code: string; reason: string };

/** The shape of `couponRedemptions/{id}`. */
export interface CouponRedemptionDoc {
  uid: string;
  couponCode: string;
  orderId: string;
  status: "pending" | "applied" | "reverted";
  createdAt: number;
  appliedAt: number | null;
  discountPaise: number;
  paymentId: string | null;
}

export const normaliseCouponCode: (raw: unknown) => string;

export const normaliseCouponDoc: (raw: unknown) => CouponDoc | null;

export const isCouponActive: (coupon: CouponDoc | null | undefined, now?: number) => boolean;
export const isWithinGlobalLimit: (coupon: CouponDoc | null | undefined) => boolean;
export const isWithinPerUserLimit: (coupon: CouponDoc | null | undefined, userUsageCount?: number) => boolean;
export const isEligibleForProducts: (coupon: CouponDoc | null | undefined, productIds: ReadonlyArray<string> | string[]) => boolean;
export const isEligibleForModules: (coupon: CouponDoc | null | undefined, moduleIds: ReadonlyArray<string> | string[]) => boolean;
export const isEligibleForResources: (coupon: CouponDoc | null | undefined, resourceIds: ReadonlyArray<string> | string[]) => boolean;
export const isEligibleForCategories: (coupon: CouponDoc | null | undefined, orderCategories: ReadonlyArray<string> | string[]) => boolean;
export const meetsMinOrder: (coupon: CouponDoc | null | undefined, orderSubtotalPaise: number) => boolean;
export const isFirstPurchase: (coupon: CouponDoc | null | undefined, userHasPriorPurchases: boolean) => boolean;
export const isEligibleForPurchaseKind: (coupon: CouponDoc | null | undefined, purchaseKind: string | null | undefined) => boolean;

export const computeCouponDiscount: (coupon: CouponDoc | null | undefined, orderSubtotalPaise: number) => number;

export const validateCoupon: (
  coupon: CouponDoc | null | undefined,
  orderContext: CouponOrderContext,
  now?: number,
) => CouponValidationResult;

export const applyCouponToQuote: (
  quote: ServerPriceQuoteRecord,
  coupon: CouponDoc,
  validatedDiscountPaise: number,
) => ServerPriceQuoteRecord;

export const removeCouponFromQuote: (quote: ServerPriceQuoteRecord) => ServerPriceQuoteRecord;

export const buildCouponRedemptionDocId: (couponCode: string, orderId: string) => string | null;

export const shouldIncrementCouponUsage: (
  redemptionDoc: unknown,
  coupon: CouponDoc,
  now?: number,
) => boolean;
