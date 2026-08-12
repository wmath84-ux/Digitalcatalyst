// Type declarations for `utils/serverQuotes.js`. The runtime lives in the
// sibling `.js` file so the Node test runner can import it without a TS
// toolchain. The server endpoints (api/quotes/*) and any future client
// surface should import the runtime from this file via
// `import { buildQuote } from "../../utils/serverQuotes"`.

import type {
  CanonicalCourseModule,
  CanonicalCourseResource,
  CanonicalPaidUpdate,
  CheckoutLineItem,
  CheckoutSelection,
} from "../src/types/commerce";
import type { CouponDoc } from "./coupons";

export interface FirestoreProductDoc {
  id: string;
  title?: string;
  price?: string | number;
  salePrice?: string | number | null;
  regularPrice?: string | number;
  minPayableAmount?: string | number;
  coinPrice?: number;
  isFree?: boolean;
  isVisible?: boolean;
  inStock?: boolean;
  saleStart?: string | number | { toMillis?: () => number; _seconds?: number } | null;
  saleEnd?: string | number | { toMillis?: () => number; _seconds?: number } | null;
  courseContent?: CanonicalCourseModule[];
  paidUpdates?: CanonicalPaidUpdate[];
  adminProduct?: {
    saleStart?: string | null;
    saleEnd?: string | null;
  };
}

export interface FirestorePurchaseDoc {
  productId?: string | number;
  productDocumentId?: string;
  updateId?: string;
  entitlementId?: string;
}

export interface QuoteLineInput {
  kind:
    | "full_product"
    | "selected_modules"
    | "selected_resources"
    | "cart_bundle"
    | "paid_update"
    | "free_entitlement";
  productId?: string | null;
  moduleId?: string | null;
  resourceId?: string | null;
  updateId?: string | null;
  title: string;
  parentTitle: string;
  regularPaise: number;
  salePaise: number | null;
  effectivePaise: number;
  quantity: number;
  entitlementId: string;
  alreadyOwned: boolean;
  minPayablePaise: number;
  parentProductTitle?: string;
}

export interface ServerPriceQuoteRecord {
  quoteId: string;
  uid: string;
  purchaseKind: CheckoutSelection["purchaseKind"];
  verifiedLineItems: CheckoutLineItem[];
  regularSubtotal: number;
  saleDiscount: number;
  couponDiscount: number;
  eduCoinDiscount: number;
  eduCoinsReserved: number;
  cashPayable: number;
  minimumPayable: number;
  currency: "INR";
  expiresAt: number;
  status: "active" | "expired" | "consumed" | "invalid";
  /**
   * Part 7 — the verified coupon the buyer applied. All three
   * fields are `null` when the quote carries no coupon. The server
   * is the sole authority on these values; the client never
   * supplies them.
   */
  couponCode?: string | null;
  couponType?: "percent" | "flat" | null;
  couponValue?: number | null;
  // Internal / round-trip-only fields (not part of the Part 1 ServerPriceQuote
  // surface, but the server stores them so the verify-payment step can
  // reconcile the order against the original intent).
  idempotencyKey?: string | null;
  createdAt?: number;
  consumedAt?: number | null;
  // Part 9 — subscription-specific metadata. `null` when the
  // purchase kind is not a subscription.
  subscriptionPlanId?: string | null;
  subscriptionCycle?: "monthly" | "yearly" | null;
  subscriptionExpiresAt?: number | null;
}

export interface BuildQuoteOk {
  ok: true;
  quote: ServerPriceQuoteRecord;
}
export interface BuildQuoteErr {
  ok: false;
  status: number;
  reason: string;
}
export type BuildQuoteResult = BuildQuoteOk | BuildQuoteErr;

export interface BuildQuoteInput {
  selection: CheckoutSelection | null | undefined;
  products:
    | Map<string, FirestoreProductDoc>
    | Array<FirestoreProductDoc>;
  /** Map<productId, Array<purchaseDoc>> OR plain object of the same shape. */
  purchasesByProduct?:
    | Map<string, FirestorePurchaseDoc[]>
    | Record<string, FirestorePurchaseDoc[]>;
  uid: string;
  /** Optional: override wall clock for tests. */
  now?: number;
  /** Optional: TTL in ms (default 15 min). */
  ttlMs?: number;
  /** Optional: pre-allocate a quoteId (the server uses one to make writes idempotent). */
  quoteId?: string;
  /**
   * Optional Part 7 coupon. When present, the engine validates the
   * coupon against the order and applies the discount to the
   * returned quote. The engine NEVER reads a client-supplied
   * `couponCode` field directly — the server endpoint is
   * responsible for loading the coupon doc and passing it in.
   */
  coupon?: CouponDoc | null;
  /**
   * Optional: the per-user redemption count for the coupon. When
   * `coupon` is set, this is required so the engine can apply the
   * per-user limit.
   */
  userCouponUsageCount?: number;
  /**
   * Optional: whether the user has at least one prior purchase on
   * their account. Required when `coupon.firstPurchaseOnly` is
   * true so the engine can reject non-first purchases.
   */
  userHasPriorPurchases?: boolean;
  /**
   * Optional: the product categories (Firestore `siteProducts` doc
   * `category` field) for the order. Required when
   * `coupon.categories` is non-empty so the engine can apply the
   * category eligibility rule.
   */
  productCategories?: string[];
  /**
   * Part 9 — when the selection is a subscription, the endpoint
   * has already pre-built the line items via the pure
   * `utils/subscriptions.js` engine. The Part 4 engine
   * propagates them through the existing coupon / EduCoin
   * pipeline; the engine NEVER re-derives plan / feature math.
   */
  subscriptionLineItems?: unknown[] | null;
  /**
   * Part 9 — the cycle expiry timestamp (ms). The success
   * page + auto-renew use this value.
   */
  subscriptionExpiresAt?: number | null;
}

// Function signatures ---------------------------------------------------------

export declare const paiseFromRupeeString: (value: unknown) => number;
export declare const paiseFromPriceFields: (data: unknown) => number;
export declare const paiseRegularFromFields: (data: unknown) => number;
export declare const paiseMinPayableFromFields: (data: unknown) => number;

export declare const isModuleVisible: (m: unknown) => boolean;
export declare const isModulePurchasable: (m: unknown) => boolean;
export declare const isResourcePurchasable: (r: unknown) => boolean;
export declare const isProductLive: (data: unknown) => boolean;

export declare const flattenModules: (tree: unknown) => CanonicalCourseModule[];
export declare const flattenResources: (modules: unknown) => CanonicalCourseResource[];

export declare const computeOwnedEntitlementIds: (
  purchaseDocs: unknown,
) => Set<string>;
export declare const isModuleOwned: (
  module: unknown,
  ownership: {
    isProductOwned: boolean;
    ownedUpdateIds: ReadonlySet<string> | readonly string[];
    ownedEntitlementIds?: ReadonlySet<string> | readonly string[];
  },
) => boolean;
export declare const isResourceOwned: (
  resource: unknown,
  modules: unknown,
  ownership: {
    isProductOwned: boolean;
    ownedUpdateIds: ReadonlySet<string> | readonly string[];
    ownedEntitlementIds?: ReadonlySet<string> | readonly string[];
  },
) => boolean;

export declare const getUnsatisfiedModuleDeps: (
  module: unknown,
  selectedIds: ReadonlySet<string> | readonly string[],
  allModules: unknown,
  ownership: {
    isProductOwned: boolean;
    ownedUpdateIds: ReadonlySet<string> | readonly string[];
    ownedEntitlementIds?: ReadonlySet<string> | readonly string[];
  },
) => string[];

export declare const findPaidUpdateInProduct: (
  productData: unknown,
  updateId: string,
) => CanonicalPaidUpdate | null;
export declare const paidUpdateLineFromProduct: (
  update: unknown,
) => {
  updateId: string;
  title: string;
  description: string;
  regularPaise: number;
  salePaise: null;
  effectivePaise: number;
  coinPrice: number;
  includedModuleIds: string[];
  includedResourceIds: string[];
} | null;

export declare const fullProductLineFromDoc: (productDoc: unknown) => {
  productId: string;
  title: string;
  parentTitle: string;
  regularPaise: number;
  salePaise: number | null;
  effectivePaise: number;
  minPayablePaise: number;
} | null;

export declare const moduleLineFromRecord: (
  productId: string,
  productTitle: string,
  module: unknown,
) => {
  productId: string;
  moduleId: string;
  title: string;
  parentTitle: string;
  regularPaise: number;
  salePaise: number | null;
  effectivePaise: number;
  coinPrice: number;
  entitlementId: string;
  requiredPreviousModuleIds: string[];
  badge: string | null;
} | null;

export declare const resourceLineFromRecord: (
  productId: string,
  productTitle: string,
  parentModule: unknown,
  resource: unknown,
) => {
  productId: string;
  resourceId: string;
  parentModuleId: string;
  title: string;
  parentTitle: string;
  regularPaise: number;
  salePaise: number | null;
  effectivePaise: number;
  coinPrice: number;
  entitlementId: string;
} | null;

export declare const isSaleValidNow: (data: unknown, now?: number) => boolean;

export declare const buildQuote: (input: BuildQuoteInput) => BuildQuoteResult;

export declare const quotesAreIdempotent: (
  existing: unknown,
  incoming: unknown,
  uid?: string | null,
  now?: number,
) => boolean;

export declare const isQuoteExpired: (quote: unknown, now?: number) => boolean;
export declare const isQuoteAccessibleToUser: (quote: unknown, uid: string) => boolean;

export declare const __testHelpers: {
  isObject: (v: unknown) => boolean;
  arr: (v: unknown) => unknown[];
  parseDateMaybe: (v: unknown) => number | null;
};
