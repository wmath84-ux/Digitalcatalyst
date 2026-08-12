// Type declarations for `utils/checkoutSession.js`. The runtime lives in
// the sibling `.js` file so the Node test runner can import it without a
// TS toolchain. React code imports the runtime from
// `src/checkout/CheckoutContext.tsx`.

import type { CheckoutSessionRecordV1 } from "../src/checkout/types";
import type { CheckoutSelection, ServerPriceQuote } from "../src/types/commerce";

export const CHECKOUT_SESSION_STORAGE_KEY: string;
export const CHECKOUT_SESSION_SCHEMA_VERSION: 1;

export declare const parseCheckoutSessionRecord: (raw: unknown) => CheckoutSessionRecordV1 | null;

export declare const buildCheckoutSessionRecord: (input: {
  selection: CheckoutSelection | null | undefined;
  quote: ServerPriceQuote | null | undefined;
  buyer: CheckoutSessionRecordV1["buyer"] | null | undefined;
  returnRoute: CheckoutSessionRecordV1["returnRoute"] | null | undefined;
  idempotencyKey?: string | null;
  savedAt?: number;
}) => CheckoutSessionRecordV1 | null;

export declare const readCheckoutSessionRecord: (
  storage: { getItem(key: string): string | null } | null,
) => CheckoutSessionRecordV1 | null;

export declare const writeCheckoutSessionRecord: (
  storage: { setItem(key: string, value: string): void } | null,
  record: CheckoutSessionRecordV1 | null,
) => boolean;

export declare const clearCheckoutSessionRecord: (
  storage: { removeItem(key: string): void } | null,
) => boolean;

export declare const readFromSessionStorage: () => CheckoutSessionRecordV1 | null;
export declare const writeToSessionStorage: (
  record: CheckoutSessionRecordV1 | null,
) => boolean;
export declare const clearFromSessionStorage: () => boolean;
