import type { CanonicalCourseModule } from "../src/types/commerce";
export function isPaidContent(item: unknown): boolean;
export function isBundleIncluded(module: unknown): boolean;
export function ownershipTimestamp(value: unknown): number;
export function isActiveOwnershipRecord(record: unknown, now?: number): boolean;
export function isFullProductPurchase(record: unknown): boolean;
export function visibleContentModules<T extends { id: string; parentModuleId?: string | null; modules?: T[] }>(tree: readonly T[] | unknown): Array<T & { parentModuleId: string | null }>;

export function commerceContentTree(product: unknown): CanonicalCourseModule[];

export type CanonicalOwnershipScopes = { full: boolean; updates: Set<string>; modules: Set<string>; resources: Set<string> };
export function canonicalOwnershipScopes(records: readonly unknown[] | unknown): CanonicalOwnershipScopes;
export function filterLegacyOwnershipRecord<T extends Record<string, unknown>>(record: T, canonical: CanonicalOwnershipScopes): T | null;
