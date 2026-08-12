// tests/checkoutCouponContract.test.mjs
//
// Part 7 — source-level contract tests for the React coupon UI.
// These tests do NOT need a real Firestore or Vercel runtime.
// They assert that the React client (CheckoutContext,
// CheckoutReviewStep, CheckoutSuccessStep) was updated for Part 7:
//
//   - The CheckoutContext exposes `applyCoupon` / `removeCoupon`
//     actions and `couponStatus` / `couponErrorMessage` /
//     `couponInput` state.
//   - The CheckoutReviewStep renders the coupon input card with
//     apply / remove / loading / error / verified-savings state.
//   - The CheckoutSuccessStep surfaces the verified coupon (code,
//     type, value, discount) on the receipt.
//   - The ServerPriceQuote type carries the couponCode /
//     couponType / couponValue fields so the UI can read them
//     from the verified quote.
//
// The pure-helper unit tests in `tests/coupons.test.mjs` cover
// the coupon rules. The server-side contract tests in
// `tests/couponsServerContract.test.mjs` cover the API.
// This file covers the cross-cutting client contract.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const checkoutContext = readSource("src/checkout/CheckoutContext.tsx");
const checkoutTypes = readSource("src/checkout/types.ts");
const reviewStep = readSource("src/components/checkout/CheckoutReviewStep.tsx");
const successStep = readSource("src/components/checkout/CheckoutSuccessStep.tsx");
const commerceTypes = readSource("src/types/commerce.ts");

// ---------------------------------------------------------------------------
// CheckoutContext — applyCoupon / removeCoupon / coupon state
// ---------------------------------------------------------------------------

test("CheckoutContext exposes applyCoupon action", () => {
  assert.match(checkoutContext, /applyCoupon\s*[:=]/);
  assert.match(checkoutContext, /async \(rawCode:/);
});

test("CheckoutContext exposes removeCoupon action", () => {
  assert.match(checkoutContext, /removeCoupon\s*[:=]/);
});

test("CheckoutContext exposes couponStatus state", () => {
  // The provider holds couponStatus + couponErrorMessage +
  // couponInput + setCouponInput so the UI can render a controlled
  // input with loading / error state.
  assert.match(checkoutContext, /couponStatus/);
  assert.match(checkoutContext, /couponErrorMessage/);
  assert.match(checkoutContext, /couponInput/);
  assert.match(checkoutContext, /setCouponInput/);
});

test("CheckoutContext applyCoupon updates the immutable selection.couponCode (no mutation)", () => {
  // The action must build a fresh selection object (the
  // immutable-immutable rule from Part 5).
  assert.match(checkoutContext, /nextSelection\s*=\s*\{\s*\.\.\.selection,\s*couponCode:\s*code/);
});

test("CheckoutContext applyCoupon re-fetches the server-side quote", () => {
  assert.match(checkoutContext, /await fetchQuote\(/);
  // The round-trip uses the new selection's couponCode.
  assert.match(checkoutContext, /selection:\s*nextSelection/);
});

test("CheckoutContext applyCoupon persists the refreshed record", () => {
  // The writeToSessionStorage call ensures the coupon survives a
  // page reload.
  assert.match(checkoutContext, /writeToSessionStorage\(/);
  assert.match(checkoutContext, /buildCheckoutSessionRecord\(/);
});

test("CheckoutContext applyCoupon surfaces a human-readable error on rejection", () => {
  // The catch block sets `couponErrorMessage` and returns a
  // structured `{ ok: false, reason }` so the UI can render a
  // targeted message.
  assert.match(checkoutContext, /setCouponStatus\("error"\)/);
  assert.match(checkoutContext, /setCouponErrorMessage/);
  assert.match(checkoutContext, /ok: false as const/);
  assert.match(checkoutContext, /reason: message/);
});

test("CheckoutContext applyCoupon rolls back the optimistic selection update on error", () => {
  // The catch block must revert the selection so the next render
  // reflects the pre-coupon state.
  assert.match(checkoutContext, /setSelection\(selection\)/);
});

test("CheckoutContext applyCoupon never trusts a client-supplied discount (only the server returns the math)", () => {
  // The action forwards only `couponCode` (a string) to the
  // server. The discount math comes back on the verified
  // `ServerPriceQuote.couponDiscount` field.
  assert.match(checkoutContext, /couponCode:\s*code/);
  // No client-side discount computation.
  assert.doesNotMatch(checkoutContext, /couponDiscount\s*=\s*[^=]/);
});

// ---------------------------------------------------------------------------
// CheckoutContextValue type — coupon surface
// ---------------------------------------------------------------------------

test("CheckoutContextValue declares the coupon actions and state fields", () => {
  for (const field of [
    "applyCoupon",
    "removeCoupon",
    "couponStatus",
    "couponErrorMessage",
    "couponInput",
    "setCouponInput",
  ]) {
    assert.match(checkoutTypes, new RegExp(`\\b${field}\\b`), `missing type field ${field}`);
  }
});

// ---------------------------------------------------------------------------
// ServerPriceQuote type — coupon surface
// ---------------------------------------------------------------------------

test("ServerPriceQuote declares the Part 7 coupon fields", () => {
  // The verified quote carries the coupon code, type, value, and
  // discount so the client UI never has to do coupon math.
  for (const field of ["couponCode", "couponType", "couponValue", "couponDiscount"]) {
    assert.match(commerceTypes, new RegExp(`\\b${field}\\b`), `missing quote field ${field}`);
  }
});

// ---------------------------------------------------------------------------
// CheckoutReviewStep — coupon input card
// ---------------------------------------------------------------------------

test("CheckoutReviewStep renders the coupon input card", () => {
  assert.match(reviewStep, /<CouponCard/);
  assert.match(reviewStep, /data-checkout-coupon/);
});

test("CheckoutReviewStep coupon card renders an Apply button (data-checkout-coupon-apply)", () => {
  assert.match(reviewStep, /data-checkout-coupon-apply/);
  assert.match(reviewStep, /Apply/);
});

test("CheckoutReviewStep coupon card renders a Remove button (data-checkout-coupon-remove)", () => {
  assert.match(reviewStep, /data-checkout-coupon-remove/);
  assert.match(reviewStep, /Remove/);
});

test("CheckoutReviewStep coupon card renders a loading state during apply / remove", () => {
  // The Apply / Remove buttons show a spinner while
  // `couponStatus === "applying"`. The card is disabled while a
  // round-trip is in flight.
  assert.match(reviewStep, /applying\s*\?\s*<LoaderCircle/);
  assert.match(reviewStep, /disabled=\{applying \|\| disabled\}/);
});

test("CheckoutReviewStep coupon card renders an error state (data-checkout-coupon-error)", () => {
  assert.match(reviewStep, /data-checkout-coupon-error/);
  // The error message comes from the CheckoutContext (server-refused reason).
  assert.match(reviewStep, /errorMessage\s*&&/);
});

test("CheckoutReviewStep coupon card renders a verified-savings badge when a coupon is applied", () => {
  assert.match(reviewStep, /data-checkout-coupon-applied/);
  assert.match(reviewStep, /Verified savings/);
});

test("CheckoutReviewStep price section shows the coupon discount only when a coupon is applied", () => {
  // The hard-coded "coupons are coming soon" note from Part 5 is
  // gone; the row only renders when `couponDiscount > 0`.
  assert.match(reviewStep, /couponDiscount\s*>\s*0\s*\?\s*\(/);
  assert.doesNotMatch(reviewStep, /coupons are coming soon/);
});

test("CheckoutReviewStep coupon card shows the type + value on the applied state", () => {
  // When a coupon is applied, the card shows e.g. "SAVE20 (20% off)".
  assert.match(reviewStep, /appliedType === "percent"/);
  assert.match(reviewStep, /appliedType === "flat"/);
});

// ---------------------------------------------------------------------------
// CheckoutSuccessStep — coupon surface
// ---------------------------------------------------------------------------

test("CheckoutSuccessStep surfaces the verified coupon on the receipt", () => {
  // The receipt header shows the coupon code (and the percent /
  // flat label) when a coupon was applied.
  assert.match(successStep, /quote\.couponCode/);
  assert.match(successStep, /Coupon/);
});

test("CheckoutSuccessStep coupon row renders the percent / flat label", () => {
  // The percent/flat label is rendered next to the coupon code
  // so the buyer can see what kind of discount they received.
  assert.match(successStep, /couponType === "percent"/);
  assert.match(successStep, /couponType === "flat"/);
});

test("CheckoutSuccessStep coupon discount row renders when a coupon was applied", () => {
  // The discount row in the totals section only renders when
  // `couponDiscount > 0`.
  assert.match(successStep, /couponDiscount > 0 \? <ReceiptRow label="Coupon discount"/);
});
