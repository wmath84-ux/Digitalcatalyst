// utils/couponVisibility.js
//
// Coupon input visibility rules.
//
// Product rule: a coupon can only ever reduce money that is actually
// being charged. When nothing is payable — a free product, a free
// entitlement grant, or a subscription selection whose payable total
// is already ₹0 — the coupon field must NOT be rendered anywhere:
// not on the PDP, not on the subscription page, and not on the
// checkout review page.
//
// These are pure functions (no React / no Firestore) so the Node test
// runner can import them directly. All money inputs are integers:
// `*Paise` arguments are paise, `isFreeProduct` reads the rupee-based
// catalog product shape.

const toFiniteNumber = (value) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Purchase kinds that never involve money, so a coupon is meaningless.
 */
export const FREE_PURCHASE_KINDS = ["free_entitlement"];

/**
 * True when a catalog product is free — either the admin flipped the
 * `isFree` switch, or the effective price resolves to zero/negative.
 * Prices in the catalog shape are rupees (not paise).
 */
export const isFreeProduct = (product) => {
  if (!product || typeof product !== "object") return false;
  if (product.isFree === true) return true;
  const price = toFiniteNumber(product.price);
  return Math.round(price) <= 0;
};

/**
 * The amount that would be charged before any coupon is applied.
 * Never negative. Both arguments are paise.
 */
export const payableBeforeCouponPaise = (chargeableSubtotalPaise, couponDiscountPaise = 0) =>
  Math.max(0, Math.round(toFiniteNumber(chargeableSubtotalPaise)) + Math.round(toFiniteNumber(couponDiscountPaise)));

/**
 * Single decision point for every coupon input in the app.
 *
 *   - `purchaseKind`  — canonical PurchaseKind of the order (optional).
 *   - `payablePaise`  — payable amount BEFORE any coupon discount.
 *   - `isFree`        — explicit free flag (e.g. `product.isFree`).
 *
 * Returns `false` (hide the coupon field) whenever the order is free.
 */
export const shouldShowCouponInput = ({ purchaseKind = null, payablePaise = 0, isFree = false } = {}) => {
  if (isFree === true) return false;
  if (purchaseKind && FREE_PURCHASE_KINDS.includes(purchaseKind)) return false;
  return Math.round(toFiniteNumber(payablePaise)) > 0;
};

export default shouldShowCouponInput;
