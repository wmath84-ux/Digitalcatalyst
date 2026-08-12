// tests/coupons.test.mjs
//
// Part 7 — unit tests for the pure coupon engine in
// `utils/coupons.js`. Covers every spec rule:
//
//   1. coupon exists
//   2. active flag
//   3. start date
//   4. expiry date
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
// Plus discount math (percent + flat + cap), quote integration
// (apply / remove), and the redemption-id helper.
//
// The Node test runner imports the .js file directly; no Firestore
// or fetch is needed.

import test from "node:test";
import assert from "node:assert/strict";
import {
  normaliseCouponCode,
  normaliseCouponDoc,
  isCouponActive,
  isWithinGlobalLimit,
  isWithinPerUserLimit,
  isEligibleForProducts,
  isEligibleForModules,
  isEligibleForResources,
  isEligibleForCategories,
  isEligibleForPurchaseKind,
  meetsMinOrder,
  isFirstPurchase,
  computeCouponDiscount,
  validateCoupon,
  applyCouponToQuote,
  removeCouponFromQuote,
  buildCouponRedemptionDocId,
  shouldIncrementCouponUsage,
} from "../utils/coupons.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const percentCoupon = (overrides = {}) => ({
  code: "SAVE20",
  type: "percent",
  value: 20,
  status: "active",
  startsAt: null,
  expiresAt: null,
  globalLimit: null,
  usedCount: 0,
  perUserLimit: null,
  productIds: [],
  moduleIds: [],
  resourceIds: [],
  categories: [],
  minOrderPaise: 0,
  maxDiscountPaise: null,
  firstPurchaseOnly: false,
  allowedPurchaseKinds: [],
  description: null,
  ...overrides,
});

const flatCoupon = (overrides = {}) => percentCoupon({ type: "flat", value: 50000, ...overrides });

const baseOrderContext = (overrides = {}) => ({
  subtotalPaise: 200000,
  productIds: ["p-1"],
  moduleIds: [],
  resourceIds: [],
  categories: [],
  purchaseKind: "full_product",
  userHasPriorPurchases: false,
  userUsageCount: 0,
  ...overrides,
});

// ---------------------------------------------------------------------------
// normaliseCouponCode
// ---------------------------------------------------------------------------

test("normaliseCouponCode trims, uppercases, strips non-alnum, caps at 60", () => {
  assert.equal(normaliseCouponCode("save20"), "SAVE20");
  assert.equal(normaliseCouponCode("  Save20 "), "SAVE20");
  assert.equal(normaliseCouponCode("SAVE!20#"), "SAVE20");
  assert.equal(normaliseCouponCode("a".repeat(120)), "A".repeat(60));
  assert.equal(normaliseCouponCode(""), "");
  assert.equal(normaliseCouponCode(null), "");
  assert.equal(normaliseCouponCode(undefined), "");
});

// ---------------------------------------------------------------------------
// normaliseCouponDoc
// ---------------------------------------------------------------------------

test("normaliseCouponDoc accepts percent and flat, rejects everything else", () => {
  assert.equal(normaliseCouponDoc({ code: "x", type: "percent", value: 10 }).type, "percent");
  assert.equal(normaliseCouponDoc({ code: "x", type: "flat", value: 100 }).type, "flat");
  assert.equal(normaliseCouponDoc({ code: "x", type: "PERCENT", value: 10 }).type, "percent");
  assert.equal(normaliseCouponDoc({ code: "x", type: "weird", value: 10 }), null);
  assert.equal(normaliseCouponDoc({ code: "x", type: "percent" }), null); // missing value
  assert.equal(normaliseCouponDoc({ code: "x", type: "percent", value: -1 }), null);
  assert.equal(normaliseCouponDoc(null), null);
  assert.equal(normaliseCouponDoc(""), null);
});

test("normaliseCouponDoc parses Firestore date fields (string | number | Timestamp)", () => {
  const fromString = normaliseCouponDoc({ code: "x", type: "flat", value: 1, expiresAt: "2025-01-01" });
  assert.equal(typeof fromString.expiresAt, "number");
  assert.ok(fromString.expiresAt > 0);
  const fromTimestamp = normaliseCouponDoc({ code: "x", type: "flat", value: 1, startsAt: { toMillis: () => 1700000000000 } });
  assert.equal(fromTimestamp.startsAt, 1700000000000);
  const fromSeconds = normaliseCouponDoc({ code: "x", type: "flat", value: 1, expiresAt: { _seconds: 1700000000 } });
  assert.equal(fromSeconds.expiresAt, 1700000000 * 1000);
  const none = normaliseCouponDoc({ code: "x", type: "flat", value: 1 });
  assert.equal(none.startsAt, null);
  assert.equal(none.expiresAt, null);
});

// ---------------------------------------------------------------------------
// Rule 1: coupon exists
// ---------------------------------------------------------------------------

test("rule 1: validateCoupon rejects null/empty coupon with COUPON_NOT_FOUND", () => {
  assert.equal(validateCoupon(null, baseOrderContext()).ok, false);
  assert.equal(validateCoupon(null, baseOrderContext()).code, "COUPON_NOT_FOUND");
});

// ---------------------------------------------------------------------------
// Rules 2 + 3 + 4: active + start + expiry
// ---------------------------------------------------------------------------

test("rule 2: isCouponActive rejects inactive/disabled/archived status", () => {
  assert.equal(isCouponActive(percentCoupon({ status: "active" })), true);
  assert.equal(isCouponActive(percentCoupon({ status: "inactive" })), false);
  assert.equal(isCouponActive(percentCoupon({ status: "disabled" })), false);
  assert.equal(isCouponActive(percentCoupon({ status: "archived" })), false);
  assert.equal(isCouponActive(percentCoupon({ status: "PENDING" })), true); // case-insensitive
});

test("rule 3: isCouponActive respects startsAt", () => {
  const now = 1_700_000_000_000;
  assert.equal(isCouponActive(percentCoupon({ startsAt: now - 1000 }), now), true);
  assert.equal(isCouponActive(percentCoupon({ startsAt: now + 1000 }), now), false);
});

test("rule 4: isCouponActive respects expiresAt", () => {
  const now = 1_700_000_000_000;
  assert.equal(isCouponActive(percentCoupon({ expiresAt: now + 1000 }), now), true);
  assert.equal(isCouponActive(percentCoupon({ expiresAt: now - 1000 }), now), false);
});

test("rules 2-4: validateCoupon surfaces COUPON_INACTIVE for expired coupons", () => {
  const r = validateCoupon(
    percentCoupon({ expiresAt: Date.now() - 1000 }),
    baseOrderContext(),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "COUPON_INACTIVE");
});

// ---------------------------------------------------------------------------
// Rule 5: global usage limit
// ---------------------------------------------------------------------------

test("rule 5: isWithinGlobalLimit checks usedCount vs globalLimit", () => {
  assert.equal(isWithinGlobalLimit(percentCoupon({ globalLimit: null, usedCount: 9999 })), true);
  assert.equal(isWithinGlobalLimit(percentCoupon({ globalLimit: 10, usedCount: 0 })), true);
  assert.equal(isWithinGlobalLimit(percentCoupon({ globalLimit: 10, usedCount: 9 })), true);
  assert.equal(isWithinGlobalLimit(percentCoupon({ globalLimit: 10, usedCount: 10 })), false);
  assert.equal(isWithinGlobalLimit(percentCoupon({ globalLimit: 10, usedCount: 11 })), false);
});

test("rule 5: validateCoupon surfaces COUPON_LIMIT_REACHED when global limit is hit", () => {
  const r = validateCoupon(
    percentCoupon({ globalLimit: 5, usedCount: 5 }),
    baseOrderContext(),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "COUPON_LIMIT_REACHED");
});

// ---------------------------------------------------------------------------
// Rule 6: per-user usage limit
// ---------------------------------------------------------------------------

test("rule 6: isWithinPerUserLimit checks userUsageCount vs perUserLimit", () => {
  assert.equal(isWithinPerUserLimit(percentCoupon({ perUserLimit: null }), 9999), true);
  assert.equal(isWithinPerUserLimit(percentCoupon({ perUserLimit: 1 }), 0), true);
  assert.equal(isWithinPerUserLimit(percentCoupon({ perUserLimit: 1 }), 1), false);
  assert.equal(isWithinPerUserLimit(percentCoupon({ perUserLimit: 3 }), 2), true);
  assert.equal(isWithinPerUserLimit(percentCoupon({ perUserLimit: 3 }), 3), false);
});

test("rule 6: validateCoupon surfaces COUPON_USER_LIMIT_REACHED", () => {
  const r = validateCoupon(
    percentCoupon({ perUserLimit: 1 }),
    baseOrderContext({ userUsageCount: 1 }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "COUPON_USER_LIMIT_REACHED");
});

// ---------------------------------------------------------------------------
// Rule 7: product eligibility
// ---------------------------------------------------------------------------

test("rule 7: isEligibleForProducts matches against the coupon's product list", () => {
  const c = percentCoupon({ productIds: ["p-1", "p-2"] });
  assert.equal(isEligibleForProducts(c, ["p-1"]), true);
  assert.equal(isEligibleForProducts(c, ["p-2"]), true);
  assert.equal(isEligibleForProducts(c, ["p-1", "p-3"]), true);
  assert.equal(isEligibleForProducts(c, ["p-3"]), false);
  assert.equal(isEligibleForProducts(c, []), false);
  // Empty list = applies to all.
  assert.equal(isEligibleForProducts(percentCoupon(), ["anything"]), true);
});

test("rule 7: validateCoupon surfaces COUPON_PRODUCT_MISMATCH", () => {
  const r = validateCoupon(
    percentCoupon({ productIds: ["p-1"] }),
    baseOrderContext({ productIds: ["p-99"] }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "COUPON_PRODUCT_MISMATCH");
});

// ---------------------------------------------------------------------------
// Rule 8: module eligibility
// ---------------------------------------------------------------------------

test("rule 8: isEligibleForModules matches against the coupon's module list", () => {
  const c = percentCoupon({ moduleIds: ["m-1"] });
  assert.equal(isEligibleForModules(c, ["m-1"]), true);
  assert.equal(isEligibleForModules(c, ["m-2"]), false);
  assert.equal(isEligibleForModules(c, []), false);
  assert.equal(isEligibleForModules(percentCoupon(), ["m-1"]), true);
});

test("rule 8: validateCoupon surfaces COUPON_MODULE_MISMATCH", () => {
  const r = validateCoupon(
    percentCoupon({ moduleIds: ["m-1"] }),
    baseOrderContext({ moduleIds: ["m-99"] }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "COUPON_MODULE_MISMATCH");
});

// ---------------------------------------------------------------------------
// Rule 9: resource eligibility
// ---------------------------------------------------------------------------

test("rule 9: isEligibleForResources matches against the coupon's resource list", () => {
  const c = percentCoupon({ resourceIds: ["r-1"] });
  assert.equal(isEligibleForResources(c, ["r-1"]), true);
  assert.equal(isEligibleForResources(c, ["r-2"]), false);
  assert.equal(isEligibleForResources(c, []), false);
  assert.equal(isEligibleForResources(percentCoupon(), ["r-1"]), true);
});

test("rule 9: validateCoupon surfaces COUPON_RESOURCE_MISMATCH", () => {
  const r = validateCoupon(
    percentCoupon({ resourceIds: ["r-1"] }),
    baseOrderContext({ resourceIds: ["r-99"] }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "COUPON_RESOURCE_MISMATCH");
});

// ---------------------------------------------------------------------------
// Rule 10: category eligibility
// ---------------------------------------------------------------------------

test("rule 10: isEligibleForCategories matches against the coupon's category list", () => {
  const c = percentCoupon({ categories: ["design"] });
  assert.equal(isEligibleForCategories(c, ["design"]), true);
  assert.equal(isEligibleForCategories(c, ["design", "tech"]), true);
  assert.equal(isEligibleForCategories(c, ["tech"]), false);
  assert.equal(isEligibleForCategories(c, []), false);
  assert.equal(isEligibleForCategories(percentCoupon(), ["tech"]), true);
});

test("rule 10: validateCoupon surfaces COUPON_CATEGORY_MISMATCH", () => {
  const r = validateCoupon(
    percentCoupon({ categories: ["design"] }),
    baseOrderContext({ categories: ["tech"] }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "COUPON_CATEGORY_MISMATCH");
});

// ---------------------------------------------------------------------------
// Rule 11: minimum order
// ---------------------------------------------------------------------------

test("rule 11: meetsMinOrder compares paise to minOrderPaise", () => {
  assert.equal(meetsMinOrder(percentCoupon({ minOrderPaise: 0 }), 0), true);
  assert.equal(meetsMinOrder(percentCoupon({ minOrderPaise: 10000 }), 9999), false);
  assert.equal(meetsMinOrder(percentCoupon({ minOrderPaise: 10000 }), 10000), true);
  assert.equal(meetsMinOrder(percentCoupon({ minOrderPaise: 10000 }), 10001), true);
});

test("rule 11: validateCoupon surfaces COUPON_MIN_ORDER with the required amount", () => {
  const r = validateCoupon(
    percentCoupon({ minOrderPaise: 50000 }),
    baseOrderContext({ subtotalPaise: 10000 }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "COUPON_MIN_ORDER");
  assert.match(r.reason, /₹500/);
});

// ---------------------------------------------------------------------------
// Rule 12: maximum discount
// ---------------------------------------------------------------------------

test("rule 12: computeCouponDiscount caps percent discount at maxDiscountPaise", () => {
  // 20% of ₹2000 = ₹400. Cap = ₹100.
  const c = percentCoupon({ value: 20, maxDiscountPaise: 10000 });
  const discount = computeCouponDiscount(c, 200000);
  assert.equal(discount, 10000);
});

test("rule 12: computeCouponDiscount caps flat discount at maxDiscountPaise", () => {
  const c = flatCoupon({ value: 100000, maxDiscountPaise: 30000 });
  const discount = computeCouponDiscount(c, 200000);
  assert.equal(discount, 30000);
});

test("rule 12: computeCouponDiscount never exceeds the order subtotal", () => {
  const c = flatCoupon({ value: 500000, maxDiscountPaise: null });
  const discount = computeCouponDiscount(c, 100000);
  assert.equal(discount, 100000);
});

test("rule 12: computeCouponDiscount returns 0 for empty / invalid coupons", () => {
  assert.equal(computeCouponDiscount(null, 200000), 0);
  assert.equal(computeCouponDiscount({}, 200000), 0);
  assert.equal(computeCouponDiscount({ type: "weird", value: 10 }, 200000), 0);
});

// ---------------------------------------------------------------------------
// Rule 13: first-purchase only
// ---------------------------------------------------------------------------

test("rule 13: isFirstPurchase allows only first-time buyers", () => {
  const c = percentCoupon({ firstPurchaseOnly: true });
  assert.equal(isFirstPurchase(c, false), true);
  assert.equal(isFirstPurchase(c, true), false);
  const d = percentCoupon({ firstPurchaseOnly: false });
  assert.equal(isFirstPurchase(d, true), true);
  assert.equal(isFirstPurchase(d, false), true);
});

test("rule 13: validateCoupon surfaces COUPON_NOT_FIRST_PURCHASE", () => {
  const r = validateCoupon(
    percentCoupon({ firstPurchaseOnly: true }),
    baseOrderContext({ userHasPriorPurchases: true }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "COUPON_NOT_FIRST_PURCHASE");
});

// ---------------------------------------------------------------------------
// Optional rule: allowedPurchaseKinds
// ---------------------------------------------------------------------------

test("isEligibleForPurchaseKind filters by Part 1 purchase kind", () => {
  const c = percentCoupon({ allowedPurchaseKinds: ["full_product", "cart_bundle"] });
  assert.equal(isEligibleForPurchaseKind(c, "full_product"), true);
  assert.equal(isEligibleForPurchaseKind(c, "cart_bundle"), true);
  assert.equal(isEligibleForPurchaseKind(c, "paid_update"), false);
  assert.equal(isEligibleForPurchaseKind(percentCoupon(), "subscription"), true);
  assert.equal(isEligibleForPurchaseKind(c, null), false);
});

test("validateCoupon surfaces COUPON_KIND_MISMATCH", () => {
  const r = validateCoupon(
    percentCoupon({ allowedPurchaseKinds: ["full_product"] }),
    baseOrderContext({ purchaseKind: "paid_update" }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "COUPON_KIND_MISMATCH");
});

// ---------------------------------------------------------------------------
// Discount math — percent + flat
// ---------------------------------------------------------------------------

test("computeCouponDiscount: percent = floor(subtotal * value / 100)", () => {
  // 20% of ₹2000 = ₹400 (paise 40000).
  assert.equal(computeCouponDiscount(percentCoupon({ value: 20 }), 200000), 40000);
  // 10% of ₹99.99 = ₹9.999 → floor → ₹9 (paise 999).
  assert.equal(computeCouponDiscount(percentCoupon({ value: 10 }), 9999), 999);
  // 0% → 0.
  assert.equal(computeCouponDiscount(percentCoupon({ value: 0 }), 200000), 0);
});

test("computeCouponDiscount: flat = the value (in paise)", () => {
  assert.equal(computeCouponDiscount(flatCoupon({ value: 50000 }), 200000), 50000);
  assert.equal(computeCouponDiscount(flatCoupon({ value: 10000 }), 99999), 10000);
});

// ---------------------------------------------------------------------------
// Top-level validator — happy path + boundary cases
// ---------------------------------------------------------------------------

test("validateCoupon: percent 20% on ₹2000 → discount ₹400", () => {
  const r = validateCoupon(percentCoupon({ value: 20 }), baseOrderContext({ subtotalPaise: 200000 }));
  assert.equal(r.ok, true);
  assert.equal(r.discountPaise, 40000);
  assert.equal(r.reason, null);
});

test("validateCoupon: flat ₹500 on ₹2000 → discount ₹500", () => {
  const r = validateCoupon(flatCoupon({ value: 50000 }), baseOrderContext({ subtotalPaise: 200000 }));
  assert.equal(r.ok, true);
  assert.equal(r.discountPaise, 50000);
});

test("validateCoupon: cap does not raise the discount when below the cap", () => {
  const r = validateCoupon(
    percentCoupon({ value: 20, maxDiscountPaise: 100000 }),
    baseOrderContext({ subtotalPaise: 200000 }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.discountPaise, 40000);
});

test("validateCoupon: full rule chain (global + per-user + product + module + resource + category + min + first-purchase)", () => {
  const c = percentCoupon({
    globalLimit: 100,
    perUserLimit: 1,
    productIds: ["p-1"],
    moduleIds: ["m-1"],
    resourceIds: ["r-1"],
    categories: ["design"],
    minOrderPaise: 10000,
    maxDiscountPaise: 50000,
    firstPurchaseOnly: true,
  });
  const ok = validateCoupon(
    c,
    baseOrderContext({
      subtotalPaise: 200000,
      productIds: ["p-1"],
      moduleIds: ["m-1"],
      resourceIds: ["r-1"],
      categories: ["design"],
      userHasPriorPurchases: false,
      userUsageCount: 0,
    }),
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.discountPaise, 40000);

  // Each gate can independently refuse.
  assert.equal(validateCoupon({ ...c, globalLimit: 0 }, baseOrderContext()).ok, false);
  // Product gate: an order with an unknown product fails the
  // product check (without touching module/resource). The full
  // rule chain short-circuits on the product rule when the
  // product id isn't in the coupon's productIds list.
  assert.equal(
    validateCoupon(c, baseOrderContext({ productIds: ["p-99"], moduleIds: [], resourceIds: [] })).code,
    "COUPON_PRODUCT_MISMATCH",
  );
  // Module gate: pass a known product so the module rule fires.
  assert.equal(
    validateCoupon(
      c,
      baseOrderContext({ productIds: ["p-1"], moduleIds: ["m-99"], resourceIds: [] }),
    ).code,
    "COUPON_MODULE_MISMATCH",
  );
  // Resource gate: pass a known product + module so the resource rule fires.
  assert.equal(
    validateCoupon(
      c,
      baseOrderContext({ productIds: ["p-1"], moduleIds: ["m-1"], resourceIds: ["r-99"] }),
    ).code,
    "COUPON_RESOURCE_MISMATCH",
  );
  // Category gate: pass product+module+resource so the category rule fires.
  assert.equal(
    validateCoupon(
      c,
      baseOrderContext({ productIds: ["p-1"], moduleIds: ["m-1"], resourceIds: ["r-1"], categories: ["tech"] }),
    ).code,
    "COUPON_CATEGORY_MISMATCH",
  );
  // Min-order gate (after product + module + resource + category pass).
  assert.equal(
    validateCoupon(
      c,
      baseOrderContext({ productIds: ["p-1"], moduleIds: ["m-1"], resourceIds: ["r-1"], categories: ["design"], subtotalPaise: 5000 }),
    ).code,
    "COUPON_MIN_ORDER",
  );
  // First-purchase gate (pass product + module + resource + category so the first-purchase rule fires).
  assert.equal(
    validateCoupon(
      c,
      baseOrderContext({
        productIds: ["p-1"],
        moduleIds: ["m-1"],
        resourceIds: ["r-1"],
        categories: ["design"],
        userHasPriorPurchases: true,
      }),
    ).code,
    "COUPON_NOT_FIRST_PURCHASE",
  );
  // Per-user-limit gate.
  assert.equal(
    validateCoupon(
      c,
      baseOrderContext({
        productIds: ["p-1"],
        moduleIds: ["m-1"],
        resourceIds: ["r-1"],
        categories: ["design"],
        userUsageCount: 1,
      }),
    ).code,
    "COUPON_USER_LIMIT_REACHED",
  );
});

// ---------------------------------------------------------------------------
// applyCouponToQuote + removeCouponFromQuote
// ---------------------------------------------------------------------------

const baseQuote = (overrides = {}) => ({
  quoteId: "Q-1",
  uid: "u-1",
  purchaseKind: "full_product",
  verifiedLineItems: [],
  regularSubtotal: 200000,
  saleDiscount: 0,
  couponDiscount: 0,
  eduCoinDiscount: 0,
  eduCoinsReserved: 0,
  cashPayable: 200000,
  minimumPayable: 0,
  currency: "INR",
  expiresAt: Date.now() + 60000,
  status: "active",
  couponCode: null,
  couponType: null,
  couponValue: null,
  ...overrides,
});

test("applyCouponToQuote: sets couponDiscount and recomputes cashPayable", () => {
  const out = applyCouponToQuote(baseQuote(), percentCoupon({ value: 20 }), 40000);
  assert.equal(out.couponCode, "SAVE20");
  assert.equal(out.couponType, "percent");
  assert.equal(out.couponValue, 20);
  assert.equal(out.couponDiscount, 40000);
  assert.equal(out.cashPayable, 160000);
});

test("applyCouponToQuote: respects the minimumPayable floor", () => {
  // Subtotal 200000, discount 40000 → post-coupon 160000. Floor is 180000.
  // The actual discount is reduced to 20000.
  const out = applyCouponToQuote(
    baseQuote({ minimumPayable: 180000 }),
    percentCoupon({ value: 20 }),
    40000,
  );
  assert.equal(out.cashPayable, 180000);
  assert.equal(out.couponDiscount, 20000);
});

test("applyCouponToQuote: does not double-apply when the quote already has a coupon", () => {
  const out = applyCouponToQuote(
    baseQuote({ couponCode: "OTHER", couponDiscount: 1000 }),
    percentCoupon({ value: 20 }),
    40000,
  );
  assert.equal(out.couponCode, "OTHER");
  assert.equal(out.couponDiscount, 1000);
});

test("removeCouponFromQuote: clears coupon fields and restores cashPayable", () => {
  const withCoupon = applyCouponToQuote(baseQuote(), percentCoupon({ value: 20 }), 40000);
  const out = removeCouponFromQuote(withCoupon);
  assert.equal(out.couponCode, null);
  assert.equal(out.couponType, null);
  assert.equal(out.couponValue, null);
  assert.equal(out.couponDiscount, 0);
  assert.equal(out.cashPayable, 200000);
});

// ---------------------------------------------------------------------------
// Redemption helpers
// ---------------------------------------------------------------------------

test("buildCouponRedemptionDocId composes {code}__{orderId}", () => {
  assert.equal(buildCouponRedemptionDocId("SAVE20", "O-1"), "SAVE20__O-1");
  assert.equal(buildCouponRedemptionDocId("  save20 ", "O-1"), "SAVE20__O-1");
  assert.equal(buildCouponRedemptionDocId("", "O-1"), null);
  assert.equal(buildCouponRedemptionDocId("SAVE20", ""), null);
  assert.equal(buildCouponRedemptionDocId(null, "O-1"), null);
});

test("shouldIncrementCouponUsage is true only for pending redemptions of an active, in-limit coupon", () => {
  const coupon = percentCoupon({ globalLimit: 10, usedCount: 5 });
  const pending = { status: "pending" };
  const applied = { status: "applied" };
  const expired = percentCoupon({ expiresAt: Date.now() - 1000 });
  assert.equal(shouldIncrementCouponUsage(pending, coupon), true);
  assert.equal(shouldIncrementCouponUsage(applied, coupon), false);
  assert.equal(shouldIncrementCouponUsage(null, coupon), false);
  // Coupon past its limit → false.
  assert.equal(shouldIncrementCouponUsage(pending, percentCoupon({ globalLimit: 5, usedCount: 5 })), false);
  // Coupon expired → false.
  assert.equal(shouldIncrementCouponUsage(pending, expired), false);
});
