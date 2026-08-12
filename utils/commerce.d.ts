// Type declarations for `utils/commerce.js` so the TypeScript surface
// (`src/types/commerce.ts`) can re-export the runtime helpers with full
// type-safety. The runtime implementation lives in the sibling `.js` file
// because the test runner (`node --test`) needs plain JavaScript.

import type {
  CheckoutLineItem,
  PurchaseKind,
} from "../src/types/commerce";

export declare const parsePriceValue: (value: unknown) => number | null;

export declare const computeEffectivePrice: (
  regularPrice: unknown,
  salePrice: unknown,
) => number;

export declare const resolveSalePrice: (
  regularPrice: unknown,
  salePrice: unknown,
) => number;

export declare const buildLineItem: (input: {
  id: string;
  kind: PurchaseKind;
  productId?: string | null;
  moduleId?: string | null;
  resourceId?: string | null;
  updateId?: string | null;
  subscriptionPlanId?: string | null;
  featureId?: string | null;
  title: string;
  parentTitle?: string;
  regularPrice: unknown;
  salePrice?: unknown;
  quantity?: unknown;
  alreadyOwned?: boolean;
  entitlementId?: string;
}) => CheckoutLineItem;

export declare const normalizePurchaseKind: (raw: unknown) => PurchaseKind;

export declare const dedupeLineItems: (
  items: CheckoutLineItem[],
) => CheckoutLineItem[];

export declare const partitionByValidPrice: (items: CheckoutLineItem[]) => {
  valid: CheckoutLineItem[];
  invalid: CheckoutLineItem[];
};

export declare const markAlreadyOwned: (
  items: CheckoutLineItem[],
  ownedEntitlementIds: ReadonlySet<string> | readonly string[],
) => CheckoutLineItem[];

export declare const sumEffectivePrice: (items: CheckoutLineItem[]) => number;
