// Type declarations for `utils/entitlements.js`. The runtime lives in
// the sibling `.js` file so the Node test runner can import it
// without a TS toolchain. The server writer
// (`api/_lib/entitlements.ts`) and the client receipt
// (`src/components/checkout/CheckoutSuccessStep.tsx`) both import
// from this file.

import type {
  CheckoutLineItem,
  PurchaseKind,
  ServerPriceQuote,
} from "../src/types/commerce";

/** Re-export so server endpoints can `import type { ServerPriceQuote }`. */
export type { CheckoutLineItem, PurchaseKind, ServerPriceQuote };

/** The five entitlement kinds we persist in Part 6. */
export type EntitlementKind =
  | "full_product"
  | "module"
  | "resource"
  | "paid_update"
  | "free";

/** The canonical entitlement record written to `entitlements/{uid}__{entitlementId}`. */
export interface EntitlementRecord {
  uid: string;
  productId: string | null;
  kind: EntitlementKind;
  moduleId: string | null;
  resourceId: string | null;
  updateId: string | null;
  subscriptionPlanId: null;
  featureId: null;
  entitlementId: string;
  orderId: string | null;
  paymentId: string | null;
  status: "active";
  amount: number;
  currency: "INR";
  source: "razorpay" | "free" | "admin";
  unlockedAt: number;
  title: string | null;
  parentTitle: string | null;
  /** Optional expiry timestamp (unused in Part 6 — kept for forward compat). */
  expiresAt?: number;
}

/** Receipt shape returned by `buildSuccessReceipt`. */
export interface SuccessReceipt {
  orderId: string | null;
  paymentId: string | null;
  paymentMethod: string;
  quoteId: string;
  purchaseKind: PurchaseKind;
  lineItems: CheckoutLineItem[];
  newItems: CheckoutLineItem[];
  cashPaid: number;
  currency: "INR";
  grantedEntitlementIds: string[];
  issuedAt: number;
}

export const ENTITLEMENT_KINDS: Set<EntitlementKind>;

export const toEntitlementKind: (purchaseKind: PurchaseKind | string | null | undefined) => EntitlementKind | null;

export const isGrantableLine: (line: CheckoutLineItem | null | undefined) => boolean;

export const deriveEntitlementId: (line: CheckoutLineItem | null | undefined) => string | null;

export const buildEntitlementDocId: (uid: string | null | undefined, entitlementId: string | null | undefined) => string | null;

export interface BuildEntitlementRecordInput {
  uid: string;
  line: CheckoutLineItem;
  orderId: string | null;
  paymentId: string | null;
  source: "razorpay" | "free" | "admin";
  now?: number;
}

export const buildEntitlementRecord: (input: BuildEntitlementRecordInput) => EntitlementRecord | null;

export const collectGrantableEntitlementIds: (quote: ServerPriceQuote | null | undefined) => Set<string>;

export const isQuoteReplayable: (quote: ServerPriceQuote | null | undefined) => boolean;

export const isEntitlementActive: (record: EntitlementRecord | null | undefined, now?: number) => boolean;

export const partitionGrantable: (quote: ServerPriceQuote | null | undefined) => { grantable: CheckoutLineItem[]; skip: CheckoutLineItem[] };

export interface BuildSuccessReceiptInput {
  quote: ServerPriceQuote | null | undefined;
  orderId?: string | null;
  paymentId?: string | null;
  paymentMethod?: string;
  grantedEntitlementIds?: string[] | null;
}

export const buildSuccessReceipt: (input: BuildSuccessReceiptInput) => SuccessReceipt | null;
