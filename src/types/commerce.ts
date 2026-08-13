// src/types/commerce.ts
//
// CANONICAL COMMERCE SCHEMA — Part 1, additive only.
//
// This module is the single vocabulary the rest of the codebase will converge on
// in Part 2. It does NOT mutate any existing behaviour: nothing in the running
// app imports from this file yet. It is referenced by the new unit tests and by
// the audit document (`docs/commerce-course-audit.md`).
//
// The pure helper functions live in `utils/commerce.js` so the Node test runner
// can import them directly without a TypeScript toolchain. This file re-exports
// the helpers for React/Firebase code, and the React side should always import
// from here, never from `utils/commerce.js` directly.
//
// =========================================================================
// 1. Enums
// =========================================================================

/**
 * What the buyer is paying for. Every checkout is exactly one `PurchaseKind`,
 * which determines the rest of the line-item shape.
 */
export type PurchaseKind =
  | "full_product"          // one or more `siteProducts/{id}`
  | "selected_modules"      // a la carte modules inside a product
  | "selected_resources"    // a la carte resources inside a product
  | "cart_bundle"           // multi-product cart (see `main.tsx` `handleCartCheckout`)
  | "paid_update"           // a published paid course update
  | "subscription"          // a recurring subscription plan
  | "subscription_features" // add-on features for a subscription
  | "free_entitlement";     // promo / manual grant (no money exchanged)

/**
 * Visibility of a module or resource. Distinct from `accessLevel`:
 *   - `visibility` controls whether the user can *see* it.
 *   - `accessLevel` controls whether the user can *open* it.
 */
export type Visibility = "visible" | "hidden";

/**
 * Access level for a module or resource. Replaces the four-way editor enum
 * (`included | purchasable | paid_update | hidden`) and the three-way player
 * enum (`included | paidUpdate | hidden`).
 *
 *   - `included`     — free with the parent product.
 *   - `purchasable`  — can be bought individually without buying the parent.
 *   - `paid_update`  — unlocked by buying a published paid course update.
 *   - `hidden`       — never exposed in the player.
 */
export type AccessLevel = "included" | "purchasable" | "paid_update" | "hidden";

export type ResourceType =
  | "youtube"
  | "video"
  | "audio"
  | "pdf"
  | "doc"
  | "sheet"
  | "slides"
  | "image"
  | "google_form"
  | "ebook"
  | "embed"
  | "mindmap";

export type BillingCycle = "monthly" | "yearly";

// =========================================================================
// 2. Canonical course module / resource / paid update
// =========================================================================

export interface CanonicalCourseResource {
  id: string;
  parentModuleId: string;
  name: string;
  type: ResourceType;
  url: string;
  provider: string;
  sortOrder: number;
  visibility: Visibility;
  accessLevel: AccessLevel;
  individuallyPurchasable: boolean;
  cashPrice: number | null;
  salePrice: number | null;
  coinPrice: number | null;
  entitlementId: string;
  paidUpdateId: string | null;
  /** Bare 11-char id for YouTube resources that were saved without a URL. */
  youtubeVideoId?: string;
}

export interface CanonicalCourseModule {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  visibility: Visibility;
  active: boolean;
  accessLevel: AccessLevel;
  individuallyPurchasable: boolean;
  cashPrice: number | null;
  salePrice: number | null;
  coinPrice: number | null;
  includeInBundle: boolean;
  previewAvailable: boolean;
  requiredPreviousModuleIds: string[];
  entitlementId: string;
  badge: string | null;
  parentModuleId: string | null;
  resources: CanonicalCourseResource[];
  modules: CanonicalCourseModule[];
}

export interface CanonicalPaidUpdate {
  id: string;
  title: string;
  description: string;
  includedModuleIds: string[];
  includedResourceIds: string[];
  cashPrice: number;
  coinPrice: number;
  active: boolean;
  visibility: Visibility;
  publishDate: string | null;
  sortOrder: number;
}

// =========================================================================
// 3. Checkout line items / selection
// =========================================================================

export interface CheckoutLineItem {
  id: string;
  kind: PurchaseKind;
  productId: string | null;
  moduleId: string | null;
  resourceId: string | null;
  updateId: string | null;
  subscriptionPlanId: string | null;
  featureId: string | null;
  title: string;
  parentTitle: string;
  regularPrice: number;
  salePrice: number | null;
  effectivePrice: number;
  quantity: number;
  alreadyOwned: boolean;
  entitlementId: string;
}

export interface CheckoutSelection {
  purchaseKind: PurchaseKind;
  productIds: string[];
  moduleIds: string[];
  resourceIds: string[];
  updateId: string | null;
  subscriptionPlanId: string | null;
  billingCycle: BillingCycle | null;
  featureIds: string[];
  couponCode: string | null;
  requestedEduCoins: number;
  returnRoute: string | null;
}

// =========================================================================
// 4. Server price quote (the only price the client should ever see)
// =========================================================================

export interface ServerPriceQuote {
  quoteId: string;
  uid: string;
  purchaseKind: PurchaseKind;
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
  /**
   * Server-assigned lifecycle status. Defaults to `"active"` for new
   * quotes; the verify-payment step is expected to flip it to
   * `"consumed"` on success, and an admin tool can flip it to
   * `"invalid"` to invalidate a quote out-of-band. Optional so older
   * cached records without this field still type-check.
   */
  status?: "active" | "expired" | "consumed" | "invalid";
  /**
   * Part 7 — the verified coupon the buyer applied to this
   * quote. All three fields are `null` when the quote carries no
   * coupon. The server is the sole authority on these values; the
   * client NEVER supplies them. Coupon usage is **not** incremented
   * here — that happens on successful payment.
   */
  couponCode?: string | null;
  couponType?: "percent" | "flat" | null;
  couponValue?: number | null;
  /**
   * Part 9 — subscription metadata. `null` for non-subscription
   * purchase kinds. The server is the sole authority on these
   * values; the client NEVER supplies them.
   */
  subscriptionPlanId?: string | null;
  subscriptionCycle?: "monthly" | "yearly" | null;
  /**
   * Part 9 — the cycle expiry timestamp (ms). The success page
   * renders the renewal date from this value.
   */
  subscriptionExpiresAt?: number | null;
}

// =========================================================================
// 5. Pure helpers — re-exported from utils/commerce.js
// =========================================================================
//
// React code should import these from `@/types/commerce` (this file) so the
// type annotations travel with the runtime values. The Node test runner
// imports them directly from `utils/commerce.js` to avoid pulling in TS.
//
// Behaviour summary (see utils/commerce.js for details):
//   - `computeEffectivePrice(regular, sale)` returns the sale price when both
//     values are usable, otherwise the regular price, otherwise 0. Negative
//     or unparseable inputs are propagated (the validator is responsible for
//     rejecting them, not the projector).
//   - `buildLineItem(...)` preserves the raw parsed numbers and uses the
//     line id as the default entitlement id.
//   - `normalizePurchaseKind(raw)` accepts the canonical enum plus legacy
//     aliases (`product`, `course_update`, `bundle`, `module`, `resource`).
//   - `partitionByValidPrice(items)` separates line items whose
//     `regularPrice` or `effectivePrice` is negative.
//   - `markAlreadyOwned(items, ownedSet | ownedArray)` flips `alreadyOwned`.
//   - `sumEffectivePrice(items)` adds effective * quantity for items that
//     are not already owned.

export {
  computeEffectivePrice,
  resolveSalePrice,
  buildLineItem,
  normalizePurchaseKind,
  dedupeLineItems,
  partitionByValidPrice,
  markAlreadyOwned,
  sumEffectivePrice,
} from "../../utils/commerce";
