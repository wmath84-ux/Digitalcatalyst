// Type declarations for `utils/productMapping.js`. The runtime lives in the
// sibling `.js` file so `node --test` can import it without a TypeScript
// toolchain. React code imports the canonical types from
// `src/types/commerce.ts` and the helpers from here.

import type {
  CanonicalCourseModule,
  CanonicalCourseResource,
  CanonicalPaidUpdate,
  AccessLevel,
  Visibility,
  ResourceType,
} from "../src/types/commerce";

// Editor shapes (mirror src/lib/admin/types.ts but kept narrow so we don't
// pull that file into the JS runtime).
export type EditorAccessLevel = "included" | "purchasable" | "paid_update" | "hidden";
export type EditorResourceType =
  | "youtube"
  | "video_url"
  | "audio_url"
  | "image_url"
  | "gdrive"
  | "pdf"
  | "gdoc"
  | "gsheet"
  | "gform"
  | "ebook"
  | "github_pages"
  | "whimsical"
  | "iframe";

export interface EditorResource {
  id: string;
  name?: string;
  type?: EditorResourceType | string;
  url?: string;
  embedUrl?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  provider?: string;
  sortOrder?: number;
  visibility?: Visibility | string;
  accessLevel?: EditorAccessLevel | string;
  individuallyPurchasable?: boolean;
  cashPrice?: number | null;
  salePrice?: number | null;
  coinPrice?: number | null;
  paidUpdateId?: string | null;
  entitlementId?: string;
  parentModuleId?: string | null;
}

export interface EditorModule {
  id: string;
  title?: string;
  description?: string;
  sortOrder?: number;
  visibility?: Visibility | string;
  active?: boolean;
  accessLevel?: EditorAccessLevel | string;
  individuallyPurchasable?: boolean;
  cashPrice?: number | null;
  salePrice?: number | null;
  coinPrice?: number | null;
  includeInBundle?: boolean;
  previewAvailable?: boolean;
  requiredPreviousModuleIds?: string[];
  entitlementId?: string;
  badge?: string | null;
  parentModuleId?: string | null;
  resources?: EditorResource[];
}

export interface EditorPaidUpdate {
  id: string;
  title?: string;
  description?: string;
  includedIds?: string[];
  cashPrice?: number;
  coinPrice?: number;
  active?: boolean;
  publishDate?: string | null;
  visibility?: Visibility | string;
  sortOrder?: number;
}

export interface EditorForm {
  id?: string;
  title?: string;
  shortDescription?: string;
  longDescription?: string;
  instructor?: string;
  category?: string;
  productType?: string;
  classLevel?: string;
  subject?: string;
  sku?: string;
  tags?: string[];
  /** Ids of the admin-managed store filter chips this product belongs to. */
  filterIds?: string[];
  searchKeywords?: string[];
  features?: string[];
  estimatedDuration?: string;
  language?: string;
  manualRating?: string | number | null;
  visibility?: Visibility | string;
  availableForSale?: boolean;
  images?: unknown[];
  regularPrice?: string | number;
  salePrice?: string | number | null;
  coinPrice?: number;
  coinPurchaseEnabled?: boolean;
  isFree?: boolean;
  eligibleCouponIds?: string[];
  minPayableAmount?: string | number;
  availabilityDate?: string | null;
  saleStart?: string | null;
  saleEnd?: string | null;
  modules?: EditorModule[];
  paidUpdates?: EditorPaidUpdate[];
  status?: "draft" | "published" | "archived" | string;
}

export interface FirestoreResource extends Record<string, unknown> {
  id?: string;
  name?: string;
  type?: string;
  url?: string;
  embedUrl?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  provider?: string;
  sortOrder?: number;
  visibility?: string;
  accessLevel?: string;
  individuallyPurchasable?: boolean;
  cashPrice?: number | null;
  salePrice?: number | null;
  coinPrice?: number | null;
  entitlementId?: string;
  parentModuleId?: string | null;
  paidUpdateId?: string | null;
  paidUpdatePrice?: string;
  paidUpdateCoinPrice?: number;
}

export interface FirestoreModule extends Record<string, unknown> {
  id?: string;
  title?: string;
  description?: string;
  sortOrder?: number;
  visibility?: string;
  active?: boolean;
  accessLevel?: string;
  individuallyPurchasable?: boolean;
  cashPrice?: number | null;
  salePrice?: number | null;
  coinPrice?: number | null;
  includeInBundle?: boolean;
  previewAvailable?: boolean;
  requiredPreviousModuleIds?: string[];
  entitlementId?: string;
  badge?: string | null;
  parentModuleId?: string | null;
  paidUpdateId?: string;
  paidUpdatePrice?: string;
  paidUpdateCoinPrice?: number;
  embedContentTypeId?: string;
  embedContentTypeLabel?: string;
  embedContentUrl?: string;
  files?: FirestoreResource[];
  modules?: FirestoreModule[];
}

export interface FirestorePaidUpdate extends Record<string, unknown> {
  id?: string;
  title?: string;
  description?: string;
  includedIds?: string[];
  includedModuleIds?: string[];
  includedResourceIds?: string[];
  cashPrice?: number;
  coinPrice?: number;
  active?: boolean;
  publishDate?: string | null;
  visibility?: string;
  sortOrder?: number;
}

export interface FirestoreProductDoc extends Record<string, unknown> {
  id?: string;
  title?: string;
  description?: string;
  longDescription?: string;
  instructor?: string | { name?: string };
  category?: string;
  subject?: string;
  sku?: string;
  tags?: string[];
  keywords?: string[];
  features?: string[];
  images?: string[];
  productImages?: { card?: string };
  price?: string | number;
  salePrice?: string | number | null;
  coinPrice?: number;
  isFree?: boolean;
  isVisible?: boolean;
  inStock?: boolean;
  manualRating?: number;
  dimensions?: string;
  courseContent?: FirestoreModule[];
  paidUpdates?: FirestorePaidUpdate[];
  adminProduct?: EditorForm;
}

export interface CatalogProductShape {
  documentId: string;
  canonicalModules: CanonicalCourseModule[];
  paidUpdates: CanonicalPaidUpdate[];
  // Legacy bridge for the existing Course Player.
  courseContent: unknown[];
}

// Function signatures ---------------------------------------------------------

export declare const editorResourceToCanonical: (
  raw: unknown,
) => CanonicalCourseResource | null;
export declare const editorModuleToCanonical: (
  raw: unknown,
) => CanonicalCourseModule | null;
export declare const editorModulesToCanonicalTree: (
  flat: unknown,
) => CanonicalCourseModule[];

export declare const editorResourceToFirestore: (
  raw: unknown,
) => FirestoreResource | null;
export declare const editorModuleToFirestore: (
  raw: unknown,
  allFlat: unknown,
) => FirestoreModule | null;
export declare const editorModulesToFirestoreTree: (
  flat: unknown,
) => FirestoreModule[];
export declare const editorPaidUpdateToFirestore: (
  raw: unknown,
  allFlatModules: unknown,
) => FirestorePaidUpdate | null;

export declare const firestoreResourceToEditor: (
  raw: unknown,
) => EditorResource | null;
export declare const firestoreModulesToEditorFlat: (
  tree: unknown,
) => EditorModule[];
export declare const firestorePaidUpdateToEditor: (
  raw: unknown,
) => EditorPaidUpdate | null;

export declare const firestoreResourceToCanonical: (
  raw: unknown,
) => CanonicalCourseResource | null;
export declare const firestoreTreeToCanonicalTree: (
  tree: unknown,
) => CanonicalCourseModule[];
export declare const firestorePaidUpdateToCanonical: (
  raw: unknown,
) => CanonicalPaidUpdate | null;

export declare const sanitizeCanonicalCourseContent: (
  raw: unknown,
) => CanonicalCourseModule[];

export declare const canonicalResourceToLegacyFile: (
  r: unknown,
) => Record<string, unknown> | null;
export declare const canonicalModuleToLegacy: (
  m: unknown,
) => Record<string, unknown> | null;
export declare const canonicalTreeToLegacyTree: (
  tree: unknown,
) => Record<string, unknown>[];

/**
 * Recursively remove every `undefined` value from a plain object/array tree.
 * Firestore rejects `undefined` field values, so anything written with
 * `setDoc()` / `updateDoc()` must pass through this first. Non-plain objects
 * (Date, Timestamp, FieldValue sentinels such as `serverTimestamp()`) are
 * returned untouched.
 */
export declare const stripUndefinedDeep: <T>(value: T) => T;

/** Clean a pasted URL, YouTube id, or iframe snippet into a public HTTPS URL. */
export declare const normalizeResourceUrl: (value: unknown, resourceType?: string) => string;
/** Resolve the authoritative draft/published/archived state, including legacy docs. */
export declare const getProductPublicationStatus: (raw: unknown) => "draft" | "published" | "archived";
export declare const isProductPublished: (raw: unknown) => boolean;

export declare const editorToFirestoreBody: (
  form: unknown,
) => {
  courseContent: FirestoreModule[];
  paidUpdates: FirestorePaidUpdate[];
  adminProduct: EditorForm;
} | null;
export declare const firestoreToEditorForm: (
  raw: unknown,
  documentId: string,
) => EditorForm | null;
export declare const firestoreToCatalogProduct: (
  raw: unknown,
  documentId: string,
) => CatalogProductShape | null;

export declare const __testHelpers: {
  isValidHttpsUrl: (v: unknown) => boolean;
  pickValidUrl: (...candidates: unknown[]) => string;
  unwrapCopiedResourceUrl: (v: unknown) => string;
  normalizeResourceUrl: (value: unknown, resourceType?: string) => string;
  getProductPublicationStatus: (raw: unknown) => "draft" | "published" | "archived";
  isProductPublished: (raw: unknown) => boolean;
  toCanonicalResourceType: (v: unknown) => ResourceType | string;
  toPlayerResourceType: (v: unknown) => string;
  fromPlayerResourceType: (v: unknown) => EditorResourceType | string;
  normAccessLevel: (v: unknown) => AccessLevel;
  normVisibility: (v: unknown) => Visibility;
  normResourceType: (v: unknown) => EditorResourceType | ResourceType | string;
  numOrNull: (v: unknown) => number | null;
  num: (v: unknown) => number;
  str: (v: unknown, fallback?: string) => string;
  bool: (v: unknown, fallback?: boolean) => boolean;
  arr: (v: unknown) => unknown[];
};
