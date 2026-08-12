// Type declarations for `utils/courseAccess.js`. The runtime
// lives in the sibling `.js` file so the Node test runner can
// import it without a TS toolchain. The React hook
// (`src/hooks/useCourseAccess.ts`) and any future server-side
// loader import the runtime from this file.

/** All possible access sources the resolver can return per item. */
export type CourseAccessSource =
  | "full_product"
  | "module_purchase"
  | "resource_purchase"
  | "paid_update"
  | "subscription"
  | "preview"
  | "locked";

/** Input to the resolver. */
export interface CourseAccessInput {
  product: {
    id?: string | null;
    canonicalModules?: unknown[] | null;
    courseContent?: unknown[] | null;
  } | null;
  ownedProductIds?: ReadonlyArray<string> | string[];
  ownedUpdateIds?: ReadonlyArray<string> | string[];
  ownedModuleIds?: ReadonlyArray<string> | string[];
  ownedResourceIds?: ReadonlyArray<string> | string[];
  subscriptionProductIds?: ReadonlyArray<string> | string[];
  subscriptionModuleIds?: ReadonlyArray<string> | string[];
  subscriptionResourceIds?: ReadonlyArray<string> | string[];
  requireBaseCourseForUpdate?: boolean;
  now?: number;
}

/** The resolver's output. */
export interface CourseAccessResolution {
  hasFullProductAccess: boolean;
  ownedModuleIds: Set<string>;
  ownedResourceIds: Set<string>;
  ownedUpdateIds: Set<string>;
  subscriptionGrantedModuleIds: Set<string>;
  accessibleModuleIds: Set<string>;
  accessibleResourceIds: Set<string>;
  lockedModuleIds: Set<string>;
  previewModuleIds: Set<string>;
  moduleAccessSources: Record<string, CourseAccessSource>;
  resourceAccessSources: Record<string, CourseAccessSource>;
  unmetDependencies: Record<string, string[]>;
}

/** Subscription record shape consumed by `isSubscriptionRecordActive`. */
export interface SubscriptionRecordShape {
  uid?: string;
  planId?: string;
  cycle?: "monthly" | "yearly" | null;
  status?: string;
  expiresAt?: number | null;
  activatedAt?: number | null;
  autoRenew?: boolean;
  includedProductIds?: string[];
  includedModuleKeys?: string[];
}

export const resolveCourseAccess: (input: CourseAccessInput) => CourseAccessResolution;

export const isSubscriptionRecordActive: (
  record: SubscriptionRecordShape | null | undefined,
  now?: number,
) => boolean;

export interface OwnershipSets {
  ownedProductIds: Set<string>;
  ownedUpdateIds: Set<string>;
  ownedModuleIds: Set<string>;
  ownedResourceIds: Set<string>;
}

export const collectEntitlementOwnership: (
  entitlementRecords: ReadonlyArray<unknown> | null | undefined,
) => OwnershipSets;

export const collectModules: (tree: unknown[] | null | undefined) => unknown[];
export const collectResources: (tree: unknown[] | null | undefined) => unknown[];
export const findModuleById: (tree: unknown[] | null | undefined, id: string) => unknown;
export const findResourceById: (tree: unknown[] | null | undefined, id: string) => unknown;
export const moduleRequiredPreviousIds: (module: unknown) => string[];
export const isPreviewEnabled: (item: unknown) => boolean;
