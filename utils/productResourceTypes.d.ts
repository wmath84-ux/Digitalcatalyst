export interface ProductResourceTypeEntry {
  value: string;
  type?: string;
  label: string;
  [key: string]: unknown;
}

export const CORE_PRODUCT_RESOURCE_TYPES: readonly ProductResourceTypeEntry[];
export const NOTE_RESOURCE_TYPE: Readonly<ProductResourceTypeEntry>;
export const ADMIN_PRODUCT_RESOURCE_TYPES: readonly ProductResourceTypeEntry[];
export const isNoteResourceType: (value: unknown) => boolean;
export const canonicalProductResourceType: (value: unknown) => string;
export const hasNoteResourceType: (registry: unknown) => boolean;
export const registerNoteResourceType: (
  registry?: readonly unknown[],
) => ProductResourceTypeEntry[];
