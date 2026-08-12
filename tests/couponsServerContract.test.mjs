// tests/couponsServerContract.test.mjs
//
// Part 7 — source-level contract tests for the coupon plumbing in
// the Razorpay endpoints + the entitlement writer. These tests do
// NOT need a live Firestore — they assert the source code:
//
//   - The pure coupon engine (`utils/coupons.js`) is the only
//     place coupons are validated; the Razorpay endpoints +
//     quote-create handler never duplicate the rules.
//   - `api/_lib/quotes.ts` loads the coupon via `loadCouponByCode`
//     and the user context via `loadUserCouponUsageCount` /
//     `loadUserHasPriorPurchases`, and passes the loaded coupon
//     to `buildQuote`.
//   - `api/razorpay/create-order.ts` carries the coupon fields
//     on the payment intent so a verify-payment replay still
//     knows what coupon was applied.
//   - `api/razorpay/verify-payment.ts` runs the entitlement grant
//     and the coupon redemption atomically (via
//     `applyCouponRedemption` inside a `db.runTransaction`).
//   - `api/_lib/coupons.ts` increments `usedCount` exactly once
//     per `{couponCode}__{orderId}` pair, even on replay.
//   - `api/_lib/entitlements.ts` NEVER increments `usedCount`
//     itself — the increment lives in the dedicated
//     `applyCouponRedemption` helper.
//
// The pure-helper unit tests in `tests/coupons.test.mjs` cover
// the rules themselves. This file covers the cross-cutting
// server-side contract.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");
/**
 * Strip JS/TS line + block comments while preserving `https://` /
 * `http://` URLs (which the `//` regex would otherwise devour).
 */
const stripComments = (s) => {
  const urls = [];
  const masked = s.replace(/https?:\/\/[^\s"'`)]+/g, (url) => {
    const token = `__URL_${urls.length}__`;
    urls.push(url);
    return token;
  });
  const stripped = masked.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  return stripped.replace(/__URL_(\d+)__/g, (_m, i) => urls[Number(i)] || "");
};

const coupons = readSource("utils/coupons.js");
const couponsDts = readSource("utils/coupons.d.ts");
const couponsLib = readSource("api/_lib/coupons.ts");
const quotes = readSource("api/_lib/quotes.ts");
const quotesCode = stripComments(quotes);
const createOrder = readSource("api/razorpay/create-order.ts");
const createOrderCode = stripComments(createOrder);
const verifyPayment = readSource("api/razorpay/verify-payment.ts");
const verifyCode = stripComments(verifyPayment);
const entitlements = readSource("api/_lib/entitlements.ts");
const entitlementsCode = stripComments(entitlements);
const serverQuotes = readSource("utils/serverQuotes.js");
const serverQuotesCode = stripComments(serverQuotes);

// ---------------------------------------------------------------------------
// utils/coupons.js — pure engine contract
// ---------------------------------------------------------------------------

test("utils/coupons.js declares every Part 7 spec rule as a pure helper", () => {
  for (const name of [
    "normaliseCouponCode",
    "normaliseCouponDoc",
    "isCouponActive",
    "isWithinGlobalLimit",
    "isWithinPerUserLimit",
    "isEligibleForProducts",
    "isEligibleForModules",
    "isEligibleForResources",
    "isEligibleForCategories",
    "isEligibleForPurchaseKind",
    "meetsMinOrder",
    "isFirstPurchase",
    "computeCouponDiscount",
    "validateCoupon",
    "applyCouponToQuote",
    "removeCouponFromQuote",
    "buildCouponRedemptionDocId",
    "shouldIncrementCouponUsage",
  ]) {
    assert.match(coupons, new RegExp(`export const ${name}`), `missing export ${name}`);
  }
});

test("utils/coupons.js is pure (no Firestore / no fetch / no Node-only imports)", () => {
  assert.doesNotMatch(coupons, /firebase-admin/);
  assert.doesNotMatch(coupons, /require\(/);
  assert.doesNotMatch(coupons, /process\.env/);
  assert.doesNotMatch(coupons, /from "node:/);
});

test("utils/coupons.d.ts declares the spec-shaped CouponDoc + CouponRedemptionDoc", () => {
  for (const field of [
    "code",
    "type",
    "value",
    "status",
    "startsAt",
    "expiresAt",
    "globalLimit",
    "usedCount",
    "perUserLimit",
    "productIds",
    "moduleIds",
    "resourceIds",
    "categories",
    "minOrderPaise",
    "maxDiscountPaise",
    "firstPurchaseOnly",
    "allowedPurchaseKinds",
  ]) {
    assert.match(couponsDts, new RegExp(`\\b${field}\\b`), `missing field ${field}`);
  }
  for (const field of [
    "uid",
    "couponCode",
    "orderId",
    "status",
    "createdAt",
    "appliedAt",
    "discountPaise",
    "paymentId",
  ]) {
    assert.match(couponsDts, new RegExp(`\\b${field}\\b`), `redemption doc missing field ${field}`);
  }
});

// ---------------------------------------------------------------------------
// utils/serverQuotes.js — coupon integration
// ---------------------------------------------------------------------------

test("serverQuotes.js delegates coupon validation to utils/coupons.js (no duplication)", () => {
  // The engine must NOT re-implement the rules — it must call
  // `validateCoupon` from the coupon engine.
  assert.match(serverQuotes, /import .*validateCoupon.* from "\.\/coupons\.js"/);
  assert.match(serverQuotesCode, /validateCoupon\(coupon,/);
});

test("serverQuotes.js accepts a `coupon` parameter on buildQuote", () => {
  // The `buildQuote` function must accept a `coupon` parameter and
  // use it to validate + apply the discount. The TS interface
  // (`utils/serverQuotes.d.ts`) declares the field.
  const dts = readSource("utils/serverQuotes.d.ts");
  assert.match(dts, /coupon\?: CouponDoc/);
  assert.match(serverQuotesCode, /coupon = null/);
});

test("serverQuotes.js sets couponCode/couponType/couponValue on the returned quote", () => {
  // The persisted quote carries the coupon surface. The engine
  // returns these fields so the server can persist + surface them
  // to the client.
  assert.match(serverQuotesCode, /couponCode/);
  assert.match(serverQuotesCode, /couponType/);
  assert.match(serverQuotesCode, /couponValue/);
});

test("serverQuotes.js applies the minimumPayable floor to couponDiscount", () => {
  // A coupon cannot push the price below minimumPayable. The
  // engine must clamp the actual couponDiscount accordingly.
  assert.match(
    serverQuotesCode,
    /cashPayable > afterCoupon/,
  );
  assert.match(
    serverQuotesCode,
    /couponDiscount = Math\.max\(0, effectiveSubtotal - Math\.max\(cashPayable, minimumPayable\)\)/,
  );
});

// ---------------------------------------------------------------------------
// api/_lib/coupons.ts — server-side plumbing
// ---------------------------------------------------------------------------

test("api/_lib/coupons.ts loads the coupon via loadCouponByCode", () => {
  assert.match(couponsLib, /loadCouponByCode/);
  assert.match(couponsLib, /COUPONS_COLLECTION\s*=\s*"coupons"/);
});

test("api/_lib/coupons.ts reads the user's per-coupon redemption count from couponRedemptions", () => {
  assert.match(couponsLib, /loadUserCouponUsageCount/);
  assert.match(couponsLib, /REDEMPTIONS_COLLECTION\s*=\s*"couponRedemptions"/);
  // Status filter: only "applied" redemptions count toward the
  // per-user limit. This protects the user from a partially-failed
  // payment (e.g. payment reserved but entitlement grant rolled
  // back) consuming their quota.
  assert.match(couponsLib, /where\("status", "==", "applied"\)/);
});

test("api/_lib/coupons.ts checks both users.purchasedProductIds and siteOrders for first-purchase eligibility", () => {
  assert.match(couponsLib, /loadUserHasPriorPurchases/);
  assert.match(couponsLib, /purchasedProductIds/);
  assert.match(couponsLib, /SITE_ORDERS_COLLECTION/);
  assert.match(couponsLib, /status.*Completed/);
});

test("api/_lib/coupons.ts applyCouponRedemption runs inside a transaction and increments usedCount", () => {
  assert.match(couponsLib, /applyCouponRedemption/);
  // The increment is `FieldValue.increment(1)` so concurrent
  // calls never lose a count.
  assert.match(couponsLib, /FieldValue\.increment\(1\)/);
  assert.match(couponsLib, /usedCount/);
});

test("api/_lib/coupons.ts applyCouponRedemption is idempotent (replay no-op)", () => {
  // The function checks `existing.exists` + `existingData.status`
  // and short-circuits when the redemption is already "applied"
  // or "reverted". A second verify-payment call therefore never
  // double-increments usedCount.
  assert.match(couponsLib, /existing\.exists/);
  assert.match(couponsLib, /status === "applied"/);
  assert.match(couponsLib, /status === "reverted"/);
});

test("api/_lib/coupons.ts stamps the user doc with lastCouponRedemptionAt + lastCouponCode", () => {
  assert.match(couponsLib, /lastCouponRedemptionAt/);
  assert.match(couponsLib, /lastCouponCode/);
});

// ---------------------------------------------------------------------------
// api/_lib/quotes.ts — quote-create integration
// ---------------------------------------------------------------------------

test("api/_lib/quotes.ts loads the coupon when the selection carries a couponCode", () => {
  assert.match(quotesCode, /loadCouponByCode/);
  assert.match(quotesCode, /selection\.couponCode/);
});

test("api/_lib/quotes.ts reads the user's coupon context (per-user count + first-purchase flag)", () => {
  assert.match(quotesCode, /loadUserCouponUsageCount/);
  assert.match(quotesCode, /loadUserHasPriorPurchases/);
});

test("api/_lib/quotes.ts passes the loaded coupon + user context to buildQuote", () => {
  // The handler must pass `coupon`, `userCouponUsageCount`,
  // `userHasPriorPurchases`, and `productCategories` so the engine
  // can apply the rules.
  assert.match(quotesCode, /coupon,/);
  assert.match(quotesCode, /userCouponUsageCount,/);
  assert.match(quotesCode, /userHasPriorPurchases,/);
  assert.match(quotesCode, /productCategories,/);
});

test("api/_lib/quotes.ts never reads a client-supplied discount / couponDiscount / coupon value", () => {
  // The endpoint must NOT trust any client-supplied price/discount
  // field. The only input it accepts is `selection.couponCode`
  // (informational), and the actual coupon comes from the loaded
  // Firestore doc.
  assert.doesNotMatch(quotesCode, /req\.body\?\.couponDiscount|req\.body\.couponDiscount/);
  assert.doesNotMatch(quotesCode, /req\.body\?\.discount|req\.body\.discount/);
  // The forbidden field list now includes `couponDiscount` so a
  // malicious client can't bypass the server-side validation.
  const forbidden = quotes.match(/const forbidden = \[([^\]]+)\]/);
  assert.ok(forbidden, "expected a forbidden-fields list");
  assert.match(forbidden[1], /couponDiscount/);
});

test("api/_lib/quotes.ts surfaces a coupon-specific error code on a 400", () => {
  // When the engine refuses a quote because of a bad coupon, the
  // response should include `couponRefused: true` so the client
  // UI can render a targeted message.
  assert.match(quotesCode, /couponRefused/);
});

// ---------------------------------------------------------------------------
// api/razorpay/create-order.ts — coupon snapshot on intent
// ---------------------------------------------------------------------------

test("create-order carries the coupon fields on the payment intent", () => {
  assert.match(createOrderCode, /couponCode/);
  assert.match(createOrderCode, /couponType/);
  assert.match(createOrderCode, /couponValue/);
  assert.match(createOrderCode, /couponDiscount/);
});

test("create-order uses quote.cashPayable (the post-coupon amount) for the Razorpay amount", () => {
  // The Razorpay amount is derived from `quote.cashPayable`, not
  // from the request body. The coupon discount is already applied
  // to the quote by the time create-order reads it.
  assert.match(createOrderCode, /quote\.cashPayable/);
});

// ---------------------------------------------------------------------------
// api/razorpay/verify-payment.ts — coupon surfaces on the response
// ---------------------------------------------------------------------------

test("verify-payment surfaces the coupon fields on every success response", () => {
  // All three success branches (replay, free, paid) carry the
  // coupon fields back to the client so the success page can
  // render the verified savings.
  const allReturns = verifyCode.match(/return res\.status\(200\)\.json\(\{[\s\S]*?\}\);/g) || [];
  assert.ok(allReturns.length >= 3, "expected at least 3 success responses");
  for (const block of allReturns) {
    assert.match(block, /couponCode/);
    assert.match(block, /couponDiscount/);
  }
});

test("verify-payment surfaces couponRedemption on the response", () => {
  // The grant object's `couponRedemption` field is propagated so
  // the client knows whether the coupon usage counter was
  // incremented in this call (vs. a replay).
  assert.match(verifyCode, /couponRedemption/);
});

// ---------------------------------------------------------------------------
// api/_lib/entitlements.ts — atomic coupon redemption
// ---------------------------------------------------------------------------

test("grantEntitlementsFromQuote calls applyCouponRedemption when the quote has a coupon", () => {
  assert.match(entitlementsCode, /applyCouponRedemption/);
  // The call site must guard on `quote.couponCode` so the
  // increment only happens for coupon-bearing quotes.
  assert.match(entitlementsCode, /quote\.couponCode/);
});

test("grantEntitlementsFromQuote does NOT increment usedCount itself (the helper does it)", () => {
  // The contract: the writer delegates the increment to
  // `applyCouponRedemption` so the increment + redemption doc
  // + user-doc stamp are atomic. The writer must NOT call
  // `FieldValue.increment(1)` on the coupon doc.
  assert.doesNotMatch(entitlementsCode, /coupons.{0,20}FieldValue\.increment/);
  assert.doesNotMatch(entitlementsCode, /collection\("coupons"\)/);
});

test("grantEntitlementsFromQuote runs the coupon redemption in its own transaction", () => {
  // The coupon redemption must be transactional (replay-safe).
  // The function wraps `applyCouponRedemption` in a separate
  // `db.runTransaction` (or `adminDb().runTransaction`) so the
  // increment + redemption doc land atomically.
  assert.match(entitlementsCode, /couponRedemption/);
  // The transaction wrappers (covers both `db.runTransaction` and
  // `adminDb().runTransaction`).
  const txBlocks = entitlementsCode.match(/(?:adminDb\(\)|db)?\.runTransaction\(/g) || [];
  assert.ok(txBlocks.length >= 2, "expected at least 2 runTransaction calls (entitlements + coupon)");
});

test("grantEntitlementsFromQuote carries the coupon fields on the siteOrders receipt", () => {
  // The siteOrders/{orderId} doc gets the coupon code, type, value,
  // and discount so the admin / receipt UI can show them.
  assert.match(entitlementsCode, /couponCode:\s*quote\.couponCode/);
  assert.match(entitlementsCode, /couponType:\s*quote\.couponType/);
  assert.match(entitlementsCode, /couponValue:/);
  assert.match(entitlementsCode, /couponDiscount:/);
});

test("grantEntitlementsFromQuote is replay-safe for coupons (existing redemption doc skips the increment)", () => {
  // The replay-prevention lives in `applyCouponRedemption`
  // (`api/_lib/coupons.ts`). When `existingData.status ===
  // "applied"`, the writer short-circuits. This is the heart of
  // the replay-prevention story.
  assert.match(couponsLib, /status === "applied"/);
  assert.match(couponsLib, /status === "reverted"/);
});

test("grantEntitlementsFromQuote surface includes the couponRedemption summary", () => {
  // The response shape must include the redemption summary so
  // the client + tests can verify what happened.
  assert.match(entitlementsCode, /couponRedemption/);
});
