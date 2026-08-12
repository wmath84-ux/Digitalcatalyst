// Type declarations for `utils/pdpSelection.js`. The runtime lives in the
// sibling `.js` file so the Node test runner can import it directly. React
// code imports the helpers from `src/components/pdp/PdpPurchaseBuilder.tsx`,
// which re-exports the canonical types from `src/types/commerce.ts`.

import type {
  CanonicalCourseModule,
  CanonicalCourseResource,
  CanonicalPaidUpdate,
  CheckoutLineItem,
  CheckoutSelection,
} from "../src/types/commerce";
import type { Product } from "../src/data/products";

export type PdpPurchaseMode =
  | "full_product"
  | "selected_modules"
  | "selected_resources"
  | "paid_update"
  | "free_entitlement";

export interface OwnershipState {
  isProductOwned: boolean;
  ownedUpdateIds: ReadonlySet<string> | readonly string[];
  ownedModuleIds?: ReadonlySet<string> | readonly string[];
}

export interface SelectionResultOk {
  ok: true;
  purchaseKind: PdpPurchaseMode;
  ids: string[];
}
export interface SelectionResultErr {
  ok: false;
  reason: string;
}
export type SelectionResult = SelectionResultOk | SelectionResultErr;

export interface SummaryResult {
  mode: PdpPurchaseMode;
  lineItems: CheckoutLineItem[];
  selectedCount: number;
  selectedTitles: string[];
  regularSubtotal: number;
  saleSavings: number;
  effectiveSubtotal: number;
  fullCourse: { regularPrice: number; salePrice: number | null; effectivePrice: number };
  fullCourseDifference: number;
  isFree: boolean;
}

// Function signatures ---------------------------------------------------------

export declare const flattenModules: (tree: unknown) => CanonicalCourseModule[];

export declare const getAvailableModes: (input: {
  isProductOwned: boolean;
  hasAnyPurchasableModule: boolean;
  hasAnyPurchasableResource: boolean;
  hasAnyPaidUpdate: boolean;
}) => PdpPurchaseMode[];

export declare const getVisibleModules: (modules: unknown) => CanonicalCourseModule[];
export declare const getPurchasableModules: (modules: unknown) => CanonicalCourseModule[];
export declare const getBundleModules: (modules: unknown) => CanonicalCourseModule[];

export declare const getModuleEffectivePrice: (module: unknown) => number | null;
export declare const getModuleDependencies: (module: unknown) => string[];
export declare const getUnsatisfiedDependencies: (
  module: unknown,
  selectedIds: ReadonlySet<string> | readonly string[],
  allModules: unknown,
) => CanonicalCourseModule[];

export declare const getIsModuleOwned: (
  module: unknown,
  ownership: OwnershipState,
) => boolean;

export declare const getPurchasableResources: (
  modules: unknown,
) => Array<CanonicalCourseResource & { parentTitle: string; parentModuleId: string }>;
export declare const getResourceEffectivePrice: (resource: unknown) => number | null;
export declare const getIsResourceOwned: (
  resource: unknown,
  modules: unknown,
  ownership: OwnershipState,
) => boolean;

export declare const getAvailablePaidUpdates: (
  paidUpdates: unknown,
  ownedUpdateIds: ReadonlySet<string> | readonly string[],
) => CanonicalPaidUpdate[];

export declare const validateSelection: (input: {
  mode: PdpPurchaseMode;
  selectedIds: ReadonlySet<string> | readonly string[];
  modules: unknown;
  isProductOwned: boolean;
  ownedUpdateIds: ReadonlySet<string> | readonly string[];
  ownedModuleIds?: ReadonlySet<string> | readonly string[];
}) => SelectionResult;

export declare const computeLineTotals: (
  lines: ReadonlyArray<{
    regularPrice?: unknown;
    salePrice?: unknown;
    effectivePrice?: unknown;
    alreadyOwned?: boolean;
  }>,
) => { regularSubtotal: number; effectiveSubtotal: number; saleSavings: number };

export declare const computeFullCoursePrice: (input: {
  product: Product | null | undefined;
  modules: unknown;
}) => { regularPrice: number; salePrice: number | null; effectivePrice: number };

export declare const buildCheckoutSelection: (input: {
  product: Product | null | undefined;
  mode: PdpPurchaseMode;
  selectedIds?: ReadonlySet<string> | readonly string[];
  paidUpdateId?: string | null;
  returnRoute?: string | null;
}) => CheckoutSelection;

export declare const buildLineItems: (input: {
  product: Product | null | undefined;
  mode: PdpPurchaseMode;
  selectedIds: ReadonlySet<string> | readonly string[];
  modules: unknown;
  paidUpdates: unknown;
  isProductOwned: boolean;
  ownedUpdateIds: ReadonlySet<string> | readonly string[];
  ownedModuleIds?: ReadonlySet<string> | readonly string[];
}) => CheckoutLineItem[];

export declare const computeSummary: (input: {
  product: Product | null | undefined;
  mode: PdpPurchaseMode;
  selectedIds: ReadonlySet<string> | readonly string[];
  modules: unknown;
  paidUpdates: unknown;
  isProductOwned: boolean;
  ownedUpdateIds: ReadonlySet<string> | readonly string[];
  ownedModuleIds?: ReadonlySet<string> | readonly string[];
}) => SummaryResult;

export declare const __testHelpers: {
  numOrNull: (v: unknown) => number | null;
  num: (v: unknown) => number;
  str: (v: unknown, fallback?: string) => string;
  arr: (v: unknown) => unknown[];
  isObject: (v: unknown) => boolean;
};
