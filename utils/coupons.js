// utils/coupons.js
//
// Part 7 — server-side coupon engine. Pure functions only (no
// Firestore / no fetch). The Node test runner imports this file
// directly; the server-side endpoint imports the same functions
// via `api/_lib/coupons.ts`.
//
// A coupon is a Firestore document stored in the `coupons`
// collection. The doc id is the **normalised** uppercase coupon
// code, so the API can do an O(1) `doc(code).get()` lookup.
//
// The Part 7 spec calls for the following validation rules (all
// of which live in this file as pure functions):
//
//   1. coupon exists
//   2. coupon is active
//   3. start date respected
//   4. expiry date respected
//   5. global usage limit
//   6. per-user usage limit
//   7. product eligibility
//   8. module eligibility
//   9. resource eligibility
//  10. category eligibility
//  11. minimum order
//  12. maximum discount
//  13. first-purchase only
//
// Plus the discount-math rules:
//
//   - `percent` coupons: `discountPaise = floor(subtotal * value / 100)`
//     capped at `maxDiscountPaise` when set.
//   - `flat` coupons: `discountPaise = value` capped at
//     `maxDiscountPaise` (per coupon) AND clamped to `subtotal` so
//     the user never ends up with a negative `cashPayable`.
//   - The minimum-payable floor from the verified line items
//     always wins — a coupon can never push the price below
//     `minimumPayable`.
//
// Part 7 is intentionally limited to **server-side coupons**. EduCoin
// reservations, subscription discounts, and dynamic bundle pricing
// are out of scope.

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined) : []);

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a coupon code: trim + uppercase + strip non-alnum. The
 * Firestore doc id is the normalised code, so a client can pass
 * "save20 " or "save20" or "SAVE20" and still hit the same doc.
 */
export const normaliseCouponCode = (raw) => {
  if (raw === null || raw === undefined) return "";
  return String(raw).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 60);
};

/**
 * Coerce a Firestore date field (string | number | Timestamp-like |
 * null) to a millisecond timestamp. Returns null when the field is
 * missing or unparseable. The same parser lives in
 * `utils/serverQuotes.js`; we duplicate it here so the coupon
 * engine is self-contained.
 */
const parseDateMaybe = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  if (isObject(value) && typeof value.toMillis === "function") return value.toMillis();
  if (isObject(value) && typeof value._seconds === "number") return value._seconds * 1000;
  return null;
};

/**
 * Normalise a Firestore coupon doc into the canonical shape used
 * everywhere else in Part 7. Returns `null` when the doc is missing
 * required fields (so the endpoint can return 404 / 400 cleanly).
 */
export const normaliseCouponDoc = (raw) => {
  if (!isObject(raw)) return null;
  const code = normaliseCouponCode(raw.code || raw.id);
  if (!code) return null;
  const typeRaw = String(raw.type || "").toLowerCase();
  const type = typeRaw === "percent" ? "percent" : typeRaw === "flat" ? "flat" : null;
  if (!type) return null;
  const value = Number(raw.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return {
    code,
    type,
    value,
    status: String(raw.status || "active").toLowerCase(),
    startsAt: parseDateMaybe(raw.startsAt),
    expiresAt: parseDateMaybe(raw.expiresAt),
    globalLimit: Number.isFinite(Number(raw.globalLimit)) ? Math.max(0, Math.floor(Number(raw.globalLimit))) : null,
    usedCount: Math.max(0, Math.floor(Number(raw.usedCount || 0))),
    perUserLimit: Number.isFinite(Number(raw.perUserLimit)) ? Math.max(0, Math.floor(Number(raw.perUserLimit))) : null,
    productIds: arr(raw.productIds).map((x) => String(x)),
    moduleIds: arr(raw.moduleIds).map((x) => String(x)),
    resourceIds: arr(raw.resourceIds).map((x) => String(x)),
    categories: arr(raw.categories).map((x) => String(x)),
    minOrderPaise: Number.isFinite(Number(raw.minOrderPaise)) ? Math.max(0, Math.round(Number(raw.minOrderPaise))) : 0,
    maxDiscountPaise: Number.isFinite(Number(raw.maxDiscountPaise)) ? Math.max(0, Math.round(Number(raw.maxDiscountPaise))) : null,
    firstPurchaseOnly: raw.firstPurchaseOnly === true,
    allowedPurchaseKinds: arr(raw.allowedPurchaseKinds).map((x) => String(x)),
    description: typeof raw.description === "string" ? raw.description : null,
    referralOwnerUid: typeof raw.referralOwnerUid === "string" ? raw.referralOwnerUid : null,
  };
};

// ---------------------------------------------------------------------------
// Individual rule predicates (each pure, each independently testable)
// ---------------------------------------------------------------------------

/** Rule 2 + 3 + 4: active flag + start window + expiry. */
export const isCouponActive = (coupon, now = Date.now()) => {
  if (!isObject(coupon)) return false;
  if (coupon.status === "inactive" || coupon.status === "disabled" || coupon.status === "archived") return false;
  if (coupon.startsAt !== null && now < coupon.startsAt) return false;
  if (coupon.expiresAt !== null && now > coupon.expiresAt) return false;
  return true;
};

/** Rule 5: global usage limit (cap is null = unlimited). */
export const isWithinGlobalLimit = (coupon) => {
  if (!isObject(coupon)) return false;
  if (coupon.globalLimit === null) return true;
  return coupon.usedCount < coupon.globalLimit;
};

/** Rule 6: per-user usage limit. `userUsageCount` = how many times the
 *  user has redeemed this coupon before. */
export const isWithinPerUserLimit = (coupon, userUsageCount = 0) => {
  if (!isObject(coupon)) return false;
  if (coupon.perUserLimit === null) return true;
  return Math.max(0, Math.floor(Number(userUsageCount || 0))) < coupon.perUserLimit;
};

/** Rule 7: product eligibility. Empty list = applies to all products. */
export const isEligibleForProducts = (coupon, productIds) => {
  if (!isObject(coupon)) return false;
  if (!coupon.productIds.length) return true;
  const set = new Set(coupon.productIds);
  return arr(productIds).some((id) => set.has(String(id)));
};

/** Rule 8: module eligibility. Empty list = applies to all modules. */
export const isEligibleForModules = (coupon, moduleIds) => {
  if (!isObject(coupon)) return false;
  if (!coupon.moduleIds.length) return true;
  const set = new Set(coupon.moduleIds);
  return arr(moduleIds).some((id) => set.has(String(id)));
};

/** Rule 9: resource eligibility. Empty list = applies to all resources. */
export const isEligibleForResources = (coupon, resourceIds) => {
  if (!isObject(coupon)) return false;
  if (!coupon.resourceIds.length) return true;
  const set = new Set(coupon.resourceIds);
  return arr(resourceIds).some((id) => set.has(String(id)));
};

/** Rule 10: category eligibility. Empty list = applies to all
 *  categories. The coupon matches if ANY of the order's product
 *  categories intersects the coupon's category list. */
export const isEligibleForCategories = (coupon, orderCategories) => {
  if (!isObject(coupon)) return false;
  if (!coupon.categories.length) return true;
  const set = new Set(coupon.categories);
  return arr(orderCategories).some((id) => set.has(String(id)));
};

/** Rule 11: minimum order (in paise). */
export const meetsMinOrder = (coupon, orderSubtotalPaise) => {
  if (!isObject(coupon)) return false;
  const subtotal = Math.max(0, Math.round(Number(orderSubtotalPaise || 0)));
  return subtotal >= (coupon.minOrderPaise || 0);
};

/** Rule 13: first-purchase only. `userHasPriorPurchases` is true
 *  when the user already owns at least one product. */
export const isFirstPurchase = (coupon, userHasPriorPurchases) => {
  if (!isObject(coupon)) return false;
  if (!coupon.firstPurchaseOnly) return true;
  return !userHasPriorPurchases;
};

/** Optional: coupon's `allowedPurchaseKinds` list. Empty = applies
 *  to all purchase kinds. */
export const isEligibleForPurchaseKind = (coupon, purchaseKind) => {
  if (!isObject(coupon)) return false;
  if (!coupon.allowedPurchaseKinds.length) return true;
  if (!purchaseKind) return false;
  return coupon.allowedPurchaseKinds.indexOf(String(purchaseKind)) !== -1;
};

// ---------------------------------------------------------------------------
// Discount math
// ---------------------------------------------------------------------------

/**
 * Compute the absolute discount in paise for the given coupon and
 * order subtotal. Pure. Respects `maxDiscountPaise` (per coupon)
 * and clamps to `orderSubtotalPaise` so the user never ends up
 * with a negative payable. The minimum-payable floor is **not**
 * applied here — `applyCouponToQuote` does that so the engine
 * stays a single-responsibility helper.
 */
export const computeCouponDiscount = (coupon, orderSubtotalPaise) => {
  if (!isObject(coupon)) return 0;
  const subtotal = Math.max(0, Math.round(Number(orderSubtotalPaise || 0)));
  if (subtotal === 0) return 0;
  let raw = 0;
  if (coupon.type === "percent") {
    raw = Math.floor((subtotal * coupon.value) / 100);
  } else if (coupon.type === "flat") {
    raw = Math.round(coupon.value);
  } else {
    return 0;
  }
  if (raw <= 0) return 0;
  // Per-coupon cap.
  if (coupon.maxDiscountPaise !== null && raw > coupon.maxDiscountPaise) {
    raw = coupon.maxDiscountPaise;
  }
  // Never exceed the subtotal.
  if (raw > subtotal) raw = subtotal;
  return Math.max(0, Math.round(raw));
};

// ---------------------------------------------------------------------------
// Top-level validator
// ---------------------------------------------------------------------------

/**
 * Validate a coupon against a candidate order. Returns either
 * `{ ok: true, discountPaise, reason }` or `{ ok: false, reason, code }`
 * where `code` is a machine-readable token the client can map to
 * its own UI copy. The `reason` is a human-readable string safe
 * for the buyer.
 *
 * `orderContext` is the resolved order data:
 *   {
 *     subtotalPaise: number,
 *     productIds: string[],
 *     moduleIds: string[],
 *     resourceIds: string[],
 *     categories: string[],
 *     purchaseKind: string | null,
 *     userHasPriorPurchases: boolean,
 *     userUsageCount: number,
 *   }
 */
export const validateCoupon = (coupon, orderContext, now = Date.now()) => {
  if (!isObject(coupon)) {
    return { ok: false, code: "COUPON_NOT_FOUND", reason: "Coupon code is invalid." };
  }
  if (!isCouponActive(coupon, now)) {
    return { ok: false, code: "COUPON_INACTIVE", reason: "This coupon is no longer active." };
  }
  if (coupon.referralOwnerUid && coupon.referralOwnerUid === orderContext.userUid) {
    return { ok: false, code: "REFERRAL_SELF_USE", reason: "You cannot use your own referral code." };
  }
  if (!isWithinGlobalLimit(coupon)) {
    if (coupon.referralOwnerUid) {
      return { ok: false, code: "REFERRAL_ALREADY_USED", reason: "Referral ID already used. Explore leaderboard Unused IDs." };
    }
    return { ok: false, code: "COUPON_LIMIT_REACHED", reason: "This coupon has reached its global usage limit." };
  }
  if (!isWithinPerUserLimit(coupon, orderContext.userUsageCount)) {
    return { ok: false, code: "COUPON_USER_LIMIT_REACHED", reason: "You have already used this coupon the maximum number of times." };
  }
  if (!isEligibleForPurchaseKind(coupon, orderContext.purchaseKind)) {
    return { ok: false, code: "COUPON_KIND_MISMATCH", reason: "This coupon does not apply to the selected purchase type." };
  }
  if (!isEligibleForProducts(coupon, orderContext.productIds)) {
    return { ok: false, code: "COUPON_PRODUCT_MISMATCH", reason: "This coupon does not apply to the selected products." };
  }
  if (!isEligibleForModules(coupon, orderContext.moduleIds)) {
    return { ok: false, code: "COUPON_MODULE_MISMATCH", reason: "This coupon does not apply to the selected modules." };
  }
  if (!isEligibleForResources(coupon, orderContext.resourceIds)) {
    return { ok: false, code: "COUPON_RESOURCE_MISMATCH", reason: "This coupon does not apply to the selected resources." };
  }
  if (!isEligibleForCategories(coupon, orderContext.categories)) {
    return { ok: false, code: "COUPON_CATEGORY_MISMATCH", reason: "This coupon does not apply to the selected categories." };
  }
  if (!meetsMinOrder(coupon, orderContext.subtotalPaise)) {
    return {
      ok: false,
      code: "COUPON_MIN_ORDER",
      reason: `This coupon requires a minimum order of ₹${(coupon.minOrderPaise / 100).toFixed(0)}.`,
    };
  }
  if (!isFirstPurchase(coupon, orderContext.userHasPriorPurchases)) {
    return { ok: false, code: "COUPON_NOT_FIRST_PURCHASE", reason: "This coupon is only valid for your first purchase." };
  }
  const discountPaise = computeCouponDiscount(coupon, orderContext.subtotalPaise);
  if (discountPaise <= 0) {
    return { ok: false, code: "COUPON_NO_DISCOUNT", reason: "This coupon does not reduce the order total." };
  }
  return { ok: true, discountPaise, reason: null };
};

// ---------------------------------------------------------------------------
// Quote integration
// ---------------------------------------------------------------------------

/**
 * Apply a validated coupon to a `ServerPriceQuoteRecord` (the shape
 * the Part 4 engine emits). Returns a NEW quote object — never
 * mutates the input. The new `cashPayable` is `max(subtotalAfter -
 * couponDiscount, minimumPayable)`. The minimum-payable floor
 * always wins, so a coupon can never push the price below the
 * per-line floor.
 *
 * The input quote is assumed to have `couponDiscount === 0`
 * (Part 4 default). If the input already carries a coupon, the
 * caller is double-applying — we return the input untouched so
 * the caller surfaces a 409.
 */
export const applyCouponToQuote = (quote, coupon, validatedDiscountPaise) => {
  if (!isObject(quote) || !isObject(coupon)) return quote;
  if (quote.couponDiscount && quote.couponDiscount > 0) return quote;
  const subtotalAfterSale = Math.max(
    0,
    Math.round(Number(quote.regularSubtotal || 0)) - Math.round(Number(quote.saleDiscount || 0)),
  );
  const discount = Math.max(
    0,
    Math.min(
      Math.round(Number(validatedDiscountPaise || 0)),
      subtotalAfterSale,
    ),
  );
  const minimumPayable = Math.max(0, Math.round(Number(quote.minimumPayable || 0)));
  // The minimum-payable floor always wins.
  const cashPayable = Math.max(subtotalAfterSale - discount, minimumPayable);
  // The "actual" coupon discount applied (may be less than the
  // raw validated value if the minimum-payable floor would have
  // been crossed).
  const actualDiscount = Math.max(0, subtotalAfterSale - Math.max(cashPayable, minimumPayable));
  return {
    ...quote,
    couponCode: coupon.code,
    couponType: coupon.type,
    couponValue: coupon.value,
    couponDiscount: actualDiscount,
    cashPayable,
  };
};

/**
 * Strip a coupon from a `ServerPriceQuoteRecord`. Returns a NEW
 * quote object with `cashPayable` restored to the pre-coupon
 * amount. Used by the "Remove" UI button.
 */
export const removeCouponFromQuote = (quote) => {
  if (!isObject(quote)) return quote;
  const subtotalAfterSale = Math.max(
    0,
    Math.round(Number(quote.regularSubtotal || 0)) - Math.round(Number(quote.saleDiscount || 0)),
  );
  const minimumPayable = Math.max(0, Math.round(Number(quote.minimumPayable || 0)));
  return {
    ...quote,
    couponCode: null,
    couponType: null,
    couponValue: null,
    couponDiscount: 0,
    cashPayable: Math.max(subtotalAfterSale, minimumPayable),
  };
};

// ---------------------------------------------------------------------------
// Redemption helpers
// ---------------------------------------------------------------------------

/**
 * The Firestore doc id for a coupon redemption. Idempotency is
 * keyed on `{couponCode}__{orderId}` so a verify-payment replay
 * short-circuits at the `existing.exists` check inside the
 * entitlement writer's transaction.
 */
export const buildCouponRedemptionDocId = (couponCode, orderId) => {
  const code = normaliseCouponCode(couponCode);
  const order = String(orderId || "").trim();
  if (!code || !order) return null;
  return `${code}__${order}`;
};

/**
 * Pure helper: decide whether a coupon's `usedCount` should be
 * incremented for a given order. The caller (the entitlement
 * writer) checks this against the `couponRedemptions/{id}` doc
 * inside its transaction. If the redemption doc already exists,
 * the function returns `false` to signal "skip the increment"
 * (the coupon has already been redeemed for this order).
 */
export const shouldIncrementCouponUsage = (redemptionDoc, coupon, now = Date.now()) => {
  if (!isObject(redemptionDoc) || !isObject(coupon)) return false;
  if (String(redemptionDoc.status || "") !== "pending") return false;
  if (!isCouponActive(coupon, now)) return false;
  if (!isWithinGlobalLimit(coupon)) return false;
  return true;
};
